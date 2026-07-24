import { useRef, useState, useEffect, useCallback } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { compileFaustWasm, type FaustDspMeta, type FaustNodeLike } from '../faust/faustTypes';
import { downloadAudioBufferAsWav } from '../audio/wavRender';

// ── Chapter 12 — De-Esser Studio ────────────────────────────────────────────
// "Tame Sibilance with a Split-Band De-Esser". Real DSP lives at
// public/faust/deesser/ (source: deesser.dsp, compiled to dsp-module.wasm +
// dsp-meta.json) — a Faust patch modeled after Waves RDeEsser (Freq / Type /
// Thresh / Range only — no Mode control exists on the patch, so none is
// shown here). It splits the signal at Freq into a low band and a high
// ("sibilant") band using either a gentle shelf pair or a ~1-octave
// band-pass (Type), then compresses the high band once it crosses Thresh,
// capped at a maximum cut of Range dB. Driven the same way as the limiter
// (Chapter11) / compressor (Chapter4) / ParamEQ (Chapter2b) patches: load
// the wasm module + meta once, instantiate one node per AudioContext, push
// every param onto it by Faust address.
//
// v1.4 of the patch added a real Gain_Reduction bargraph (same idea as the
// limiter's), so the live "Attenuation" readout below reads the DSP's own
// actual gain reduction (via setOutputParamHandler, see ADDR.gainReduction)
// instead of estimating it from broadband input/output level. That estimate
// used to make Band-Pass look broken — its sibilant band is only ~1 octave
// wide, a small slice of total signal energy, so a real cut there barely
// moved a broadband level reading even though it was being applied
// correctly. The frequency-domain split-band curve above it (green/red) is
// a static, illustrative shape (like the limiter's transfer-function curve)
// — it shows *where* the split happens, while the live scope below shows
// *how much* broadband level is moving right now, in motion.

// ── Types ────────────────────────────────────────────────────────────────────
type DeesserType = 0 | 1; // 0 = High-Pass/Shelf, 1 = Band-Pass — matches dsp-meta.json's Type menu exactly

interface DeesserParams {
  freq:   number;       // Hz   1000 → 20000  (split/crossover frequency)
  type:   DeesserType;  //      0 = High-Pass/Shelf, 1 = Band-Pass
  thresh: number;       // dB   -60 → 0        (level, in the sibilant band, above which de-essing engages)
  range:  number;        // dB   -30 → 0        (the hardest cut the sibilant band can ever take)
}

interface UploadedTrack { id: number; name: string; buffer: AudioBuffer; }

interface KnobSpec {
  key:  keyof Pick<DeesserParams, 'freq' | 'thresh' | 'range'>;
  label: string;
  min:   number;
  max:   number;
  step:  number;
  fmt:   (v: number) => string;
}

