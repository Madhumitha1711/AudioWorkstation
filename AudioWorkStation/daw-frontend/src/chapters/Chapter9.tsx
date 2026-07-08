import { useRef, useState, useEffect, useCallback } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { Knob, type KnobSpec } from '../components/Knob';
import { compileFaustWasm, type FaustDspMeta, type FaustNodeLike } from '../faust/faustTypes';
import { downloadAudioBufferAsWav } from '../audio/wavRender';

// ── Chapter 9 — Delay Design Studio ─────────────────────────────────────────
// "Shape Character with Modulated, Filtered Delay". Real DSP lives at
// public/faust/delay/ (dsp-module.wasm + dsp-meta.json) — a Faust patch built
// on delays.lib with an LFO-modulated delay line, hi/lopass filtering on the
// repeats, ping-pong routing, and soft analog-style saturation, all exported
// straight from the Faust IDE. Driven the same way as the compressor
// (Chapter4), ParamEQ (Chapter2b) and reverb (Chapter6) patches: load the
// wasm module + meta once, instantiate one node per AudioContext, push every
// param onto it directly by Faust address.
type PresetOrSynth = number | 'synth';

interface UploadedTrack { id: number; name: string; buffer: AudioBuffer; }

// ── HiDPI canvas helper (same pattern as Chapter6's reverb scope) ──────────
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

// ── Live Delay Echo Scope ────────────────────────────────────────────────
// The tap visualiser below is illustrative — a formula-driven bar chart of
// where repeats *should* land for the current DELAY TIME/FEEDBACK/PING PONG
// settings, redrawn on every knob move but never actually listening to real
// audio. This is the real counterpart: a scrolling, real audio-driven
// analyzer tapping the actual dry input and the actual Faust delay output,
// so students can watch discrete echoes decay live and see how MOD
// DEPTH/RATE and the HIPASS/LOPASS filters actually change the repeats'
// tone over time — mirrors Chapter6's live reverb tail scope.
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB   = -72;
const SCOPE_MAX_DB   = 6;

interface ScopePoint { t: number; inputDb: number; outputDb: number; }

function drawDelayScope(canvas: HTMLCanvasElement, history: ScopePoint[], nowT: number, active: boolean) {
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

  if (!active) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('HIT PLAY TO SEE THE ECHOES RING OUT', W / 2 - 110, H / 2);
    return;
  }

  const visible = history.filter(p => p.t >= nowT - SCOPE_WINDOW_S - 0.25);
  if (visible.length < 2) return;

  const inPts  = visible.map(p => ({ x: toX(p.t), y: toY(p.inputDb) }));
  const outPts = visible.map(p => ({ x: toX(p.t), y: toY(p.outputDb) }));

  // Shaded gap — the delay's own contribution. Wherever the wet output
  // persists once the dry input has already died away (right after a hit),
  // the widening/lingering teal region is literally the repeats/tail —
  // same color as the WET OUTPUT legend below.
  ctx.save(); ctx.globalAlpha = 0.24; ctx.fillStyle = '#2DD4BF';
  ctx.beginPath();
  ctx.moveTo(inPts[0].x, inPts[0].y);
  for (const p of inPts.slice(1)) ctx.lineTo(p.x, p.y);
  for (let i = outPts.length - 1; i >= 0; i--) ctx.lineTo(outPts[i].x, outPts[i].y);
  ctx.closePath(); ctx.fill(); ctx.restore();

  // Dry (input) trace — amber, matching the DRY tap color in the tap display
  ctx.save(); ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#F5A623'; ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.moveTo(inPts[0].x, inPts[0].y);
  for (const p of inPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke(); ctx.restore();

  // Wet (output) trace — the actual delay repeats reaching the ear
  ctx.strokeStyle = '#2DD4BF'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(outPts[0].x, outPts[0].y);
  for (const p of outPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();

  // Time axis
  ctx.fillStyle = '#8A8A9A'; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`-${SCOPE_WINDOW_S}s`, 4, H - 4);
  ctx.fillText('NOW', W - 26, H - 4);
}

// ── Level ballistics — feeds the live scope's smoothed input/output dB,
// same fast-attack/slow-release approach as the reverb scope in Chapter6.
const METER_FLOOR_DB = -70;
const LEVEL_ATTACK_S  = 0.015;
const LEVEL_RELEASE_S = 0.35;

function levelBallistic(prev: number, target: number, dt: number): number {
  if (dt <= 0) return prev;
  const tau = target > prev ? LEVEL_ATTACK_S : LEVEL_RELEASE_S;
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}

interface DelayParams {
  delayTimeMs: number; // 1 – 2000 ms
  feedback:    number; // 0 – 95 %
  analog:      number; // 0 – 10  (analog-style saturation amount)
  pingPong:    boolean;
  modDepth:    number; // 0 – 100 %
  modRate:     number; // 0.05 – 8 Hz
  hipass:      number; // 20 – 5000 Hz
  lopass:      number; // 200 – 18000 Hz
  dryWet:      number; // 0 – 100 %
  output:      number; // -24 – 12 dB
}

type SyncDivision = '1/4' | '1/8' | '1/8.' | '1/16T' | 'FREE';
const SYNC_DIVISIONS: SyncDivision[] = ['1/4', '1/8', '1/8.', '1/16T', 'FREE'];
const BPM = 120;

