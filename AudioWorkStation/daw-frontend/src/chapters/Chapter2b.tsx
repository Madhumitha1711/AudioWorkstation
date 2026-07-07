import { useRef, useState, useEffect, useCallback } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { compileFaustWasm, type FaustDspMeta, type FaustNodeLike } from '../faust/faustTypes';
import { downloadBlob, audioBufferToWavBlob } from '../audio/wavRender';

// ═══════════════════════════════════════════════════════════════════════════
// Chapter 2b — ParamEQ (Logic-style parametric EQ, Faust WASM)
// ═══════════════════════════════════════════════════════════════════════════
// Uses the real 8-band "ParamEQ" Faust patch in public/faust/ParamEQ/
// (HPF → Low Shelf → 4x Peak → High Shelf → LPF), driven by a single Faust
// AudioWorkletNode whose params are the addresses in dsp-meta.json — instead
// of per-band BiquadFilterNodes (Chapter 2) or per-band Faust instances
// (Chapter 2a). The UI mirrors a Logic-style Channel EQ: a draggable curve
// with one node per band, plus a live spectrum analyzer.
//
// Two exercises share the same engine:
//   • TEST BENCH  — upload your own audio, freely sculpt the curve, download
//     the processed result. Meant for experimentation.
//   • EAR TRAINING — a hidden target curve is set on load; adjust your own
//     curve by listening (not looking) until it sounds the same, then submit
//     for a score. Download both the target and your own render as WAV.

const FAUST_BASE_PATH = '/faust/ParamEQ';

// ── Param addresses (from public/faust/ParamEQ/dsp-meta.json) ───────────────
const ADDR = {
  hpfFreq: '/ParamEQ/HPF_Freq',
  lowShelfFreq: '/ParamEQ/Low_Shelf_Freq',
  lowShelfGain: '/ParamEQ/Low_Shelf_Gain',
  peak1Freq: '/ParamEQ/Peak1_Freq',
  peak1Gain: '/ParamEQ/Peak1_Gain',
  peak1Q: '/ParamEQ/Peak1_Q',
  peak2Freq: '/ParamEQ/Peak2_Freq',
  peak2Gain: '/ParamEQ/Peak2_Gain',
  peak2Q: '/ParamEQ/Peak2_Q',
  peak3Freq: '/ParamEQ/Peak3_Freq',
  peak3Gain: '/ParamEQ/Peak3_Gain',
  peak3Q: '/ParamEQ/Peak3_Q',
  peak4Freq: '/ParamEQ/Peak4_Freq',
  peak4Gain: '/ParamEQ/Peak4_Gain',
  peak4Q: '/ParamEQ/Peak4_Q',
  highShelfFreq: '/ParamEQ/High_Shelf_Freq',
  highShelfGain: '/ParamEQ/High_Shelf_Gain',
  lpfFreq: '/ParamEQ/LPF_Freq',
} as const;

type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

// A single uploaded audio file kept in the Test Bench's source list, so
// multiple files can be uploaded and switched between without re-uploading.
interface UploadedAudioTrack {
  id: number;
  name: string;
  buffer: AudioBuffer;
}

interface ParamEQBands {
  hpfFreq: number;
  lowShelfFreq: number; lowShelfGain: number;
  peak1Freq: number; peak1Gain: number; peak1Q: number;
  peak2Freq: number; peak2Gain: number; peak2Q: number;
  peak3Freq: number; peak3Gain: number; peak3Q: number;
  peak4Freq: number; peak4Gain: number; peak4Q: number;
  highShelfFreq: number; highShelfGain: number;
  lpfFreq: number;
}

// Matches dsp-meta.json's `init` values — a flat, all-pass-through response.
const DEFAULT_BANDS: ParamEQBands = {
  hpfFreq: 20,
  lowShelfFreq: 75, lowShelfGain: 0,
  peak1Freq: 100, peak1Gain: 0, peak1Q: 0.7,
  peak2Freq: 250, peak2Gain: 0, peak2Q: 1,
  peak3Freq: 1000, peak3Gain: 0, peak3Q: 1,
  peak4Freq: 2500, peak4Gain: 0, peak4Q: 1,
  highShelfFreq: 7500, highShelfGain: 0,
  lpfFreq: 20000,
};

function applyBandsToNode(node: FaustNodeLike, b: ParamEQBands): void {
  node.setParamValue(ADDR.hpfFreq, b.hpfFreq);
  node.setParamValue(ADDR.lowShelfFreq, b.lowShelfFreq);
  node.setParamValue(ADDR.lowShelfGain, b.lowShelfGain);
  node.setParamValue(ADDR.peak1Freq, b.peak1Freq);
  node.setParamValue(ADDR.peak1Gain, b.peak1Gain);
  node.setParamValue(ADDR.peak1Q, b.peak1Q);
  node.setParamValue(ADDR.peak2Freq, b.peak2Freq);
  node.setParamValue(ADDR.peak2Gain, b.peak2Gain);
  node.setParamValue(ADDR.peak2Q, b.peak2Q);
  node.setParamValue(ADDR.peak3Freq, b.peak3Freq);
  node.setParamValue(ADDR.peak3Gain, b.peak3Gain);
  node.setParamValue(ADDR.peak3Q, b.peak3Q);
  node.setParamValue(ADDR.peak4Freq, b.peak4Freq);
  node.setParamValue(ADDR.peak4Gain, b.peak4Gain);
  node.setParamValue(ADDR.peak4Q, b.peak4Q);
  node.setParamValue(ADDR.highShelfFreq, b.highShelfFreq);
  node.setParamValue(ADDR.highShelfGain, b.highShelfGain);
  node.setParamValue(ADDR.lpfFreq, b.lpfFreq);
}

// ── Band descriptors (drives the curve UI generically) ──────────────────────
type BandKind = 'hpf' | 'lowshelf' | 'peak' | 'highshelf' | 'lpf';

interface BandDef {
  id: string;
  short: string;
  label: string;
  color: string;
  kind: BandKind;
  freqKey: keyof ParamEQBands;
  gainKey?: keyof ParamEQBands;
  qKey?: keyof ParamEQBands;
}

const BAND_DEFS: BandDef[] = [
  { id: 'hpf', short: 'HPF', label: 'High-Pass', color: '#9AA5B1', kind: 'hpf', freqKey: 'hpfFreq' },
  { id: 'lowShelf', short: 'LOW SHELF', label: 'Low Shelf', color: '#F5A623', kind: 'lowshelf', freqKey: 'lowShelfFreq', gainKey: 'lowShelfGain' },
  { id: 'peak1', short: 'PEAK 1', label: 'Peak 1', color: '#D9E86B', kind: 'peak', freqKey: 'peak1Freq', gainKey: 'peak1Gain', qKey: 'peak1Q' },
  { id: 'peak2', short: 'PEAK 2', label: 'Peak 2', color: '#6BE86B', kind: 'peak', freqKey: 'peak2Freq', gainKey: 'peak2Gain', qKey: 'peak2Q' },
  { id: 'peak3', short: 'PEAK 3', label: 'Peak 3', color: '#2DD4BF', kind: 'peak', freqKey: 'peak3Freq', gainKey: 'peak3Gain', qKey: 'peak3Q' },
  { id: 'peak4', short: 'PEAK 4', label: 'Peak 4', color: '#4D9EFF', kind: 'peak', freqKey: 'peak4Freq', gainKey: 'peak4Gain', qKey: 'peak4Q' },
  { id: 'highShelf', short: 'HIGH SHELF', label: 'High Shelf', color: '#A78BFA', kind: 'highshelf', freqKey: 'highShelfFreq', gainKey: 'highShelfGain' },
  { id: 'lpf', short: 'LPF', label: 'Low-Pass', color: '#CBD5E1', kind: 'lpf', freqKey: 'lpfFreq' },
];

function getFreq(b: ParamEQBands, def: BandDef): number { return b[def.freqKey]; }
function getGain(b: ParamEQBands, def: BandDef): number { return def.gainKey ? b[def.gainKey] : 0; }
function getQ(b: ParamEQBands, def: BandDef): number | undefined { return def.qKey ? b[def.qKey] : undefined; }

