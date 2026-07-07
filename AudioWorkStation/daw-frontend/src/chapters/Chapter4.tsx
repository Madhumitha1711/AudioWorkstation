import { useRef, useState, useEffect, useCallback } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { compileFaustWasm, type FaustDspMeta, type FaustNodeLike } from '../faust/faustTypes';
import { downloadAudioBufferAsWav } from '../audio/wavRender';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CompParams {
  threshold: number;   // dB  -60 → 0
  ratio:     number;   //       1 → 20
  attack:    number;   // ms   1 → 2000  (segmented knob, see TIME_KNOB_* below)
  release:   number;   // ms   1 → 2000  (segmented knob, see TIME_KNOB_* below)
  knee:      number;   // dB   0 → 20
  makeup:    number;   // dB  -20 → +20
}

// An uploaded audio track that can be used as the signal source in the
// Compressor Studio (free play / learning).
interface UploadedTrack { id: number; name: string; buffer: AudioBuffer; }

interface KnobSpec {
  key:   keyof CompParams;
  label: string;
  min:   number;
  max:   number;
  step:  number;
  fmt:   (v: number) => string;
  /** Non-linear knobs (Attack/Release) override the plain min/max lerp used
   *  for both the pointer arc and the value ↔ rotation mapping. */
  toFrac?:   (v: number) => number;
  fromFrac?: (f: number) => number;
}

// Attack/Release: a "segmented" knob — the bottom 60% of the knob's travel
// covers 1–200 ms (where most musical settings live), the remaining 40%
// covers 200–2000 ms (long releases / slow attacks), instead of one linear
// sweep that would make the common 1–200 ms zone impossible to dial in
// precisely.
const TIME_KNOB_MIN_MS   = 1;
const TIME_KNOB_BREAK_MS = 200;
const TIME_KNOB_MAX_MS   = 2000;
const TIME_KNOB_BREAK_FRAC = 0.6;

function timeKnobToFrac(ms: number): number {
  const v = Math.min(TIME_KNOB_MAX_MS, Math.max(TIME_KNOB_MIN_MS, ms));
  if (v <= TIME_KNOB_BREAK_MS) {
    return ((v - TIME_KNOB_MIN_MS) / (TIME_KNOB_BREAK_MS - TIME_KNOB_MIN_MS)) * TIME_KNOB_BREAK_FRAC;
  }
  return TIME_KNOB_BREAK_FRAC + ((v - TIME_KNOB_BREAK_MS) / (TIME_KNOB_MAX_MS - TIME_KNOB_BREAK_MS)) * (1 - TIME_KNOB_BREAK_FRAC);
}
function timeKnobFromFrac(frac: number): number {
  const f = Math.min(1, Math.max(0, frac));
  if (f <= TIME_KNOB_BREAK_FRAC) {
    return TIME_KNOB_MIN_MS + (f / TIME_KNOB_BREAK_FRAC) * (TIME_KNOB_BREAK_MS - TIME_KNOB_MIN_MS);
  }
  return TIME_KNOB_BREAK_MS + ((f - TIME_KNOB_BREAK_FRAC) / (1 - TIME_KNOB_BREAK_FRAC)) * (TIME_KNOB_MAX_MS - TIME_KNOB_BREAK_MS);
}
// Whole-number formatting — Ratio, Attack and Release are all integer-only
// knobs (step: 1 below), so no decimals are ever shown or enterable.
function fmtMs(v: number): string {
  return `${Math.round(v)} ms`;
}

