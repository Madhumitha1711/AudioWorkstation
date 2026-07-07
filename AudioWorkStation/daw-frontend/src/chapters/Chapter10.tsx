import { useRef, useState, useEffect, useCallback } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { compileFaustWasm, type FaustDspMeta, type FaustNodeLike } from '../faust/faustTypes';
import { downloadAudioBufferAsWav } from '../audio/wavRender';

// ── Chapter 10 — Gate Studio ─────────────────────────────────────────────────
// "Dynamics Processing — Noise Gate". Real DSP lives at public/faust/Gate/
// (dsp-module.wasm + dsp-meta.json) — a Faust hysteresis noise gate (separate
// Gate Open / Gate Close thresholds, so the gate doesn't chatter right at the
// boundary) with its own Attack / Hold / Release envelope and a Floor that
// sets how far down a closed gate attenuates (not all the way to silence).
// Driven the same way as the compressor (Chapter4): load the wasm module +
// meta once, instantiate one node per AudioContext, push every param onto it
// directly by Faust address. The overall lab layout, and the live scope
// analyzer (real input/output level over time, replacing static vertical
// meters), deliberately mirror Chapter4's compressor design — same
// ballistics approach, same .comp-lab/.comp-body/.comp-controls/.comp-visual
// and .scope-graph shared CSS classes.

// ── Types ────────────────────────────────────────────────────────────────────
interface GateParams {
  floor:     number; // dB  -96 → 0    (attenuation depth when fully closed)
  gateOpen:  number; // dB  -80 → 0    (level above which the gate opens)
  gateClose: number; // dB  -80 → 0    (level below which the gate closes — always ≤ Gate Open, the gap is the hysteresis band)
  attack:    number; // ms  0.1 → 100  (how fast the gate opens)
  release:   number; // ms  1 → 1000  (how fast the gate closes)
  hold:      number; // ms  0 → 500   (how long the gate stays open after level drops, before closing begins)
}

interface UploadedTrack { id: number; name: string; buffer: AudioBuffer; }

interface KnobSpec {
  key:   keyof GateParams;
  label: string;
  min:   number;
  max:   number;
  step:  number;
  fmt:   (v: number) => string;
}