// Tempo-synced note value → ms, at BPM. FREE has no fixed value (the knob
// drives delayTimeMs directly instead).
function syncDivisionMs(div: SyncDivision, bpm: number): number | null {
  const quarter = 60000 / bpm;
  switch (div) {
    case '1/4':   return quarter;
    case '1/8':   return quarter / 2;
    case '1/8.':  return (quarter / 2) * 1.5;
    case '1/16T': return (quarter / 4) * (2 / 3);
    case 'FREE':  return null;
  }
}

// ── Defaults — mirror the `init` values in public/faust/delay/dsp-meta.json
// (Delay Time 250ms == the 1/8 note at 120 BPM, Feedback 42%, Analog 2,
// Mod Depth 28%, Mod Rate 0.6Hz, Hipass 220Hz, Lopass 6.5kHz, Dry/Wet 28%,
// Output +1dB). Ping Pong has no `init` in the patch (Faust checkboxes
// default to 0) but the lab defaults it on to showcase the stereo bounce.
const DEFAULT_SYNC: SyncDivision = '1/8';
const DEFAULTS: DelayParams = {
  delayTimeMs: syncDivisionMs(DEFAULT_SYNC, BPM)!,
  feedback:    42,
  analog:      2,
  pingPong:    true,
  modDepth:    28,
  modRate:     0.6,
  hipass:      220,
  lopass:      6500,
  dryWet:      28,
  output:      1,
};

// ── Faust engine wiring ───────────────────────────────────────────────────
const FAUST_BASE_PATH = '/faust/delay';

// Faust addresses, from public/faust/delay/dsp-meta.json's `ui` tree.
const ADDR = {
  delayTime: '/DELAY_DESIGN_STUDIO/Delay_Time',
  feedback:  '/DELAY_DESIGN_STUDIO/Feedback',
  analog:    '/DELAY_DESIGN_STUDIO/Analog_Saturation',
  pingPong:  '/DELAY_DESIGN_STUDIO/Ping_Pong',
  modDepth:  '/DELAY_DESIGN_STUDIO/Mod_Depth',
  modRate:   '/DELAY_DESIGN_STUDIO/Mod_Rate',
  hipass:    '/DELAY_DESIGN_STUDIO/Hipass',
  lopass:    '/DELAY_DESIGN_STUDIO/Lopass',
  dryWet:    '/DELAY_DESIGN_STUDIO/Dry_Wet',
  output:    '/DELAY_DESIGN_STUDIO/Output',
} as const;

// Every unit here already matches the Faust patch's own range (ms, %, Hz,
// dB, 0-10) — no external rescaling needed, only the checkbox → 0/1.
function pushFaustParams(node: FaustNodeLike, p: DelayParams) {
  node.setParamValue(ADDR.delayTime, p.delayTimeMs);
  node.setParamValue(ADDR.feedback,  p.feedback);
  node.setParamValue(ADDR.analog,    p.analog);
  node.setParamValue(ADDR.pingPong,  p.pingPong ? 1 : 0);
  node.setParamValue(ADDR.modDepth,  p.modDepth);
  node.setParamValue(ADDR.modRate,   p.modRate);
  node.setParamValue(ADDR.hipass,    p.hipass);
  node.setParamValue(ADDR.lopass,    p.lopass);
  node.setParamValue(ADDR.dryWet,    p.dryWet);
  node.setParamValue(ADDR.output,    p.output);
}

// Estimated time (seconds) for the feedback repeats to decay below audibility
// (-60dB), used to pad the offline render below so echoes aren't cut off
// mid-repeat — the same feedback^n falloff computeTaps uses for the tap
// visualiser, just solved for n at a fixed amplitude floor instead of capped
// at a fixed 24 taps / 2000ms display window.
function estimateDelayTailSeconds(delayMs: number, feedbackPct: number): number {
  const feedbackFrac = feedbackPct / 100;
  if (feedbackFrac <= 0.001) return delayMs / 1000;
  const n = Math.log(0.001) / Math.log(feedbackFrac); // taps until -60dB
  return Math.min(20, (n * delayMs) / 1000);
}

// Renders an uploaded track through the same Faust delay patch offline, so it
// can be exported as a WAV — mirrors the live graph in startAudio() but with
// no scheduler/meters, padded so the feedback tail isn't cut short.
async function renderDelayOffline(
  generator: FaustMonoDspGenerator,
  meta: FaustDspMeta,
  dspModule: WebAssembly.Module,
  source: AudioBuffer,
  params: DelayParams,
): Promise<AudioBuffer> {
  const tailSeconds = estimateDelayTailSeconds(params.delayTimeMs, params.feedback) + 0.5;
  const totalLength = source.length + Math.ceil(tailSeconds * source.sampleRate);
  const offlineCtx = new OfflineAudioContext(source.numberOfChannels, totalLength, source.sampleRate);

  const factory = { module: dspModule, json: JSON.stringify(meta), soundfiles: {} };
  const node = await generator.createNode(
    offlineCtx as unknown as AudioContext, meta.name, factory, false, 512,
  ) as unknown as FaustNodeLike;
  pushFaustParams(node, params);

  const src = offlineCtx.createBufferSource();
  src.buffer = source;
  src.connect(node as unknown as AudioNode);
  (node as unknown as AudioNode).connect(offlineCtx.destination);
  src.start();
  return offlineCtx.startRendering();
}