function withFreq(b: ParamEQBands, def: BandDef, v: number): ParamEQBands {
  return { ...b, [def.freqKey]: v };
}
function withGain(b: ParamEQBands, def: BandDef, v: number): ParamEQBands {
  if (!def.gainKey) return b;
  return { ...b, [def.gainKey]: v };
}
function withQ(b: ParamEQBands, def: BandDef, v: number): ParamEQBands {
  if (!def.qKey) return b;
  return { ...b, [def.qKey]: v };
}

// ── Curve math (analytic magnitude-response approximations, in dB) ──────────
const FMIN = 20, FMAX = 20000;
const GMIN = -24, GMAX = 24;

// AnalyserNode's dB floor/ceiling — set on the node itself (see `play()`)
// *and* used here to decode its byte data, so the two stay in sync. Real
// signal level (dBFS-ish), deliberately on its own scale rather than the EQ
// gain axis above — the analyzer is a level meter, not another EQ curve.
const ANALYSER_MIN_DB = -85;
const ANALYSER_MAX_DB = -15;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function butterHighpassDB(f: number, fc: number, order: number): number {
  const ratio = Math.pow(f / fc, 2 * order);
  return 10 * Math.log10(Math.max(ratio / (1 + ratio), 1e-12));
}
function butterLowpassDB(f: number, fc: number, order: number): number {
  const ratio = Math.pow(f / fc, 2 * order);
  return 10 * Math.log10(Math.max(1 / (1 + ratio), 1e-12));
}
// Shelf knee: full gain right at (and past) the corner frequency, tapering
// to 0 dB over SHELF_KNEE_OCTAVES — as opposed to a symmetric curve centered
// on fc (which only reaches *half* gain at fc). This keeps the corner
// frequency the point where the shelf reaches its full, dialed-in gain, so
// what you type/drag matches what the curve shows right at that node.
const SHELF_KNEE_OCTAVES = 2;
function shelfKneeShape(t: number): number {
  if (t <= 0) return 1;
  if (t >= SHELF_KNEE_OCTAVES) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * t) / SHELF_KNEE_OCTAVES));
}
function lowShelfDB(f: number, fc: number, gainDb: number): number {
  return gainDb * shelfKneeShape(Math.log2(f / fc));
}
function highShelfDB(f: number, fc: number, gainDb: number): number {
  return gainDb * shelfKneeShape(Math.log2(fc / f));
}
function peakDB(f: number, fc: number, gainDb: number, q: number): number {
  const x = f / fc;
  const bw = q * (x - 1 / x);
  return gainDb / (1 + bw * bw);
}

function bandResponseDB(def: BandDef, b: ParamEQBands, f: number): number {
  const freq = getFreq(b, def);
  switch (def.kind) {
    case 'hpf': return butterHighpassDB(f, freq, 2);
    case 'lpf': return butterLowpassDB(f, freq, 4);
    case 'lowshelf': return lowShelfDB(f, freq, getGain(b, def));
    case 'highshelf': return highShelfDB(f, freq, getGain(b, def));
    case 'peak': return peakDB(f, freq, getGain(b, def), getQ(b, def) ?? 1);
    default: return 0;
  }
}

function totalResponseDB(b: ParamEQBands, f: number): number {
  let sum = 0;
  for (const def of BAND_DEFS) sum += bandResponseDB(def, b, f);
  return sum;
}

// Same sum, but skipping HPF/LPF — they always carry some roll-off shape
// near their own corner even when every actual *gain* control is at 0 dB, so
// including them would make the "shaded gain region" show a sliver of fill
// at the edges even on a fully flat setting. This is used for the fill only;
// the drawn curve line still uses totalResponseDB so it shows the true
// response including the HPF/LPF roll-off.
function gainOnlyResponseDB(b: ParamEQBands, f: number): number {
  let sum = 0;
  for (const def of BAND_DEFS) {
    if (!def.gainKey) continue;
    sum += bandResponseDB(def, b, f);
  }
  return sum;
}

// Curve-similarity score: average |dB error| across the audible spectrum,
// not per-parameter distance — two different freq/Q combos that produce the
// same overall shape should score the same, which is what the ear judges.
function curveRMSErrorDB(a: ParamEQBands, b: ParamEQBands): number {
  const N = 48;
  let sumSq = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const f = FMIN * Math.pow(FMAX / FMIN, t);
    const d = totalResponseDB(a, f) - totalResponseDB(b, f);
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (N + 1));
}
function scoreFromRMS(rms: number): number {
  return Math.round(clamp(1 - rms / 12, 0, 1) * 100);
}

// ── Log-freq / dB ⇄ fractional-position helpers (0..1, used for % layout) ──
function fToFrac(f: number): number { return Math.log10(f / FMIN) / Math.log10(FMAX / FMIN); }
function fracToF(t: number): number { return FMIN * Math.pow(FMAX / FMIN, t); }
function gainToFrac(g: number): number { return (GMAX - g) / (GMAX - GMIN); }
function fracToGain(t: number): number { return GMAX - t * (GMAX - GMIN); }

// ── EQ presets — used both as Test Bench quick-apply buttons and as the
// hidden target pool for Ear Training ────────────────────────────────────────
interface EQPreset { name: string; bands: Partial<ParamEQBands>; }

const EQ_PRESETS: EQPreset[] = [
  { name: 'WARM & ROUND', bands: { hpfFreq: 30, lowShelfGain: 4, peak2Freq: 300, peak2Gain: 2, peak4Freq: 3000, peak4Gain: -3, highShelfGain: -4 } },
  { name: 'BRIGHT & AIRY', bands: { lowShelfGain: -2, peak3Freq: 2000, peak3Gain: 3, highShelfFreq: 9000, highShelfGain: 6 } },
  { name: 'TELEPHONE', bands: { hpfFreq: 400, lpfFreq: 3400, peak2Freq: 1200, peak2Gain: 6, peak2Q: 1.2, lowShelfGain: -12, highShelfGain: -12 } },
  { name: 'BOOMY CUT', bands: { lowShelfGain: -6, peak1Freq: 150, peak1Gain: -4, peak1Q: 1.5 } },
  { name: 'VOCAL PRESENCE', bands: { hpfFreq: 90, lowShelfGain: -2, peak3Freq: 3000, peak3Gain: 5, peak3Q: 0.8, peak4Freq: 6000, peak4Gain: 2 } },
  { name: 'PODCAST CLARITY', bands: { hpfFreq: 80, peak2Freq: 400, peak2Gain: -3, peak2Q: 1.2, peak3Freq: 4000, peak3Gain: 4, highShelfGain: 2 } },
];

function mergeBands(base: ParamEQBands, partial: Partial<ParamEQBands>): ParamEQBands {
  return { ...base, ...partial };
}

function pickRandomPreset(): EQPreset {
  return EQ_PRESETS[Math.floor(Math.random() * EQ_PRESETS.length)];
}

// WAV encoding + download for offline-rendered buffers now lives in
// ../audio/wavRender (shared across every chapter with a download button).

function dbToLinear(db: number): number { return Math.pow(10, db / 20); }

// Schedules the GainNode's value properly (cancel + setValueAtTime + a short
// ramp) instead of a bare `.gain.value = x` assignment — the correct way to
// change an AudioParam live per the Web Audio spec, and it avoids any click
// or "value doesn't stick" edge case a plain assignment can hit while audio
// is actively rendering.
function applyOutputGain(node: GainNode, db: number, ctx: AudioContext | null): void {
  const target = dbToLinear(db);
  if (!ctx) { node.gain.value = target; return; }
  const now = ctx.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, now);
  node.gain.linearRampToValueAtTime(target, now + 0.03);
}

async function renderParamEQOffline(
  generator: FaustMonoDspGenerator,
  meta: FaustDspMeta,
  dspModule: WebAssembly.Module,
  source: AudioBuffer,
  bands: ParamEQBands,
  outputGainDb = 0,
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate);
  const factory = { module: dspModule, json: JSON.stringify(meta), soundfiles: {} };
  const node = await generator.createNode(
    offlineCtx as unknown as AudioContext, meta.name, factory, false, 512,
  ) as unknown as FaustNodeLike;
  applyBandsToNode(node, bands);

  const outputGain = offlineCtx.createGain();
  outputGain.gain.value = dbToLinear(outputGainDb);

  const src = offlineCtx.createBufferSource();
  src.buffer = source;
  src.connect(node as unknown as AudioNode);
  (node as unknown as AudioNode).connect(outputGain);
  outputGain.connect(offlineCtx.destination);
  src.start();
  return offlineCtx.startRendering();
}