// Ranges mirror the live bounds in public/faust/deesser/dsp-meta.json.
const KNOBS: KnobSpec[] = [
  { key: 'freq',   label: 'FREQ',   min: 1000, max: 20000, step: 1,   fmt: v => v >= 1000 ? `${(v / 1000).toFixed(2)}k` : `${Math.round(v)} Hz` },
  { key: 'thresh', label: 'THRESH', min: -60,  max: 0,     step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
  { key: 'range',  label: 'RANGE',  min: -30,  max: 0,     step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
];

// Defaults — mirror the `init` values in public/faust/deesser/dsp-meta.json.
const DEFAULTS: DeesserParams = {
  freq:   3385,
  type:   0,
  thresh: -29.6,
  range:  -12.6,
};

const TYPE_OPTIONS: { value: DeesserType; label: string }[] = [
  { value: 0, label: 'High-Pass/Shelf' },
  { value: 1, label: 'Band-Pass' },
];

// ── Faust de-esser engine wiring ──────────────────────────────────────────────
const FAUST_BASE_PATH = '/faust/deesser';

// Faust addresses, from public/faust/deesser/dsp-meta.json's `ui` tree.
// public/faust/deesser/deesser.dsp (v1.4) fixed two bugs that used to live
// here as frontend workarounds, both now fixed at the DSP source instead:
//   1) Band-Pass's bandpass corners are clamped to stay below Nyquist
//      (computed from the live sample rate), so Band-Pass no longer blows
//      up to NaN at high Freq — the full 1000-20000 Hz range is safe again
//      for both Types, no frontend clamp needed.
//   2) The patch now exposes a real Gain_Reduction bargraph (see
//      `gainReduction` below), so the live Attenuation readout can read
//      the DSP's actual gain reduction directly instead of inferring it
//      from broadband input/output level — which used to make Band-Pass
//      look like it was "always passing" even when it was working, since
//      its ~1-octave sibilant band is a small fraction of total signal
//      energy and barely moves a broadband level reading.
const ADDR = {
  freq:   '/deesser/Freq',
  type:   '/deesser/Type',
  thresh: '/deesser/Thresh',
  range:  '/deesser/Range',
  gainReduction: '/deesser/Gain_Reduction', // read-only hbargraph output
} as const;

type FaustEngineStatus = 'idle' | 'loading' | 'ready' | 'error';

// The de-esser patch has no internal Wet_Dry, so bypass and wet/dry mixing
// are done at the WebAudio graph level instead — a dry/wet crossfade around
// the Faust node — same pattern the limiter (Chapter11) and gate
// (Chapter10) use.
function pushFaustParams(node: FaustNodeLike, params: DeesserParams) {
  node.setParamValue(ADDR.freq,   params.freq);
  node.setParamValue(ADDR.type,   params.type);
  node.setParamValue(ADDR.thresh, params.thresh);
  node.setParamValue(ADDR.range,  params.range);
}

// Renders an uploaded track through the same Faust de-esser + dry/wet
// crossfade used live (an OfflineAudioContext instead of a live one), so it
// can be exported as a WAV.
async function renderDeesserOffline(
  generator: FaustMonoDspGenerator,
  meta: FaustDspMeta,
  dspModule: WebAssembly.Module,
  source: AudioBuffer,
  params: DeesserParams,
  bypass: boolean,
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate);

  const dryGain = offlineCtx.createGain(); dryGain.gain.value = bypass ? 1 : 0;
  const wetGain = offlineCtx.createGain(); wetGain.gain.value = bypass ? 0 : 1;

  const factory = { module: dspModule, json: JSON.stringify(meta), soundfiles: {} };
  const node = await generator.createNode(
    offlineCtx as unknown as AudioContext, meta.name, factory, false, 512,
  ) as unknown as FaustNodeLike;
  pushFaustParams(node, params);

  const src = offlineCtx.createBufferSource();
  src.buffer = source;

  src.connect(dryGain);
  dryGain.connect(offlineCtx.destination);

  src.connect(node as unknown as AudioNode);
  (node as unknown as AudioNode).connect(wetGain);
  wetGain.connect(offlineCtx.destination);

  src.start();
  return offlineCtx.startRendering();
}

// ── Frequency-domain split curve math (analytic magnitude-response
// approximations, in dB — a visual approximation of the split-filter shape,
// the same spirit as the limiter's static transfer-function curve) ─────────
const FMIN = 500, FMAX = 20000;
const ATTEN_MIN = -36, ATTEN_MAX = 0;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Butterworth-style magnitude responses (same shape used by Chapter2b's
// ParamEQ HPF/LPF bands) — `order` controls the crossover's steepness: the
// Band-Pass Type uses a steeper split than the gentler High-Pass/Shelf Type,
// mirroring how RDeEsser's two Type options differ in how hard they carve
// the sibilant band out from the rest of the signal.
function butterHighpassDB(f: number, fc: number, order: number): number {
  const ratio = Math.pow(f / fc, 2 * order);
  return 10 * Math.log10(Math.max(ratio / (1 + ratio), 1e-12));
}
function butterLowpassDB(f: number, fc: number, order: number): number {
  const ratio = Math.pow(f / fc, 2 * order);
  return 10 * Math.log10(Math.max(1 / (1 + ratio), 1e-12));
}

function fToFrac(f: number): number { return Math.log10(f / FMIN) / Math.log10(FMAX / FMIN); }
function fracToF(t: number): number { return FMIN * Math.pow(FMAX / FMIN, t); }

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

// ── Canvas: split-band response (green = sibilant/high band, red = low band)
function drawDeesserCurve(canvas: HTMLCanvasElement, params: DeesserParams, liveAttenDb: number, active: boolean) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;

  const toX = (f: number) => fToFrac(f) * W;
  const toY = (db: number) => ((ATTEN_MAX - clamp(db, ATTEN_MIN, ATTEN_MAX)) / (ATTEN_MAX - ATTEN_MIN)) * H;

  ctx.fillStyle = '#0D0D0F'; ctx.fillRect(0, 0, W, H);

  // Frequency grid
  const freqLines: [number, string][] = [[1000, '1K'], [2000, '2K'], [4000, '4K'], [8000, '8K'], [16000, '16K']];
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (const [f] of freqLines) {
    const x = toX(f);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Attenuation grid (0 at top, 36 at bottom — matches a hardware de-esser's
  // own "attenuation" readout, which reads as a positive cut magnitude)
  for (const db of [0, -12, -24, -36]) {
    const y = toY(db);
    ctx.strokeStyle = db === 0 ? '#2E2E3D' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = db === 0 ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  ctx.fillStyle = '#6A6A7A'; ctx.font = '9px "JetBrains Mono", monospace';
  for (const [f, l] of freqLines) ctx.fillText(l, toX(f) - 8, H - 3);
  for (const db of [0, -12, -24, -36]) ctx.fillText(`${Math.abs(db)}`, 3, toY(db) - 2);

  // Split-filter order: Band-Pass (Type 1) carves a steeper crossover than
  // the gentler High-Pass/Shelf (Type 0).
  const order = params.type === 1 ? 3 : 1;

  const N = 160;
  const greenPts: { x: number; y: number }[] = [];
  const redPts:   { x: number; y: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const f = fracToF(t);
    greenPts.push({ x: t * W, y: toY(butterHighpassDB(f, params.freq, order)) });
    redPts.push({ x: t * W, y: toY(butterLowpassDB(f, params.freq, order)) });
  }

  const y0 = toY(0);
  // Fills — where each band is being passed through untouched. The overlap
  // near the crossover naturally blends into the violet-ish tone the
  // reference hardware shows there.
  ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = '#00FF87';
  ctx.beginPath(); ctx.moveTo(greenPts[0].x, y0);
  for (const p of greenPts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(greenPts[greenPts.length - 1].x, y0); ctx.closePath(); ctx.fill(); ctx.restore();

  ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = '#FF4D6A';
  ctx.beginPath(); ctx.moveTo(redPts[0].x, y0);
  for (const p of redPts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(redPts[redPts.length - 1].x, y0); ctx.closePath(); ctx.fill(); ctx.restore();

  // Strokes
  ctx.strokeStyle = '#FF4D6A'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(redPts[0].x, redPts[0].y);
  for (const p of redPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();

  ctx.strokeStyle = '#00FF87'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(greenPts[0].x, greenPts[0].y);
  for (const p of greenPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();

  // Freq (crossover) marker
  ctx.strokeStyle = '#3D3D52'; ctx.setLineDash([2, 3]);
  const fx = toX(params.freq);
  ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#8A8A9A'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('FREQ', fx + 3, H - 15);

  // Live "Attenuation" readout — the real, current gain reduction on the
  // sibilant band, derived from the actual audio graph (see animate() below)
  // rather than a static model — moves down from 0 dB as de-essing engages.
  const ay = toY(liveAttenDb);
  ctx.strokeStyle = 'rgba(245,166,35,0.75)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 2]);
  ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(W, ay); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = active ? '#F5A623' : 'rgba(245,166,35,0.4)';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText(`Attenuation: ${liveAttenDb.toFixed(1)} dB`, 6, Math.max(11, ay - 4));
}

// ── Canvas: live de-esser scope ──────────────────────────────────────────────
// Same idea as the compressor's Live Compression Scope (Chapter4), the
// gate's Live Gate Scope (Chapter10), and the limiter's Live Limiter Scope
// (Chapter11): a scrolling window of level over time. The input trace is the
// real, smoothed broadband input level; the output trace is that same input
// level minus the DSP's real Gain_Reduction (see animate() below) rather
// than a second broadband reading of the final mix — a broadband reading of
// the final mix barely dips for Band-Pass, whose sibilant band is only ~1
// octave wide (a small slice of total signal energy), even though a real
// cut is being applied there. For a de-esser, a burst of "s"/"sh" energy
// shows as a brief dip in the output trace below the input trace — the
// shaded gap between them — while the rest of the signal (vowels, low end)
// passes through untouched.
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB   = -60;
const SCOPE_MAX_DB   = 6;

interface ScopePoint { t: number; inputDb: number; outputDb: number; }

function drawDeesserScope(
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

  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  ctx.fillStyle = '#6A6A7A'; ctx.font = '9px "JetBrains Mono", monospace';
  for (let db = Math.ceil(SCOPE_MIN_DB / 12) * 12; db <= SCOPE_MAX_DB; db += 12) {
    const y = toY(db);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 3, y - 2);
  }

  // Thresh reference line — the level (measured in the sibilant band, but
  // drawn on this same broadband dB scale as a reference) above which
  // de-essing engages. Same "reference line on the live scope" pattern as
  // the limiter's THRESH/CEILING lines (Chapter11) and the gate's
  // GATE OPEN/CLOSE lines (Chapter10).
  if (showThreshold) {
    ctx.strokeStyle = 'rgba(138,138,154,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    const threshY = toY(thresholdDb);
    ctx.beginPath(); ctx.moveTo(0, threshY); ctx.lineTo(W, threshY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(138,138,154,0.85)';
    ctx.fillText('THRESH', W - 42, threshY - 3);
  }

  const visible = history.filter(p => p.t >= nowT - SCOPE_WINDOW_S - 0.25);
  if (visible.length < 2) return;

  const inPts  = visible.map(p => ({ x: toX(p.t), y: toY(p.inputDb) }));
  const outPts = visible.map(p => ({ x: toX(p.t), y: toY(p.outputDb) }));

  // Shaded gap between input and output — the actual attenuation in motion.
  ctx.save(); ctx.globalAlpha = 0.24; ctx.fillStyle = '#F5A623';
  ctx.beginPath();
  ctx.moveTo(inPts[0].x, inPts[0].y);
  for (const p of inPts.slice(1)) ctx.lineTo(p.x, p.y);
  for (let i = outPts.length - 1; i >= 0; i--) ctx.lineTo(outPts[i].x, outPts[i].y);
  ctx.closePath(); ctx.fill(); ctx.restore();

  ctx.save(); ctx.globalAlpha = 0.6;
  ctx.strokeStyle = '#00FF87'; ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.moveTo(inPts[0].x, inPts[0].y);
  for (const p of inPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke(); ctx.restore();

  ctx.strokeStyle = '#4D9EFF'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(outPts[0].x, outPts[0].y);
  for (const p of outPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

// ── Knob helpers (plain linear) ───────────────────────────────────────────────
function specToFrac(spec: KnobSpec, v: number): number {
  return (v - spec.min) / (spec.max - spec.min);
}
function specFromFrac(spec: KnobSpec, f: number): number {
  return spec.min + f * (spec.max - spec.min);
}
function knobRotationForSpec(spec: KnobSpec, v: number): number {
  return -140 + specToFrac(spec, v) * 280;
}

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

// ── Level ballistics — real, smoothed input/output dB, feeding the live
// scope (the "how much is happening right now, in motion" trace). ─────────
const METER_FLOOR_DB = -60;
const LEVEL_ATTACK_S  = 0.01;
const LEVEL_RELEASE_S = 0.15;

function levelBallistic(prev: number, target: number, dt: number): number {
  if (dt <= 0) return prev;
  const tau = target > prev ? LEVEL_ATTACK_S : LEVEL_RELEASE_S;
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}

// ── Gain-reduction readout smoothing — deesser.dsp (v1.4+) exposes a real
// Gain_Reduction bargraph (see ADDR.gainReduction), so the Attenuation
// readout below reads the DSP's own live gain reduction directly rather
// than estimating it from broadband input/output level. Same pattern as
// the limiter's (Chapter11) Gain_Reduction readout.
const GR_READOUT_TAU_S = 0.05;

function grReadoutSmooth(prev: number, target: number, dt: number): number {
  if (dt <= 0) return prev;
  return prev + (target - prev) * (1 - Math.exp(-dt / GR_READOUT_TAU_S));
}

// ── Demo signal: a sustained vowel-ish pad plus periodic sibilant "sss"
// bursts — exactly the material a de-esser exists for. Built once as a
// looping AudioBuffer (same "precomputed loop" pattern as Chapter2b's demo
// pad), so playback is a plain looping BufferSource — no step scheduler
// needed, unlike the drum-machine demo loops in Chapter4/Chapter10/Chapter11.
function normAndFade(buf: AudioBuffer, peakTarget = 0.55): void {
  const chans: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  let peak = 0;
  for (const d of chans) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const scale = peakTarget / Math.max(peak, 0.001);
  const sr = buf.sampleRate;
  const fadeN = Math.round(sr * 0.02);
  for (const d of chans) {
    for (let i = 0; i < d.length; i++) d[i] *= scale;
    for (let i = 0; i < fadeN; i++) {
      const f = i / fadeN;
      d[i] *= f;
      d[d.length - 1 - i] *= f;
    }
  }
}

function createDeesserDemoBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 4;
  const buf = ctx.createBuffer(2, Math.round(sr * dur), sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);

  // Sustained "vowel" pad — a few slow, detuned harmonics around a low male
  // vocal fundamental, breathing in and out so it doesn't feel static.
  const fund = 130.8;
  const harmonics: [number, number][] = [[1, 1.0], [2, 0.5], [3, 0.28], [4, 0.14], [5, 0.08]];
  for (const [ratio, amp] of harmonics) {
    const freq = fund * ratio;
    for (let n = 0; n < L.length; n++) {
      const t = n / sr;
      const breathe = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.4 * t);
      const s = Math.sin(2 * Math.PI * freq * t + Math.sin(2 * Math.PI * 4 * t) * 0.02) * amp * 0.16 * breathe;
      L[n] += s; R[n] += s * 0.95;
    }
  }

  // Periodic sibilant "sss" bursts — high-passed noise with a sharp attack
  // and a natural decay, the classic material a de-esser tames.
  const hpState = { L: 0, R: 0 };
  const burstStarts = [0.35, 1.15, 1.95, 2.55, 3.35];
  for (const startS of burstStarts) {
    const start = Math.round(startS * sr);
    const lenS = 0.16 + Math.random() * 0.08;
    const len = Math.round(lenS * sr);
    for (let i = 0; i < len && start + i < L.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.006) * Math.exp(-t * 14);
      const nL = Math.random() * 2 - 1;
      const nR = Math.random() * 2 - 1;
      // Simple one-pole highpass to push the noise energy up around 6-9kHz
      hpState.L = nL - hpState.L * 0.86; hpState.R = nR - hpState.R * 0.86;
      L[start + i] += hpState.L * env * 0.55;
      R[start + i] += hpState.R * env * 0.55;
    }
  }

  normAndFade(buf);
  return buf;
}

function normalizeUploadedBuffer(buf: AudioBuffer, peakTarget = 0.85) {
  let peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak < 1e-6) return;
  // Ceiling, not a target: only ever turn a hot file DOWN to avoid clipping.
  // `peakTarget / peak` alone would also turn a quiet file UP to hit
  // peakTarget, baking a silent gain boost into the uploaded buffer itself —
  // audible even with the effect bypassed, since it happens once at upload
  // time, before Bypass or any DSP ever sees the audio.
  const scale = Math.min(1, peakTarget / peak);
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chapter12() {
  const [params,    setParams]    = useState<DeesserParams>(DEFAULTS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bypass,    setBypass]    = useState(false);
  const [attenuation, setAttenuation] = useState(0);
  const [tasks, setTasks]         = useState([false, false, false, false]);

  // Signal source — vocal + sibilance demo loop, or an uploaded track.
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
  const demoBufferRef      = useRef<AudioBuffer | null>(null);
  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
  useEffect(() => { uploadedTracksRef.current = uploadedTracks; }, [uploadedTracks]);

  const activeTrack = activeSourceId !== 'synth' ? uploadedTracks.find(t => t.id === activeSourceId) : undefined;

  // Canvas refs
  const curveRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<HTMLCanvasElement>(null);
  const scopeHistoryRef = useRef<ScopePoint[]>([]);

  // Faust de-esser engine (module + meta loaded once on mount, one node
  // instantiated per AudioContext in startAudio — same pattern as Chapter4's
  // compressor / Chapter10's gate / Chapter11's limiter).
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
        console.error('[Chapter12] failed to load Faust de-esser DSP', err);
        setEngineError(err instanceof Error ? err.message : String(err));
        setEngineStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Audio refs
  const ctxRef        = useRef<AudioContext | null>(null);
  const faustNodeRef  = useRef<FaustNodeLike | null>(null);
  const dryAnalRef    = useRef<AnalyserNode | null>(null);
  const mixRef        = useRef<GainNode | null>(null);
  const dryGainRef    = useRef<GainNode | null>(null);
  const wetGainRef    = useRef<GainNode | null>(null);
  const finalAnalRef  = useRef<AnalyserNode | null>(null); // taps the actual blended output (reflects bypass)
  const animRef       = useRef<number>(0);
  const startTokenRef = useRef(0);
  const paramsRef     = useRef(params);
  const bypassRef     = useRef(bypass);
  useEffect(() => { paramsRef.current = params; }, [params]);
  useEffect(() => { bypassRef.current = bypass; }, [bypass]);

  // Meter ballistics state
  const smoothedInputDbRef = useRef(METER_FLOOR_DB);
  const smoothedAttenDbRef = useRef(0);
  const meterClockRef      = useRef<number | null>(null);

  // Latest raw Gain_Reduction value pushed from the audio thread — this is a
  // read-only DSP *output*, never registered as an AudioParam, so it can't
  // be read with faustNode.getParamValue() every frame; it arrives via
  // setOutputParamHandler (see startAudio) instead. Same pattern as the
  // limiter's (Chapter11) grRawRef.
  const grRawRef = useRef(0);

  // Knob drag ref
  const mainDragRef = useRef<{ spec: KnobSpec; startY: number; startFrac: number } | null>(null);

  // ── Sync Faust de-esser params (always live — bypass is handled by the
  // dry/wet crossfade below, not by touching the DSP itself) ───────────────
  useEffect(() => {
    const node = faustNodeRef.current;
    if (!node) return;
    pushFaustParams(node, params);
  }, [params]);

  // ── Bypass (crossfade to dry) ──────────────────────────────────────────────
  useEffect(() => {
    const wet = wetGainRef.current, dry = dryGainRef.current, ac = ctxRef.current;
    if (!wet || !dry || !ac) return;
    const w = bypass ? 0 : 1;
    wet.gain.setTargetAtTime(w,     ac.currentTime, 0.01);
    dry.gain.setTargetAtTime(1 - w, ac.currentTime, 0.01);
  }, [bypass]);

  // ── Static curve redraw while stopped (once playing, animate() redraws
  // every frame so the live Attenuation line can move) ─────────────────────
  useEffect(() => {
    if (!isPlaying && curveRef.current) {
      drawDeesserCurve(curveRef.current, params, 0, false);
    }
  }, [params, isPlaying]);

  // ── Task tracking ─────────────────────────────────────────────────────────
  useEffect(() => {
    setTasks([
      params.freq   !== DEFAULTS.freq,
      params.thresh !== DEFAULTS.thresh,
      params.range  !== DEFAULTS.range,
      params.type   !== DEFAULTS.type,
    ]);
  }, [params]);

  // ── Animation loop ────────────────────────────────────────────────────────
  const animate = useCallback(() => {
    const dryAnal = dryAnalRef.current;

    const now = ctxRef.current?.currentTime ?? performance.now() / 1000;
    const dt  = meterClockRef.current !== null ? Math.max(0, Math.min(0.2, now - meterClockRef.current)) : 0;
    meterClockRef.current = now;

    if (dryAnal) {
      const buf = new Float32Array(dryAnal.fftSize); dryAnal.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      const rawInputDb = peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
      smoothedInputDbRef.current = levelBallistic(smoothedInputDbRef.current, rawInputDb, dt);
    }

    // Live Attenuation: the DSP's own real Gain_Reduction bargraph (see
    // ADDR.gainReduction / grRawRef, pushed via setOutputParamHandler in
    // startAudio), not an estimate from broadband input/output level. That
    // broadband-diff estimate used to badly under-report Band-Pass, whose
    // sibilant band is only ~1 octave wide and so is a small fraction of
    // total signal energy — a real cut there barely moves a broadband
    // level reading even though the DSP is genuinely applying it.
    if (!bypassRef.current) {
      smoothedAttenDbRef.current = grReadoutSmooth(smoothedAttenDbRef.current, grRawRef.current, dt);
      setAttenuation(smoothedAttenDbRef.current);
    } else {
      smoothedAttenDbRef.current = 0;
      setAttenuation(0);
    }

    if (dryAnal && finalAnalRef.current) {
      const history = scopeHistoryRef.current;
      // outputDb is synthesized from the real input level minus the DSP's
      // real Gain_Reduction (smoothedAttenDbRef), not read from finalAnal's
      // broadband peak. A broadband reading of the final mix barely dips
      // for Band-Pass — its sibilant band is only ~1 octave wide, a small
      // slice of total signal energy, so a real several-dB cut there is
      // nearly invisible against the untouched rest of the signal. Driving
      // the trace (and the shaded "cut" area between the two lines) from
      // the actual gain reduction instead makes the scope agree with the
      // Attenuation readout above it for both Types.
      const outputDb = smoothedInputDbRef.current + smoothedAttenDbRef.current;
      history.push({ t: now, inputDb: smoothedInputDbRef.current, outputDb });
      const cutoff = now - SCOPE_WINDOW_S - 0.5;
      while (history.length > 0 && history[0].t < cutoff) history.shift();
      if (scopeRef.current) {
        drawDeesserScope(scopeRef.current, history, now, paramsRef.current.thresh, !bypassRef.current);
      }
    }

    if (curveRef.current) {
      drawDeesserCurve(curveRef.current, paramsRef.current, smoothedAttenDbRef.current, !bypassRef.current);
    }

    animRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Start / Stop audio ────────────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) return;
    const myToken = ++startTokenRef.current;

    const ctx = new AudioContext();

    // mix ─┬→ dryAnal (viz + input-level tap) → dryGain ─┐
    //      └→ faustNode (de-esser) → wetGain ─┴→ output → finalAnal → destination
    const mix = ctx.createGain(); mix.gain.value = 1.0;
    const dryAnal = ctx.createAnalyser(); dryAnal.fftSize = 1024; dryAnal.smoothingTimeConstant = 0.4;
    const dryGain = ctx.createGain(); dryGain.gain.value = bypass ? 1 : 0;
    const wetGain = ctx.createGain(); wetGain.gain.value = bypass ? 0 : 1;
    const output  = ctx.createGain(); output.gain.value = 1;
    const finalAnal = ctx.createAnalyser(); finalAnal.fftSize = 1024; finalAnal.smoothingTimeConstant = 0.35;

    const factory = { module: dspModuleRef.current, json: JSON.stringify(dspMetaRef.current), soundfiles: {} };
    let faustNode: FaustNodeLike;
    try {
      faustNode = await generatorRef.current.createNode(
        ctx, dspMetaRef.current.name, factory, false, 512,
      ) as unknown as FaustNodeLike;
    } catch (err) {
      console.error('[Chapter12] failed to build Faust de-esser node', err);
      ctx.close();
      return;
    }

    if (myToken !== startTokenRef.current) { try { ctx.close(); } catch { /* ok */ } return; }

    pushFaustParams(faustNode, params);

    // Live Gain_Reduction bargraph: a read-only DSP output, never
    // registered as an AudioParam, so getParamValue() on this address
    // would just return 0 forever. The processor posts updates from the
    // audio thread instead; subscribe to them here (same pattern as the
    // limiter's Chapter11).
    grRawRef.current = 0;
    faustNode.setOutputParamHandler?.((path, value) => {
      if (path === ADDR.gainReduction) grRawRef.current = value;
    });

    ctxRef.current = ctx;
    mixRef.current = mix;
    dryAnalRef.current = dryAnal;
    dryGainRef.current = dryGain;
    wetGainRef.current = wetGain;
    finalAnalRef.current = finalAnal;
    faustNodeRef.current = faustNode;

    mix.connect(dryAnal);
    dryAnal.connect(dryGain);
    dryGain.connect(output);

    mix.connect(faustNode as unknown as AudioNode);
    (faustNode as unknown as AudioNode).connect(wetGain);
    wetGain.connect(output);

    output.connect(finalAnal);
    finalAnal.connect(ctx.destination);

    const track = activeSourceIdRef.current !== 'synth'
      ? uploadedTracksRef.current.find(t => t.id === activeSourceIdRef.current)
      : undefined;

    if (!demoBufferRef.current) demoBufferRef.current = createDeesserDemoBuffer(ctx);
    const bufSrc = ctx.createBufferSource();
    bufSrc.buffer = track ? track.buffer : demoBufferRef.current;
    bufSrc.loop   = true;
    bufSrc.connect(mix);
    bufSrc.start();
    bufSourceRef.current = bufSrc;

    scopeHistoryRef.current = [];
    animRef.current = requestAnimationFrame(animate);
    setIsPlaying(true);
  }, [engineStatus, params, bypass, animate]);

  const stopAudio = useCallback(() => {
    startTokenRef.current++;
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
    dryAnalRef.current = null; mixRef.current = null;
    dryGainRef.current = null; wetGainRef.current = null; finalAnalRef.current = null;
    smoothedInputDbRef.current = METER_FLOOR_DB;
    smoothedAttenDbRef.current = 0;
    grRawRef.current = 0;
    meterClockRef.current = null;
    setAttenuation(0); setIsPlaying(false);
    scopeHistoryRef.current = [];
    if (scopeRef.current) {
      const c = scopeRef.current.getContext('2d')!;
      c.fillStyle = '#0D0D0F'; c.fillRect(0, 0, scopeRef.current.width, scopeRef.current.height);
    }
    if (curveRef.current) drawDeesserCurve(curveRef.current, paramsRef.current, 0, false);
  }, []);

  useEffect(() => () => {
    startTokenRef.current++;
    cancelAnimationFrame(animRef.current);
    if (bufSourceRef.current) { try { bufSourceRef.current.stop(); } catch { /* ok */ } }
    if (faustNodeRef.current) { try { (faustNodeRef.current as unknown as AudioNode).disconnect(); } catch { /* ok */ } }
    ctxRef.current?.close();
  }, []);

  // ── Spacebar toggles play/stop ─────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      e.preventDefault();
      if (isPlaying) {
        stopAudio();
      } else if (engineStatus === 'ready') {
        void startAudio();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, engineStatus, startAudio, stopAudio]);

  // ── Signal source: switch tab / upload new track ──────────────────────────
  const handleSelectSource = useCallback((id: number | 'synth') => {
    stopAudio();
    setActiveSourceId(id);
  }, [stopAudio]);

  const handleUploadClick = useCallback(() => { fileInputRef.current?.click(); }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
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

  // Renders the currently active uploaded track through the de-esser (with
  // current knob/bypass settings) and downloads it as a WAV.
  const handleDownload = useCallback(async () => {
    const track = activeTrack;
    if (!track || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) return;
    setDownloadError('');
    setDownloading(true);
    try {
      const rendered = await renderDeesserOffline(
        generatorRef.current, dspMetaRef.current, dspModuleRef.current,
        track.buffer, params, bypass,
      );
      downloadAudioBufferAsWav(rendered, `${track.name || 'deesser-studio'}-deessed.wav`);
    } catch (err) {
      console.error('[Chapter12] failed to render audio for download', err);
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
  const TASK_LABELS = ['Move the split Freq', 'Lower the Thresh', 'Open up the Range', 'Try Band-Pass Type'];

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
          background: activeSourceId === 'synth' ? 'rgba(77,158,255,0.13)' : 'var(--surface)',
          border: `1px solid ${activeSourceId === 'synth' ? 'rgba(77,158,255,0.5)' : 'var(--border)'}`,
          borderRadius: '3px',
          color: activeSourceId === 'synth' ? 'var(--blue)' : 'var(--text-dim)',
          fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>🎙</span>
        <span>VOCAL + SIBILANCE LOOP</span>
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
        title="Upload your own audio to run through the de-esser"
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
          title="Render the active track through the de-esser and download it as a WAV"
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
          <div className="lab-icon" style={{ background: 'var(--blue-dim)', border: '1px solid rgba(77,158,255,0.4)' }}>✂</div>
          <div>
            <div className="lab-name">De-Esser Studio</div>
            <div className="lab-subtitle">DYNAMICS — SPLIT-BAND DE-ESSER</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="badge" style={{
            background: !isPlaying ? 'var(--surface)' : attenuation < -0.3 ? 'rgba(77,158,255,0.15)' : 'rgba(0,255,135,0.12)',
            borderColor: !isPlaying ? 'var(--border)' : attenuation < -0.3 ? 'rgba(77,158,255,0.4)' : 'rgba(0,255,135,0.4)',
            color: !isPlaying ? 'var(--text-faint)' : attenuation < -0.3 ? 'var(--blue)' : 'var(--green)',
          }}>
            {!isPlaying ? '○ IDLE' : attenuation < -0.3 ? `● DE-ESSING ${attenuation.toFixed(1)} dB` : '● PASSING'}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`toggle-btn${isPlaying ? ' on' : ''}`}
              style={isPlaying ? { borderColor: 'var(--blue)', color: 'var(--blue)', background: 'var(--blue-dim)' } : {}}
              onClick={isPlaying ? stopAudio : () => { void startAudio(); }}
              disabled={!isPlaying && engineStatus !== 'ready'}
              title={engineStatus === 'loading' ? 'Loading Faust de-esser engine…' : engineStatus === 'error' ? (engineError ?? 'Faust engine failed to load') : undefined}
            >
              {isPlaying ? '⏹ STOP' : engineStatus === 'loading' ? '⏳ LOADING…' : engineStatus === 'error' ? '⚠ ENGINE ERROR' : '▶ PLAY'}
            </button>
            <button className={`toggle-btn${bypass ? ' on' : ''}`} onClick={() => setBypass(b => !b)}>
              {bypass ? 'BYPASS: ON' : 'BYPASS: OFF'}
            </button>
          </div>
          <div className="lab-status" style={{ color: isPlaying ? 'var(--blue)' : 'var(--text-dim)' }}>
            <div className="status-dot" style={{
              background: isPlaying ? 'var(--blue)' : 'var(--text-faint)',
              boxShadow:  isPlaying ? '0 0 6px var(--blue)' : 'none',
              animation:  isPlaying ? undefined : 'none',
            }} />
            {isPlaying ? (bypass ? 'BYPASSED' : 'ACTIVE') : 'STOPPED'}
          </div>
        </div>
      </div>

      {/* Signal source selector */}
      <div style={{ padding: '0 1.25rem', borderBottom: '1px solid var(--border)' }}>
        {renderSourceRow()}
      </div>

      {/* Body */}
      <div className="comp-body">
        {/* Left: knobs + type dropdown */}
        <div className="comp-controls">
          <div className="canvas-label" style={{ marginBottom: '1rem' }}>
            DE-ESSER PARAMETERS · DRAG KNOBS VERTICALLY
          </div>

          <div className="knob-grid">
            {KNOBS.map(spec => {
              const val = params[spec.key];
              const rot = knobRotationForSpec(spec, val);
              return (
                <div className="knob-wrap" key={spec.key}>
                  <div style={{ position: 'relative', width: 64, height: 64 }}>
                    <svg style={{ position: 'absolute', top: 0, left: 0 }} width={64} height={64} viewBox="-32 -32 64 64">
                      <path d={describeArc(28, -140, 140)} fill="none" stroke="#2E2E3D" strokeWidth={3} strokeLinecap="round" />
                      <path d={describeArc(28, -140, rot)} fill="none" stroke="#4D9EFF" strokeWidth={3} strokeLinecap="round" opacity={0.85} />
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

          {/* Type dropdown — the only other control the Faust patch exposes.
              No Mode selector: dsp-meta.json's ui tree has just these four
              controls, so there's nothing else to show. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
            <label htmlFor="deesser-type" style={{
              fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--text-dim)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Type
            </label>
            <select
              id="deesser-type"
              value={params.type}
              onChange={e => setParams(p => ({ ...p, type: Number(e.target.value) as DeesserType }))}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                color: 'var(--text)',
                fontFamily: 'var(--mono)',
                fontSize: '0.65rem',
                padding: '0.3rem 0.5rem',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="concept-callout" style={{ background: 'var(--blue-dim)', borderColor: 'rgba(77,158,255,0.2)' }}>
              <strong style={{ color: 'var(--blue)' }}>Concept: </strong>
              Freq sets where the signal splits into a low band and a sibilant high band; Thresh decides
              when the high band starts getting compressed; Range caps the hardest cut it can ever take.
              Type decides how sharply the split happens — <strong style={{ color: 'var(--blue)' }}>High-Pass/Shelf</strong> is
              gentle, <strong style={{ color: 'var(--blue)' }}>Band-Pass</strong> carves a steeper, more surgical band out
              around Freq.
            </div>
          </div>
        </div>

        {/* Right: split-band curve + live scope */}
        <div className="comp-visual">
          <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>
            SPLIT-BAND RESPONSE — FREQUENCY vs ATTENUATION
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
              · green = sibilant band, red = low band, shaped by FREQ &amp; TYPE — live scope below shows THRESH/RANGE in motion
            </span>
          </div>
          <div className="transfer-graph">
            <canvas ref={curveRef} width={400} height={200} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>

          <div className="canvas-label" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
            LIVE DE-ESSER SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
              · real input/output level over time — watch the output dip on every "s" burst
            </span>
          </div>
          <div className="scope-graph">
            <canvas ref={scopeRef} width={400} height={150} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>
          <div className="legend-row" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            <div className="legend-item"><span className="legend-line" style={{ background: '#00FF87' }} />INPUT</div>
            <div className="legend-item"><span className="legend-line" style={{ background: '#4D9EFF' }} />OUTPUT</div>
            <div className="legend-item"><span className="legend-line" style={{ background: '#F5A623' }} />ATTENUATION</div>
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
          <button className="btn-primary">Submit &amp; Continue →</button>
        </div>
      </div>
    </div>
  );
}