type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

// ── Knob specs ─────────────────────────────────────────────────────────────
const fmtHz = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${Math.round(v)}Hz`;

const KNOB_SPECS = {
  delayTimeMs: { label: 'DELAY TIME', min: 1,    max: 2000,  step: 1,    fmt: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`, accent: 'var(--teal)' },
  feedback:    { label: 'FEEDBACK',   min: 0,    max: 95,    step: 1,    fmt: (v: number) => `${Math.round(v)}%`, accent: 'var(--teal)' },
  analog:      { label: 'ANALOG',     min: 0,    max: 10,    step: 1,    fmt: (v: number) => `${Math.round(v)}`, accent: 'var(--teal)' },
  modDepth:    { label: 'DEPTH',      min: 0,    max: 100,   step: 1,    fmt: (v: number) => `${Math.round(v)}%`, accent: 'var(--teal)' },
  modRate:     { label: 'RATE',       min: 0.05, max: 8,     step: 0.01, fmt: (v: number) => `${v.toFixed(2)} Hz`, accent: 'var(--teal)' },
  hipass:      { label: 'HIPASS',     min: 20,   max: 5000,  step: 1,    fmt: fmtHz, accent: 'var(--teal)' },
  lopass:      { label: 'LOPASS',     min: 200,  max: 18000, step: 1,    fmt: fmtHz, accent: 'var(--teal)' },
  dryWet:      { label: 'DRY/WET',    min: 0,    max: 100,   step: 1,    fmt: (v: number) => `${Math.round(v)}%`, accent: 'var(--teal)' },
  output:      { label: 'OUTPUT',     min: -24,  max: 12,    step: 0.1,  fmt: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`, accent: 'var(--teal)' },
} satisfies Record<string, KnobSpec>;

// ── Tap visualiser — plain positioned divs (left %, height px), not canvas ──
// Each tap's position (n × delayTime) and height (feedback^n, attenuated a
// touch further by the saturation amount) is derived straight from the live
// params, so what you see is an honest picture of the actual repeats — not a
// baked-in illustration.
const TAP_DISPLAY_H     = 140; // must match .tap-display CSS height
const TAP_BASELINE_OFFSET = 24; // must match .tap-baseline CSS bottom offset
const TAP_MAX_BAR_H     = TAP_DISPLAY_H - TAP_BASELINE_OFFSET - 14;

interface Tap { leftPct: number; heightPx: number; label: string; color: string; opacity: number; }

function computeTaps(delayMs: number, feedbackPct: number, pingPong: boolean, analog: number): Tap[] {
  const feedbackFrac = feedbackPct / 100;
  // Heavier analog saturation compresses/darkens the tail a little faster.
  const satAtten = 1 - Math.min(0.4, (analog / 10) * 0.3);
  const windowMs = Math.min(2000, Math.max(600, delayMs * 6));
  const taps: Tap[] = [];
  for (let n = 0; n * delayMs <= windowMs && n <= 24; n++) {
    const t = n * delayMs;
    const amp = n === 0 ? 1 : Math.pow(feedbackFrac * satAtten, n);
    if (n > 0 && amp < 0.03) break;
    const isRight = pingPong && n % 2 === 1;
    taps.push({
      leftPct:  (t / windowMs) * 100,
      heightPx: Math.max(3, TAP_MAX_BAR_H * amp),
      label:    n === 0 ? 'DRY' : `${Math.round(t)}ms`,
      color:    n === 0 ? 'var(--amber)' : (isRight ? 'var(--blue)' : 'var(--teal)'),
      opacity:  n === 0 ? 1 : Math.max(0.22, 1 - n * 0.07),
    });
  }
  return taps;
}

// ── Drum synth (same synth used in Chapters 4 & 6, for a consistent, free,
// copyright-free test signal with clear transients — good for hearing
// discrete echoes) ──────────────────────────────────────────────────────────
const LOOP_BPM  = 120;
const STEP_SEC  = 60 / LOOP_BPM / 2;
const STEPS     = 16;
const PAT_KICK  = [1,0,0,0, 0,0,1,0, 1,0,0,1, 0,0,0,0];
const PAT_SNARE = [0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0];
const PAT_HAT   = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0];
const PAT_STAB  = [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0];

function noiseBuffer(ctx: AudioContext, dur: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
function synthKick(ctx: AudioContext, dest: AudioNode, t: number) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.06);
  g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.35);
}
function synthSnare(ctx: AudioContext, dest: AudioNode, t: number) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 0.15);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2000; f.Q.value = 0.7;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  n.connect(f); f.connect(g); g.connect(dest); n.start(t); n.stop(t + 0.15);
}
function synthHat(ctx: AudioContext, dest: AudioNode, t: number) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 0.05);
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 9000;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  n.connect(f); f.connect(g); g.connect(dest); n.start(t); n.stop(t + 0.05);
}
// A short plucked stab — the kind of transient that shows off discrete,
// audibly-separated delay repeats far better than a dense drum loop would.
function synthStab(ctx: AudioContext, dest: AudioNode, t: number) {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.value = 330;
  f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.4); f.Q.value = 2;
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  o.connect(f); f.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.5);
}
function scheduleStep(ctx: AudioContext, dest: AudioNode, step: number, t: number) {
  if (PAT_KICK[step])  synthKick(ctx, dest, t);
  if (PAT_SNARE[step]) synthSnare(ctx, dest, t);
  if (PAT_HAT[step])   synthHat(ctx, dest, t);
  if (PAT_STAB[step])  synthStab(ctx, dest, t);
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

// ── VU meter (5 segments) from a live analyser peak ─────────────────────────
const VU_SEGMENTS = 5;
function vuSegmentFills(peakLinear: number): number[] {
  const db   = peakLinear > 1e-6 ? 20 * Math.log10(peakLinear) : -60;
  const norm = Math.max(0, Math.min(1, (db + 60) / 60)); // -60dB..0dB → 0..1
  return Array.from({ length: VU_SEGMENTS }, (_, i) => {
    const segFloor = i / VU_SEGMENTS, segCeil = (i + 1) / VU_SEGMENTS;
    return Math.max(0, Math.min(1, (norm - segFloor) / (segCeil - segFloor))) * 100;
  });
}
function vuSegmentClass(i: number): 'green' | 'amber' | 'red' {
  if (i < 3) return 'green';
  if (i === 3) return 'amber';
  return 'red';
}

// ── Component ────────────────────────────────────────────────────────────────
export default function Chapter9() {
  const [params, setParams] = useState<DelayParams>({ ...DEFAULTS });
  const [sync, setSync]     = useState<SyncDivision>(DEFAULT_SYNC);
  const [link, setLink]     = useState(false); // when on, keeps HIPASS/LOPASS moving together, proportionally
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [engineError, setEngineError]   = useState<string | null>(null);
  const [vuFills, setVuFills] = useState<number[]>(() => vuSegmentFills(0));

  // Signal source — a short plucked stab / drum loop, or an uploaded track.
  const [uploadedTracks, setUploadedTracks] = useState<UploadedTrack[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<PresetOrSynth>('synth');
  const [decoding, setDecoding]     = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const uploadIdSeqRef = useRef(0);
  const activeSourceIdRef = useRef(activeSourceId);
  const uploadedTracksRef = useRef(uploadedTracks);
  const bufSourceRef      = useRef<AudioBufferSourceNode | null>(null);
  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
  useEffect(() => { uploadedTracksRef.current = uploadedTracks; }, [uploadedTracks]);
  const activeTrack = activeSourceId !== 'synth' ? uploadedTracks.find(t => t.id === activeSourceId) : undefined;

  // ── Faust engine (module + meta loaded once on mount; one node instantiated
  // per AudioContext in startAudio) — same pattern as Chapter6's reverb.
  const dspMetaRef   = useRef<FaustDspMeta | null>(null);
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
        console.error('[Chapter9] failed to load Faust delay DSP', err);
        setEngineError(err instanceof Error ? err.message : String(err));
        setEngineStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Audio refs
  const ctxRef        = useRef<AudioContext | null>(null);
  const faustNodeRef  = useRef<FaustNodeLike | null>(null);
  const mixRef        = useRef<GainNode | null>(null);
  const outAnalRef    = useRef<AnalyserNode | null>(null);   // post-delay tap — feeds VU meter + scope wet trace
  const dryAnalRef    = useRef<AnalyserNode | null>(null);   // pre-delay tap — feeds scope dry trace
  const animRef       = useRef<number>(0);
  const schedulerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextNoteRef   = useRef(0);
  const stepRef       = useRef(0);
  const startTokenRef = useRef(0);
  const pingMuteUntilRef = useRef(0); // while ctx.currentTime < this, the loop is silenced for a clean test-echo ping

  // Live delay echo scope state
  const scopeRef            = useRef<HTMLCanvasElement>(null);
  const scopeHistoryRef     = useRef<ScopePoint[]>([]);
  const meterClockRef       = useRef<number | null>(null);
  const smoothedInputDbRef  = useRef(METER_FLOOR_DB);
  const smoothedOutputDbRef = useRef(METER_FLOOR_DB);

  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);

  // ── Idle state for the live scope ───────────────────────────────────────
  useEffect(() => {
    if (isPlaying) return;
    if (scopeRef.current) drawDelayScope(scopeRef.current, [], 0, false);
  }, [isPlaying]);

  // ── Sync division → delay time ──────────────────────────────────────────
  const applySync = useCallback((div: SyncDivision) => {
    setSync(div);
    const ms = syncDivisionMs(div, BPM);
    if (ms !== null) setParams(p => ({ ...p, delayTimeMs: Math.min(2000, Math.max(1, ms)) }));
  }, []);

  // ── Filter LINK — moving one of HIPASS/LOPASS scales the other by the same
  // multiplicative delta, so their ratio (and therefore the width of the
  // passband carved out of the repeats) stays put while you sweep either. ──
  const setHipass = useCallback((v: number) => {
    setParams(p => {
      if (!link || p.hipass <= 0) return { ...p, hipass: v };
      const ratio = v / p.hipass;
      return { ...p, hipass: v, lopass: Math.min(18000, Math.max(200, p.lopass * ratio)) };
    });
  }, [link]);
  const setLopass = useCallback((v: number) => {
    setParams(p => {
      if (!link || p.lopass <= 0) return { ...p, lopass: v };
      const ratio = v / p.lopass;
      return { ...p, lopass: v, hipass: Math.min(5000, Math.max(20, p.hipass * ratio)) };
    });
  }, [link]);

  // ── Sync live params to the Faust delay node ────────────────────────────
  useEffect(() => {
    const node = faustNodeRef.current; if (!node) return;
    pushFaustParams(node, params);
  }, [params]);

  // ── Task tracking ────────────────────────────────────────────────────────
  const tasks = [
    sync === '1/8',
    params.modDepth !== DEFAULTS.modDepth || params.modRate !== DEFAULTS.modRate,
    params.hipass !== DEFAULTS.hipass || params.lopass !== DEFAULTS.lopass,
  ];
  const TASK_LABELS = ['Sync to 1/8 note', 'Add subtle modulation depth', 'Filter repeats with hi/lo-pass'];

  // ── Scheduler ────────────────────────────────────────────────────────────
  // While pingMuteUntilRef is in the future, steps still advance on the beat
  // (so the groove doesn't drift) but aren't actually triggered — this is
  // what gives triggerTestEcho() a clean window to let a single hit's
  // repeats ring out in the echo scope below, undisturbed by the loop.
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current; const mix = mixRef.current;
    if (!ctx || !mix) return;
    while (nextNoteRef.current < ctx.currentTime + 0.1) {
      if (nextNoteRef.current >= pingMuteUntilRef.current) {
        scheduleStep(ctx, mix, stepRef.current, nextNoteRef.current);
      }
      stepRef.current = (stepRef.current + 1) % STEPS;
      nextNoteRef.current += STEP_SEC;
    }
    schedulerRef.current = setTimeout(runScheduler, 25);
  }, []);

  // ── Test-echo ping ───────────────────────────────────────────────────────
  // The pluck+drums loop keeps re-triggering the delay, so MOD/FILTER/ANALOG
  // changes barely show up in the scope. This fires one isolated stab, mutes
  // the loop for one full scope window so nothing else re-triggers the
  // delay, and resets the scope history so the whole window is free to show
  // that single hit's repeats — mirrors Chapter6's PING TAIL.
  const triggerTestEcho = useCallback(() => {
    const ctx = ctxRef.current; const mix = mixRef.current;
    if (!ctx || !mix) return;
    const t = ctx.currentTime + 0.03;
    pingMuteUntilRef.current = t + SCOPE_WINDOW_S + 0.5;
    scopeHistoryRef.current = [];
    meterClockRef.current = null;
    synthStab(ctx, mix, t);
  }, []);

  // ── Meter + scope animation ──────────────────────────────────────────────
  // Drives the VU meter (post-delay peak) and the live echo scope (smoothed
  // dry/wet dB history) from the real dry/wet analyser taps.
  const animate = useCallback(() => {
    const dryAnal = dryAnalRef.current; const wetAnal = outAnalRef.current;

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
    if (wetAnal) {
      const buf = new Float32Array(wetAnal.fftSize); wetAnal.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
      setVuFills(vuSegmentFills(peak));
      const rawOutputDb = peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
      smoothedOutputDbRef.current = levelBallistic(smoothedOutputDbRef.current, rawOutputDb, dt);
    }

    if (dryAnal && wetAnal) {
      const history = scopeHistoryRef.current;
      history.push({ t: now, inputDb: smoothedInputDbRef.current, outputDb: smoothedOutputDbRef.current });
      const cutoff = now - SCOPE_WINDOW_S - 0.5;
      while (history.length > 0 && history[0].t < cutoff) history.shift();
      if (scopeRef.current) drawDelayScope(scopeRef.current, history, now, true);
    }

    animRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Start audio ──────────────────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) return;
    const myToken = ++startTokenRef.current;

    const ctx = new AudioContext();
    const mix = ctx.createGain();

    // ── Live scope taps ── dryAnal reads the raw pluck/loop/track signal
    // before the delay; outAnal reads the actual Faust delay output
    // (including its own internal mod/filter/ping-pong/analog-sat/dry-wet
    // blend) — outAnal feeds both the VU meter and the scope's wet trace.
    const dryAnal = ctx.createAnalyser(); dryAnal.fftSize = 1024; dryAnal.smoothingTimeConstant = 0.4;
    const outAnal = ctx.createAnalyser(); outAnal.fftSize = 2048; outAnal.smoothingTimeConstant = 0.35;
    outAnal.connect(ctx.destination);

    const factory = { module: dspModuleRef.current, json: JSON.stringify(dspMetaRef.current), soundfiles: {} };
    let faustNode: FaustNodeLike;
    try {
      faustNode = await generatorRef.current.createNode(ctx, dspMetaRef.current.name, factory, false, 512) as unknown as FaustNodeLike;
    } catch (err) {
      console.error('[Chapter9] failed to build Faust delay node', err);
      ctx.close();
      return;
    }

    if (myToken !== startTokenRef.current) { try { ctx.close(); } catch { /* ok */ } return; }

    pushFaustParams(faustNode, paramsRef.current);

    ctxRef.current = ctx;
    mixRef.current = mix;
    outAnalRef.current = outAnal;
    dryAnalRef.current = dryAnal;
    faustNodeRef.current = faustNode;

    // ── Wire: mix → dryAnal (viz tap) ─┐
    //      └→ faustNode (delay + mod + filters + ping-pong + analog sat) → outAnal (viz tap + VU) → destination ──
    mix.connect(dryAnal);
    mix.connect(faustNode as unknown as AudioNode);
    (faustNode as unknown as AudioNode).connect(outAnal);

    const track = activeSourceIdRef.current !== 'synth'
      ? uploadedTracksRef.current.find(t => t.id === activeSourceIdRef.current)
      : undefined;

    if (track) {
      const bufSrc = ctx.createBufferSource();
      bufSrc.buffer = track.buffer; bufSrc.loop = true;
      bufSrc.connect(mix); bufSrc.start();
      bufSourceRef.current = bufSrc;
    } else {
      nextNoteRef.current = ctx.currentTime + 0.05;
      stepRef.current = 0;
      pingMuteUntilRef.current = 0;
      runScheduler();
    }

    scopeHistoryRef.current = [];
    meterClockRef.current = null;
    animRef.current = requestAnimationFrame(animate);
    setIsPlaying(true);
    setHasPlayed(true);
  }, [engineStatus, runScheduler, animate]);

  const stopAudio = useCallback(() => {
    startTokenRef.current++;
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
    mixRef.current = null; outAnalRef.current = null; dryAnalRef.current = null;
    ctxRef.current?.close(); ctxRef.current = null;
    smoothedInputDbRef.current = METER_FLOOR_DB;
    smoothedOutputDbRef.current = METER_FLOOR_DB;
    meterClockRef.current = null;
    scopeHistoryRef.current = [];
    pingMuteUntilRef.current = 0;
    setVuFills(vuSegmentFills(0));
    setIsPlaying(false);
    if (scopeRef.current) drawDelayScope(scopeRef.current, [], 0, false);
  }, []);

  useEffect(() => () => {
    startTokenRef.current++;
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    if (bufSourceRef.current) { try { bufSourceRef.current.stop(); } catch { /* ok */ } }
    if (faustNodeRef.current) { try { (faustNodeRef.current as unknown as AudioNode).disconnect(); } catch { /* ok */ } }
    ctxRef.current?.close();
  }, []);

  // ── Signal source: switch tab / upload new track ──────────────────────────
  const handleSelectSource = useCallback((id: PresetOrSynth) => {
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

  // Renders the currently active uploaded track through the delay (with
  // current knob settings) and downloads it as a WAV — the "download after
  // processing" counterpart to the upload button above.
  const handleDownload = useCallback(async () => {
    const track = activeTrack;
    if (!track || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) return;
    setDownloadError('');
    setDownloading(true);
    try {
      const rendered = await renderDelayOffline(
        generatorRef.current, dspMetaRef.current, dspModuleRef.current,
        track.buffer, params,
      );
      downloadAudioBufferAsWav(rendered, `${track.name || 'delay-design-studio'}-delay.wav`);
    } catch (err) {
      console.error('[Chapter9] failed to render audio for download', err);
      setDownloadError('Could not render the audio for download — see console for details.');
    } finally {
      setDownloading(false);
    }
  }, [activeTrack, params]);

  const reset = useCallback(() => {
    setParams({ ...DEFAULTS });
    setSync(DEFAULT_SYNC);
    setLink(false);
  }, []);

  const taps = computeTaps(params.delayTimeMs, params.feedback, params.pingPong, params.analog);
  const faustActive = engineStatus === 'ready' || engineStatus === 'loading';

  const renderSourceRow = () => (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.5rem 0 0.1rem' }}>
      <button
        onClick={() => handleSelectSource('synth')}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem',
          background: activeSourceId === 'synth' ? 'rgba(45,212,191,0.13)' : 'var(--surface)',
          border: `1px solid ${activeSourceId === 'synth' ? 'rgba(45,212,191,0.5)' : 'var(--border)'}`,
          borderRadius: '3px', color: activeSourceId === 'synth' ? 'var(--teal)' : 'var(--text-dim)',
          fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>🎸</span>
        <span>PLUCK + DRUMS</span>
      </button>

      {uploadedTracks.map(track => {
        const active = activeSourceId === track.id;
        return (
          <button
            key={track.id}
            onClick={() => handleSelectSource(track.id)}
            title={track.name}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem',
              background: active ? 'rgba(0,255,135,0.13)' : 'var(--surface)',
              border: `1px solid ${active ? 'rgba(0,255,135,0.5)' : 'var(--border)'}`,
              borderRadius: '3px', color: active ? 'var(--green)' : 'var(--text-dim)',
              fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '0.85rem' }}>📁</span>
            <span>{track.name}</span>
          </button>
        );
      })}

      <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelected} style={{ display: 'none' }} />
      <button
        onClick={handleUploadClick}
        disabled={decoding}
        title="Upload your own audio to run through the delay"
        style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem',
          background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '3px',
          color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
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
          title="Render the active track through the delay and download it as a WAV"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem',
            background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '3px',
            color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
            cursor: downloading ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
          }}
        >
          <span style={{ fontSize: '0.85rem' }}>{downloading ? '⏳' : '⬇'}</span>
          <span>{downloading ? 'RENDERING…' : 'DOWNLOAD AUDIO'}</span>
        </button>
      )}
      {uploadError && (
        <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--mono)', alignSelf: 'center' }}>{uploadError}</span>
      )}
      {downloadError && (
        <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--mono)', alignSelf: 'center' }}>{downloadError}</span>
      )}
    </div>
  );

  return (
    <div className="hdelay-lab">
      {/* ── Top bar ── */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--teal-dim)', border: '1px solid rgba(45,212,191,0.4)' }}>⏱</div>
          <div>
            <div className="lab-name">Delay Design Studio</div>
            <div className="lab-subtitle">
              FAUST DELAYS.LIB · {activeTrack ? activeTrack.name : `PLUCK + DRUMS @ ${LOOP_BPM} BPM`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="badge" style={{ background: 'var(--teal-dim)', borderColor: 'rgba(45,212,191,0.3)', color: 'var(--teal)' }}>
            ♪ {sync === 'FREE' ? 'FREE' : sync} · {BPM} BPM
          </span>
          <span className="badge" style={{
            background: engineStatus === 'ready'   ? 'rgba(45,212,191,0.15)' :
                        engineStatus === 'loading' ? 'rgba(245,166,35,0.15)' :
                        engineStatus === 'error'   ? 'rgba(255,77,106,0.12)' : 'var(--surface)',
            borderColor: engineStatus === 'ready'  ? 'rgba(45,212,191,0.4)'  :
                         engineStatus === 'loading'? 'rgba(245,166,35,0.4)'  :
                         engineStatus === 'error'  ? 'rgba(255,77,106,0.4)'  : 'var(--border)',
            color: engineStatus === 'ready'   ? 'var(--teal)'    :
                   engineStatus === 'loading' ? 'var(--amber)'   :
                   engineStatus === 'error'   ? 'var(--red)'     : 'var(--text-faint)',
          }}>
            {engineStatus === 'ready'   ? '● FAUST WASM'   :
             engineStatus === 'loading' ? '◌ LOADING…'     :
             engineStatus === 'error'   ? '⚠ ENGINE ERROR' : '○ IDLE'}
          </span>
          <button
            className={`toggle-btn${isPlaying ? ' on' : ''}`}
            style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-dim)' } : {}}
            onClick={isPlaying ? stopAudio : () => { void startAudio(); }}
            disabled={!isPlaying && engineStatus !== 'ready'}
            title={engineStatus === 'loading' ? 'Loading Faust delay engine…' : engineStatus === 'error' ? (engineError ?? 'Faust engine failed to load') : undefined}
          >
            {isPlaying ? '⏹ STOP' : engineStatus === 'loading' ? '⏳ LOADING…' : engineStatus === 'error' ? '⚠ ENGINE ERROR' : '▶ PLAY'}
          </button>
          <div className="lab-status" style={{ color: isPlaying ? 'var(--teal)' : 'var(--text-dim)' }}>
            <div className="status-dot" style={{
              background: isPlaying ? 'var(--teal)' : 'var(--text-faint)',
              boxShadow:  isPlaying ? '0 0 6px var(--teal)' : 'none',
              animation:  isPlaying ? undefined : 'none',
            }} />
            {isPlaying ? 'LIVE' : 'STOPPED'}
          </div>
        </div>
      </div>

      {/* Signal source selector */}
      <div style={{ padding: '0 1.25rem', borderBottom: '1px solid var(--border)' }}>
        {renderSourceRow()}
      </div>

      <div className="hdelay-body">
        {/* ── Left panel ── */}
        <div className="hdelay-left">
          <div className="canvas-label">DELAY TAPS — TIME DOMAIN</div>
          <div className="tap-display">
            <div className="tap-grid" />
            <div className="tap-baseline" />
            {taps.map((tap, i) => (
              <div
                key={i}
                className="tap-bar"
                style={{ left: `${tap.leftPct}%`, height: tap.heightPx, background: tap.color, opacity: tap.opacity, boxShadow: `0 0 6px ${tap.color}` }}
              />
            ))}
            {taps.map((tap, i) => (
              <div key={`l${i}`} className="tap-bar-label" style={{ left: `${tap.leftPct}%` }}>{tap.label}</div>
            ))}
          </div>

          <div className="canvas-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span>
              LIVE DELAY ECHO SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
              <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
                · real dry input vs wet output over time — the tap chart above is illustrative, this is the actual audio
              </span>
            </span>
            <button
              className="toggle-btn"
              style={{ fontSize: '0.6rem', padding: '0.25rem 0.6rem', whiteSpace: 'nowrap' }}
              onClick={triggerTestEcho}
              disabled={!isPlaying || activeSourceId !== 'synth'}
              title={activeSourceId !== 'synth' ? 'Switch to pluck + drums to use the test-echo ping' : 'Fire one isolated hit and mute the loop so the repeats ring out cleanly'}
            >
              ⚡ PING ECHO
            </button>
          </div>
          <div className="hdelay-scope-display">
            <canvas
              ref={scopeRef}
              width={760}
              height={150}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          </div>
          <div className="legend-row" style={{ marginBottom: '1rem' }}>
            <div className="legend-item"><span className="legend-line" style={{ background: '#F5A623' }} />DRY INPUT</div>
            <div className="legend-item"><span className="legend-line" style={{ background: '#2DD4BF' }} />WET OUTPUT (ECHOES)</div>
          </div>
          <div className="concept-callout" style={{ marginTop: '-0.5rem', marginBottom: '1rem', background: 'rgba(45,212,191,0.05)', borderColor: 'rgba(45,212,191,0.15)' }}>
            The pluck + drums loop keeps re-triggering the delay, so MOD/FILTER/ANALOG changes can be hard to
            see in a busy loop. Click <strong style={{ color: 'var(--teal)' }}>PING ECHO</strong>{' '}
            to hear (and see) one hit's repeats ring out with nothing else in the way.
          </div>

          <div className="canvas-label">SYNC DIVISION</div>
          <div className="delay-sync-row">
            {SYNC_DIVISIONS.map(div => (
              <div
                key={div}
                className={`sync-btn${sync === div ? ' active' : ''}`}
                onClick={() => applySync(div)}
              >
                {div}
              </div>
            ))}
          </div>

          <div className="canvas-label">CHARACTER</div>
          <div className="comp-toggles" style={{ marginBottom: '1rem' }}>
            <button
              className={`toggle-btn${params.pingPong ? ' on' : ''}`}
              style={params.pingPong ? { background: 'var(--teal-dim)', borderColor: 'var(--teal)', color: 'var(--teal)' } : {}}
              onClick={() => setParams(p => ({ ...p, pingPong: !p.pingPong }))}
            >
              PING PONG
            </button>
          </div>

          <div className="hdelay-knob-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Knob spec={KNOB_SPECS.delayTimeMs} value={params.delayTimeMs} disabled={sync !== 'FREE'}
              onChange={v => setParams(p => ({ ...p, delayTimeMs: v }))} />
            <Knob spec={KNOB_SPECS.feedback} value={params.feedback}
              onChange={v => setParams(p => ({ ...p, feedback: v }))} />
            <Knob spec={KNOB_SPECS.analog} value={params.analog}
              onChange={v => setParams(p => ({ ...p, analog: v }))} />
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="hdelay-right">
          <div className="subsection-label">MODULATION</div>
          <div className="hdelay-knob-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '1.25rem' }}>
            <Knob spec={KNOB_SPECS.modDepth} value={params.modDepth}
              onChange={v => setParams(p => ({ ...p, modDepth: v }))} />
            <Knob spec={KNOB_SPECS.modRate} value={params.modRate}
              onChange={v => setParams(p => ({ ...p, modRate: v }))} />
          </div>

          <div className="subsection-label">FILTERS — SHAPING THE REPEATS</div>
          <div className="hdelay-knob-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.25rem' }}>
            <Knob spec={KNOB_SPECS.hipass} value={params.hipass} onChange={setHipass} />
            <Knob spec={KNOB_SPECS.lopass} value={params.lopass} onChange={setLopass} />
            <div className="knob-wrap" style={{ justifyContent: 'center' }}>
              <button
                className={`toggle-btn${link ? ' on' : ''}`}
                style={{ marginTop: '0.6rem', ...(link ? { background: 'var(--teal-dim)', borderColor: 'var(--teal)', color: 'var(--teal)' } : {}) }}
                onClick={() => setLink(l => !l)}
                title="When on, HIPASS and LOPASS sweep together, keeping the same ratio between them"
              >
                LINK
              </button>
            </div>
          </div>

          <div className="subsection-label">OUTPUT</div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
            <div className="hdelay-knob-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', flex: 1 }}>
              <Knob spec={KNOB_SPECS.dryWet} value={params.dryWet}
                onChange={v => setParams(p => ({ ...p, dryWet: v }))} />
              <Knob spec={KNOB_SPECS.output} value={params.output}
                onChange={v => setParams(p => ({ ...p, output: v }))} />
            </div>
            <div className="meter-block" style={{ width: 70 }}>
              <div className="meter-label">LEVEL</div>
              <div className="vu-meter">
                {vuFills.map((h, i) => (
                  <div key={i} className={`vu-bar ${vuSegmentClass(i)}`} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>

          {/* Faust engine section header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--mono)', fontSize: '0.55rem',
            marginTop: '1rem', background: faustActive ? 'rgba(45,212,191,0.08)' : 'var(--surface)',
            border: `1px solid ${faustActive ? 'rgba(45,212,191,0.3)' : 'var(--border)'}`, borderRadius: 4, padding: '0.3rem 0.6rem',
          }}>
            <span style={{ color: faustActive ? 'var(--teal)' : 'var(--text-faint)', fontWeight: 600 }}>{'◈'}</span>
            <span style={{ color: faustActive ? 'var(--teal)' : 'var(--text-faint)' }}>
              MOD + FILTER + PING-PONG + ANALOG SAT
            </span>
            <span style={{ color: 'var(--text-faint)', marginLeft: 2 }}>
              — powered by <span style={{ color: faustActive ? 'var(--teal)' : 'var(--text-faint)' }}>Faust delays.lib</span>
            </span>
          </div>

          <div className="concept-callout" style={{ background: 'var(--teal-dim)', borderColor: 'rgba(45,212,191,0.2)', marginTop: '1rem' }}>
            <strong style={{ color: 'var(--teal)' }}>Concept check:</strong> Slow LFO modulation on the delay line adds
            subtle pitch drift to repeats — the classic "tape wobble" that keeps echoes from sounding sterile. Filtering
            repeats darker with each pass mimics natural high-frequency air absorption.
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
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
          <button
            className={`toggle-btn${isPlaying ? ' on' : ''}`}
            style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-dim)' } : {}}
            onClick={isPlaying ? stopAudio : () => { void startAudio(); }}
          >
            {isPlaying ? '⏹ STOP' : '▶ Audition'}
          </button>
          <button className="btn-secondary" onClick={reset}>Reset</button>
          <button className="btn-primary" disabled={!hasPlayed}>Submit &amp; Continue →</button>
        </div>
      </div>
    </div>
  );
}
