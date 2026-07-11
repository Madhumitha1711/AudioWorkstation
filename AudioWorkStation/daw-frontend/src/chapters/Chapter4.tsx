import { useRef, useState, useEffect, useCallback } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { compileFaustWasm, type FaustDspMeta, type FaustNodeLike } from '../faust/faustTypes';
import { downloadAudioBufferAsWav } from '../audio/wavRender';

// ── Types ─────────────────────────────────────────────────────────────────────
// v2: the Faust patch is now a 4-band multiband compressor with internal/
// external sidechain detection (public/faust/compressor/compressor.dsp).
// Each band gets its own full compressor; three crossover points split the
// signal into Low / Low-Mid / High-Mid / High.
type BandId = 'low' | 'lowMid' | 'highMid' | 'high';
const BAND_IDS: BandId[] = ['low', 'lowMid', 'highMid', 'high'];
const BAND_LABELS: Record<BandId, string> = {
  low: 'LOW', lowMid: 'LOW-MID', highMid: 'HIGH-MID', high: 'HIGH',
};

interface BandParams {
  bypass:    boolean;
  threshold: number;   // dB  -60 → 0
  ratio:     number;   //       1 → 20
  attack:    number;   // ms   1 → 2000  (segmented knob, see TIME_KNOB_* below)
  release:   number;   // ms   1 → 2000  (segmented knob, see TIME_KNOB_* below)
  knee:      number;   // dB   0 → 20
  makeup:    number;   // dB   0 → 24
}

interface CrossoverParams {
  loLowMid:    number; // Hz  20 → 1000   (Low / Low-Mid split)
  lowMidHiMid: number; // Hz 200 → 5000   (Low-Mid / High-Mid split)
  hiMidHigh:   number; // Hz 500 → 20000  (High-Mid / High split)
}

interface SidechainParams {
  external: boolean; // detect off the sidechain input instead of each band's own audio
  listen:   boolean; // audition the (filtered) detector signal instead of the processed output
  hpf:      number;  // Hz  20 → 2000 — pre-filter applied to the sidechain before detection
}

// An uploaded audio track that can be used as the signal source in the
// Compressor Studio (free play / learning).
interface UploadedTrack { id: number; name: string; buffer: AudioBuffer; }

// The main signal source is always the drum loop or one uploaded track (see
// UploadedTrack above). The sidechain source is independently selectable —
// 'none' mirrors whatever the main source is (self-sidechain), 'synth' is
// the built-in drum loop even when it isn't the main source, or a specific
// uploaded track id, so External Sidechain can genuinely duck one track off
// a different one (e.g. a kick loop ducking an uploaded bass/pad track).
type SidechainSourceId = number | 'synth' | 'none';

type BandKnobKey = 'threshold' | 'ratio' | 'attack' | 'release' | 'knee' | 'makeup';

interface KnobSpec {
  key:   BandKnobKey;
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

// Per-band knob ranges mirror the live bounds in
// public/faust/compressor/dsp-meta.json (the Faust patch clamps its own
// params internally — Attack 0.1–100 ms, Release 10–1000 ms, Makeup_Gain
// 0–24 dB — so dialing a knob past those on Attack/Release/Makeup won't
// change the audio any further even though the knob keeps turning). This
// same knob set now drives whichever band is selected in the tab row above
// it, instead of one fixed global compressor.
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
  { key: 'makeup',    label: 'MAKEUP GAIN', min: 0,   max: 24,   step: 0.1, fmt: v => `+${v.toFixed(1)} dB` },
];

// Defaults mirror the Faust patch's own declared `init` values, so the knobs
// read exactly what the DSP is already doing the instant it loads — no
// silent mismatch between "what the UI shows" and "what's actually playing".
const DEFAULT_BAND: BandParams = {
  bypass: false, threshold: -20, ratio: 4, attack: 10, release: 100, knee: 3, makeup: 0,
};
function makeDefaultBands(): Record<BandId, BandParams> {
  return { low: { ...DEFAULT_BAND }, lowMid: { ...DEFAULT_BAND }, highMid: { ...DEFAULT_BAND }, high: { ...DEFAULT_BAND } };
}
const DEFAULT_CROSSOVER: CrossoverParams = { loLowMid: 150, lowMidHiMid: 1000, hiMidHigh: 5000 };
const DEFAULT_SIDECHAIN: SidechainParams = { external: false, listen: false, hpf: 20 };
const DEFAULT_OUTPUT_GAIN = 0;
// Matches the Faust patch's own "Multiband/Enable" checkbox default (off) —
// see public/faust/compressor/compressor.dsp v3.1. Off = single-band: the
// Low Band controls act on the whole, unsplit signal and the other 3 bands
// are silent. On = the full 4-band crossover split.
const DEFAULT_MULTIBAND = false;

// ── Faust compressor engine wiring ───────────────────────────────────────────
// Real DSP: public/faust/compressor/ (dsp-module.wasm + dsp-meta.json), a
// 4-band multiband compressor with sidechain detection (compressors.lib
// soft-knee engine, same math as before, now instantiated per band). Two
// audio inputs: channel 0 is the main signal, channel 1 is the sidechain
// detector input — see the ChannelMergerNode wiring in startAudio() below.
const FAUST_BASE_PATH = '/faust/compressor';

// Faust addresses, from public/faust/compressor/dsp-meta.json's `ui` tree —
// band group labels became "Low_Band" / "Low-Mid_Band" / "High-Mid_Band" /
// "High_Band" prefixes (Faust turns label spaces into underscores).
const BAND_PREFIX: Record<BandId, string> = {
  low: 'Low_Band', lowMid: 'Low-Mid_Band', highMid: 'High-Mid_Band', high: 'High_Band',
};
function bandAddr(band: BandId, suffix: string) {
  return `/compressor/${BAND_PREFIX[band]}_${suffix}`;
}
const ADDR = {
  multiband: {
    enable: '/compressor/Multiband_Enable',
  },
  band: (b: BandId) => ({
    bypass:    bandAddr(b, 'Bypass'),
    threshold: bandAddr(b, 'Threshold'),
    ratio:     bandAddr(b, 'Ratio'),
    knee:      bandAddr(b, 'Knee'),
    attack:    bandAddr(b, 'Attack'),
    release:   bandAddr(b, 'Release'),
    makeup:    bandAddr(b, 'Makeup_Gain'),
    gr:        bandAddr(b, 'Gain_Reduction'), // read-only hbargraph output
  }),
  crossover: {
    loLowMid:    '/compressor/Crossover_Low-LowMid',
    lowMidHiMid: '/compressor/Crossover_LowMid-HighMid',
    hiMidHigh:   '/compressor/Crossover_HighMid-High',
  },
  sidechain: {
    external: '/compressor/Sidechain_External_Sidechain',
    listen:   '/compressor/Sidechain_SC_Listen',
    hpf:      '/compressor/Sidechain_SC_HPF',
  },
  output: {
    wetDry: '/compressor/Output_Wet-Dry',
    gain:   '/compressor/Output_Gain',
  },
} as const;