// Ranges otherwise mirror the live bounds in public/faust/compressor/dsp-meta.json
// (the Faust compressor patch clamps its own params internally — Attack
// 0.1–100 ms, Release 10–1000 ms, Makeup_Gain 0–24 dB — so dialing a knob
// past those on Attack/Release/Makeup won't change the audio any further
// even though the knob keeps turning).
const KNOBS: KnobSpec[] = [
  { key: 'threshold', label: 'THRESHOLD',   min: -60, max: 0,    step: 0.5, fmt: v => `${v.toFixed(0)} dB` },
  { key: 'ratio',     label: 'RATIO',       min: 1,   max: 20,   step: 1,   fmt: v => `${v.toFixed(0)} : 1` },
  {
    key: 'attack', label: 'ATTACK', min: TIME_KNOB_MIN_MS, max: TIME_KNOB_MAX_MS, step: 1,
    fmt: fmtMs, toFrac: timeKnobToFrac, fromFrac: timeKnobFromFrac,
  },
  {
    key: 'release', label: 'RELEASE', min: TIME_KNOB_MIN_MS, max: TIME_KNOB_MAX_MS, step: 1,
    fmt: fmtMs, toFrac: timeKnobToFrac, fromFrac: timeKnobFromFrac,
  },
  { key: 'knee',      label: 'KNEE',        min: 0,   max: 20,   step: 0.1, fmt: v => v < 2 ? 'HARD' : v < 10 ? 'MEDIUM' : 'SOFT' },
  { key: 'makeup',    label: 'MAKEUP GAIN', min: -20, max: 20,   step: 0.1, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB` },
];

const DEFAULTS: CompParams = {
  threshold: -24,
  ratio:      4,
  attack:     10,
  release:    200,
  knee:       20,
  makeup:      6,
};

// ── Faust compressor engine wiring ───────────────────────────────────────────
// Real DSP: public/faust/compressor/ (dsp-module.wasm + dsp-meta.json),
// exported straight from the Faust IDE — replaces the native
// DynamicsCompressorNode with the actual Faust "compressors.lib" soft-knee
// compressor, driven the same way as the ParamEQ patch in Chapter2b.
const FAUST_BASE_PATH = '/faust/compressor';

// Faust addresses, from public/faust/compressor/dsp-meta.json's `ui` tree.
const ADDR = {
  threshold: '/compressor/Threshold',
  ratio:     '/compressor/Ratio',
  attack:    '/compressor/Attack',
  release:   '/compressor/Release',
  knee:      '/compressor/Knee',
  makeup:    '/compressor/Makeup_Gain',
  wetDry:    '/compressor/Wet_Dry',
} as const;

type FaustEngineStatus = 'idle' | 'loading' | 'ready' | 'error';

// Pushes every UI param onto a live Faust node. Bypass drives the patch's own
// Wet_Dry to 0 (fully dry passthrough) — a true bypass, same intent as the
// old "threshold=0/ratio=1/knee=40" trick, but done the way the DSP itself
// exposes it rather than faking it from outside. There's no user-facing
// wet/dry mix control (removed — a partial blend didn't help anyone learn
// what the compressor itself was doing), so outside of bypass this always
// pushes 100% wet.
function pushFaustParams(node: FaustNodeLike, params: CompParams, bypass: boolean) {
  if (bypass) {
    node.setParamValue(ADDR.wetDry, 0);
    return;
  }
  node.setParamValue(ADDR.threshold, params.threshold);
  node.setParamValue(ADDR.ratio,     params.ratio);
  node.setParamValue(ADDR.knee,      params.knee);
  node.setParamValue(ADDR.attack,    params.attack);   // ms — matches the patch's own unit
  node.setParamValue(ADDR.release,   params.release);  // ms
  node.setParamValue(ADDR.makeup,    params.makeup);
  node.setParamValue(ADDR.wetDry,    100);              // patch takes 0..100 — always fully wet
}

// Renders an uploaded track through the same Faust compressor patch offline
// (an OfflineAudioContext instead of a live one), so it can be exported as a
// WAV — mirrors the live graph in startAudio() but with no meters/scheduler.
async function renderCompressorOffline(
  generator: FaustMonoDspGenerator,
  meta: FaustDspMeta,
  dspModule: WebAssembly.Module,
  source: AudioBuffer,
  params: CompParams,
  bypass: boolean,
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate);
  const factory = { module: dspModule, json: JSON.stringify(meta), soundfiles: {} };
  const node = await generator.createNode(
    offlineCtx as unknown as AudioContext, meta.name, factory, false, 512,
  ) as unknown as FaustNodeLike;
  pushFaustParams(node, params, bypass);

  const src = offlineCtx.createBufferSource();
  src.buffer = source;
  src.connect(node as unknown as AudioNode);
  (node as unknown as AudioNode).connect(offlineCtx.destination);
  src.start();
  return offlineCtx.startRendering();
}

// ── Transfer function math ────────────────────────────────────────────────────
type ShapeParams = Pick<CompParams, 'threshold' | 'ratio' | 'knee'>;

function applyCompression(inputDb: number, p: ShapeParams): number {
  const { threshold, ratio, knee } = p;
  const diff = inputDb - threshold;
  // Hard knee (knee=0): no transition region, avoid division by zero
  if (knee === 0) return inputDb <= threshold ? inputDb : threshold + diff / ratio;
  const halfKnee = knee / 2;
  if (2 * diff < -knee) return inputDb;
  if (2 * diff > knee)  return threshold + diff / ratio;
  return inputDb + ((1 / ratio - 1) * (diff + halfKnee) ** 2) / (2 * knee);
}

// ── HiDPI canvas helper ───────────────────────────────────────────────────────
function hiDpi(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.clientWidth  || canvas.width;
  const H   = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W, H };
}

// ── Canvas: main transfer function ────────────────────────────────────────────
// Input axis stays -60..0 dB (that's the useful signal range coming in), but
// the output axis gets extra headroom above 0 dB — Makeup Gain (up to +24 dB)
// pushes the curve above unity, and without that headroom the makeup-shifted
// curve would just clip off the top of the graph and look like nothing
// happened.
function drawTransfer(canvas: HTMLCanvasElement, params: CompParams) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;
  const IN_MIN = -60, IN_MAX = 0;
  const OUT_MIN = -60, OUT_MAX = 24;
  const toX = (db: number) => ((db - IN_MIN) / (IN_MAX - IN_MIN)) * W;
  const toY = (db: number) => H - ((db - OUT_MIN) / (OUT_MAX - OUT_MIN)) * H;

  ctx.fillStyle = '#0D0D0F'; ctx.fillRect(0, 0, W, H);

  // Grid — vertical lines follow the input axis, horizontal lines the output axis
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  for (let db = IN_MIN; db <= IN_MAX; db += 10) {
    ctx.beginPath(); ctx.moveTo(toX(db), 0); ctx.lineTo(toX(db), H); ctx.stroke();
  }
  for (let db = Math.ceil(OUT_MIN / 12) * 12; db <= OUT_MAX; db += 12) {
    ctx.beginPath(); ctx.moveTo(0, toY(db)); ctx.lineTo(W, toY(db)); ctx.stroke();
  }

  // dB axis tick labels — input along the bottom, output along the left edge
  ctx.fillStyle = '#6A6A7A'; ctx.font = '9px "JetBrains Mono", monospace';
  for (let db = IN_MIN; db <= IN_MAX; db += 10) {
    ctx.fillText(`${db}`, toX(db) + 2, H - 2);
  }
  for (let db = Math.ceil(OUT_MIN / 12) * 12; db <= OUT_MAX; db += 12) {
    ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 2, toY(db) - 2);
  }

  // Unity line (input == output, no makeup)
  ctx.strokeStyle = '#2E2E3D'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(toX(IN_MIN), toY(IN_MIN)); ctx.lineTo(toX(IN_MAX), toY(IN_MAX)); ctx.stroke();
  ctx.setLineDash([]);

  // Threshold marker
  ctx.strokeStyle = '#3D3D52'; ctx.setLineDash([2, 3]);
  const tx = toX(params.threshold);
  ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#8A8A9A'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('THRESH', tx + 3, H - 5);

  // Fill + stroke. The drawn curve is compression (threshold/ratio/knee) PLUS
  // Makeup Gain added on top — Makeup Gain doesn't change the *shape* Faust
  // applies (that's the ratio/knee/threshold curve, unchanged), it just lifts
  // the whole thing vertically, so a shaded ribbon between the two makes that
  // separation visible instead of only the combined result.
  const curve = (p: CompParams, stroke: string, fillAlpha: number) => {
    const baseDb   = (db: number) => applyCompression(db, p);
    const shapedDb = (db: number) => applyCompression(db, p) + p.makeup;

    if (p.makeup !== 0) {
      ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#F5A623';
      ctx.beginPath();
      let firstR = true;
      for (let db = IN_MIN; db <= IN_MAX; db += 0.5) {
        const x = toX(db), y = toY(baseDb(db));
        if (firstR) { ctx.moveTo(x, y); firstR = false; } else ctx.lineTo(x, y);
      }
      for (let db = IN_MAX; db >= IN_MIN; db -= 0.5) {
        ctx.lineTo(toX(db), toY(shapedDb(db)));
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    ctx.strokeStyle = stroke; ctx.lineWidth = 2.5;
    if (fillAlpha > 0) {
      ctx.fillStyle = stroke.replace(')', `,${fillAlpha})`).replace('rgb', 'rgba');
      ctx.beginPath();
      let first = true;
      for (let db = IN_MIN; db <= IN_MAX; db += 0.5) {
        const x = toX(db), y = toY(shapedDb(db));
        first ? (ctx.moveTo(x, H), ctx.lineTo(x, y), (first = false)) : ctx.lineTo(x, y);
      }
      ctx.lineTo(toX(IN_MAX), H); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); let first2 = true;
    for (let db = IN_MIN; db <= IN_MAX; db += 0.5) {
      const x = toX(db), y = toY(shapedDb(db));
      first2 ? (ctx.moveTo(x, y), (first2 = false)) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  curve(params, 'rgb(167,139,250)', 0.08);

  // Operating point crosshairs (example input: 12 dB above threshold)
  const exampleInput  = Math.min(-1, params.threshold + 12);
  const exampleOutput = applyCompression(exampleInput, params) + params.makeup;
  const px = toX(exampleInput);
  const py = toY(exampleOutput);

  ctx.strokeStyle = 'rgba(167,139,250,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, H); ctx.stroke(); // vertical
  ctx.beginPath(); ctx.moveTo(0, py);  ctx.lineTo(px, py); ctx.stroke(); // horizontal
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(167,139,250,0.9)';
  ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();

  // Labels
  ctx.fillStyle = '#8A8A9A'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('INPUT (dB) →', W - 82, H - 5);
  ctx.save(); ctx.translate(11, H * 0.38); ctx.rotate(-Math.PI / 2);
  ctx.fillText('↑ OUT (dB)', 0, 0); ctx.restore();
}

// ── Canvas: live compression scope ───────────────────────────────────────────
// A separate, dedicated analyzer (not drawn into the transfer-function
// graph above) that answers the thing a static transfer curve can't: what do
// ATTACK and RELEASE actually *do* to the signal over time? It scrolls the
// real, smoothed input/output level (the same ballistics feeding the
// gain-staging meters) across a fixed time window — a fast attack shows as a
// sharp dip opening between the two traces right on the transient, a slow
// release shows as that gap closing gradually afterwards, instead of
// snapping shut.
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB   = -54;
const SCOPE_MAX_DB   = 12;

// `makeupDb` is recorded per-point (the Makeup Gain knob's value at that
// instant, 0 when bypassed) so the draw step can split the real measured
// output back into "what compression alone did" vs. "the flat makeup
// boost" — Makeup Gain is a constant additive dB gain applied regardless of
// whether the compressor is actually pulling anything down, so a high
// Threshold silences the gain-reduction part but the makeup boost still
// shows, and without separating the two that reads as "the graph is still
// showing gain changes with no compression happening."
interface ScopePoint { t: number; inputDb: number; outputDb: number; makeupDb: number; }

function drawCompressorScope(
  canvas: HTMLCanvasElement,
  history: ScopePoint[],
  nowT: number,
  thresholdDb: number,
  showThreshold: boolean,
) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;

  const toY = (db: number) => H - ((Math.min(SCOPE_MAX_DB, Math.max(SCOPE_MIN_DB, db)) - SCOPE_MIN_DB) / (SCOPE_MAX_DB - SCOPE_MIN_DB)) * H;
  const toX = (t: number) => ((t - (nowT - SCOPE_WINDOW_S)) / SCOPE_WINDOW_S) * W;

  ctx.fillStyle = '#0D0D0F'; ctx.fillRect(0, 0, W, H);

  // dB grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  ctx.fillStyle = '#6A6A7A'; ctx.font = '9px "JetBrains Mono", monospace';
  for (let db = -48; db <= SCOPE_MAX_DB; db += 12) {
    const y = toY(db);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 3, y - 2);
  }

  // 0 dB reference
  ctx.strokeStyle = '#2E2E3D'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  const y0 = toY(0);
  ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
  ctx.setLineDash([]);

  if (showThreshold) {
    ctx.strokeStyle = 'rgba(245,166,35,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    const ty = toY(thresholdDb);
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(W, ty); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(245,166,35,0.8)';
    ctx.fillText('THRESH', W - 42, ty - 3);
  }

  const visible = history.filter(p => p.t >= nowT - SCOPE_WINDOW_S - 0.25);
  if (visible.length < 2) return;

  const inPts    = visible.map(p => ({ x: toX(p.t), y: toY(p.inputDb) }));
  const outPts   = visible.map(p => ({ x: toX(p.t), y: toY(p.outputDb) }));
  // Estimated output with makeup backed out — dB is a log scale, so
  // subtracting the makeup dB recovers "what compression alone produced."
  const preMakeupPts = visible.map(p => ({ x: toX(p.t), y: toY(p.outputDb - p.makeupDb) }));

  const fillBetween = (top: { x: number; y: number }[], bottom: { x: number; y: number }[], color: string, alpha: number) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    for (const p of top.slice(1)) ctx.lineTo(p.x, p.y);
    for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i].x, bottom[i].y);
    ctx.closePath(); ctx.fill(); ctx.restore();
  };

  // Gain-reduction gap — input vs. compression alone (no makeup). This is
  // the part that should shrink to nothing as Threshold goes up.
  fillBetween(inPts, preMakeupPts, '#FF4D6A', 0.22);
  // Makeup-boost gap — a flat, constant lift on top of compression, present
  // any time Makeup Gain is non-zero regardless of Threshold/Ratio.
  fillBetween(preMakeupPts, outPts, '#F5A623', 0.22);

  // Input trace
  ctx.save(); ctx.globalAlpha = 0.6;
  ctx.strokeStyle = '#00FF87'; ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.moveTo(inPts[0].x, inPts[0].y);
  for (const p of inPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke(); ctx.restore();

  // Output trace (what actually reaches the ear)
  ctx.strokeStyle = '#A78BFA'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(outPts[0].x, outPts[0].y);
  for (const p of outPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

// ── Knob helpers ──────────────────────────────────────────────────────────────
// Linear by default; a spec with toFrac/fromFrac (Attack/Release) overrides
// this with its own segmented mapping instead.
function specToFrac(spec: KnobSpec, v: number): number {
  if (spec.toFrac) return spec.toFrac(v);
  return (v - spec.min) / (spec.max - spec.min);
}
function specFromFrac(spec: KnobSpec, f: number): number {
  if (spec.fromFrac) return spec.fromFrac(f);
  return spec.min + f * (spec.max - spec.min);
}
function knobRotationForSpec(spec: KnobSpec, v: number): number {
  return -140 + specToFrac(spec, v) * 280;
}

// Small numeric input for typing an exact knob value directly, alongside the
// knob itself — keeps its own draft text while focused so the knob's live
// value doesn't clobber what's mid-typing (e.g. typing "20" as "2" then "0").
function KnobNumberInput({
  value, min, max, step, onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const decimals = step < 1 ? Math.max(0, Math.ceil(-Math.log10(step))) : 0;
  const [local, setLocal] = useState(() => value.toFixed(decimals));
  const focusedRef = useRef(false);
  useEffect(() => { if (!focusedRef.current) setLocal(value.toFixed(decimals)); }, [value, decimals]);

  const commit = (text: string) => {
    const n = parseFloat(text);
    const clamped = Number.isNaN(n) ? value : Math.min(max, Math.max(min, n));
    onChange(clamped);
    setLocal(clamped.toFixed(decimals));
  };

  return (
    <input
      type="number"
      className="knob-num-input"
      value={local}
      min={min}
      max={max}
      step={step}
      onFocus={() => { focusedRef.current = true; }}
      onChange={e => {
        setLocal(e.target.value);
        const n = parseFloat(e.target.value);
        if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
      }}
      onBlur={() => { focusedRef.current = false; commit(local); }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}
function polarToCartesian(r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}
function describeArc(r: number, start: number, end: number) {
  if (Math.abs(end - start) < 0.1) end = start + 0.1;
  const s = polarToCartesian(r, start);
  const e = polarToCartesian(r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

// ── Level ballistics ─────────────────────────────────────────────────────────
// The old vertical INPUT/G·R/OUTPUT bar meters were removed — the live
// compression scope below shows the same input/output levels (and the gain
// change between them) as motion over time, which is strictly more
// information than three static bars, so keeping both was redundant. The
// smoothed dB values are still computed here (fast-attack/slow-release, so
// they're readable frame to frame) — the scope is what displays them now.
const METER_FLOOR_DB = -60;

const LEVEL_ATTACK_S  = 0.015;
const LEVEL_RELEASE_S = 0.35;

function levelBallistic(prev: number, target: number, dt: number): number {
  if (dt <= 0) return prev;
  const tau = target > prev ? LEVEL_ATTACK_S : LEVEL_RELEASE_S;
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}

// ── Drum synthesiser ──────────────────────────────────────────────────────────
const BPM      = 120;
const STEP_SEC = 60 / BPM / 2;
const STEPS    = 16;

const PAT_KICK  = [1,0,0,0, 0,0,1,0, 1,0,0,1, 0,0,0,0];
const PAT_SNARE = [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0];
const PAT_HAT   = [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,0,1];
const PAT_OPEN  = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];
const PAT_BASS  = [82,0,0,0, 98,0,0,0, 82,0,0,0, 62,0,0,0];

function noiseBuffer(ctx: AudioContext, dur: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function synthKick(ctx: AudioContext, dest: AudioNode, time: number) {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.06);
  g.gain.setValueAtTime(0.9, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
  osc.connect(g); g.connect(dest); osc.start(time); osc.stop(time + 0.4);
}

function synthSnare(ctx: AudioContext, dest: AudioNode, time: number) {
  const body = ctx.createOscillator(); const bg = ctx.createGain();
  body.type = 'sine'; body.frequency.setValueAtTime(200, time);
  body.frequency.exponentialRampToValueAtTime(100, time + 0.06);
  bg.gain.setValueAtTime(0.5, time); bg.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  body.connect(bg); bg.connect(dest); body.start(time); body.stop(time + 0.15);

  const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(ctx, 0.15);
  const filt  = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 2200; filt.Q.value = 0.6;
  const ng    = ctx.createGain(); ng.gain.setValueAtTime(0.6, time); ng.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  noise.connect(filt); filt.connect(ng); ng.connect(dest); noise.start(time); noise.stop(time + 0.15);
}

function synthHihat(ctx: AudioContext, dest: AudioNode, time: number, open = false) {
  const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(ctx, open ? 0.3 : 0.05);
  const filt  = ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 9000;
  const g     = ctx.createGain(); const decay = open ? 0.25 : 0.04;
  g.gain.setValueAtTime(0.22, time); g.gain.exponentialRampToValueAtTime(0.001, time + decay);
  noise.connect(filt); filt.connect(g); g.connect(dest); noise.start(time); noise.stop(time + decay + 0.01);
}

function synthBass(ctx: AudioContext, dest: AudioNode, time: number, freq: number) {
  const osc  = ctx.createOscillator(); const filt = ctx.createBiquadFilter(); const g = ctx.createGain();
  osc.type = 'sawtooth'; osc.frequency.value = freq;
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(900, time); filt.frequency.exponentialRampToValueAtTime(180, time + 0.25);
  filt.Q.value = 3;
  g.gain.setValueAtTime(0.55, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.38);
  osc.connect(filt); filt.connect(g); g.connect(dest); osc.start(time); osc.stop(time + 0.4);
}

// Peak-normalise an uploaded buffer and fade its ends slightly so the loop
// doesn't click, regardless of channel count or the source recording's level.
function normalizeUploadedBuffer(buf: AudioBuffer, peakTarget = 0.6) {
  let peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak < 1e-6) return;
  const scale = peakTarget / peak;
  const fadeSamples = Math.min(Math.round(buf.sampleRate * 0.01), Math.floor(buf.length / 2));
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] *= scale;
    for (let i = 0; i < fadeSamples; i++) {
      const f = i / fadeSamples;
      data[i] *= f;
      data[data.length - 1 - i] *= f;
    }
  }
}

function scheduleStep(ctx: AudioContext, dest: AudioNode, step: number, time: number) {
  if (PAT_KICK[step])  synthKick  (ctx, dest, time);
  if (PAT_SNARE[step]) synthSnare (ctx, dest, time);
  if (PAT_HAT[step])   synthHihat (ctx, dest, time, false);
  if (PAT_OPEN[step])  synthHihat (ctx, dest, time, true);
  if (PAT_BASS[step])  synthBass  (ctx, dest, time, PAT_BASS[step]);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chapter4() {
  // Main lab state
  const [params,    setParams]    = useState<CompParams>(DEFAULTS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bypass,    setBypass]    = useState(false);
  const [tasks, setTasks]         = useState([false, false, false, false]);

  // Signal source — the built-in synth drum loop, or one of any number of
  // uploaded tracks.
  const [uploadedTracks, setUploadedTracks] = useState<UploadedTrack[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<number | 'synth'>('synth');
  const [decoding,       setDecoding]       = useState(false);
  const [uploadError,    setUploadError]    = useState('');
  const [downloading,    setDownloading]    = useState(false);
  const [downloadError,  setDownloadError]  = useState('');
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const uploadIdSeqRef = useRef(0);
  const activeSourceIdRef  = useRef(activeSourceId);
  const uploadedTracksRef  = useRef(uploadedTracks);
  const bufSourceRef       = useRef<AudioBufferSourceNode | null>(null);
  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
  useEffect(() => { uploadedTracksRef.current = uploadedTracks; }, [uploadedTracks]);

  const activeTrack = activeSourceId !== 'synth' ? uploadedTracks.find(t => t.id === activeSourceId) : undefined;

  // Canvas refs
  const transferRef  = useRef<HTMLCanvasElement>(null);
  const scopeRef     = useRef<HTMLCanvasElement>(null);
  const scopeHistoryRef = useRef<ScopePoint[]>([]);

  // Faust compressor engine (module + meta loaded once on mount, one node
  // instantiated per AudioContext in startAudio — same pattern as
  // Chapter2b's ParamEQ).
  const [engineStatus, setEngineStatus] = useState<FaustEngineStatus>('idle');
  const [engineError,  setEngineError]  = useState<string | null>(null);
  const dspMetaRef    = useRef<FaustDspMeta | null>(null);
  const dspModuleRef  = useRef<WebAssembly.Module | null>(null);
  const generatorRef  = useRef<FaustMonoDspGenerator | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEngineStatus('loading');
    setEngineError(null);
    (async () => {
      try {
        const meta: FaustDspMeta = await (await fetch(`${FAUST_BASE_PATH}/dsp-meta.json`)).json();
        const mod = await compileFaustWasm(`${FAUST_BASE_PATH}/dsp-module.wasm`);
        if (cancelled) return;
        dspMetaRef.current = meta;
        dspModuleRef.current = mod;
        generatorRef.current = new FaustMonoDspGenerator();
        setEngineStatus('ready');
      } catch (err) {
        if (cancelled) return;
        console.error('[Chapter4] failed to load Faust compressor DSP', err);
        setEngineError(err instanceof Error ? err.message : String(err));
        setEngineStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Audio refs
  const ctxRef              = useRef<AudioContext | null>(null);
  const faustNodeRef        = useRef<FaustNodeLike | null>(null);
  const dryAnalRef          = useRef<AnalyserNode | null>(null);
  const wetAnalRef          = useRef<AnalyserNode | null>(null);
  const mixRef              = useRef<GainNode | null>(null);
  const outputRef           = useRef<GainNode | null>(null);        // final sum before destination
  const animRef             = useRef<number>(0);
  const schedulerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextNoteRef         = useRef(0);
  const currentStepRef      = useRef(0);
  const startTokenRef       = useRef(0);                            // invalidates in-flight startAudio() on stop
  const paramsRef           = useRef(params);
  const bypassRef           = useRef(bypass);
  useEffect(() => { paramsRef.current = params; }, [params]);
  useEffect(() => { bypassRef.current = bypass; }, [bypass]);

  // Smoothed input/output dB, chased frame-to-frame in animate() and fed
  // straight into the compression scope's canvas draw — plain refs, not
  // React state, since they update every animation frame and the scope
  // redraws itself directly rather than through a re-render.
  const smoothedInputDbRef  = useRef(METER_FLOOR_DB);
  const smoothedOutputDbRef = useRef(METER_FLOOR_DB);
  const meterClockRef       = useRef<number | null>(null);

  // Knob drag ref (for main lab) — tracks fraction-of-travel (0..1) rather
  // than the raw value, so segmented knobs (Attack/Release) drag through
  // specFromFrac/specToFrac exactly like linear ones.
  const mainDragRef = useRef<{ spec: KnobSpec; startY: number; startFrac: number } | null>(null);

  // ── Main transfer canvas ──────────────────────────────────────────────────
  useEffect(() => {
    if (transferRef.current) {
      // When bypassed, draw unity line (ratio=1 collapses to straight diagonal)
      const displayParams = bypass ? { ...params, threshold: 0, ratio: 1, makeup: 0 } : params;
      drawTransfer(transferRef.current, displayParams);
    }
  }, [params, bypass]);

  // ── Sync Faust compressor params + bypass (single effect) ─────────────────
  // The Faust patch owns its own Wet_Dry and Makeup_Gain internally, so this
  // one effect replaces what used to be two separate syncs (compressor
  // AudioParams, and an outer dry/wet GainNode blend).
  useEffect(() => {
    const node = faustNodeRef.current;
    if (!node) return;
    pushFaustParams(node, params, bypass);
  }, [params, bypass]);

  // ── Task tracking ─────────────────────────────────────────────────────────
  useEffect(() => {
    setTasks([
      params.threshold !== DEFAULTS.threshold,
      Math.abs(params.ratio - 4) < 0.15,
      params.attack !== DEFAULTS.attack || params.release !== DEFAULTS.release,
      params.makeup > 0 && params.makeup !== DEFAULTS.makeup,
    ]);
  }, [params]);

  // ── Scheduler ─────────────────────────────────────────────────────────────
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current; const mix = mixRef.current;
    if (!ctx || !mix) return;
    while (nextNoteRef.current < ctx.currentTime + 0.1) {
      scheduleStep(ctx, mix, currentStepRef.current, nextNoteRef.current);
      currentStepRef.current = (currentStepRef.current + 1) % STEPS;
      nextNoteRef.current   += STEP_SEC;
    }
    schedulerRef.current = setTimeout(runScheduler, 25);
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────────
  const animate = useCallback(() => {
    const dryAnal = dryAnalRef.current; const wetAnal = wetAnalRef.current;

    // Real elapsed time since the last frame, used to drive the meter
    // ballistics below (not just a fixed per-frame step) so the meters read
    // the same regardless of frame rate.
    const now = ctxRef.current?.currentTime ?? performance.now() / 1000;
    const dt  = meterClockRef.current !== null ? Math.max(0, Math.min(0.2, now - meterClockRef.current)) : 0;
    meterClockRef.current = now;

    if (dryAnal) {
      const buf = new Float32Array(dryAnal.fftSize); dryAnal.getFloatTimeDomainData(buf);

      // Real instantaneous peak off the pre-compression tap, smoothed with
      // fast-attack/slow-release ballistics so it's actually readable frame
      // to frame instead of jumping around with every sample.
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      const rawInputDb = peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
      smoothedInputDbRef.current = levelBallistic(smoothedInputDbRef.current, rawInputDb, dt);
    }
    if (wetAnal) {
      const buf = new Float32Array(wetAnal.fftSize); wetAnal.getFloatTimeDomainData(buf);

      // Real post-compression peak (post makeup gain).
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      const rawOutputDb = peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
      smoothedOutputDbRef.current = levelBallistic(smoothedOutputDbRef.current, rawOutputDb, dt);
    }

    // Live compression scope — records the smoothed input/output dB into a
    // scrolling history, so Attack/Release are visible as actual motion on
    // the real signal instead of only as numbers on a knob.
    if (dryAnal && wetAnal) {
      const history = scopeHistoryRef.current;
      history.push({
        t: now,
        inputDb: smoothedInputDbRef.current,
        outputDb: smoothedOutputDbRef.current,
        makeupDb: bypassRef.current ? 0 : paramsRef.current.makeup,
      });
      const cutoff = now - SCOPE_WINDOW_S - 0.5;
      while (history.length > 0 && history[0].t < cutoff) history.shift();
      if (scopeRef.current) {
        drawCompressorScope(scopeRef.current, history, now, paramsRef.current.threshold, !bypassRef.current);
      }
    }

    animRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Start / Stop audio ────────────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
      // Faust engine still loading (or failed) — the topbar status/error
      // message below covers user feedback; Play is also disabled until ready.
      return;
    }
    const myToken = ++startTokenRef.current;

    const ctx = new AudioContext();

    // mix → dryAnal (viz tap) ─┐
    //     └→ faustNode (compression + makeup) → wetAnal → output → destination
    const mix = ctx.createGain(); mix.gain.value = 0.85;
    const dryAnal = ctx.createAnalyser(); dryAnal.fftSize = 1024; dryAnal.smoothingTimeConstant = 0.4;
    const wetAnal = ctx.createAnalyser(); wetAnal.fftSize = 1024; wetAnal.smoothingTimeConstant = 0.4;
    const output = ctx.createGain(); output.gain.value = 1;

    const factory = { module: dspModuleRef.current, json: JSON.stringify(dspMetaRef.current), soundfiles: {} };
    let faustNode: FaustNodeLike;
    try {
      faustNode = await generatorRef.current.createNode(
        ctx, dspMetaRef.current.name, factory, false, 512,
      ) as unknown as FaustNodeLike;
    } catch (err) {
      console.error('[Chapter4] failed to build Faust compressor node', err);
      ctx.close();
      return;
    }

    // stopAudio() (or a second startAudio()) ran while we were awaiting — bail
    if (myToken !== startTokenRef.current) { try { ctx.close(); } catch { /* ok */ } return; }

    pushFaustParams(faustNode, params, bypass);

    ctxRef.current = ctx;
    mixRef.current = mix;
    dryAnalRef.current = dryAnal;
    wetAnalRef.current = wetAnal;
    outputRef.current = output;
    faustNodeRef.current = faustNode;

    mix.connect(dryAnal);                                     // tap for dry waveform + GR estimate
    mix.connect(faustNode as unknown as AudioNode);            // through the Faust compressor
    (faustNode as unknown as AudioNode).connect(wetAnal);
    wetAnal.connect(output);
    output.connect(ctx.destination);

    // Signal source: either the built-in synth drum loop, or a looping
    // uploaded track, feeding into the same `mix` node either way.
    const track = activeSourceIdRef.current !== 'synth'
      ? uploadedTracksRef.current.find(t => t.id === activeSourceIdRef.current)
      : undefined;

    if (track) {
      const bufSrc = ctx.createBufferSource();
      bufSrc.buffer = track.buffer;
      bufSrc.loop   = true;
      bufSrc.connect(mix);
      bufSrc.start();
      bufSourceRef.current = bufSrc;
    } else {
      nextNoteRef.current = ctx.currentTime + 0.05; currentStepRef.current = 0;
      runScheduler();
    }

    scopeHistoryRef.current = [];
    animRef.current = requestAnimationFrame(animate);
    setIsPlaying(true);
  }, [engineStatus, params, bypass, runScheduler, animate]);

  const stopAudio = useCallback(() => {
    startTokenRef.current++; // invalidate any in-flight startAudio()
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    if (bufSourceRef.current) {
      try { bufSourceRef.current.stop(); } catch { /* ok */ }
      bufSourceRef.current.disconnect();
      bufSourceRef.current = null;
    }
    if (faustNodeRef.current) {
      try { (faustNodeRef.current as unknown as AudioNode).disconnect(); } catch { /* ok */ }
      faustNodeRef.current = null;
    }
    ctxRef.current?.close();
    ctxRef.current = null;
    dryAnalRef.current = null; wetAnalRef.current = null; mixRef.current = null;
    outputRef.current = null;
    smoothedInputDbRef.current = METER_FLOOR_DB;
    smoothedOutputDbRef.current = METER_FLOOR_DB;
    meterClockRef.current = null;
    setIsPlaying(false);
    scopeHistoryRef.current = [];
    if (scopeRef.current) {
      const c = scopeRef.current.getContext('2d')!;
      c.fillStyle = '#0D0D0F'; c.fillRect(0, 0, scopeRef.current.width, scopeRef.current.height);
    }
  }, []);

  useEffect(() => () => {
    startTokenRef.current++;
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    if (bufSourceRef.current) {
      try { bufSourceRef.current.stop(); } catch { /* ok */ }
    }
    if (faustNodeRef.current) {
      try { (faustNodeRef.current as unknown as AudioNode).disconnect(); } catch { /* ok */ }
    }
    ctxRef.current?.close();
  }, []);

  // ── Signal source: switch tab / upload new track ──────────────────────────
  const handleSelectSource = useCallback((id: number | 'synth') => {
    stopAudio();
    setActiveSourceId(id);
  }, [stopAudio]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    stopAudio();
    setUploadError('');
    setDecoding(true);

    let tmpCtx: AudioContext | null = null;
    try {
      tmpCtx = new AudioContext();
      if (tmpCtx.state === 'suspended') await tmpCtx.resume();

      const arrayBuf = await file.arrayBuffer();
      const decoded  = await tmpCtx.decodeAudioData(arrayBuf);
      normalizeUploadedBuffer(decoded);

      const track: UploadedTrack = {
        id: ++uploadIdSeqRef.current,
        name: file.name.replace(/\.[^/.]+$/, '').toUpperCase().slice(0, 24),
        buffer: decoded,
      };

      setUploadedTracks(prev => [...prev, track]);
      setActiveSourceId(track.id);
    } catch (err) {
      console.error('Failed to decode audio file', err);
      setUploadError('Could not read that file — try an mp3, wav, or m4a.');
    } finally {
      tmpCtx?.close();
      setDecoding(false);
    }
  }, [stopAudio]);

  // Renders the currently active uploaded track through the compressor
  // (with current knob/bypass settings) and downloads it as a WAV — the
  // "download after processing" counterpart to the upload button above.
  const handleDownload = useCallback(async () => {
    const track = activeTrack;
    if (!track || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) return;
    setDownloadError('');
    setDownloading(true);
    try {
      const rendered = await renderCompressorOffline(
        generatorRef.current, dspMetaRef.current, dspModuleRef.current,
        track.buffer, params, bypass,
      );
      downloadAudioBufferAsWav(rendered, `${track.name || 'compressor-studio'}-compressed.wav`);
    } catch (err) {
      console.error('[Chapter4] failed to render audio for download', err);
      setDownloadError('Could not render the audio for download — see console for details.');
    } finally {
      setDownloading(false);
    }
  }, [activeTrack, params, bypass]);

  // ── Main lab knob drag ────────────────────────────────────────────────────
  const onMainKnobDown = useCallback((e: React.MouseEvent, spec: KnobSpec, val: number) => {
    e.preventDefault();
    mainDragRef.current = { spec, startY: e.clientY, startFrac: specToFrac(spec, val) };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = mainDragRef.current; if (!d) return;
      const frac    = Math.min(1, Math.max(0, d.startFrac + (d.startY - e.clientY) / 220));
      const raw     = specFromFrac(d.spec, frac);
      const clamped = Math.min(d.spec.max, Math.max(d.spec.min, Math.round(raw / d.spec.step) * d.spec.step));
      setParams(p => ({ ...p, [d.spec.key]: clamped }));
    };
    const onUp = () => { mainDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const reset = useCallback(() => setParams(DEFAULTS), []);

  // Derived
  const TASK_LABELS = ['Set threshold', 'Set ratio to 4:1', 'Adjust attack / release', 'Apply makeup gain'];

  // Signal-source tab row — lets the source be switched (or a new one uploaded).
  const renderSourceRow = () => (
    <div className="eq-tabrow" style={{
      display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center',
      padding: '0.5rem 0 0.1rem',
    }}>
      <button
        onClick={() => handleSelectSource('synth')}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem',
          padding: '0.3rem 0.65rem',
          background: activeSourceId === 'synth' ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
          border: `1px solid ${activeSourceId === 'synth' ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
          borderRadius: '3px',
          color: activeSourceId === 'synth' ? 'var(--purple)' : 'var(--text-dim)',
          fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>🥁</span>
        <span>DRUM LOOP</span>
      </button>

      {uploadedTracks.map(track => {
        const active = activeSourceId === track.id;
        return (
          <button
            key={track.id}
            onClick={() => handleSelectSource(track.id)}
            title={track.name}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.3rem 0.65rem',
              background: active ? 'rgba(0,255,135,0.13)' : 'var(--surface)',
              border: `1px solid ${active ? 'rgba(0,255,135,0.5)' : 'var(--border)'}`,
              borderRadius: '3px',
              color: active ? 'var(--green)' : 'var(--text-dim)',
              fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '0.85rem' }}>📁</span>
            <span>{track.name}</span>
          </button>
        );
      })}

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileSelected}
        style={{ display: 'none' }}
      />
      <button
        onClick={handleUploadClick}
        disabled={decoding}
        title="Upload your own audio to run through the compressor"
        style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem',
          padding: '0.3rem 0.65rem',
          background: 'var(--surface)',
          border: '1px dashed var(--border)',
          borderRadius: '3px',
          color: 'var(--text-dim)',
          fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
          cursor: decoding ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>{decoding ? '⏳' : '+'}</span>
        <span>{decoding ? 'DECODING…' : 'UPLOAD AUDIO'}</span>
      </button>
      {activeTrack && (
        <button
          onClick={() => { void handleDownload(); }}
          disabled={downloading}
          title="Render the active track through the compressor and download it as a WAV"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.3rem 0.65rem',
            background: 'var(--surface)',
            border: '1px dashed var(--border)',
            borderRadius: '3px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
            cursor: downloading ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: '0.85rem' }}>{downloading ? '⏳' : '⬇'}</span>
          <span>{downloading ? 'RENDERING…' : 'DOWNLOAD AUDIO'}</span>
        </button>
      )}
      {uploadError && (
        <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--mono)', alignSelf: 'center' }}>
          {uploadError}
        </span>
      )}
      {downloadError && (
        <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--mono)', alignSelf: 'center' }}>
          {downloadError}
        </span>
      )}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="comp-lab">
      {/* Top bar */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--purple-dim)', border: '1px solid rgba(167,139,250,0.4)' }}>⬡</div>
          <div>
            <div className="lab-name">Compressor Studio</div>
            <div className="lab-subtitle">DYNAMICS</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`toggle-btn${isPlaying ? ' on' : ''}`}
              style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-dim)' } : {}}
              onClick={isPlaying ? stopAudio : () => { void startAudio(); }}
              disabled={!isPlaying && engineStatus !== 'ready'}
              title={engineStatus === 'loading' ? 'Loading Faust compressor engine…' : engineStatus === 'error' ? (engineError ?? 'Faust engine failed to load') : undefined}
            >
              {isPlaying ? '⏹ STOP' : engineStatus === 'loading' ? '⏳ LOADING…' : engineStatus === 'error' ? '⚠ ENGINE ERROR' : '▶ PLAY'}
            </button>
            <button className={`toggle-btn${bypass    ? ' on' : ''}`} onClick={() => setBypass(b => !b)}>
              {bypass ? 'BYPASS: ON' : 'BYPASS: OFF'}
            </button>
          </div>
          <div className="lab-status" style={{ color: isPlaying ? 'var(--purple)' : 'var(--text-dim)' }}>
            <div className="status-dot" style={{
              background: isPlaying ? 'var(--purple)' : 'var(--text-faint)',
              boxShadow:  isPlaying ? '0 0 6px var(--purple)' : 'none',
              animation:  isPlaying ? undefined : 'none',
            }} />
            {isPlaying ? (bypass ? 'BYPASSED' : 'ACTIVE') : 'STOPPED'}
          </div>
        </div>
      </div>

      {/* Signal source selector — drum loop or any uploaded track */}
      <div style={{ padding: '0 1.25rem', borderBottom: '1px solid var(--border)' }}>
        {renderSourceRow()}
      </div>

      {/* Body */}
      <div className="comp-body">
        {/* Left: knobs + GR */}
        <div className="comp-controls">
          <div className="canvas-label" style={{ marginBottom: '1rem' }}>
            COMPRESSOR PARAMETERS · DRAG KNOBS VERTICALLY
          </div>

          {/* Knobs, evenly spread across the full control column now that the
              old meter column beside them is gone — the live scope on the
              right already covers input/output/gain-change, so this panel
              is just the controls themselves. */}
          <div className="knob-grid">
            {KNOBS.map(spec => {
              const val = params[spec.key] as number;
              const rot = knobRotationForSpec(spec, val);
              return (
                <div className="knob-wrap" key={spec.key}>
                  <div style={{ position: 'relative', width: 64, height: 64 }}>
                    <svg style={{ position: 'absolute', top: 0, left: 0 }} width={64} height={64} viewBox="-32 -32 64 64">
                      <path d={describeArc(28, -140, 140)} fill="none" stroke="#2E2E3D" strokeWidth={3} strokeLinecap="round" />
                      <path d={describeArc(28, -140, rot)} fill="none" stroke="#A78BFA" strokeWidth={3} strokeLinecap="round" opacity={0.85} />
                    </svg>
                    <div
                      className="big-knob"
                      style={{ position: 'absolute', top: 6, left: 6, width: 52, height: 52, cursor: 'ns-resize', userSelect: 'none' }}
                      onMouseDown={e => onMainKnobDown(e, spec, val)}
                    >
                      <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        width: 3, height: 16, background: '#E8E8EC', borderRadius: 2,
                        transformOrigin: 'bottom center',
                        transform: `translate(-50%, -100%) rotate(${rot}deg)`,
                        marginTop: -2,
                      }} />
                    </div>
                  </div>
                  <div className="knob-name">{spec.label}</div>
                  <div className="knob-val">{spec.fmt(val)}</div>
                  <KnobNumberInput
                    value={val}
                    min={spec.min}
                    max={spec.max}
                    step={spec.step}
                    onChange={v => setParams(p => ({ ...p, [spec.key]: v }))}
                  />
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="concept-callout" style={{ background: 'var(--purple-dim)', borderColor: 'rgba(167,139,250,0.2)' }}>
              <strong style={{ color: 'var(--purple)' }}>Concept: </strong>
              {params.ratio.toFixed(0)}:1 ratio — {params.ratio > 10 ? 'Limiting territory. Very aggressive.' : params.ratio > 6 ? 'Heavy compression. Peak control.' : params.ratio > 3 ? 'Classic glue. Musical.' : 'Gentle, transparent.'}
              {' '}Toggle <strong style={{ color: 'var(--purple)' }}>BYPASS</strong> while playing to A/B.
            </div>
          </div>
        </div>

        {/* Right: transfer + live scope */}
        <div className="comp-visual">
          <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>
            TRANSFER FUNCTION — INPUT vs OUTPUT
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
              · shape set by THRESHOLD / RATIO / KNEE, <span style={{ color: 'var(--amber)' }}>MAKEUP GAIN</span> shifts it up (amber) — attack &amp; release are time-domain, see scope below
            </span>
          </div>
          <div className="transfer-graph">
            <canvas ref={transferRef} width={400} height={200} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>

          <div className="canvas-label" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
            LIVE COMPRESSION SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
              · real input/output level over time — watch ATTACK bite on transients &amp; RELEASE let go
            </span>
          </div>
          <div className="scope-graph">
            <canvas ref={scopeRef} width={400} height={150} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>
          <div className="legend-row" style={{ marginTop: '0.5rem', marginBottom: 0, flexWrap: 'wrap' }}>
            <div className="legend-item"><span className="legend-line" style={{ background: '#00FF87' }} />INPUT</div>
            <div className="legend-item"><span className="legend-line" style={{ background: '#A78BFA' }} />OUTPUT</div>
            <div className="legend-item"><span className="legend-line" style={{ background: '#FF4D6A' }} />GAIN REDUCTION</div>
            <div className="legend-item"><span className="legend-line" style={{ background: '#F5A623' }} />MAKEUP BOOST</div>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--text-faint)', marginTop: '0.35rem', lineHeight: 1.5 }}>
            Red is real dB, measured off the live signal — it shrinks toward nothing as Threshold rises. Amber is Makeup Gain, a flat boost applied whether or not the compressor is doing anything, so it stays even at a very high Threshold.
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="tip-box" style={{ background: 'rgba(245,166,35,0.07)', borderColor: 'rgba(245,166,35,0.2)' }}>
              <strong style={{ color: 'var(--amber)' }}>Signal:</strong>{' '}
              {activeTrack
                ? `Your uploaded track — "${activeTrack.name}". Switch to a different track above, or upload another.`
                : 'Synthesised drum groove — kick, snare, hi-hat + bass. Percussive transients make compression clearly audible.'}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="lab-footer">
        <div className="task-list" style={{ flexDirection: 'row', gap: '1rem' }}>
          {TASK_LABELS.map((label, i) => (
            <div className="task-item" key={i}>
              <div className={`task-check${tasks[i] ? ' done' : ''}`}>{tasks[i] ? '✓' : ''}</div>
              {label}
            </div>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn-secondary" onClick={reset}>Reset</button>
          <button className="btn-primary">Submit & Continue →</button>
        </div>
      </div>
    </div>
  );
}