// ── Demo loop (used until the user uploads their own audio) ─────────────────
// A short pad + bass + hat pulse — enough spectral content across the band to
// make every ParamEQ move audible, without needing an uploaded file.
function normAndFade(buf: AudioBuffer, peakTarget = 0.3): void {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const scale = peakTarget / Math.max(peak, 0.001);
  for (let i = 0; i < L.length; i++) { L[i] *= scale; R[i] *= scale; }
  const sr = buf.sampleRate;
  const fadeN = Math.round(sr * 0.02);
  for (let i = 0; i < fadeN; i++) {
    const f = i / fadeN;
    L[i] *= f; R[i] *= f;
    const idx = L.length - 1 - i;
    L[idx] *= f; R[idx] *= f;
  }
}

function createDemoLoopBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const dur = 4;
  const buf = ctx.createBuffer(2, sr * dur, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);

  // Sustained Am7 pad (harmonic series, slow attack)
  const padNotes = [110.0, 130.81, 164.81, 196.0, 261.63];
  const harmonics: [number, number][] = [[1, 1.0], [2, 0.35], [3, 0.18], [4, 0.09], [5, 0.05]];
  for (const fund of padNotes) {
    for (const [ratio, amp] of harmonics) {
      const freq = fund * ratio;
      if (freq > sr / 2) continue;
      for (let n = 0; n < L.length; n++) {
        const t = n / sr;
        const env = Math.min(1, t / 0.4) * amp * 0.22;
        const s = Math.sin(2 * Math.PI * freq * t) * env;
        L[n] += s * 0.9; R[n] += s * 1.1;
      }
    }
  }

  // Bass pulse every 0.5s (E1/A1 alternating)
  const bassFreqs = [41.2, 55.0];
  for (let beat = 0; beat < 8; beat++) {
    const start = Math.round(beat * 0.5 * sr);
    const freq = bassFreqs[beat % 2];
    for (let i = 0; i < Math.round(0.45 * sr) && start + i < L.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 4) * 0.5;
      const s = Math.sin(2 * Math.PI * freq * t) * env;
      L[start + i] += s; R[start + i] += s;
    }
  }

  // Hat pulse every eighth note for high-frequency content
  for (let e = 0; e < 32; e++) {
    const start = Math.round(e * 0.25 * sr);
    let prev = 0;
    for (let i = 0; i < Math.round(sr * 0.05) && start + i < L.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 45) * 0.18;
      const n = Math.random() * 2 - 1;
      const hp = n - prev * 0.94; prev = n;
      L[start + i] += hp * env; R[start + i] += hp * env;
    }
  }

  normAndFade(buf);
  return buf;
}

// ── HiDPI canvas helper ───────────────────────────────────────────────────────
function hiDpi(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; W: number; H: number } | null {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || canvas.width;
  const H = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W, H };
}