type FaustEngineStatus = 'idle' | 'loading' | 'ready' | 'error';

// Pushes every UI param onto a live Faust node. Bypass drives the patch's own
// Output/Wet-Dry to 0 (fully dry passthrough) — a true bypass, same intent
// as the single-band version, done the way the DSP itself exposes it. There
// is still no user-facing wet/dry mix knob (a partial blend doesn't help
// anyone learn what the compressor is doing), so outside of bypass this
// always pushes 100% wet; Output Gain is the one new global trim exposed.
function pushFaustParams(
  node: FaustNodeLike,
  bands: Record<BandId, BandParams>,
  crossover: CrossoverParams,
  sidechain: SidechainParams,
  outputGainDb: number,
  bypass: boolean,
  multibandEnabled: boolean,
) {
  node.setParamValue(ADDR.multiband.enable, multibandEnabled ? 1 : 0);
  for (const b of BAND_IDS) {
    const a = ADDR.band(b);
    const p = bands[b];
    node.setParamValue(a.bypass,    p.bypass ? 1 : 0);
    node.setParamValue(a.threshold, p.threshold);
    node.setParamValue(a.ratio,     p.ratio);
    node.setParamValue(a.knee,      p.knee);
    node.setParamValue(a.attack,    p.attack);   // ms — matches the patch's own unit
    node.setParamValue(a.release,   p.release);  // ms
    node.setParamValue(a.makeup,    p.makeup);
  }
  node.setParamValue(ADDR.crossover.loLowMid,    crossover.loLowMid);
  node.setParamValue(ADDR.crossover.lowMidHiMid, crossover.lowMidHiMid);
  node.setParamValue(ADDR.crossover.hiMidHigh,   crossover.hiMidHigh);

  node.setParamValue(ADDR.sidechain.external, sidechain.external ? 1 : 0);
  node.setParamValue(ADDR.sidechain.listen,   sidechain.listen ? 1 : 0);
  node.setParamValue(ADDR.sidechain.hpf,      sidechain.hpf);

  node.setParamValue(ADDR.output.wetDry, bypass ? 0 : 100); // patch takes 0..100
  node.setParamValue(ADDR.output.gain,   outputGainDb);
}

// Builds a 2-channel (main, sidechain) stream out of two *independent*
// sources — the Faust node declares 2 audio inputs (see compressor.dsp's
// process(mainIn, scIn)), which @grame/faustwasm exposes as ONE AudioNode
// input with channelCount 2 rather than two separate AudioNode inputs, so
// feeding it two distinct signals means merging them onto one 2-channel
// stream with a ChannelMergerNode first. Pass the same node twice to mirror
// one signal onto both channels (self-sidechain).
function connectMainAndSidechain(ctx: BaseAudioContext, mainSource: AudioNode, sidechainSource: AudioNode, destination: AudioNode) {
  const merger = ctx.createChannelMerger(2);
  mainSource.connect(merger, 0, 0);
  sidechainSource.connect(merger, 0, 1);
  merger.connect(destination);
  return merger;
}

// Renders an uploaded track through the same Faust compressor patch offline
// (an OfflineAudioContext instead of a live one), so it can be exported as a
// WAV — mirrors the live graph in startAudio() but with no meters/scheduler.
// `sidechainBuffer` is optional: pass a different track's buffer to render
// with a genuine external sidechain, or omit it to mirror `source` (matches
// "Same as main" / the built-in drum loop, which can't be rendered offline
// here without a dedicated offline scheduler).
async function renderCompressorOffline(
  generator: FaustMonoDspGenerator,
  meta: FaustDspMeta,
  dspModule: WebAssembly.Module,
  source: AudioBuffer,
  sidechainBuffer: AudioBuffer | undefined,
  bands: Record<BandId, BandParams>,
  crossover: CrossoverParams,
  sidechain: SidechainParams,
  outputGainDb: number,
  bypass: boolean,
  multibandEnabled: boolean,
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate);
  const factory = { module: dspModule, json: JSON.stringify(meta), soundfiles: {} };
  const node = await generator.createNode(
    offlineCtx as unknown as AudioContext, meta.name, factory, false, 512,
  ) as unknown as FaustNodeLike;
  pushFaustParams(node, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled);

  const mainSrc = offlineCtx.createBufferSource();
  mainSrc.buffer = source;
  const scSrc = offlineCtx.createBufferSource();
  scSrc.buffer = sidechainBuffer ?? source;
  scSrc.loop = true; // covers the full render even if the sidechain clip is shorter than the main one

  connectMainAndSidechain(offlineCtx, mainSrc, scSrc, node as unknown as AudioNode);
  (node as unknown as AudioNode).connect(offlineCtx.destination);
  mainSrc.start();
  scSrc.start();
  return offlineCtx.startRendering();
}