// Ranges mirror the live bounds in public/faust/Gate/dsp-meta.json (the Faust
// gate patch clamps its own params internally, so dialing a knob past these
// won't change the audio any further even though the knob keeps turning).
const KNOBS: KnobSpec[] = [
  { key: 'gateOpen',  label: 'GATE OPEN',  min: -80, max: 0,   step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
  { key: 'gateClose', label: 'GATE CLOSE', min: -80, max: 0,   step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
  { key: 'attack',    label: 'ATTACK',     min: 0.1, max: 100, step: 0.1, fmt: v => `${v.toFixed(1)} ms` },
  { key: 'hold',      label: 'HOLD',       min: 0,   max: 500, step: 1,   fmt: v => `${Math.round(v)} ms` },
  { key: 'release',   label: 'RELEASE',    min: 1,   max: 1000, step: 1,  fmt: v => `${Math.round(v)} ms` },
  { key: 'floor',     label: 'FLOOR',      min: -96, max: 0,   step: 1,   fmt: v => `${Math.round(v)} dB` },
];

// Defaults — mirror the `init` values in public/faust/Gate/dsp-meta.json.
const DEFAULTS: GateParams = {
  floor:     -60,
  gateOpen:  -32,
  gateClose: -38,
  attack:      2,
  release:    30,
  hold:       10,
};

// ── Faust gate engine wiring ─────────────────────────────────────────────────
// Real DSP: public/faust/Gate/ (dsp-module.wasm + dsp-meta.json), a hysteresis
// noise gate exported straight from the Faust IDE (analyzers.lib + basics.lib
// envelope following, driven the same way as the ParamEQ / compressor /
// reverb / delay patches elsewhere in this app).
const FAUST_BASE_PATH = '/faust/Gate';

// Faust addresses, from public/faust/Gate/dsp-meta.json's `ui` tree.
const ADDR = {
  floor:     '/NOISE_GATE_STUDIO/Floor',
  gateOpen:  '/NOISE_GATE_STUDIO/Gate_Open',
  gateClose: '/NOISE_GATE_STUDIO/Gate_Close',
  attack:    '/NOISE_GATE_STUDIO/Attack',
  release:   '/NOISE_GATE_STUDIO/Release',
  hold:      '/NOISE_GATE_STUDIO/Hold',
} as const;

type FaustEngineStatus = 'idle' | 'loading' | 'ready' | 'error';

// The gate patch has no internal Wet_Dry (unlike the compressor's), so bypass
// and wet/dry mixing are done at the WebAudio graph level instead — a
// dry/wet crossfade around the Faust node — same pattern as Chapter7's
// saturation dry/wet bypass path.
function pushFaustParams(node: FaustNodeLike, params: GateParams) {
  node.setParamValue(ADDR.floor,     params.floor);
  node.setParamValue(ADDR.gateOpen,  params.gateOpen);
  node.setParamValue(ADDR.gateClose, Math.min(params.gateClose, params.gateOpen));
  node.setParamValue(ADDR.attack,    params.attack);
  node.setParamValue(ADDR.release,   params.release);
  node.setParamValue(ADDR.hold,      params.hold);
}

// Renders an uploaded track through the same Faust gate + dry/wet crossfade
// used live (an OfflineAudioContext instead of a live one), so it can be
// exported as a WAV — mirrors the graph built in startAudio() but with no
// analysers/meters.
async function renderGateOffline(
  generator: FaustMonoDspGenerator,
  meta: FaustDspMeta,
  dspModule: WebAssembly.Module,
  source: AudioBuffer,
  params: GateParams,
  bypass: boolean,
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate);

  // No user-facing wet/dry mix control (removed — same call as the
  // compressor's: a partial blend didn't help anyone learn what the gate
  // itself was doing) — always fully wet outside of bypass.
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

// ── Transfer function math (static curve — a visual approximation; Attack /
// Hold / Release are time-domain and shown on the waveform pane instead) ────
type ShapeParams = Pick<GateParams, 'gateOpen' | 'gateClose' | 'floor'>;

function applyGate(inputDb: number, p: ShapeParams): number {
  const { gateOpen, floor } = p;
  const gateClose = Math.min(p.gateClose, p.gateOpen);
  if (inputDb >= gateOpen)  return inputDb;              // fully open — unity
  if (inputDb <= gateClose) return inputDb + floor;       // fully closed — attenuated to floor
  const span = Math.max(0.01, gateOpen - gateClose);
  const frac = Math.max(0, Math.min(1, (inputDb - gateClose) / span));
  return inputDb + floor * (1 - frac);
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

// ── Canvas: gate transfer function ───────────────────────────────────────────
function drawTransfer(canvas: HTMLCanvasElement, params: GateParams) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;
  const DB_MIN = -80, DB_MAX = 0;
  const toX = (db: number) => ((db - DB_MIN) / (DB_MAX - DB_MIN)) * W;
  const toY = (db: number) => H - ((Math.max(DB_MIN, db) - DB_MIN) / (DB_MAX - DB_MIN)) * H;

  ctx.fillStyle = '#0D0D0F'; ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  for (let db = DB_MIN; db <= DB_MAX; db += 10) {
    ctx.beginPath(); ctx.moveTo(toX(db), 0); ctx.lineTo(toX(db), H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toY(db)); ctx.lineTo(W, toY(db)); ctx.stroke();
  }

  // dB axis tick labels (every 10 dB) — input along the bottom, output along the left edge
  ctx.fillStyle = '#6A6A7A'; ctx.font = '9px "JetBrains Mono", monospace';
  for (let db = DB_MIN; db <= DB_MAX; db += 10) {
    ctx.fillText(`${db}`, toX(db) + 2, H - 2);
    ctx.fillText(`${db}`, 2, toY(db) - 2);
  }

  // Unity line
  ctx.strokeStyle = '#2E2E3D'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(toX(DB_MIN), toY(DB_MIN)); ctx.lineTo(toX(DB_MAX), toY(DB_MAX)); ctx.stroke();
  ctx.setLineDash([]);

  // Gate Open / Gate Close markers
  const gateClose = Math.min(params.gateClose, params.gateOpen);
  ctx.strokeStyle = '#3D3D52'; ctx.setLineDash([2, 3]);
  const openX = toX(params.gateOpen);
  ctx.beginPath(); ctx.moveTo(openX, 0); ctx.lineTo(openX, H); ctx.stroke();
  const closeX = toX(gateClose);
  ctx.beginPath(); ctx.moveTo(closeX, 0); ctx.lineTo(closeX, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#8A8A9A'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('OPEN', openX + 3, H - 5);
  ctx.fillText('CLOSE', closeX + 3, 12);

  // Hysteresis band shading
  ctx.fillStyle = 'rgba(0,255,135,0.05)';
  ctx.fillRect(Math.min(closeX, openX), 0, Math.abs(openX - closeX), H);

  // Fill + stroke
  const stroke = 'rgb(0,255,135)';
  ctx.strokeStyle = stroke; ctx.lineWidth = 2.5;
  ctx.fillStyle = 'rgba(0,255,135,0.08)';
  ctx.beginPath();
  let first = true;
  for (let db = DB_MIN; db <= DB_MAX; db += 0.5) {
    const x = toX(db), y = toY(applyGate(db, params));
    first ? (ctx.moveTo(x, H), ctx.lineTo(x, y), (first = false)) : ctx.lineTo(x, y);
  }
  ctx.lineTo(toX(DB_MAX), H); ctx.closePath(); ctx.fill();

  ctx.beginPath(); let first2 = true;
  for (let db = DB_MIN; db <= DB_MAX; db += 0.5) {
    const x = toX(db), y = toY(applyGate(db, params));
    first2 ? (ctx.moveTo(x, y), (first2 = false)) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Floor reference line (deepest output the gate will attenuate down to)
  ctx.strokeStyle = 'rgba(255,77,106,0.4)'; ctx.setLineDash([2, 2]);
  ctx.beginPath(); ctx.moveTo(0, toY(params.floor)); ctx.lineTo(W, toY(params.floor)); ctx.stroke();
  ctx.setLineDash([]);

  // Labels
  ctx.fillStyle = '#8A8A9A'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('INPUT (dB) →', W - 82, H - 5);
  ctx.save(); ctx.translate(11, H * 0.38); ctx.rotate(-Math.PI / 2);
  ctx.fillText('↑ OUT (dB)', 0, 0); ctx.restore();
}

// ── Canvas: live gate scope ───────────────────────────────────────────────────
// Same idea as the compressor's Live Compression Scope (Chapter4): a
// separate, dedicated analyzer — not drawn into the transfer-function graph
// above — that scrolls the real, smoothed input/output level over a fixed
// time window. For a gate this is what makes Attack / Hold / Release
// legible: Attack shows as how fast the output snaps up to meet the input
// when it opens, Hold shows as a flat stretch where the gate stays open
// after the input's already dropped, and Release shows as how gradually the
// output then falls back down to the Floor as it closes.
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB   = -66;
const SCOPE_MAX_DB   = 12;

interface ScopePoint { t: number; inputDb: number; outputDb: number; }

function drawGateScope(
  canvas: HTMLCanvasElement,
  history: ScopePoint[],
  nowT: number,
  gateOpenDb: number,
  gateCloseDb: number,
  showThresholds: boolean,
) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;

  const toY = (db: number) => H - ((Math.min(SCOPE_MAX_DB, Math.max(SCOPE_MIN_DB, db)) - SCOPE_MIN_DB) / (SCOPE_MAX_DB - SCOPE_MIN_DB)) * H;
  const toX = (t: number) => ((t - (nowT - SCOPE_WINDOW_S)) / SCOPE_WINDOW_S) * W;

  ctx.fillStyle = '#0D0D0F'; ctx.fillRect(0, 0, W, H);

  // dB grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  ctx.fillStyle = '#6A6A7A'; ctx.font = '9px "JetBrains Mono", monospace';
  for (let db = Math.ceil(SCOPE_MIN_DB / 12) * 12; db <= SCOPE_MAX_DB; db += 12) {
    const y = toY(db);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 3, y - 2);
  }

  // 0 dB reference
  ctx.strokeStyle = '#2E2E3D'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  const y0 = toY(0);
  ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
  ctx.setLineDash([]);

  if (showThresholds) {
    ctx.strokeStyle = 'rgba(245,166,35,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    const openY = toY(gateOpenDb);
    ctx.beginPath(); ctx.moveTo(0, openY); ctx.lineTo(W, openY); ctx.stroke();
    const closeY = toY(Math.min(gateCloseDb, gateOpenDb));
    ctx.beginPath(); ctx.moveTo(0, closeY); ctx.lineTo(W, closeY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(245,166,35,0.8)';
    ctx.fillText('OPEN', W - 32, openY - 3);
    ctx.fillText('CLOSE', W - 36, closeY + 9);
  }

  const visible = history.filter(p => p.t >= nowT - SCOPE_WINDOW_S - 0.25);
  if (visible.length < 2) return;

  const inPts  = visible.map(p => ({ x: toX(p.t), y: toY(p.inputDb) }));
  const outPts = visible.map(p => ({ x: toX(p.t), y: toY(p.outputDb) }));

  // Shaded gap between input and output — the actual gate reduction in
  // motion (there's no makeup-gain equivalent here, so unlike the
  // compressor's scope this gap is *only* ever the gate pulling level down).
  ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#FF4D6A';
  ctx.beginPath();
  ctx.moveTo(inPts[0].x, inPts[0].y);
  for (const p of inPts.slice(1)) ctx.lineTo(p.x, p.y);
  for (let i = outPts.length - 1; i >= 0; i--) ctx.lineTo(outPts[i].x, outPts[i].y);
  ctx.closePath(); ctx.fill(); ctx.restore();

  // Input trace
  ctx.save(); ctx.globalAlpha = 0.6;
  ctx.strokeStyle = '#00FF87'; ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.moveTo(inPts[0].x, inPts[0].y);
  for (const p of inPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke(); ctx.restore();

  // Output trace (what actually reaches the ear)
  ctx.strokeStyle = '#4D9EFF'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(outPts[0].x, outPts[0].y);
  for (const p of outPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

// ── Knob helpers (plain linear — same fallback Chapter4 uses for its
// non-segmented knobs) ───────────────────────────────────────────────────────
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

// ── Level ballistics ─────────────────────────────────────────────────────────
// The old vertical INPUT/G·R/OUTPUT bar meters were removed — the live gate
// scope below shows the same input/output levels (and the gate reduction
// between them) as motion over time, which is strictly more information than
// three static bars, so keeping both was redundant (same change made to the
// compressor's Chapter4). The smoothed dB values are still computed here
// (fast-attack/slow-release, so they're readable frame to frame) — the scope
// is what displays them now.
const METER_FLOOR_DB = -60;

const LEVEL_ATTACK_S  = 0.015;
const LEVEL_RELEASE_S = 0.35;

function levelBallistic(prev: number, target: number, dt: number): number {
  if (dt <= 0) return prev;
  const tau = target > prev ? LEVEL_ATTACK_S : LEVEL_RELEASE_S;
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}

// ── Test signal: sparse hits over a low, continuous noise floor ─────────────
// A busy 16th-note drum loop never gives a gate anything to *do* — the whole
// point of a noise gate is silencing the hiss/hum/bleed that sits between
// hits, so the source here is deliberately sparse (kick + snare backbeat)
// laid over a constant low-level hiss + 60Hz hum bed, the classic case for
// reaching for a gate on a mic or DI channel.
const BPM      = 100;
const STEP_SEC = 60 / BPM / 2;
const STEPS    = 16;
const PAT_KICK  = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0];
const PAT_SNARE = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];

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
  g.gain.setValueAtTime(0.95, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
  osc.connect(g); g.connect(dest); osc.start(time); osc.stop(time + 0.35);
}

function synthSnare(ctx: AudioContext, dest: AudioNode, time: number) {
  const body = ctx.createOscillator(); const bg = ctx.createGain();
  body.type = 'sine'; body.frequency.setValueAtTime(200, time);
  body.frequency.exponentialRampToValueAtTime(100, time + 0.06);
  bg.gain.setValueAtTime(0.5, time); bg.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  body.connect(bg); bg.connect(dest); body.start(time); body.stop(time + 0.15);

  const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer(ctx, 0.15);
  const filt  = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 2200; filt.Q.value = 0.6;
  const ng    = ctx.createGain(); ng.gain.setValueAtTime(0.65, time); ng.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  noise.connect(filt); filt.connect(ng); ng.connect(dest); noise.start(time); noise.stop(time + 0.15);
}

function scheduleStep(ctx: AudioContext, dest: AudioNode, step: number, time: number) {
  if (PAT_KICK[step])  synthKick(ctx, dest, time);
  if (PAT_SNARE[step]) synthSnare(ctx, dest, time);
}

// Persistent low-level noise floor: filtered hiss + a soft 60Hz hum, mixed
// well under the drum hits — the "problem" a noise gate exists to solve.
//
// Gain values here matter more than they look: the input/GR meter (see
// animate() below) reads level as a true block-peak (max |sample| over a
// ~1024-sample window), and white noise's peak is nearly always close to
// its full linear ceiling no matter how many samples you look at — a peak
// detector basically reports 20*log10(hissGain), not the noise's perceived
// (RMS) loudness. At the old gains (0.05 / 0.03) that put the "quiet" hiss
// bed at roughly -23 to -27 dBFS on the meter — *above* the default Gate
// Open/Close (-32 / -38 dB), so the gate read as permanently open and the
// G/R meter never moved no matter how Gate Open/Close were dialed in.
// Lowered so the measured floor sits safely under -38 dB, letting the gate
// actually close between hits at the default settings.
function startNoiseFloor(ctx: AudioContext, dest: AudioNode): { stop: () => void } {
  const hissSrc = ctx.createBufferSource();
  hissSrc.buffer = noiseBuffer(ctx, 2);
  hissSrc.loop = true;
  const hissFilt = ctx.createBiquadFilter(); hissFilt.type = 'highpass'; hissFilt.frequency.value = 3000;
  const hissGain = ctx.createGain(); hissGain.gain.value = 0.006;

  const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 60;
  const humGain = ctx.createGain(); humGain.gain.value = 0.004;

  hissSrc.connect(hissFilt); hissFilt.connect(hissGain); hissGain.connect(dest);
  hum.connect(humGain); humGain.connect(dest);

  hissSrc.start(); hum.start();

  return {
    stop: () => {
      try { hissSrc.stop(); } catch { /* ok */ }
      try { hum.stop(); } catch { /* ok */ }
      hissSrc.disconnect(); hissFilt.disconnect(); hissGain.disconnect();
      hum.disconnect(); humGain.disconnect();
    },
  };
}

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

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chapter10() {
  const [params,    setParams]    = useState<GateParams>(DEFAULTS);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bypass,    setBypass]    = useState(false);
  const [gateIsOpen, setGateIsOpen] = useState(true);
  const [tasks, setTasks]         = useState([false, false, false, false]);

  // Signal source — sparse drums + hiss/hum bed, or an uploaded track.
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
  const noiseFloorRef      = useRef<{ stop: () => void } | null>(null);
  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
  useEffect(() => { uploadedTracksRef.current = uploadedTracks; }, [uploadedTracks]);

  const activeTrack = activeSourceId !== 'synth' ? uploadedTracks.find(t => t.id === activeSourceId) : undefined;

  // Canvas refs
  const transferRef  = useRef<HTMLCanvasElement>(null);
  const scopeRef     = useRef<HTMLCanvasElement>(null);
  const scopeHistoryRef = useRef<ScopePoint[]>([]);

  // Faust gate engine (module + meta loaded once on mount, one node
  // instantiated per AudioContext in startAudio — same pattern as Chapter4's
  // compressor).
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
        console.error('[Chapter10] failed to load Faust gate DSP', err);
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
  const wetAnalRef    = useRef<AnalyserNode | null>(null);
  const mixRef        = useRef<GainNode | null>(null);
  const dryGainRef    = useRef<GainNode | null>(null);
  const wetGainRef    = useRef<GainNode | null>(null);
  const outputRef     = useRef<GainNode | null>(null);       // post-crossfade sum → destination
  const finalAnalRef  = useRef<AnalyserNode | null>(null);    // taps the actual blended output (reflects bypass/mix)
  const animRef       = useRef<number>(0);
  const schedulerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextNoteRef   = useRef(0);
  const currentStepRef = useRef(0);
  const startTokenRef = useRef(0);
  const paramsRef     = useRef(params);
  const bypassRef     = useRef(bypass);
  useEffect(() => { paramsRef.current = params; }, [params]);
  useEffect(() => { bypassRef.current = bypass; }, [bypass]);

  // Smoothed input/output dB, chased frame-to-frame in animate() and fed
  // straight into the gate scope's canvas draw — plain refs, not React
  // state, since they update every animation frame and the scope redraws
  // itself directly rather than through a re-render.
  const smoothedInputDbRef  = useRef(METER_FLOOR_DB);
  const smoothedOutputDbRef = useRef(METER_FLOOR_DB);
  const meterClockRef       = useRef<number | null>(null);
  const isOpenRef           = useRef(true);
  const holdUntilRef        = useRef(0);

  // Knob drag ref
  const mainDragRef = useRef<{ spec: KnobSpec; startY: number; startFrac: number } | null>(null);

  // ── Main transfer canvas ──────────────────────────────────────────────────
  useEffect(() => {
    if (transferRef.current) {
      const displayParams = bypass ? { ...params, gateOpen: -96, gateClose: -96 } : params;
      drawTransfer(transferRef.current, displayParams);
    }
  }, [params, bypass]);

  // ── Sync Faust gate params (always live — bypass is handled by the
  // dry/wet crossfade below, not by touching the DSP itself) ───────────────
  useEffect(() => {
    const node = faustNodeRef.current;
    if (!node) return;
    pushFaustParams(node, params);
  }, [params]);

  // ── Bypass (crossfade to dry) ──────────────────────────────────────────────
  // No user-facing wet/dry mix control (removed, same as the compressor) —
  // this crossfade only ever moves between fully wet and fully dry, driven
  // by Bypass alone.
  useEffect(() => {
    const wet = wetGainRef.current, dry = dryGainRef.current, ac = ctxRef.current;
    if (!wet || !dry || !ac) return;
    const w = bypass ? 0 : 1;
    wet.gain.setTargetAtTime(w,     ac.currentTime, 0.01);
    dry.gain.setTargetAtTime(1 - w, ac.currentTime, 0.01);
  }, [bypass]);

  // ── Task tracking ─────────────────────────────────────────────────────────
  useEffect(() => {
    setTasks([
      params.gateOpen !== DEFAULTS.gateOpen,
      Math.abs((params.gateOpen - params.gateClose) - (DEFAULTS.gateOpen - DEFAULTS.gateClose)) > 0.5,
      params.attack !== DEFAULTS.attack || params.release !== DEFAULTS.release || params.hold !== DEFAULTS.hold,
      params.floor !== DEFAULTS.floor,
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

      // The Faust gate patch has no live open/closed output, so the state is
      // estimated: run a hysteresis + hold state machine off that same raw
      // input peak (Gate Open / Gate Close / Hold) — drives the OPEN/CLOSED
      // badge up top. The actual gate *reduction* is no longer separately
      // modeled here — the scope below reads real measured input/output
      // levels straight off the analysers instead.
      if (!bypassRef.current) {
        const p = paramsRef.current;
        if (rawInputDb >= p.gateOpen) {
          isOpenRef.current = true;
          holdUntilRef.current = now + p.hold / 1000;
        } else if (now >= holdUntilRef.current && rawInputDb <= Math.min(p.gateClose, p.gateOpen)) {
          isOpenRef.current = false;
        }
        setGateIsOpen(isOpenRef.current);
      } else {
        isOpenRef.current = true;
        setGateIsOpen(true);
      }
    }
    if (finalAnalRef.current) {
      const buf = new Float32Array(finalAnalRef.current.fftSize);
      finalAnalRef.current.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      const rawOutputDb = peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
      smoothedOutputDbRef.current = levelBallistic(smoothedOutputDbRef.current, rawOutputDb, dt);
    }

    // Live gate scope — records the smoothed input/output dB into a
    // scrolling history, so Attack/Hold/Release are visible as actual motion
    // on the real signal instead of only as numbers on a knob.
    if (dryAnal && finalAnalRef.current) {
      const history = scopeHistoryRef.current;
      history.push({ t: now, inputDb: smoothedInputDbRef.current, outputDb: smoothedOutputDbRef.current });
      const cutoff = now - SCOPE_WINDOW_S - 0.5;
      while (history.length > 0 && history[0].t < cutoff) history.shift();
      if (scopeRef.current) {
        const p = paramsRef.current;
        drawGateScope(scopeRef.current, history, now, p.gateOpen, p.gateClose, !bypassRef.current);
      }
    }

    animRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Start / Stop audio ────────────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) return;
    const myToken = ++startTokenRef.current;

    const ctx = new AudioContext();

    // mix ─┬→ dryAnal (viz + input-level tap) → dryGain ─┐
    //      └→ faustNode (gate) → wetAnal (viz tap) → wetGain ─┴→ output → finalAnal → destination
    const mix = ctx.createGain(); mix.gain.value = 0.85;
    const dryAnal = ctx.createAnalyser(); dryAnal.fftSize = 1024; dryAnal.smoothingTimeConstant = 0.4;
    const wetAnal = ctx.createAnalyser(); wetAnal.fftSize = 1024; wetAnal.smoothingTimeConstant = 0.4;
    // No user-facing wet/dry mix control (removed, same as the compressor) —
    // always fully wet outside of bypass.
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
      console.error('[Chapter10] failed to build Faust gate node', err);
      ctx.close();
      return;
    }

    if (myToken !== startTokenRef.current) { try { ctx.close(); } catch { /* ok */ } return; }

    pushFaustParams(faustNode, params);

    ctxRef.current = ctx;
    mixRef.current = mix;
    dryAnalRef.current = dryAnal;
    wetAnalRef.current = wetAnal;
    dryGainRef.current = dryGain;
    wetGainRef.current = wetGain;
    outputRef.current = output;
    finalAnalRef.current = finalAnal;
    faustNodeRef.current = faustNode;

    mix.connect(dryAnal);
    dryAnal.connect(dryGain);
    dryGain.connect(output);

    mix.connect(faustNode as unknown as AudioNode);
    (faustNode as unknown as AudioNode).connect(wetAnal);
    wetAnal.connect(wetGain);
    wetGain.connect(output);

    output.connect(finalAnal);
    finalAnal.connect(ctx.destination);

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
      noiseFloorRef.current = startNoiseFloor(ctx, mix);
      nextNoteRef.current = ctx.currentTime + 0.05; currentStepRef.current = 0;
      runScheduler();
    }

    scopeHistoryRef.current = [];
    animRef.current = requestAnimationFrame(animate);
    setIsPlaying(true);
  }, [engineStatus, params, bypass, runScheduler, animate]);

  const stopAudio = useCallback(() => {
    startTokenRef.current++;
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    if (bufSourceRef.current) {
      try { bufSourceRef.current.stop(); } catch { /* ok */ }
      bufSourceRef.current.disconnect();
      bufSourceRef.current = null;
    }
    if (noiseFloorRef.current) { noiseFloorRef.current.stop(); noiseFloorRef.current = null; }
    if (faustNodeRef.current) {
      try { (faustNodeRef.current as unknown as AudioNode).disconnect(); } catch { /* ok */ }
      faustNodeRef.current = null;
    }
    ctxRef.current?.close();
    ctxRef.current = null;
    dryAnalRef.current = null; wetAnalRef.current = null; mixRef.current = null;
    dryGainRef.current = null; wetGainRef.current = null; outputRef.current = null; finalAnalRef.current = null;
    smoothedInputDbRef.current = METER_FLOOR_DB;
    smoothedOutputDbRef.current = METER_FLOOR_DB;
    meterClockRef.current = null;
    isOpenRef.current = true;
    holdUntilRef.current = 0;
    setGateIsOpen(true); setIsPlaying(false);
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
    if (bufSourceRef.current) { try { bufSourceRef.current.stop(); } catch { /* ok */ } }
    if (noiseFloorRef.current) { noiseFloorRef.current.stop(); }
    if (faustNodeRef.current) { try { (faustNodeRef.current as unknown as AudioNode).disconnect(); } catch { /* ok */ } }
    ctxRef.current?.close();
  }, []);

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

  // Renders the currently active uploaded track through the gate (with
  // current knob/bypass settings) and downloads it as a WAV — the "download
  // after processing" counterpart to the upload button above.
  const handleDownload = useCallback(async () => {
    const track = activeTrack;
    if (!track || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) return;
    setDownloadError('');
    setDownloading(true);
    try {
      const rendered = await renderGateOffline(
        generatorRef.current, dspMetaRef.current, dspModuleRef.current,
        track.buffer, params, bypass,
      );
      downloadAudioBufferAsWav(rendered, `${track.name || 'gate-studio'}-gated.wav`);
    } catch (err) {
      console.error('[Chapter10] failed to render audio for download', err);
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
  const TASK_LABELS = ['Set gate open threshold', 'Widen the hysteresis gap', 'Tune attack / hold / release', 'Set a floor (not full silence)'];

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
          background: activeSourceId === 'synth' ? 'rgba(0,255,135,0.13)' : 'var(--surface)',
          border: `1px solid ${activeSourceId === 'synth' ? 'rgba(0,255,135,0.5)' : 'var(--border)'}`,
          borderRadius: '3px',
          color: activeSourceId === 'synth' ? 'var(--green)' : 'var(--text-dim)',
          fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>🥁</span>
        <span>DRUMS + HISS/HUM</span>
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
              background: active ? 'rgba(77,158,255,0.13)' : 'var(--surface)',
              border: `1px solid ${active ? 'rgba(77,158,255,0.5)' : 'var(--border)'}`,
              borderRadius: '3px',
              color: active ? 'var(--blue)' : 'var(--text-dim)',
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
        title="Upload your own audio to run through the gate"
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
          title="Render the active track through the gate and download it as a WAV"
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
          <div className="lab-icon" style={{ background: 'var(--green-dim)', border: '1px solid rgba(0,255,135,0.4)' }}>⏚</div>
          <div>
            <div className="lab-name">Gate Studio</div>
            <div className="lab-subtitle">DYNAMICS — NOISE GATE</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="badge" style={{
            background: !isPlaying ? 'var(--surface)' : gateIsOpen ? 'rgba(0,255,135,0.15)' : 'rgba(255,77,106,0.12)',
            borderColor: !isPlaying ? 'var(--border)' : gateIsOpen ? 'rgba(0,255,135,0.4)' : 'rgba(255,77,106,0.4)',
            color: !isPlaying ? 'var(--text-faint)' : gateIsOpen ? 'var(--green)' : 'var(--red)',
          }}>
            {!isPlaying ? '○ IDLE' : gateIsOpen ? '● OPEN' : '● CLOSED'}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`toggle-btn${isPlaying ? ' on' : ''}`}
              style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-dim)' } : {}}
              onClick={isPlaying ? stopAudio : () => { void startAudio(); }}
              disabled={!isPlaying && engineStatus !== 'ready'}
              title={engineStatus === 'loading' ? 'Loading Faust gate engine…' : engineStatus === 'error' ? (engineError ?? 'Faust engine failed to load') : undefined}
            >
              {isPlaying ? '⏹ STOP' : engineStatus === 'loading' ? '⏳ LOADING…' : engineStatus === 'error' ? '⚠ ENGINE ERROR' : '▶ PLAY'}
            </button>
            <button className={`toggle-btn${bypass ? ' on' : ''}`} onClick={() => setBypass(b => !b)}>
              {bypass ? 'BYPASS: ON' : 'BYPASS: OFF'}
            </button>
          </div>
          <div className="lab-status" style={{ color: isPlaying ? 'var(--green)' : 'var(--text-dim)' }}>
            <div className="status-dot" style={{
              background: isPlaying ? 'var(--green)' : 'var(--text-faint)',
              boxShadow:  isPlaying ? '0 0 6px var(--green)' : 'none',
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
        {/* Left: meters + knobs */}
        <div className="comp-controls">
          <div className="canvas-label" style={{ marginBottom: '1rem' }}>
            GATE PARAMETERS · DRAG KNOBS VERTICALLY
          </div>

          {/* Knobs, evenly spread across the full control column now that the
              old meter column beside them is gone — the live scope on the
              right already covers input/output/gate-reduction, so this
              panel is just the controls themselves (same change made to the
              compressor's Chapter4). */}
          <div className="knob-grid">
            {KNOBS.map(spec => {
              const val = params[spec.key] as number;
              const rot = knobRotationForSpec(spec, val);
              return (
                <div className="knob-wrap" key={spec.key}>
                  <div style={{ position: 'relative', width: 64, height: 64 }}>
                    <svg style={{ position: 'absolute', top: 0, left: 0 }} width={64} height={64} viewBox="-32 -32 64 64">
                      <path d={describeArc(28, -140, 140)} fill="none" stroke="#2E2E3D" strokeWidth={3} strokeLinecap="round" />
                      <path d={describeArc(28, -140, rot)} fill="none" stroke="#00FF87" strokeWidth={3} strokeLinecap="round" opacity={0.85} />
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
            <div className="concept-callout" style={{ background: 'var(--green-dim)', borderColor: 'rgba(0,255,135,0.2)' }}>
              <strong style={{ color: 'var(--green)' }}>Concept: </strong>
              Gate Close sits {(params.gateOpen - params.gateClose).toFixed(1)} dB below Gate Open — that gap is the
              hysteresis band, and it's what stops the gate from chattering open/closed right at the threshold.
              Toggle <strong style={{ color: 'var(--green)' }}>BYPASS</strong> while playing to A/B.
            </div>
          </div>
        </div>

        {/* Right: transfer + live scope */}
        <div className="comp-visual">
          <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>
            TRANSFER FUNCTION — INPUT vs OUTPUT
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
              · shaped by GATE OPEN / GATE CLOSE / FLOOR only — attack, hold &amp; release are time-domain, see scope below
            </span>
          </div>
          <div className="transfer-graph">
            <canvas ref={transferRef} width={400} height={200} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>

          <div className="canvas-label" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
            LIVE GATE SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
              · real input/output level over time — watch ATTACK snap the gate open &amp; HOLD/RELEASE let it close
            </span>
          </div>
          <div className="scope-graph">
            <canvas ref={scopeRef} width={400} height={150} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>
          <div className="legend-row" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            <div className="legend-item"><span className="legend-line" style={{ background: '#00FF87' }} />INPUT</div>
            <div className="legend-item"><span className="legend-line" style={{ background: '#4D9EFF' }} />OUTPUT</div>
            <div className="legend-item"><span className="legend-line" style={{ background: '#FF4D6A' }} />GATE REDUCTION</div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="tip-box" style={{ background: 'rgba(245,166,35,0.07)', borderColor: 'rgba(245,166,35,0.2)' }}>
              <strong style={{ color: 'var(--amber)' }}>Signal:</strong>{' '}
              {activeTrack
                ? `Your uploaded track — "${activeTrack.name}". Switch to a different track above, or upload another.`
                : 'Sparse kick + snare over a constant hiss/hum bed — the classic case for a noise gate: silence the noise floor between hits without chopping the hits themselves.'}
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
          <button className="btn-primary">Submit &amp; Continue →</button>
        </div>
      </div>
    </div>
  );
}