function drawParamEQCanvas(
  canvas: HTMLCanvasElement,
  bands: ParamEQBands,
  targetBands: ParamEQBands | undefined,
  showTarget: boolean,
  analyserData: Uint8Array | null,
  sampleRate: number,
  outputGainDb = 0,
): void {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;

  ctx.fillStyle = '#0A0A0C';
  ctx.fillRect(0, 0, W, H);

  // Vertical frequency grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  const freqLines: [number, string][] = [
    [30, '30'], [50, '50'], [100, '100'], [200, '200'], [500, '500'],
    [1000, '1k'], [2000, '2k'], [5000, '5k'], [10000, '10k'], [20000, '20k'],
  ];
  for (const [f] of freqLines) {
    const x = fToFrac(f) * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Horizontal dB grid
  const y0 = gainToFrac(0) * H;
  for (const db of [-18, -12, -6, 0, 6, 12, 18]) {
    const y = gainToFrac(db) * H;
    ctx.strokeStyle = db === 0 ? '#2E2E3D' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = db === 0 ? 1.5 : 1;
    ctx.setLineDash(db === 0 ? [5, 5] : []);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '9px "JetBrains Mono", monospace';
  for (const db of [-18, -12, -6, 0, 6, 12, 18]) {
    ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 4, gainToFrac(db) * H + 3);
  }
  for (const [f, l] of freqLines) ctx.fillText(l, fToFrac(f) * W - 6, H - 3);

  // Live analyzer (post-EQ spectrum) — a level meter, not another EQ curve.
  // getByteFrequencyData() returns bytes already mapped *linearly* between
  // the AnalyserNode's own minDecibels/maxDecibels (see ANALYSER_MIN_DB /
  // ANALYSER_MAX_DB, set to match on the node itself) — applying another
  // log10() on top of that (as the old code did) double-transforms the
  // value and warps the shape so it no longer tracks what the EQ is
  // actually doing to the signal. Converted correctly here, then plotted on
  // its own bottom-anchored scale (real signal level, not EQ gain), so a
  // boosted band visibly rises and a cut band visibly falls.
  if (analyserData) {
    const levelPts: { x: number; y: number }[] = [];
    const nyquist = sampleRate / 2;
    const binCount = analyserData.length;
    for (let i = 1; i < binCount; i++) {
      const f = (i / binCount) * nyquist;
      if (f < FMIN || f > FMAX) continue;
      const db = ANALYSER_MIN_DB + (analyserData[i] / 255) * (ANALYSER_MAX_DB - ANALYSER_MIN_DB);
      const levelFrac = clamp((db - ANALYSER_MIN_DB) / (ANALYSER_MAX_DB - ANALYSER_MIN_DB), 0, 1);
      levelPts.push({ x: fToFrac(f) * W, y: H - levelFrac * H * 0.68 });
    }
    if (levelPts.length > 1) {
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#FF4D6A';
      ctx.beginPath();
      ctx.moveTo(levelPts[0].x, H); ctx.lineTo(levelPts[0].x, levelPts[0].y);
      for (const p of levelPts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.lineTo(levelPts[levelPts.length - 1].x, H);
      ctx.closePath(); ctx.fill(); ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#FF4D6A';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(levelPts[0].x, levelPts[0].y);
      for (const p of levelPts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  const sampleResponse = (b: ParamEQBands, responseFn: (bands: ParamEQBands, f: number) => number): { x: number; y: number }[] => {
    const N = 160;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const f = fracToF(t);
      const db = responseFn(b, f);
      pts.push({ x: t * W, y: gainToFrac(clamp(db, GMIN, GMAX)) * H });
    }
    return pts;
  };

  // Fill only covers the gap between the *gain-only* response and the 0 dB
  // line — i.e. only where an actual gain control is boosting/cutting. HPF
  // and LPF are excluded from this (see gainOnlyResponseDB), so a fully flat
  // setting (all gain knobs at 0) shows no shading at all, even if HPF/LPF
  // are dialed somewhere and shaping the line itself.
  const strokeCurve = (b: ParamEQBands, color: string, alpha: number, fillAlpha: number, outputGain = 0) => {
    if (fillAlpha > 0) {
      const fillPts = sampleResponse(b, gainOnlyResponseDB);
      ctx.save(); ctx.globalAlpha = fillAlpha; ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(fillPts[0].x, y0); ctx.lineTo(fillPts[0].x, fillPts[0].y);
      for (const p of fillPts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.lineTo(fillPts[fillPts.length - 1].x, y0);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    // Master/output Gain band — a second, differently-colored shaded ribbon
    // between the EQ's own response and that same response shifted by the
    // output Gain slider (e.g. a peak at +6 dB with +3 dB of output Gain
    // shades 0→6 in the EQ color and 6→9 in this one), since that extra
    // boost/cut is coming from the broadband Gain control, not the band.
    if (outputGain !== 0) {
      const basePts = sampleResponse(b, totalResponseDB);
      const shiftedPts = sampleResponse(b, (bb: ParamEQBands, f: number) => totalResponseDB(bb, f) + outputGain);
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#A78BFA';
      ctx.beginPath();
      ctx.moveTo(basePts[0].x, basePts[0].y);
      for (const p of basePts.slice(1)) ctx.lineTo(p.x, p.y);
      for (let i = shiftedPts.length - 1; i >= 0; i--) ctx.lineTo(shiftedPts[i].x, shiftedPts[i].y);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    // The stroked line is the *true* response — the EQ curve (incl. HPF/LPF)
    // shifted by the output Gain, since that's what actually reaches the ear.
    const linePts = sampleResponse(b, (bb: ParamEQBands, f: number) => totalResponseDB(bb, f) + outputGain);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(linePts[0].x, linePts[0].y);
    for (const p of linePts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke(); ctx.restore();
  };

  if (targetBands && showTarget) {
    strokeCurve(targetBands, '#F5A623', 0.9, 0.16);
  } else if (targetBands && !showTarget) {
    ctx.fillStyle = 'rgba(245,166,35,0.3)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('TARGET HIDDEN — LISTEN & MATCH BY EAR', W / 2 - 150, 14);
  }

  strokeCurve(bands, '#4D9EFF', 0.95, 0.22, outputGainDb);
}

// ── Interactive band node (drag = freq/gain, wheel = Q) ──────────────────────
function EQNode({
  def, bands, containerRef, onChange, editable,
}: {
  def: BandDef;
  bands: ParamEQBands;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onChange?: (b: ParamEQBands) => void;
  editable: boolean;
}) {
  const dragRef = useRef(false);
  const freq = getFreq(bands, def);
  const gain = getGain(bands, def);
  // Every node's position depends only on *this band's own* parameters —
  // never on any other band's freq/gain/Q. That's the only way to guarantee
  // that changing one dot never moves another: HPF/LPF sit on the 0 dB
  // reference line (they have no gain of their own), and shelves/peaks sit
  // at their own gain value, full stop. The drawn curve (the sum of every
  // band) will only coincide with a given dot when that's the only band
  // doing anything — completely normal for a multi-band EQ.
  const xPct = fToFrac(freq) * 100;
  const yPct = gainToFrac(def.gainKey ? gain : 0) * 100;

  const updateFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!onChange || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xFrac = clamp((clientX - rect.left) / rect.width, 0, 1);
    const newFreq = clamp(fracToF(xFrac), FMIN, FMAX);
    let next = withFreq(bands, def, newFreq);
    if (def.gainKey) {
      const yFrac = clamp((clientY - rect.top) / rect.height, 0, 1);
      next = withGain(next, def, clamp(fracToGain(yFrac), GMIN, GMAX));
    }
    onChange(next);
  }, [bands, def, onChange, containerRef]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editable || !onChange) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = true;
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    updateFromPointer(e.clientX, e.clientY);
  };
  const handlePointerUp = () => { dragRef.current = false; };
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!editable || !onChange || !def.qKey) return;
    e.preventDefault();
    const q = getQ(bands, def) ?? 1;
    onChange(withQ(bands, def, clamp(q - Math.sign(e.deltaY) * 0.1, 0.1, 10)));
  };

  const size = 13;
  const q = getQ(bands, def);
  const title = `${def.label}: ${freq >= 1000 ? (freq / 1000).toFixed(2) + 'k' : Math.round(freq)}Hz`
    + (def.gainKey ? ` · ${gain > 0 ? '+' : ''}${gain.toFixed(1)}dB` : '')
    + (q !== undefined ? ` · Q ${q.toFixed(2)} (scroll to adjust)` : '');

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      title={title}
      style={{
        position: 'absolute',
        left: `${xPct}%`,
        top: `${yPct}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: '50%',
        background: def.color,
        border: '2px solid rgba(0,0,0,0.5)',
        boxShadow: `0 0 8px ${def.color}88`,
        cursor: editable ? 'grab' : 'default',
        touchAction: 'none',
        zIndex: 2,
      }}
    />
  );
}

// ── Output (makeup) gain — a plain vertical slider, not a knob, matching the
// thin fader-style "Gain" control on a real Channel EQ. Drag anywhere on the
// track to jump/scrub to that value; a small tick ruler (15/10/5/0/5/10/15)
// runs alongside it, same as the reference screenshot.
function OutputGainSlider({
  value, onChange, min = -15, max = 15,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef(false);

  const pctFromValue = (v: number) => ((max - v) / (max - min)) * 100;
  const valueFromClientY = (clientY: number) => {
    if (!trackRef.current) return value;
    const rect = trackRef.current.getBoundingClientRect();
    const frac = clamp((clientY - rect.top) / rect.height, 0, 1);
    return max - frac * (max - min);
  };
  const commit = (v: number) => onChange(clamp(roundTo(v, 1), min, max));

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = true;
    commit(valueFromClientY(e.clientY));
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    commit(valueFromClientY(e.clientY));
  };
  const handlePointerUp = () => { dragRef.current = false; };

  const clamped = clamp(value, min, max);
  const pct = pctFromValue(clamped);
  const ticks = [15, 10, 5, 0, -5, -10, -15].filter(t => t <= max && t >= min);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', width: 40, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: '0.25rem', flex: 1, minHeight: 160, width: '100%', justifyContent: 'center' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          fontFamily: 'var(--mono)', fontSize: '0.45rem', color: 'var(--text-faint)', textAlign: 'right',
        }}>
          {ticks.map(t => <div key={t}>{Math.abs(t)}</div>)}
        </div>
        {/* Slightly wider invisible hit-area so a thin visual track is still easy to grab */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title={`Output gain: ${clamped > 0 ? '+' : ''}${clamped.toFixed(1)} dB`}
          style={{
            position: 'relative',
            width: 16,
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            cursor: 'ns-resize',
            touchAction: 'none',
          }}
        >
          <div
            ref={trackRef}
            style={{
              position: 'relative',
              width: 3,
              height: '100%',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 2,
            }}
          >
            <div style={{ position: 'absolute', left: -4, right: -4, top: `${pctFromValue(0)}%`, height: 1, background: 'var(--border-bright)' }} />
            <div
              style={{
                position: 'absolute', left: '50%', top: `${pct}%`, transform: 'translate(-50%, -50%)',
                width: 12, height: 6, borderRadius: 2, background: 'var(--purple)',
                boxShadow: '0 0 6px rgba(167,139,250,0.6)', border: '1px solid rgba(0,0,0,0.4)',
              }}
            />
          </div>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '0.5rem', color: 'var(--text-faint)', letterSpacing: '0.06em' }}>GAIN</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '0.58rem', color: 'var(--text)' }}>
        {clamped > 0 ? '+' : ''}{clamped.toFixed(1)}dB
      </div>
    </div>
  );
}

// ── Reusable curve widget ─────────────────────────────────────────────────────
function ParamEQCurve({
  bands, onChange, targetBands, showTarget, analyserRef, analyserActive, sampleRate,
  outputGainDb, onOutputGainChange,
}: {
  bands: ParamEQBands;
  onChange?: (b: ParamEQBands) => void;
  targetBands?: ParamEQBands;
  showTarget?: boolean;
  analyserRef?: React.RefObject<AnalyserNode | null>;
  analyserActive?: boolean;
  sampleRate: number;
  outputGainDb?: number;
  onOutputGainChange?: (v: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (analyserActive && analyserRef?.current) {
      const analyser = analyserRef.current;
      if (!dataRef.current || dataRef.current.length !== analyser.frequencyBinCount) {
        dataRef.current = new Uint8Array(analyser.frequencyBinCount);
      }
      const tick = () => {
        if (!analyserRef.current) return;
        const buf = dataRef.current!;
        analyserRef.current.getByteFrequencyData(buf as unknown as Uint8Array<ArrayBuffer>);
        drawParamEQCanvas(canvas, bands, targetBands, !!showTarget, buf, sampleRate, outputGainDb ?? 0);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }

    drawParamEQCanvas(canvas, bands, targetBands, !!showTarget, null, sampleRate, outputGainDb ?? 0);
    return undefined;
  }, [bands, targetBands, showTarget, analyserActive, analyserRef, sampleRate, outputGainDb]);

  return (
    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'stretch' }}>
      <div ref={containerRef} className="spectrum-display" style={{ height: 220, flex: 1 }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        {BAND_DEFS.map(def => (
          <EQNode
            key={def.id}
            def={def}
            bands={bands}
            containerRef={containerRef}
            onChange={onChange}
            editable={!!onChange}
          />
        ))}
      </div>
      {onOutputGainChange && (
        <OutputGainSlider value={outputGainDb ?? 0} onChange={onOutputGainChange} />
      )}
    </div>
  );
}

function roundTo(v: number, decimals: number): number {
  const p = Math.pow(10, decimals);
  return Math.round(v * p) / p;
}

// Small themed numeric input — types a value directly instead of dragging.
// Commits live on every keystroke that parses to a number (so the curve,
// dot, and audio all update as you type), while keeping its own draft
// string while focused so the *displayed* text isn't clobbered mid-type by
// the clamped value bouncing back (e.g. typing "1" then "10" then "100").
// On blur, the display snaps to the final clamped value.
function NumberField({
  value, onChange, min, max, step, disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  const focusedRef = useRef(false);
  useEffect(() => { if (!focusedRef.current) setLocal(String(value)); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setLocal(text);
    const n = parseFloat(text);
    if (!Number.isNaN(n)) onChange(clamp(n, min, max));
  };

  const handleBlur = () => {
    focusedRef.current = false;
    const n = parseFloat(local);
    const clamped = Number.isNaN(n) ? value : clamp(n, min, max);
    onChange(clamped);
    setLocal(String(clamped));
  };

  return (
    <input
      type="number"
      value={local}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onFocus={() => { focusedRef.current = true; }}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      style={{
        width: '100%',
        background: disabled ? 'transparent' : 'var(--surface)',
        border: `1px solid ${disabled ? 'transparent' : 'var(--border)'}`,
        borderRadius: '3px',
        color: disabled ? 'var(--text-faint)' : 'var(--text)',
        fontFamily: 'var(--mono)',
        fontSize: '0.6rem',
        textAlign: 'center',
        padding: '0.1rem 0.15rem',
        outline: 'none',
      }}
    />
  );
}

// ── Readout row (mirrors the freq / gain / Q labels under the Logic curve) ──
// Each cell is directly editable — typing a new freq / gain / Q updates the
// same band state the curve and drag-nodes read from, so all three (curve,
// dot, numbers) always agree.
function BandReadout({ bands, onChange }: { bands: ParamEQBands; onChange: (b: ParamEQBands) => void }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${BAND_DEFS.length}, 1fr)`,
      gap: '0.35rem',
      marginTop: '0.5rem',
    }}>
      {BAND_DEFS.map(def => {
        const freq = getFreq(bands, def);
        const gain = getGain(bands, def);
        const q = getQ(bands, def);
        return (
          <div key={def.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
            <div style={{ fontSize: '0.5rem', color: def.color, letterSpacing: '0.06em', fontFamily: 'var(--mono)' }}>
              {def.short}
            </div>
            <NumberField
              value={roundTo(freq, 0)}
              min={FMIN}
              max={FMAX}
              step={1}
              onChange={v => onChange(withFreq(bands, def, clamp(v, FMIN, FMAX)))}
            />
            <NumberField
              value={def.gainKey ? roundTo(gain, 1) : 0}
              min={GMIN}
              max={GMAX}
              step={0.1}
              disabled={!def.gainKey}
              onChange={v => onChange(withGain(bands, def, clamp(v, GMIN, GMAX)))}
            />
            <NumberField
              value={q !== undefined ? roundTo(q, 2) : 1}
              min={0.1}
              max={10}
              step={0.01}
              disabled={q === undefined}
              onChange={v => onChange(withQ(bands, def, clamp(v, 0.1, 10)))}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
type TabId = 'bench' | 'ear';
type PlaySource = 'idle' | 'bench' | 'mine' | 'target';

export default function Chapter2b() {
  const [tab, setTab] = useState<TabId>('bench');

  // ── Faust engine (loaded once) ─────────────────────────────────────────────
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [engineError, setEngineError] = useState<string | null>(null);
  const dspMetaRef = useRef<FaustDspMeta | null>(null);
  const dspModuleRef = useRef<WebAssembly.Module | null>(null);
  const generatorRef = useRef<FaustMonoDspGenerator | null>(null);

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
        console.error('[Chapter2b] failed to load Faust ParamEQ DSP', err);
        setEngineError(err instanceof Error ? err.message : String(err));
        setEngineStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Shared audio engine — one Faust node / source / analyser at a time ─────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const activeNodeRef = useRef<FaustNodeLike | null>(null);
  const outputGainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const demoBufferRef = useRef<AudioBuffer | null>(null);
  const [playSource, setPlaySource] = useState<PlaySource>('idle');
  const [playError, setPlayError] = useState('');
  const [sampleRate, setSampleRate] = useState(44100);

  const ensureAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
      setSampleRate(audioCtxRef.current.sampleRate);
    }
    return audioCtxRef.current;
  }, []);

  const ensureDemoBuffer = useCallback((ctx: AudioContext): AudioBuffer => {
    if (!demoBufferRef.current) demoBufferRef.current = createDemoLoopBuffer(ctx);
    return demoBufferRef.current;
  }, []);

  // ── Test Bench state ────────────────────────────────────────────────────────
  const [benchBands, setBenchBands] = useState<ParamEQBands>(DEFAULT_BANDS);
  const benchBandsRef = useRef(benchBands);
  useEffect(() => { benchBandsRef.current = benchBands; }, [benchBands]);
  const [benchOutputGain, setBenchOutputGain] = useState(0);
  const benchOutputGainRef = useRef(benchOutputGain);
  useEffect(() => { benchOutputGainRef.current = benchOutputGain; }, [benchOutputGain]);
  const [benchBuffer, setBenchBuffer] = useState<AudioBuffer | null>(null);
  const [benchFileName, setBenchFileName] = useState('');
  const [benchDecoding, setBenchDecoding] = useState(false);
  const [benchUploadError, setBenchUploadError] = useState('');
  const benchFileInputRef = useRef<HTMLInputElement>(null);
  const [benchDownloading, setBenchDownloading] = useState(false);
  // Multiple uploaded tracks — each upload adds a new track instead of
  // replacing the last one, so you can switch between several files.
  const [benchTracks, setBenchTracks] = useState<UploadedAudioTrack[]>([]);
  const [benchActiveTrackId, setBenchActiveTrackId] = useState<number | null>(null);
  const benchUploadIdSeqRef = useRef(0);

  // ── Ear Training state ──────────────────────────────────────────────────────
  const [targetPreset, setTargetPreset] = useState<EQPreset>(() => pickRandomPreset());
  const targetBands = mergeBands(DEFAULT_BANDS, targetPreset.bands);
  const targetBandsRef = useRef(targetBands);
  useEffect(() => { targetBandsRef.current = targetBands; });
  const [myBands, setMyBands] = useState<ParamEQBands>(DEFAULT_BANDS);
  const myBandsRef = useRef(myBands);
  useEffect(() => { myBandsRef.current = myBands; }, [myBands]);
  const [myOutputGain, setMyOutputGain] = useState(0);
  const myOutputGainRef = useRef(myOutputGain);
  useEffect(() => { myOutputGainRef.current = myOutputGain; }, [myOutputGain]);
  const [earBuffer, setEarBuffer] = useState<AudioBuffer | null>(null);
  const [earFileName, setEarFileName] = useState('');
  const [earDecoding, setEarDecoding] = useState(false);
  const [earUploadError, setEarUploadError] = useState('');
  const earFileInputRef = useRef<HTMLInputElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [earDownloading, setEarDownloading] = useState<'mine' | 'target' | null>(null);

  // ── Playback ────────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch { /* already stopped */ }
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (activeNodeRef.current) {
      try { (activeNodeRef.current as unknown as AudioNode).disconnect(); } catch { /* ok */ }
      activeNodeRef.current = null;
    }
    if (outputGainNodeRef.current) {
      try { outputGainNodeRef.current.disconnect(); } catch { /* ok */ }
      outputGainNodeRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch { /* ok */ }
      analyserRef.current = null;
    }
    setPlaySource('idle');
  }, []);

  const play = useCallback(async (which: Exclude<PlaySource, 'idle'>) => {
    if (playSource === which) { stopAudio(); return; }
    stopAudio();

    if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
      setPlayError('Faust ParamEQ engine is still loading — try again in a moment.');
      return;
    }
    setPlayError('');

    const ctx = ensureAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    let buffer: AudioBuffer;
    let bands: ParamEQBands;
    let outputGainDb: number;
    if (which === 'bench') {
      buffer = benchBuffer ?? ensureDemoBuffer(ctx);
      bands = benchBandsRef.current;
      outputGainDb = benchOutputGainRef.current;
    } else if (which === 'mine') {
      buffer = earBuffer ?? ensureDemoBuffer(ctx);
      bands = myBandsRef.current;
      outputGainDb = myOutputGainRef.current;
    } else {
      buffer = earBuffer ?? ensureDemoBuffer(ctx);
      bands = targetBandsRef.current;
      outputGainDb = 0;
    }

    const factory = { module: dspModuleRef.current, json: JSON.stringify(dspMetaRef.current), soundfiles: {} };
    let node: FaustNodeLike;
    try {
      node = await generatorRef.current.createNode(
        ctx, dspMetaRef.current.name, factory, false, 512,
      ) as unknown as FaustNodeLike;
    } catch (err) {
      console.error('[Chapter2b] failed to build Faust ParamEQ node', err);
      setPlayError('Could not start the Faust ParamEQ engine — see console for details.');
      return;
    }
    applyBandsToNode(node, bands);

    const outputGain = ctx.createGain();
    applyOutputGain(outputGain, outputGainDb, ctx);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.78;
    analyser.minDecibels = ANALYSER_MIN_DB;
    analyser.maxDecibels = ANALYSER_MAX_DB;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(node as unknown as AudioNode);
    (node as unknown as AudioNode).connect(outputGain);
    outputGain.connect(analyser);
    analyser.connect(ctx.destination);
    src.start();

    sourceNodeRef.current = src;
    activeNodeRef.current = node;
    outputGainNodeRef.current = outputGain;
    analyserRef.current = analyser;
    setPlaySource(which);
  }, [playSource, stopAudio, engineStatus, benchBuffer, earBuffer, ensureAudioCtx, ensureDemoBuffer]);

  // Live param updates while playing
  useEffect(() => {
    if (playSource === 'bench' && activeNodeRef.current) applyBandsToNode(activeNodeRef.current, benchBands);
  }, [benchBands, playSource]);
  useEffect(() => {
    if (playSource === 'bench' && outputGainNodeRef.current) applyOutputGain(outputGainNodeRef.current, benchOutputGain, audioCtxRef.current);
  }, [benchOutputGain, playSource]);
  useEffect(() => {
    if (playSource === 'mine' && outputGainNodeRef.current) applyOutputGain(outputGainNodeRef.current, myOutputGain, audioCtxRef.current);
  }, [myOutputGain, playSource]);
  useEffect(() => {
    if (playSource === 'mine' && activeNodeRef.current) applyBandsToNode(activeNodeRef.current, myBands);
  }, [myBands, playSource]);

  // Stop playback + reset engine state when switching tabs
  const handleTabChange = useCallback((next: TabId) => {
    stopAudio();
    setTab(next);
  }, [stopAudio]);

  useEffect(() => () => {
    try { sourceNodeRef.current?.stop(); } catch { /* ok */ }
    sourceNodeRef.current?.disconnect();
    try { (activeNodeRef.current as unknown as AudioNode)?.disconnect(); } catch { /* ok */ }
    outputGainNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();
    audioCtxRef.current?.close();
  }, []);

  // ── Test Bench actions ──────────────────────────────────────────────────────
  const handleBenchUploadClick = useCallback(() => { benchFileInputRef.current?.click(); }, []);

  const handleBenchFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    stopAudio();
    setBenchUploadError('');
    setBenchDecoding(true);
    try {
      const ctx = ensureAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      const newTracks: UploadedAudioTrack[] = [];
      let failures = 0;
      for (const file of files) {
        try {
          const arrayBuf = await file.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuf);
          newTracks.push({
            id: ++benchUploadIdSeqRef.current,
            name: file.name.replace(/\.[^/.]+$/, ''),
            buffer: decoded,
          });
        } catch (err) {
          console.error('Failed to decode audio file', file.name, err);
          failures++;
        }
      }
      if (newTracks.length > 0) {
        setBenchTracks(prev => [...prev, ...newTracks]);
        const last = newTracks[newTracks.length - 1];
        setBenchActiveTrackId(last.id);
        setBenchBuffer(last.buffer);
        setBenchFileName(last.name);
      }
      if (failures > 0) {
        setBenchUploadError(
          newTracks.length > 0
            ? `${failures} file${failures > 1 ? 's' : ''} could not be read — try mp3, wav, or m4a.`
            : 'Could not read that file — try an mp3, wav, or m4a.'
        );
      }
    } finally {
      setBenchDecoding(false);
    }
  }, [stopAudio, ensureAudioCtx]);

  // Switch the active Test Bench source between the demo loop and any of the
  // previously uploaded tracks, without needing to re-upload.
  const handleBenchSelectTrack = useCallback((id: number | null) => {
    stopAudio();
    setBenchActiveTrackId(id);
    if (id === null) {
      setBenchBuffer(null);
      setBenchFileName('');
      return;
    }
    const track = benchTracks.find(t => t.id === id);
    if (track) {
      setBenchBuffer(track.buffer);
      setBenchFileName(track.name);
    }
  }, [stopAudio, benchTracks]);

  const handleBenchReset = useCallback(() => {
    stopAudio();
    setBenchBands(DEFAULT_BANDS);
    setBenchOutputGain(0);
  }, [stopAudio]);

  const handleBenchDownload = useCallback(async () => {
    if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
      setPlayError('Faust ParamEQ engine is still loading — try again in a moment.');
      return;
    }
    setBenchDownloading(true);
    setPlayError('');
    try {
      const ctx = ensureAudioCtx();
      const source = benchBuffer ?? ensureDemoBuffer(ctx);
      const rendered = await renderParamEQOffline(
        generatorRef.current, dspMetaRef.current, dspModuleRef.current, source, benchBands, benchOutputGain,
      );
      const blob = audioBufferToWavBlob(rendered);
      downloadBlob(blob, `${benchFileName || 'paramEQ-test-bench'}-eq.wav`);
    } catch (err) {
      console.error('[Chapter2b] offline render failed', err);
      setPlayError('Could not render the audio for download — see console for details.');
    } finally {
      setBenchDownloading(false);
    }
  }, [engineStatus, benchBuffer, benchBands, benchOutputGain, benchFileName, ensureAudioCtx, ensureDemoBuffer]);

  // ── Ear Training actions ────────────────────────────────────────────────────
  const handleEarUploadClick = useCallback(() => { earFileInputRef.current?.click(); }, []);

  const handleEarFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopAudio();
    setEarUploadError('');
    setEarDecoding(true);
    try {
      const ctx = ensureAudioCtx();
      if (ctx.state === 'suspended') await ctx.resume();
      const arrayBuf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      setEarBuffer(decoded);
      setEarFileName(file.name.replace(/\.[^/.]+$/, ''));
      setTargetPreset(pickRandomPreset());
      setMyBands(DEFAULT_BANDS);
      setRevealed(false);
      setSubmitted(false);
      setHintUsed(false);
    } catch (err) {
      console.error('Failed to decode audio file', err);
      setEarUploadError('Could not read that file — try an mp3, wav, or m4a.');
    } finally {
      setEarDecoding(false);
    }
  }, [stopAudio, ensureAudioCtx]);

  const handleEarReset = useCallback(() => {
    stopAudio();
    setMyBands(DEFAULT_BANDS);
    setMyOutputGain(0);
    setTargetPreset(pickRandomPreset());
    setRevealed(false);
    setSubmitted(false);
    setHintUsed(false);
  }, [stopAudio]);

  const handleEarSubmit = useCallback(() => {
    stopAudio();
    setRevealed(true);
    setSubmitted(true);
  }, [stopAudio]);

  const handleEarHint = useCallback(() => {
    setRevealed(true);
    setHintUsed(true);
  }, []);

  const handleEarDownload = useCallback(async (which: 'mine' | 'target') => {
    if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
      setPlayError('Faust ParamEQ engine is still loading — try again in a moment.');
      return;
    }
    setEarDownloading(which);
    setPlayError('');
    try {
      const ctx = ensureAudioCtx();
      const source = earBuffer ?? ensureDemoBuffer(ctx);
      const bands = which === 'mine' ? myBands : targetBands;
      const outputGainDb = which === 'mine' ? myOutputGain : 0;
      const rendered = await renderParamEQOffline(
        generatorRef.current, dspMetaRef.current, dspModuleRef.current, source, bands, outputGainDb,
      );
      const blob = audioBufferToWavBlob(rendered);
      downloadBlob(blob, `paramEQ-${which}.wav`);
    } catch (err) {
      console.error('[Chapter2b] offline render failed', err);
      setPlayError('Could not render the audio for download — see console for details.');
    } finally {
      setEarDownloading(null);
    }
  }, [engineStatus, earBuffer, myBands, targetBands, myOutputGain, ensureAudioCtx, ensureDemoBuffer]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const rms = curveRMSErrorDB(myBands, targetBands);
  const score = scoreFromRMS(rms);
  const scoreColor = score >= 90 ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--red)';

  const bandDiagnostics = BAND_DEFS.map(def => {
    const f = getFreq(targetBands, def);
    const t = totalResponseDB(targetBands, f);
    const u = totalResponseDB(myBands, f);
    const diff = u - t;
    const color = Math.abs(diff) < 1.5 ? 'var(--green)' : Math.abs(diff) < 4 ? 'var(--amber)' : 'var(--red)';
    const acc = clamp(1 - Math.abs(diff) / 10, 0, 1);
    return { def, diff, color, acc };
  });
  const worst = bandDiagnostics.reduce(
    (w, b, i) => Math.abs(b.diff) > Math.abs(bandDiagnostics[w].diff) ? i : w, 0,
  );

  const engineBadge: Record<EngineStatus, { bg: string; border: string; fg: string; text: string }> = {
    idle: { bg: 'var(--surface)', border: 'var(--border)', fg: 'var(--text-faint)', text: '○ IDLE' },
    loading: { bg: 'rgba(245,166,35,0.15)', border: 'rgba(245,166,35,0.4)', fg: 'var(--amber)', text: '◌ LOADING DSP…' },
    ready: { bg: 'rgba(45,212,191,0.15)', border: 'rgba(45,212,191,0.4)', fg: 'var(--teal)', text: '● FAUST WASM' },
    error: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', fg: '#EF4444', text: '✕ ENGINE ERROR' },
  };
  const eb = engineBadge[engineStatus];
  const engineReady = engineStatus === 'ready';

  return (
    <div className="eq-lab">
      {/* Top bar */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--purple-dim)', borderColor: 'rgba(167,139,250,0.4)' }}>
            〰
          </div>
          <div>
            <div className="lab-name">ParamEQ</div>
            <div className="lab-subtitle">8-BAND PARAMETRIC · FAUST WASM</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {tab === 'bench' && (
            <>
              <input ref={benchFileInputRef} type="file" accept="audio/*" multiple onChange={handleBenchFileSelected} style={{ display: 'none' }} />
              <button
                className="btn-secondary"
                onClick={handleBenchUploadClick}
                disabled={benchDecoding}
                title="Upload one or more audio files — pick multiple in the file dialog to load them all"
                style={{
                  fontSize: '0.65rem',
                  padding: '0.4rem 0.8rem',
                  fontWeight: 600,
                  borderColor: 'rgba(167,139,250,0.5)',
                  color: 'var(--purple)',
                  background: 'rgba(167,139,250,0.1)',
                }}
              >
                {benchDecoding ? '⏳ Decoding…' : '⬆ Upload Audio'}
              </button>
              {benchUploadError && <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--mono)' }}>{benchUploadError}</span>}
            </>
          )}
          <span className="badge" style={{ background: eb.bg, borderColor: eb.border, color: eb.fg, fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.06em' }}>
            {eb.text}
          </span>
          <div className="lab-status" style={{ color: 'var(--purple)' }}>
            <div className="status-dot" style={{ background: 'var(--purple)', boxShadow: '0 0 6px var(--purple)' }} />
            {tab === 'bench' ? 'TEST BENCH' : (submitted ? `SCORE: ${score}%` : 'MATCHING')}
          </div>
        </div>
      </div>

      {engineStatus === 'error' && (
        <div className="concept-callout" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', margin: '1rem 1.25rem 0' }}>
          <strong style={{ color: '#EF4444' }}>Failed to load Faust ParamEQ DSP:</strong> {engineError}
          <br />
          Check that <code>dsp-module.wasm</code> and <code>dsp-meta.json</code> are present at{' '}
          <code>public/faust/ParamEQ/</code>.
        </div>
      )}

      {/* Tab row */}
      <div className="eq-tabrow" style={{ display: 'flex', gap: '0.4rem', padding: '0.55rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {([
          { id: 'bench' as const, label: '🧪 TEST BENCH', color: 'var(--blue)' },
          { id: 'ear' as const, label: '🎧 EAR TRAINING', color: 'var(--amber)' },
        ]).map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              style={{
                padding: '0.35rem 0.8rem',
                background: active ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
                border: `1px solid ${active ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
                borderRadius: '3px',
                color: active ? 'var(--purple)' : 'var(--text-dim)',
                fontFamily: 'var(--mono)',
                fontSize: '0.62rem',
                letterSpacing: '0.06em',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Source row — switch between the demo loop and any uploaded tracks */}
      {tab === 'bench' && benchTracks.length > 0 && (
        <div style={{
          display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center',
          padding: '0.5rem 1rem 0',
        }}>
          <span style={{ fontSize: '0.55rem', color: 'var(--text-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
            SOURCE:
          </span>
          <button
            onClick={() => handleBenchSelectTrack(null)}
            title="Built-in demo loop"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem',
              background: benchActiveTrackId === null ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
              border: `1px solid ${benchActiveTrackId === null ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
              borderRadius: '3px', color: benchActiveTrackId === null ? 'var(--purple)' : 'var(--text-dim)',
              fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
          >
            🎵 Demo Loop
          </button>
          {benchTracks.map(track => {
            const active = benchActiveTrackId === track.id;
            return (
              <button
                key={track.id}
                onClick={() => handleBenchSelectTrack(track.id)}
                title={track.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem',
                  background: active ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
                  border: `1px solid ${active ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
                  borderRadius: '3px', color: active ? 'var(--purple)' : 'var(--text-dim)',
                  fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                  maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                📁 {track.name}
              </button>
            );
          })}
        </div>
      )}

      {/* ═══ TEST BENCH ═══ */}
      {tab === 'bench' && (
        <>
          <div className="eq-body">
            <div className="eq-main">
              <div className="legend-row">
                <div className="legend-item"><div className="legend-line" style={{ background: 'var(--blue)' }} />YOUR CURVE (DRAG NODES)</div>
                <div className="legend-item"><div className="legend-line" style={{ background: 'var(--text-faint)', height: '1px' }} />FLAT (0 dB)</div>
              </div>

              <ParamEQCurve
                bands={benchBands}
                onChange={setBenchBands}
                analyserRef={analyserRef}
                analyserActive={playSource === 'bench'}
                sampleRate={sampleRate}
                outputGainDb={benchOutputGain}
                onOutputGainChange={setBenchOutputGain}
              />
              <BandReadout bands={benchBands} onChange={setBenchBands} />

              <div className="canvas-label" style={{ margin: '1rem 0 0.5rem' }}>QUICK PRESETS</div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {EQ_PRESETS.map(p => (
                  <button
                    key={p.name}
                    className="btn-secondary"
                    style={{ fontSize: '0.6rem', padding: '0.35rem 0.6rem' }}
                    onClick={() => setBenchBands(mergeBands(DEFAULT_BANDS, p.bands))}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="eq-sidebar">
              <div style={{
                background: 'rgba(77,158,255,0.08)', border: '1px solid rgba(77,158,255,0.2)',
                borderRadius: '4px', padding: '0.75rem', fontSize: '0.7rem', color: 'var(--text-dim)', lineHeight: 1.6,
              }}>
                <div style={{ color: 'var(--blue)', fontWeight: 600, marginBottom: '0.4rem', fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
                  🧪 HOW TO USE
                </div>
                1. Upload audio (or use the built-in demo loop).<br />
                2. Drag any node to set its <strong style={{ color: 'var(--text)' }}>freq / gain</strong>.<br />
                3. Scroll on a peak node to change its <strong style={{ color: 'var(--text)' }}>Q</strong>.<br />
                4. Play to hear it live, then download the result.
              </div>

              {!benchBuffer && (
                <div style={{ fontSize: '0.6rem', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
                  Using built-in demo loop until you upload your own.
                </div>
              )}

              <div className="tip-box">
                <strong>Tip:</strong> This tab is a sandbox for testing how ParamEQ shapes a sound —
                nothing to score here, just listen and experiment.
              </div>
            </div>
          </div>

          <div className="lab-footer">
            <div className="hint-text">
              {playError
                ? <span style={{ color: '#EF4444' }}>{playError}</span>
                : <>Drag nodes on the curve, then <strong style={{ color: 'var(--blue)', margin: '0 0.25rem' }}>Play</strong> to hear it.</>}
            </div>
            <div className="btn-row">
              <button className="btn-secondary" onClick={handleBenchReset}>Reset</button>
              <button
                className="btn-secondary"
                onClick={() => play('bench')}
                disabled={!engineReady}
                title={engineReady ? '' : 'Loading Faust ParamEQ engine…'}
                style={playSource === 'bench' ? { borderColor: 'var(--blue)', color: 'var(--blue)' } : {}}
              >
                {playSource === 'bench' ? '⏸ Stop' : '▶ Play'}
              </button>
              <button className="btn-primary" onClick={handleBenchDownload} disabled={benchDownloading || !engineReady}>
                {benchDownloading ? 'Rendering…' : '⬇ Download EQ\'d Audio'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ EAR TRAINING ═══ */}
      {tab === 'ear' && (
        <>
          <div className="eq-body">
            <div className="eq-main">
              <div className="legend-row">
                <div className="legend-item">
                  <div className="legend-line" style={{ background: revealed ? 'var(--amber)' : 'var(--text-faint)', opacity: revealed ? 1 : 0.4 }} />
                  {revealed ? 'TARGET CURVE' : 'TARGET (HIDDEN)'}
                </div>
                <div className="legend-item"><div className="legend-line" style={{ background: 'var(--blue)' }} />YOUR EQ</div>
              </div>

              <ParamEQCurve
                bands={myBands}
                onChange={setMyBands}
                targetBands={targetBands}
                showTarget={revealed}
                analyserRef={analyserRef}
                analyserActive={playSource === 'mine' || playSource === 'target'}
                sampleRate={sampleRate}
                outputGainDb={myOutputGain}
                onOutputGainChange={setMyOutputGain}
              />
              <BandReadout bands={myBands} onChange={setMyBands} />
            </div>

            <div className="eq-sidebar">
              {!submitted && (
                <div style={{
                  background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)',
                  borderRadius: '4px', padding: '0.75rem', fontSize: '0.7rem', color: 'var(--text-dim)', lineHeight: 1.6,
                }}>
                  <div style={{ color: 'var(--amber)', fontWeight: 600, marginBottom: '0.4rem', fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
                    🎧 HOW TO PLAY
                  </div>
                  1. Press <strong style={{ color: 'var(--amber)' }}>Hear Target / Mine</strong> to learn the goal sound, then tap it again to switch and drag nodes to match it.<br />
                  2. Submit when you're confident — score is based on how close your overall curve is, not exact node positions.
                </div>
              )}

              {submitted && (
                <div className="score-ring-wrap">
                  <div className="score-ring" style={{ background: `conic-gradient(${scoreColor} 0% ${score}%, var(--surface) ${score}% 100%)` }}>
                    <div className="score-ring-inner">
                      <div className="score-num" style={{ color: scoreColor }}>{score}</div>
                      <div className="score-lbl">SCORE</div>
                    </div>
                  </div>
                  <div className="score-label">CURVE MATCH ACCURACY</div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-faint)', fontFamily: 'var(--mono)', marginTop: '0.2rem' }}>
                    TARGET WAS: {targetPreset.name}
                  </div>
                  {hintUsed && <div style={{ fontSize: '0.55rem', color: 'var(--red)', fontFamily: 'var(--mono)', marginTop: '0.2rem' }}>HINT USED</div>}
                </div>
              )}

              {submitted && (
                <div className="band-analysis">
                  <div className="canvas-label">BAND ACCURACY (AT TARGET FREQ)</div>
                  {bandDiagnostics.map(({ def, diff, color, acc }) => (
                    <div className="band-item" key={def.id}>
                      <div className="band-name">{def.short}</div>
                      <div className="band-bar-track"><div className="band-bar-fill" style={{ width: `${acc * 100}%`, background: color }} /></div>
                      <div className="band-diff" style={{ color }}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="tip-box">
                <strong>Tip:</strong>{' '}
                {submitted
                  ? `Biggest mismatch is around the ${worst >= 0 ? bandDiagnostics[worst].def.label : ''} band — orange curve shows where it should sit.`
                  : 'A/B compare quickly — your short-term memory for tone fades in about 5 seconds.'}
              </div>

              <input ref={earFileInputRef} type="file" accept="audio/*" onChange={handleEarFileSelected} style={{ display: 'none' }} />
              <button className="btn-secondary" onClick={handleEarUploadClick} disabled={earDecoding} style={{ fontSize: '0.68rem' }}>
                {earDecoding ? '⏳ Decoding…' : (earBuffer ? `📁 ${earFileName}` : '+ Use My Own Audio')}
              </button>
              {earUploadError && <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--mono)' }}>{earUploadError}</span>}

              {!submitted && !revealed && (
                <button className="btn-secondary" onClick={handleEarHint} style={{ fontSize: '0.7rem', borderColor: 'rgba(245,166,35,0.3)', color: 'var(--amber)' }}>
                  👁 Show Target Curve (reveals answer)
                </button>
              )}
            </div>
          </div>

          <div className="lab-footer">
            <div className="hint-text">
              {playError
                ? <span style={{ color: '#EF4444' }}>{playError}</span>
                : submitted
                  ? (score >= 90
                      ? <span style={{ color: 'var(--green)' }}>✓ Excellent ear! Orange curve shows the target.</span>
                      : 'Orange curve shows the target shape. Retry to improve.')
                  : <>Press <strong style={{ color: 'var(--amber)', margin: '0 0.25rem' }}>Hear Target / Mine</strong> — tap again to switch and drag until they match.</>}
            </div>
            <div className="btn-row">
              <button className="btn-secondary" onClick={handleEarReset}>Reset</button>
              <button
                className="btn-secondary"
                onClick={() => play(playSource === 'target' ? 'mine' : 'target')}
                disabled={!engineReady}
                title={engineReady ? '' : 'Loading Faust ParamEQ engine…'}
                style={
                  playSource === 'target' ? { borderColor: 'var(--amber)', color: 'var(--amber)' }
                  : playSource === 'mine' ? { borderColor: 'var(--blue)', color: 'var(--blue)' }
                  : {}
                }
              >
                {playSource === 'target' ? '⏸ Target · Tap for Mine'
                  : playSource === 'mine' ? '⏸ Mine · Tap for Target'
                  : '▶ Hear Target / Mine'}
              </button>
              <button
                className="btn-secondary"
                onClick={stopAudio}
                disabled={playSource === 'idle'}
              >
                ■ Stop
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleEarDownload('target')}
                disabled={earDownloading !== null || !engineReady}
              >
                {earDownloading === 'target' ? 'Rendering…' : '⬇ Target WAV'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => handleEarDownload('mine')}
                disabled={earDownloading !== null || !engineReady}
              >
                {earDownloading === 'mine' ? 'Rendering…' : '⬇ Mine WAV'}
              </button>
              <button className="btn-primary" onClick={handleEarSubmit} disabled={submitted && score >= 90}>
                {submitted && score >= 90 ? '✓ Passed →' : 'Submit Score →'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