// ── Transfer function math ────────────────────────────────────────────────────
type ShapeParams = Pick<BandParams, 'threshold' | 'ratio' | 'knee'>;

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
// happened. Shows the currently-selected band's curve only — each band has
// its own independent threshold/ratio/knee/makeup.
function drawTransfer(canvas: HTMLCanvasElement, params: BandParams) {
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

  // Stroke (+ optional fill under the curve itself). The drawn curve is
  // compression (threshold/ratio/knee) PLUS Makeup Gain added on top —
  // Makeup Gain doesn't change the *shape* Faust applies (that's the
  // ratio/knee/threshold curve, unchanged), it just lifts the whole thing
  // vertically. No separate shaded region is drawn for the makeup portion.
  const curve = (p: BandParams, stroke: string, fillAlpha: number) => {
    const shapedDb = (db: number) => applyCompression(db, p) + p.makeup;

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
// real, smoothed broadband input/output level across a fixed time window,
// and shades the gap between the input trace and "input minus the selected
// band's real gain reduction" — that reduction number comes straight off the
// Faust patch's own Gain_Reduction meter for that band (see
// setOutputParamHandler in startAudio), not an estimate, so it's exact for
// whichever band is selected even though 4 bands are summing into the one
// broadband output trace.
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB   = -54;
const SCOPE_MAX_DB   = 12;

interface ScopePoint { t: number; inputDb: number; outputDb: number; grDb: number; }

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
  // Reference line: input minus the selected band's real gain reduction —
  // exact, not backed-out from the (4-band-summed) output.
  const afterBandGrPts = visible.map(p => ({ x: toX(p.t), y: toY(p.inputDb - p.grDb) }));

  const fillBetween = (top: { x: number; y: number }[], bottom: { x: number; y: number }[], color: string, alpha: number) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    for (const p of top.slice(1)) ctx.lineTo(p.x, p.y);
    for (let i = bottom.length - 1; i >= 0; i--) ctx.lineTo(bottom[i].x, bottom[i].y);
    ctx.closePath(); ctx.fill(); ctx.restore();
  };

  // Gain-reduction gap for the selected band — shrinks to nothing as that
  // band's Threshold goes up, or when its Bypass is on.
  fillBetween(inPts, afterBandGrPts, '#FF4D6A', 0.22);

  // Input trace (broadband, pre-compression)
  ctx.save(); ctx.globalAlpha = 0.6;
  ctx.strokeStyle = '#00FF87'; ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.moveTo(inPts[0].x, inPts[0].y);
  for (const p of inPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke(); ctx.restore();

  // Output trace (broadband, post-compression — what actually reaches the ear)
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

// Compact labeled range slider used for the global Crossover / Sidechain /
// Output controls, which don't warrant a full rotary knob each (there are
// six of them, and none is a "learning objective" knob the way the six main
// per-band controls are) — plain, consistent with the app's dark theme via
// the same CSS variables the rest of this file already uses inline.
function MiniSlider({
  label, value, min, max, step, fmt, onChange, accent = 'var(--purple)',
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
  accent?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
      <span style={{
        width: 96, fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--text-dim)',
        letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.25,
      }}>
        {label}
      </span>
      <input
        type="range"
        className="mini-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ ['--mini-range-accent' as string]: accent } as React.CSSProperties}
      />
      <span style={{ width: 58, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '0.55rem', color: accent }}>
        {fmt(value)}
      </span>
    </div>
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

// Light smoothing (30ms) applied to the real Gain_Reduction values read off
// the Faust patch, purely so the on-screen number/bar doesn't jitter frame
// to frame — the compression ballistics themselves are already the patch's
// own Attack/Release, this is a display-only pass.
const GR_READOUT_TAU_S = 0.03;
function grReadoutSmooth(prev: number, target: number, dt: number): number {
  if (dt <= 0) return prev;
  return prev + (target - prev) * (1 - Math.exp(-dt / GR_READOUT_TAU_S));
}
const GR_METER_MAX_DB = 24; // matches the Faust patch's Gain_Reduction hbargraph range (-24..0)

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
  // Ceiling, not a target: only ever turn a hot file DOWN to avoid clipping.
  // `peakTarget / peak` alone would also turn a quiet file UP to hit 0.6,
  // baking a silent gain boost into the uploaded buffer itself — audible
  // even with the compressor bypassed, since it happens once at upload
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

// `fullDest` gets the whole kit (kick/snare/hats/bass) — that's the "Drum
// Loop" heard as a main source. `kickDest` gets a second, isolated copy of
// just the kick hits — that's what "Kick Only" feeds the sidechain with, so
// picking it as the Sidechain Source is a genuinely different (trigger-only)
// signal from the full drum loop, not a duplicate of it.
function scheduleStep(ctx: AudioContext, fullDest: AudioNode, kickDest: AudioNode, step: number, time: number) {
  if (PAT_KICK[step]) {
    synthKick(ctx, fullDest, time);
    synthKick(ctx, kickDest, time);
  }
  if (PAT_SNARE[step]) synthSnare (ctx, fullDest, time);
  if (PAT_HAT[step])   synthHihat (ctx, fullDest, time, false);
  if (PAT_OPEN[step])  synthHihat (ctx, fullDest, time, true);
  if (PAT_BASS[step])  synthBass  (ctx, fullDest, time, PAT_BASS[step]);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chapter4() {
  // Main lab state — per-band params, the 3 crossover points, sidechain
  // detection, and one global output trim, plus which band the knob column
  // is currently editing.
  const [bands,      setBands]      = useState<Record<BandId, BandParams>>(makeDefaultBands);
  const [crossover,  setCrossover]  = useState<CrossoverParams>(DEFAULT_CROSSOVER);
  const [sidechain,  setSidechain]  = useState<SidechainParams>(DEFAULT_SIDECHAIN);
  const [outputGainDb, setOutputGainDb] = useState(DEFAULT_OUTPUT_GAIN);
  const [selectedBand, setSelectedBand] = useState<BandId>('low');
  // Off by default (single-band, using the Low Band controls on the whole
  // signal) — matches the Faust patch's own Multiband/Enable default. On
  // restores the 4-band crossover split.
  const [multibandEnabled, setMultibandEnabled] = useState(DEFAULT_MULTIBAND);

  const [isPlaying, setIsPlaying] = useState(false);
  const [bypass,    setBypass]    = useState(false);
  const [tasks, setTasks]         = useState([false, false, false, false]);

  // Signal source — the built-in synth drum loop, or one of any number of
  // uploaded tracks. The sidechain source is independent of this (see
  // sidechainSourceId below); 'none' is the default and mirrors whatever
  // the main source is, matching the old self-sidechain-only behavior.
  const [uploadedTracks, setUploadedTracks] = useState<UploadedTrack[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<number | 'synth'>('synth');
  const [sidechainSourceId, setSidechainSourceId] = useState<SidechainSourceId>('none');
  const [decoding,       setDecoding]       = useState(false);
  const [uploadError,    setUploadError]    = useState('');
  const [downloading,    setDownloading]    = useState(false);
  const [downloadError,  setDownloadError]  = useState('');
  const fileInputRef           = useRef<HTMLInputElement>(null);
  const sidechainFileInputRef  = useRef<HTMLInputElement>(null);
  const uploadIdSeqRef = useRef(0);
  const activeSourceIdRef      = useRef(activeSourceId);
  const sidechainSourceIdRef   = useRef(sidechainSourceId);
  const uploadedTracksRef      = useRef(uploadedTracks);
  const bufSourceRef           = useRef<AudioBufferSourceNode | null>(null); // main source
  const scBufSourceRef         = useRef<AudioBufferSourceNode | null>(null); // dedicated sidechain source (only when it differs from main)
  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
  useEffect(() => { sidechainSourceIdRef.current = sidechainSourceId; }, [sidechainSourceId]);
  useEffect(() => { uploadedTracksRef.current = uploadedTracks; }, [uploadedTracks]);

  const activeTrack = activeSourceId !== 'synth' ? uploadedTracks.find(t => t.id === activeSourceId) : undefined;
  const sidechainTrack = typeof sidechainSourceId === 'number' ? uploadedTracks.find(t => t.id === sidechainSourceId) : undefined;

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
  const mixRef              = useRef<GainNode | null>(null);        // main signal bus
  const scMixRef            = useRef<GainNode | null>(null);        // sidechain-detector bus (may mirror mixRef)
  const drumBusRef          = useRef<GainNode | null>(null);        // full drum kit, feeds mix when main source is 'synth'
  const kickBusRef          = useRef<GainNode | null>(null);        // kick-only, feeds scMix when sidechain source is 'synth'
  const outputRef           = useRef<GainNode | null>(null);        // final sum before destination
  const animRef             = useRef<number>(0);
  const schedulerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextNoteRef         = useRef(0);
  const currentStepRef      = useRef(0);
  const startTokenRef       = useRef(0);                            // invalidates in-flight startAudio() on stop
  const bandsRef            = useRef(bands);
  const crossoverRef        = useRef(crossover);
  const sidechainRef        = useRef(sidechain);
  const outputGainDbRef     = useRef(outputGainDb);
  const selectedBandRef     = useRef(selectedBand);
  const bypassRef           = useRef(bypass);
  useEffect(() => { bandsRef.current = bands; }, [bands]);
  useEffect(() => { crossoverRef.current = crossover; }, [crossover]);
  useEffect(() => { sidechainRef.current = sidechain; }, [sidechain]);
  useEffect(() => { outputGainDbRef.current = outputGainDb; }, [outputGainDb]);
  useEffect(() => { selectedBandRef.current = selectedBand; }, [selectedBand]);
  useEffect(() => { bypassRef.current = bypass; }, [bypass]);

  // Smoothed input/output dB, chased frame-to-frame in animate() and fed
  // straight into the compression scope's canvas draw — plain refs, not
  // React state, since they update every animation frame and the scope
  // redraws itself directly rather than through a re-render.
  const smoothedInputDbRef  = useRef(METER_FLOOR_DB);
  const smoothedOutputDbRef = useRef(METER_FLOOR_DB);
  const meterClockRef       = useRef<number | null>(null);

  // Real per-band Gain_Reduction, read off the Faust patch's own hbargraph
  // outputs via setOutputParamHandler (they're read-only DSP outputs, never
  // registered as AudioParams, so getParamValue() on these addresses would
  // just return 0 — see the comment on FaustNodeLike.setOutputParamHandler).
  // Raw values are the compressor's gain in dB (≤0); stored here negated, so
  // 0 = no reduction and larger = more reduction, matching the meters below.
  const grRawRef      = useRef<Record<BandId, number>>({ low: 0, lowMid: 0, highMid: 0, high: 0 });
  const smoothedGrRef = useRef<Record<BandId, number>>({ low: 0, lowMid: 0, highMid: 0, high: 0 });

  // Live GR (gain-reduction) meter — a vertical bar beside the transfer
  // graph for the selected band, updated by direct DOM writes in animate()
  // (same reasoning as the scope canvas: this changes every frame, so it
  // bypasses React state) — plus a compact per-band mini-meter row so all
  // four bands' reduction is visible at a glance.
  const grFillRef  = useRef<HTMLDivElement>(null);
  const grValueRef = useRef<HTMLSpanElement>(null);
  const bandGrFillRefs = useRef<Partial<Record<BandId, HTMLDivElement | null>>>({});

  // Knob drag ref (for main lab) — tracks fraction-of-travel (0..1) rather
  // than the raw value, so segmented knobs (Attack/Release) drag through
  // specFromFrac/specToFrac exactly like linear ones. Captures which band it
  // started on, so the drag stays consistent even if selection changes.
  const mainDragRef = useRef<{ spec: KnobSpec; band: BandId; startY: number; startFrac: number } | null>(null);

  // ── Main transfer canvas ──────────────────────────────────────────────────
  useEffect(() => {
    if (transferRef.current) {
      const band = bands[selectedBand];
      // When bypassed (globally, or this band alone), draw unity line
      // (ratio=1 collapses to straight diagonal).
      const displayParams = (bypass || band.bypass) ? { ...band, threshold: 0, ratio: 1, makeup: 0 } : band;
      drawTransfer(transferRef.current, displayParams);
    }
  }, [bands, selectedBand, bypass]);

  // ── Sync Faust compressor params + bypass (single effect) ─────────────────
  useEffect(() => {
    const node = faustNodeRef.current;
    if (!node) return;
    pushFaustParams(node, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled);
  }, [bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled]);

  // Single-band mode only exposes the Low Band controls (see compressor.dsp
  // v3.1) — if Multiband gets switched off while a different band is
  // selected, snap the selection back to the one band that's actually live.
  useEffect(() => {
    if (!multibandEnabled) setSelectedBand('low');
  }, [multibandEnabled]);

  // ── Task tracking ─────────────────────────────────────────────────────────
  useEffect(() => {
    const anyBandThresholdMoved = BAND_IDS.some(b => bands[b].threshold !== DEFAULT_BAND.threshold);
    const anyBandMakeupApplied  = BAND_IDS.some(b => bands[b].makeup > 0);
    const crossoverReshaped =
      crossover.loLowMid !== DEFAULT_CROSSOVER.loLowMid ||
      crossover.lowMidHiMid !== DEFAULT_CROSSOVER.lowMidHiMid ||
      crossover.hiMidHigh !== DEFAULT_CROSSOVER.hiMidHigh;
    setTasks([
      anyBandThresholdMoved,
      crossoverReshaped,
      sidechain.external,
      anyBandMakeupApplied,
    ]);
  }, [bands, crossover, sidechain]);

  // ── Scheduler ─────────────────────────────────────────────────────────────
  // One clock drives two independent buses: drumBus gets the full kit
  // (kick/snare/hats/bass) and kickBus gets only the kick hits. startAudio()
  // fans drumBus into mix if the main source is 'synth', and kickBus into
  // scMix if the sidechain source is 'synth' — so picking "Kick Only" as the
  // sidechain is a genuinely isolated trigger signal, not a duplicate of the
  // full drum loop heard on the main input.
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current; const drumBus = drumBusRef.current; const kickBus = kickBusRef.current;
    if (!ctx || !drumBus || !kickBus) return;
    while (nextNoteRef.current < ctx.currentTime + 0.1) {
      scheduleStep(ctx, drumBus, kickBus, currentStepRef.current, nextNoteRef.current);
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

      // Real post-compression peak (post makeup gain, post all 4 bands).
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      const rawOutputDb = peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
      smoothedOutputDbRef.current = levelBallistic(smoothedOutputDbRef.current, rawOutputDb, dt);
    }

    // Real per-band gain reduction, smoothed only for display jitter (the
    // actual ballistics are the patch's own Attack/Release per band).
    for (const b of BAND_IDS) {
      const target = bypassRef.current ? 0 : grRawRef.current[b];
      smoothedGrRef.current[b] = grReadoutSmooth(smoothedGrRef.current[b], target, dt);
      const fillEl = bandGrFillRefs.current[b];
      if (fillEl) fillEl.style.width = `${Math.min(100, (smoothedGrRef.current[b] / GR_METER_MAX_DB) * 100)}%`;
    }
    const selectedGrDb = smoothedGrRef.current[selectedBandRef.current];
    if (grFillRef.current)  grFillRef.current.style.height = `${Math.min(100, (selectedGrDb / GR_METER_MAX_DB) * 100)}%`;
    if (grValueRef.current) grValueRef.current.textContent = selectedGrDb > 0.05 ? `-${selectedGrDb.toFixed(1)}` : '0.0';

    // Live compression scope — records the smoothed broadband input/output
    // dB plus the selected band's real gain reduction into a scrolling
    // history, so Attack/Release are visible as actual motion on the real
    // signal instead of only as numbers on a knob.
    if (dryAnal && wetAnal) {
      const history = scopeHistoryRef.current;
      history.push({
        t: now,
        inputDb: smoothedInputDbRef.current,
        outputDb: smoothedOutputDbRef.current,
        grDb: selectedGrDb,
      });
      const cutoff = now - SCOPE_WINDOW_S - 0.5;
      while (history.length > 0 && history[0].t < cutoff) history.shift();
      if (scopeRef.current) {
        const selBand = bandsRef.current[selectedBandRef.current];
        drawCompressorScope(scopeRef.current, history, now, selBand.threshold, !bypassRef.current && !selBand.bypass);
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

    // mix (main bus)       → dryAnal (viz tap) ─┐
    // scMix (sidechain bus) ────────────────────┤→ 2ch merger → faustNode → wetAnal → output → destination
    // drumBus (full kit) fans into mix, kickBus (kick hits only) fans into
    // scMix — kept as two separate buses so picking "Kick Only" as the
    // Sidechain Source is a genuinely different, isolated signal rather than
    // a duplicate of the full drum loop heard on the main input. See the
    // source-resolution block further down for exactly when each connects.
    //
    // The Faust node declares 2 audio inputs (main + sidechain, see
    // compressor.dsp's process(mainIn, scIn)), which @grame/faustwasm
    // exposes as ONE AudioNode input with channelCount 2 rather than two
    // separate AudioNode inputs — so feeding it two distinct sources means
    // merging them onto one 2-channel stream with a ChannelMergerNode
    // first (connectMainAndSidechain). mix and scMix can carry genuinely
    // different signals now (Sidechain Source selector), or scMix can just
    // mirror mix ("Same as main") for the old self-sidechain behavior.
    // mix/scMix stay unity gain — no .gain.value override — since neither
    // is backed by anything in the interface (no UI control scales the
    // main or sidechain bus), so they shouldn't silently attenuate the
    // signal feeding the compressor.
    const mix     = ctx.createGain();
    const scMix   = ctx.createGain();
    const drumBus = ctx.createGain();
    const kickBus = ctx.createGain();
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

    pushFaustParams(faustNode, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled);

    // Subscribe to all 4 bands' live Gain_Reduction outputs.
    grRawRef.current = { low: 0, lowMid: 0, highMid: 0, high: 0 };
    smoothedGrRef.current = { low: 0, lowMid: 0, highMid: 0, high: 0 };
    const grAddrToBand = new Map<string, BandId>(BAND_IDS.map(b => [ADDR.band(b).gr, b]));
    faustNode.setOutputParamHandler?.((path, value) => {
      const band = grAddrToBand.get(path);
      if (band) grRawRef.current[band] = Math.max(0, -value);
    });

    ctxRef.current = ctx;
    mixRef.current = mix;
    scMixRef.current = scMix;
    drumBusRef.current = drumBus;
    kickBusRef.current = kickBus;
    dryAnalRef.current = dryAnal;
    wetAnalRef.current = wetAnal;
    outputRef.current = output;
    faustNodeRef.current = faustNode;

    mix.connect(dryAnal);                                     // tap for dry waveform + input meter
    connectMainAndSidechain(ctx, mix, scMix, faustNode as unknown as AudioNode);
    (faustNode as unknown as AudioNode).connect(wetAnal);
    wetAnal.connect(output);
    output.connect(ctx.destination);

    // ── Resolve the MAIN source into `mix` ──────────────────────────────
    const mainTrack = activeSourceIdRef.current !== 'synth'
      ? uploadedTracksRef.current.find(t => t.id === activeSourceIdRef.current)
      : undefined;

    let mainBufSrc: AudioBufferSourceNode | null = null;
    if (mainTrack) {
      mainBufSrc = ctx.createBufferSource();
      mainBufSrc.buffer = mainTrack.buffer;
      mainBufSrc.loop   = true;
      mainBufSrc.connect(mix);
      mainBufSrc.start();
      bufSourceRef.current = mainBufSrc;
    } else {
      drumBus.connect(mix);
    }

    // ── Resolve the SIDECHAIN source into `scMix` ───────────────────────
    const scSel = sidechainSourceIdRef.current;
    if (scSel === 'synth') {
      // Isolated kick hits only — deliberately NOT drumBus, so this never
      // sounds identical to a "Drum Loop" main source (same performance,
      // same clock, but only the kick actually reaches the detector).
      kickBus.connect(scMix);
    } else if (mainTrack && scSel === mainTrack.id && mainBufSrc) {
      // Same uploaded track chosen for both — fan the one playing node into
      // scMix too, so main and sidechain stay perfectly sample-locked
      // instead of two independent loops slowly drifting apart.
      mainBufSrc.connect(scMix);
    } else if (typeof scSel === 'number') {
      const scTrack = uploadedTracksRef.current.find(t => t.id === scSel);
      if (scTrack) {
        const scBufSrc = ctx.createBufferSource();
        scBufSrc.buffer = scTrack.buffer;
        scBufSrc.loop   = true;
        scBufSrc.connect(scMix);
        scBufSrc.start();
        scBufSourceRef.current = scBufSrc;
      } else {
        mix.connect(scMix); // selected track no longer exists — fall back to mirroring main
      }
    } else {
      mix.connect(scMix); // 'none' — mirror the main signal (self-sidechain)
    }

    // Drum scheduler runs whenever either source needs the synth loop.
    if (!mainTrack || scSel === 'synth') {
      nextNoteRef.current = ctx.currentTime + 0.05; currentStepRef.current = 0;
      runScheduler();
    }

    scopeHistoryRef.current = [];
    animRef.current = requestAnimationFrame(animate);
    setIsPlaying(true);
  }, [engineStatus, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled, runScheduler, animate]);

  const stopAudio = useCallback(() => {
    startTokenRef.current++; // invalidate any in-flight startAudio()
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    if (bufSourceRef.current) {
      try { bufSourceRef.current.stop(); } catch { /* ok */ }
      bufSourceRef.current.disconnect();
      bufSourceRef.current = null;
    }
    if (scBufSourceRef.current) {
      try { scBufSourceRef.current.stop(); } catch { /* ok */ }
      scBufSourceRef.current.disconnect();
      scBufSourceRef.current = null;
    }
    if (faustNodeRef.current) {
      try { (faustNodeRef.current as unknown as AudioNode).disconnect(); } catch { /* ok */ }
      faustNodeRef.current = null;
    }
    ctxRef.current?.close();
    ctxRef.current = null;
    dryAnalRef.current = null; wetAnalRef.current = null; mixRef.current = null;
    scMixRef.current = null; drumBusRef.current = null; kickBusRef.current = null;
    outputRef.current = null;
    smoothedInputDbRef.current = METER_FLOOR_DB;
    smoothedOutputDbRef.current = METER_FLOOR_DB;
    meterClockRef.current = null;
    grRawRef.current = { low: 0, lowMid: 0, highMid: 0, high: 0 };
    smoothedGrRef.current = { low: 0, lowMid: 0, highMid: 0, high: 0 };
    setIsPlaying(false);
    scopeHistoryRef.current = [];
    if (scopeRef.current) {
      const c = scopeRef.current.getContext('2d')!;
      c.fillStyle = '#0D0D0F'; c.fillRect(0, 0, scopeRef.current.width, scopeRef.current.height);
    }
    if (grFillRef.current) grFillRef.current.style.height = '0%';
    if (grValueRef.current) grValueRef.current.textContent = '0.0';
    for (const b of BAND_IDS) {
      const el = bandGrFillRefs.current[b];
      if (el) el.style.width = '0%';
    }
  }, []);

  useEffect(() => () => {
    startTokenRef.current++;
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    if (bufSourceRef.current) {
      try { bufSourceRef.current.stop(); } catch { /* ok */ }
    }
    if (scBufSourceRef.current) {
      try { scBufSourceRef.current.stop(); } catch { /* ok */ }
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

  // The sidechain source graph is only wired up inside startAudio(), so a
  // change while playing needs a restart to actually take effect — same
  // reasoning as handleSelectSource above for the main source.
  const handleSelectSidechainSource = useCallback((id: SidechainSourceId) => {
    stopAudio();
    setSidechainSourceId(id);
  }, [stopAudio]);

  // Shared decode step for both the main-source and sidechain-source upload
  // buttons — turns a File into a normalized, playable UploadedTrack and
  // adds it to the shared uploadedTracks pool, so once uploaded either
  // selector row can pick it (a file uploaded as the sidechain source shows
  // up as a selectable main source too, and vice versa).
  const decodeAndAddTrack = useCallback(async (file: File): Promise<UploadedTrack> => {
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
      return track;
    } finally {
      tmpCtx?.close();
    }
  }, []);

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
    try {
      const track = await decodeAndAddTrack(file);
      setActiveSourceId(track.id);
    } catch (err) {
      console.error('Failed to decode audio file', err);
      setUploadError('Could not read that file — try an mp3, wav, or m4a.');
    } finally {
      setDecoding(false);
    }
  }, [stopAudio, decodeAndAddTrack]);

  // Uploads a file straight into the Sidechain Source selector, without
  // touching the main source — lets you bring in a second, genuinely
  // different track (e.g. a kick loop) purely to drive detection.
  const handleUploadSidechainClick = useCallback(() => {
    sidechainFileInputRef.current?.click();
  }, []);

  const handleSidechainFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    stopAudio();
    setUploadError('');
    setDecoding(true);
    try {
      const track = await decodeAndAddTrack(file);
      setSidechainSourceId(track.id);
    } catch (err) {
      console.error('Failed to decode sidechain audio file', err);
      setUploadError('Could not read that file — try an mp3, wav, or m4a.');
    } finally {
      setDecoding(false);
    }
  }, [stopAudio, decodeAndAddTrack]);

  // Renders the currently active uploaded track through the compressor
  // (with current knob/bypass settings) and downloads it as a WAV — the
  // "download after processing" counterpart to the upload button above. If
  // the Sidechain Source is itself an uploaded track, that buffer is passed
  // through too, so the download reflects a genuine external sidechain
  // rather than silently falling back to self-sidechain. A 'synth' sidechain
  // selection can't be rendered offline here (no offline drum scheduler), so
  // it falls back to mirroring the main track, same as 'none'.
  const handleDownload = useCallback(async () => {
    const track = activeTrack;
    if (!track || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) return;
    setDownloadError('');
    setDownloading(true);
    try {
      const rendered = await renderCompressorOffline(
        generatorRef.current, dspMetaRef.current, dspModuleRef.current,
        track.buffer, sidechainTrack?.buffer, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled,
      );
      downloadAudioBufferAsWav(rendered, `${track.name || 'compressor-studio'}-compressed.wav`);
    } catch (err) {
      console.error('[Chapter4] failed to render audio for download', err);
      setDownloadError('Could not render the audio for download — see console for details.');
    } finally {
      setDownloading(false);
    }
  }, [activeTrack, sidechainTrack, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled]);

  // ── Main lab knob drag ────────────────────────────────────────────────────
  const onMainKnobDown = useCallback((e: React.MouseEvent, spec: KnobSpec, val: number) => {
    e.preventDefault();
    mainDragRef.current = { spec, band: selectedBand, startY: e.clientY, startFrac: specToFrac(spec, val) };
  }, [selectedBand]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = mainDragRef.current; if (!d) return;
      const frac    = Math.min(1, Math.max(0, d.startFrac + (d.startY - e.clientY) / 220));
      const raw     = specFromFrac(d.spec, frac);
      const clamped = Math.min(d.spec.max, Math.max(d.spec.min, Math.round(raw / d.spec.step) * d.spec.step));
      setBands(prev => ({ ...prev, [d.band]: { ...prev[d.band], [d.spec.key]: clamped } }));
    };
    const onUp = () => { mainDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const setSelectedBandParam = useCallback((key: BandKnobKey, v: number) => {
    setBands(prev => ({ ...prev, [selectedBand]: { ...prev[selectedBand], [key]: v } }));
  }, [selectedBand]);

  // Bypasses a specific band's compression (its audio still passes through,
  // unprocessed) independently of which band is currently selected for
  // editing — each band tracks its own bypass flag, so any combination of
  // bands can be bypassed at once, not just one at a time.
  const toggleBandBypass = useCallback((band: BandId) => {
    setBands(prev => ({ ...prev, [band]: { ...prev[band], bypass: !prev[band].bypass } }));
  }, []);

  const reset = useCallback(() => {
    setBands(makeDefaultBands());
    setCrossover(DEFAULT_CROSSOVER);
    setSidechain(DEFAULT_SIDECHAIN);
    setOutputGainDb(DEFAULT_OUTPUT_GAIN);
    setSelectedBand('low');
    setMultibandEnabled(DEFAULT_MULTIBAND);
  }, []);

  // Derived
  const selBand = bands[selectedBand];
  const TASK_LABELS = ['Compress a band', 'Reshape the crossover', 'Try External Sidechain', 'Apply makeup gain'];

  // In single-band mode (Multiband off) only "low" is actually live — its
  // controls act on the whole signal (see compressor.dsp v3.1), so it reads
  // as "COMPRESSOR" rather than "LOW" everywhere in the UI.
  const bandLabel = (b: BandId) => (!multibandEnabled && b === 'low') ? 'COMPRESSOR' : BAND_LABELS[b];

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

  // Band tab row — each tab is two independent controls fused into one
  // pill: the label half selects which band's knobs/transfer curve/scope/GR
  // meter are shown, the ⦸ half bypasses *that* band's compression on its
  // own. Splitting them means any combination of bands can be bypassed at
  // once — bypass no longer follows the selection around.
  //
  // In single-band mode (Multiband off) only "low" is live in the DSP (see
  // compressor.dsp v3.1), so the other 3 tabs are hidden rather than shown
  // disabled — their controls would have no audible effect right now.
  const renderBandTabs = () => (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
      {(multibandEnabled ? BAND_IDS : (['low'] as BandId[])).map(b => {
        const active = b === selectedBand;
        const byp = bands[b].bypass;
        const borderColor = active ? 'rgba(167,139,250,0.5)' : 'var(--border)';
        return (
          <div
            key={b}
            style={{
              display: 'flex', alignItems: 'stretch', borderRadius: '3px', overflow: 'hidden',
              border: `1px solid ${borderColor}`, opacity: byp ? 0.7 : 1, transition: 'opacity 0.15s',
            }}
          >
            <button
              onClick={() => setSelectedBand(b)}
              title={`Edit the ${bandLabel(b)} band`}
              style={{
                padding: '0.3rem 0.6rem', border: 'none',
                background: active ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
                color: active ? 'var(--purple)' : 'var(--text-dim)',
                fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                textDecoration: byp ? 'line-through' : 'none',
              }}
            >
              {bandLabel(b)}
            </button>
            <button
              onClick={() => toggleBandBypass(b)}
              title={byp ? `${bandLabel(b)} is bypassed — click to re-enable` : `Bypass the ${bandLabel(b)} band (its audio still passes through, unprocessed)`}
              style={{
                padding: '0.3rem 0.45rem', border: 'none', borderLeft: `1px solid ${borderColor}`,
                background: byp ? 'rgba(255,77,106,0.16)' : 'var(--surface)',
                color: byp ? '#FF4D6A' : 'var(--text-faint)',
                fontFamily: 'var(--mono)', fontSize: '0.65rem',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              ⦸
            </button>
          </div>
        );
      })}
    </div>
  );

  // Mode switch — Single Band vs Multiband, as its own two-option segmented
  // control in its own row (not squeezed into the band-tab row, which is
  // what was clipping/wrapping the label text before). Mutually exclusive,
  // so each button sets the mode directly rather than toggling.
  const renderModeSwitch = () => (
    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
      <button
        onClick={() => setMultibandEnabled(false)}
        title="One compressor acting on the whole signal"
        style={{
          flex: 1,
          padding: '0.35rem 0.5rem',
          background: !multibandEnabled ? 'rgba(0,255,135,0.13)' : 'var(--surface)',
          border: `1px solid ${!multibandEnabled ? 'rgba(0,255,135,0.5)' : 'var(--border)'}`,
          borderRadius: '3px',
          color: !multibandEnabled ? 'var(--green)' : 'var(--text-dim)',
          fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.04em',
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}
      >
        SINGLE BAND
      </button>
      <button
        onClick={() => setMultibandEnabled(true)}
        title="Split the signal into 4 independent bands (Low / Low-Mid / High-Mid / High), each with its own compressor"
        style={{
          flex: 1,
          padding: '0.35rem 0.5rem',
          background: multibandEnabled ? 'rgba(0,255,135,0.13)' : 'var(--surface)',
          border: `1px solid ${multibandEnabled ? 'rgba(0,255,135,0.5)' : 'var(--border)'}`,
          borderRadius: '3px',
          color: multibandEnabled ? 'var(--green)' : 'var(--text-dim)',
          fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.04em',
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}
      >
        MULTIBAND
      </button>
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
            <div className="lab-subtitle">DYNAMICS · {multibandEnabled ? '4-BAND' : 'SINGLE-BAND'} + SIDECHAIN</div>
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
        {/* Left: band tabs + knobs + crossover/sidechain controls */}
        <div className="comp-controls">
          <div className="canvas-label" style={{ marginBottom: '0.5rem' }}>
            MODE
          </div>
          {renderModeSwitch()}

          <div className="canvas-label" style={{ marginBottom: '0.5rem' }}>
            BAND · DRAG KNOBS VERTICALLY
          </div>
          {renderBandTabs()}

          {/* Knobs for whichever band is selected above. */}
          <div className="knob-grid">
            {KNOBS.map(spec => {
              const val = selBand[spec.key];
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
                    onChange={v => setSelectedBandParam(spec.key, v)}
                  />
                </div>
              );
            })}
          </div>

          {/* Crossover — 3 points splitting the signal into 4 bands. Only
              meaningful (and only sent anywhere audible) once Multiband is
              on — see compressor.dsp v3.1, where the crossover filters are
              bypassed entirely in single-band mode. */}
          <div className="canvas-label" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
            CROSSOVER
          </div>
          {multibandEnabled ? (
            <>
              <MiniSlider
                label="Low – Low-Mid" value={crossover.loLowMid} min={20} max={1000} step={1}
                fmt={v => `${v.toFixed(0)} Hz`}
                onChange={v => setCrossover(c => ({ ...c, loLowMid: v }))}
              />
              <MiniSlider
                label="Low-Mid – High-Mid" value={crossover.lowMidHiMid} min={200} max={5000} step={1}
                fmt={v => `${v.toFixed(0)} Hz`}
                onChange={v => setCrossover(c => ({ ...c, lowMidHiMid: v }))}
              />
              <MiniSlider
                label="High-Mid – High" value={crossover.hiMidHigh} min={500} max={20000} step={1}
                fmt={v => `${v.toFixed(0)} Hz`}
                onChange={v => setCrossover(c => ({ ...c, hiMidHigh: v }))}
              />
            </>
          ) : (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--text-faint)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
              One compressor, whole signal. Turn on <strong style={{ color: 'var(--green)' }}>MULTIBAND</strong> above to split into 4 bands with independent crossover points.
            </div>
          )}

          {/* Sidechain — internal (each band's own audio) vs external
              (a filtered detector signal fed into a second input, which can
              now be a genuinely different track via the source row below).
              "Kick Only" is deliberately NOT the same signal as a "Drum
              Loop" main source — it's an isolated copy of just the kick
              hits (see scheduleStep/kickBus in startAudio), so selecting it
              alongside a drum-loop main input is a real, audible trigger
              rather than the exact same audio duplicated. */}
          <div className="canvas-label" style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
            SIDECHAIN
          </div>
          <div style={{
            display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem',
          }}>
            {([['none', 'SAME AS MAIN'], ['synth', 'KICK ONLY']] as [SidechainSourceId, string][])
              .concat(uploadedTracks.map(t => [t.id, t.name] as [SidechainSourceId, string]))
              .map(([id, label]) => {
                const active = id === sidechainSourceId;
                const title = id === 'none'
                  ? 'Detector hears the same signal as the main input'
                  : id === 'synth'
                    ? "Detector hears only the kick drum hits, isolated from the full loop — a classic sidechain trigger"
                    : `Detector hears ${label} instead of the main input`;
                return (
                  <button
                    key={String(id)}
                    onClick={() => handleSelectSidechainSource(id)}
                    title={title}
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: active ? 'rgba(245,166,35,0.13)' : 'var(--surface)',
                      border: `1px solid ${active ? 'rgba(245,166,35,0.5)' : 'var(--border)'}`,
                      borderRadius: '3px',
                      color: active ? 'var(--amber)' : 'var(--text-dim)',
                      fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.04em',
                      cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            <input
              ref={sidechainFileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleSidechainFileSelected}
              style={{ display: 'none' }}
            />
            <button
              onClick={handleUploadSidechainClick}
              disabled={decoding}
              title="Upload a separate track to use as the sidechain source — e.g. a kick loop to duck the main input"
              style={{
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.25rem 0.5rem',
                background: 'var(--surface)',
                border: '1px dashed var(--border)',
                borderRadius: '3px',
                color: 'var(--text-dim)',
                fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.04em',
                cursor: decoding ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >
              <span>{decoding ? '⏳' : '+'}</span>
              <span>{decoding ? 'DECODING…' : 'UPLOAD'}</span>
            </button>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <button
              className={`toggle-btn${sidechain.external ? ' on' : ''}`}
              onClick={() => setSidechain(s => ({ ...s, external: !s.external }))}
              title="Detect off the Sidechain Source above (filtered) instead of each band's own raw audio"
            >
              EXTERNAL SC
            </button>
            <button
              className={`toggle-btn${sidechain.listen ? ' on' : ''}`}
              onClick={() => setSidechain(s => ({ ...s, listen: !s.listen }))}
              title="Audition the detector signal itself, in place of the compressed output"
            >
              SC LISTEN
            </button>
          </div>
          {sidechainSourceId !== 'none' && !sidechain.external && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--text-faint)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
              A Sidechain Source is selected but EXTERNAL SC is off, so it isn't driving detection yet — turn EXTERNAL SC on to use it.
            </div>
          )}
          <MiniSlider
            label="SC HPF" value={sidechain.hpf} min={20} max={2000} step={1}
            fmt={v => `${v.toFixed(0)} Hz`}
            onChange={v => setSidechain(s => ({ ...s, hpf: v }))}
          />

          {/* Output trim */}
          <div className="canvas-label" style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
            OUTPUT
          </div>
          <MiniSlider
            label="Gain" value={outputGainDb} min={-24} max={24} step={0.1}
            fmt={v => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`}
            onChange={setOutputGainDb}
          />

          <div style={{ marginTop: '1rem' }}>
            <div className="concept-callout" style={{ background: 'var(--purple-dim)', borderColor: 'rgba(167,139,250,0.2)' }}>
              <strong style={{ color: 'var(--purple)' }}>Concept: </strong>
              {bandLabel(selectedBand)}{multibandEnabled ? ' band' : ''} at {selBand.ratio.toFixed(0)}:1 —{' '}
              {selBand.ratio > 10 ? 'Limiting territory. Very aggressive.' : selBand.ratio > 6 ? 'Heavy compression. Peak control.' : selBand.ratio > 3 ? 'Classic glue. Musical.' : 'Gentle, transparent.'}
              {' '}
              {multibandEnabled
                ? 'Each band compresses independently — try a fast, tight ratio on one band while leaving another gentle.'
                : 'Acting on the whole signal right now — turn on MULTIBAND above to split it into 4 independently-compressed bands.'}
              {' '}Toggle <strong style={{ color: 'var(--purple)' }}>BYPASS</strong> while playing to A/B.
            </div>
          </div>
        </div>

        {/* Right: transfer (+ GR meter alongside) + live scope */}
        <div className="comp-visual">
          <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>
            TRANSFER FUNCTION — {bandLabel(selectedBand)}{multibandEnabled ? ' BAND' : ''}
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
              · shape set by THRESHOLD / RATIO / KNEE, <span style={{ color: 'var(--amber)' }}>MAKEUP GAIN</span> shifts it up (amber) — attack &amp; release are time-domain, see scope below
            </span>
          </div>
          <div className="transfer-row">
            <div className="transfer-graph" style={{ flex: 1 }}>
              <canvas ref={transferRef} width={400} height={200} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            </div>
            <div className="gr-meter-col">
              <span className="gr-meter-lbl">0dB</span>
              <div className="gr-meter-track-v">
                <div ref={grFillRef} className="gr-meter-fill-v" style={{ height: '0%' }} />
              </div>
              <span className="gr-meter-val" ref={grValueRef}>0.0</span>
              <span className="gr-meter-unit">GR</span>
            </div>
          </div>

          {/* All live bands' real gain reduction at a glance — click a label
              to jump the knob column / transfer graph / scope to that band.
              Single-band mode only has one live band, so this collapses to
              one entry instead of 4. */}
          <div className="canvas-label" style={{ marginTop: '0.75rem', marginBottom: '0.4rem' }}>
            {multibandEnabled ? 'ALL BANDS — GAIN REDUCTION' : 'GAIN REDUCTION'}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
            {(multibandEnabled ? BAND_IDS : (['low'] as BandId[])).map(b => (
              <div
                key={b}
                onClick={() => setSelectedBand(b)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', cursor: 'pointer' }}
              >
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: '0.5rem', textAlign: 'center', letterSpacing: '0.04em',
                  color: b === selectedBand ? 'var(--purple)' : 'var(--text-faint)',
                }}>
                  {bandLabel(b)}
                </div>
                <div style={{ height: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    ref={el => { bandGrFillRefs.current[b] = el; }}
                    style={{ height: '100%', width: '0%', background: 'linear-gradient(90deg, #00FF87 0%, #F5A623 65%, #FF4D6A 100%)', transition: 'width 0.1s ease' }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="canvas-label" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
            LIVE COMPRESSION SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
              · real broadband input/output level over time — red shows the {bandLabel(selectedBand)}{multibandEnabled ? ' band' : ''}'s real gain reduction
            </span>
          </div>
          <div className="scope-graph">
            <canvas ref={scopeRef} width={400} height={150} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>
          <div className="legend-row" style={{ marginTop: '0.5rem', marginBottom: 0, flexWrap: 'wrap' }}>
            <div className="legend-item"><span className="legend-line" style={{ background: '#00FF87' }} />INPUT</div>
            <div className="legend-item"><span className="legend-line" style={{ background: '#A78BFA' }} />OUTPUT</div>
            <div className="legend-item"><span className="legend-line" style={{ background: '#FF4D6A' }} />{bandLabel(selectedBand)} GAIN REDUCTION</div>
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--text-faint)', marginTop: '0.35rem', lineHeight: 1.5 }}>
            Red is the real Gain_Reduction the Faust patch reports for this band — it shrinks toward nothing as Threshold rises or Bypass is on.
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
