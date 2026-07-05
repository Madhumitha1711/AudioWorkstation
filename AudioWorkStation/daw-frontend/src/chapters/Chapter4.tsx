import { useRef, useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CompParams {
  threshold: number;   // dB  -60 → 0
  ratio:     number;   //       1 → 20
  attack:    number;   // ms   0.5 → 200
  release:   number;   // ms   50 → 2000
  knee:      number;   // dB   0 → 40
  makeup:    number;   // dB   0 → 24
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
}

const KNOBS: KnobSpec[] = [
  { key: 'threshold', label: 'THRESHOLD',   min: -60,  max: 0,    step: 0.5,  fmt: v => `${v.toFixed(0)} dB` },
  { key: 'ratio',     label: 'RATIO',       min: 1,    max: 20,   step: 0.1,  fmt: v => `${v.toFixed(1)} : 1` },
  { key: 'attack',    label: 'ATTACK',      min: 0.5,  max: 200,  step: 0.5,  fmt: v => `${v.toFixed(1)} ms` },
  { key: 'release',   label: 'RELEASE',     min: 50,   max: 2000, step: 5,    fmt: v => `${v.toFixed(0)} ms` },
  { key: 'knee',      label: 'KNEE',        min: 0,    max: 40,   step: 0.5,  fmt: v => v < 5 ? 'HARD' : v < 20 ? 'MEDIUM' : 'SOFT' },
  { key: 'makeup',    label: 'MAKEUP GAIN', min: 0,    max: 24,   step: 0.1,  fmt: v => `+${v.toFixed(1)} dB` },
];

const DEFAULTS: CompParams = {
  threshold: -24,
  ratio:      4,
  attack:     10,
  release:    200,
  knee:       20,
  makeup:      6,
};

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
function drawTransfer(canvas: HTMLCanvasElement, params: CompParams) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;
  const DB_MIN = -60, DB_MAX = 0;
  const toX = (db: number) => ((db - DB_MIN) / (DB_MAX - DB_MIN)) * W;
  const toY = (db: number) => H - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * H;

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
    ctx.fillText(`${db}`, toX(db) + 2, H - 2);   // X axis: input level
    ctx.fillText(`${db}`, 2, toY(db) - 2);        // Y axis: output level
  }

  // Unity line
  ctx.strokeStyle = '#2E2E3D'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(toX(DB_MIN), toY(DB_MIN)); ctx.lineTo(toX(DB_MAX), toY(DB_MAX)); ctx.stroke();
  ctx.setLineDash([]);

  // Threshold marker
  ctx.strokeStyle = '#3D3D52'; ctx.setLineDash([2, 3]);
  const tx = toX(params.threshold);
  ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#8A8A9A'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('THRESH', tx + 3, H - 5);

  // Fill + stroke
  const curve = (p: ShapeParams, stroke: string, fillAlpha: number) => {
    ctx.strokeStyle = stroke; ctx.lineWidth = 2.5;
    if (fillAlpha > 0) {
      ctx.fillStyle = stroke.replace(')', `,${fillAlpha})`).replace('rgb', 'rgba');
      ctx.beginPath();
      let first = true;
      for (let db = DB_MIN; db <= DB_MAX; db += 0.5) {
        const x = toX(db), y = toY(applyCompression(db, p));
        first ? (ctx.moveTo(x, H), ctx.lineTo(x, y), (first = false)) : ctx.lineTo(x, y);
      }
      ctx.lineTo(toX(DB_MAX), H); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); let first2 = true;
    for (let db = DB_MIN; db <= DB_MAX; db += 0.5) {
      const x = toX(db), y = toY(applyCompression(db, p));
      first2 ? (ctx.moveTo(x, y), (first2 = false)) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  curve(params, 'rgb(167,139,250)', 0.08);

  // Operating point crosshairs (example input: 12 dB above threshold)
  const exampleInput  = Math.min(-1, params.threshold + 12);
  const exampleOutput = applyCompression(exampleInput, params);
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

// ── Canvas: waveform ──────────────────────────────────────────────────────────
function drawWaveform(canvas: HTMLCanvasElement, data: Float32Array, color: string) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;
  ctx.fillStyle = '#22222E'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * W;
    const y = ((1 - data[i]) / 2) * H;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ── Knob helpers ──────────────────────────────────────────────────────────────
function knobRotation(v: number, min: number, max: number) {
  return -140 + ((v - min) / (max - min)) * 280;
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

function scheduleStep(
  ctx: AudioContext, dest: AudioNode, step: number, time: number,
  sidechainGain: GainNode | null,
) {
  if (PAT_KICK[step]) {
    synthKick(ctx, dest, time);
    // Sidechain: duck the whole mix on every kick
    if (sidechainGain) {
      sidechainGain.gain.cancelScheduledValues(time);
      sidechainGain.gain.setValueAtTime(1.0, time);
      sidechainGain.gain.setTargetAtTime(0.12, time + 0.002, 0.005); // fast duck
      sidechainGain.gain.setTargetAtTime(1.0,  time + 0.07,  0.045); // pump back
    }
  }
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
  const [sidechain, setSidechain] = useState(false);
  const [gainReduction, setGR]    = useState(0);
  const [wetDry,        setWetDry] = useState(1);   // 0 = dry, 1 = wet
  const [tasks, setTasks]         = useState([false, false, false, false]);

  // Signal source — the built-in synth drum loop, or one of any number of
  // uploaded tracks.
  const [uploadedTracks, setUploadedTracks] = useState<UploadedTrack[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<number | 'synth'>('synth');
  const [decoding,       setDecoding]       = useState(false);
  const [uploadError,    setUploadError]    = useState('');
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
  const dryRef       = useRef<HTMLCanvasElement>(null);
  const wetRef       = useRef<HTMLCanvasElement>(null);

  // Audio refs
  const ctxRef              = useRef<AudioContext | null>(null);
  const compRef             = useRef<DynamicsCompressorNode | null>(null);
  const makeupRef           = useRef<GainNode | null>(null);
  const dryAnalRef          = useRef<AnalyserNode | null>(null);
  const wetAnalRef          = useRef<AnalyserNode | null>(null);
  const mixRef              = useRef<GainNode | null>(null);
  const dryBlendRef         = useRef<GainNode | null>(null);        // wet/dry: dry leg
  const wetBlendRef         = useRef<GainNode | null>(null);        // wet/dry: wet leg
  const outputRef           = useRef<GainNode | null>(null);        // final sum before destination
  const sidechainGainRef    = useRef<GainNode | null>(null);       // sidechain duck node
  const sidechainEnabledRef = useRef(false);                        // live ref, no re-render needed
  const animRef             = useRef<number>(0);
  const schedulerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextNoteRef         = useRef(0);
  const currentStepRef      = useRef(0);

  // Knob drag ref (for main lab)
  const mainDragRef = useRef<{
    key: keyof CompParams; startY: number; startVal: number;
    min: number; max: number; step: number;
  } | null>(null);

  // ── Main transfer canvas ──────────────────────────────────────────────────
  useEffect(() => {
    if (transferRef.current) {
      // When bypassed, draw unity line (ratio=1 collapses to straight diagonal)
      const displayParams = bypass ? { ...params, threshold: 0, ratio: 1 } : params;
      drawTransfer(transferRef.current, displayParams);
    }
  }, [params, bypass]);

  // ── Sync compressor params + bypass (single effect, no conflicts) ────────
  useEffect(() => {
    const comp = compRef.current; const makeup = makeupRef.current;
    if (!comp || !makeup || !ctxRef.current) return;
    const t = ctxRef.current.currentTime;
    if (bypass) {
      // True bypass: pass audio uncompressed AND remove makeup boost
      comp.threshold.setTargetAtTime(0,  t, 0.01);
      comp.ratio.setTargetAtTime(1,      t, 0.01);
      comp.knee.setTargetAtTime(40,      t, 0.01);
      makeup.gain.setTargetAtTime(1,     t, 0.01); // unity — no boost
    } else {
      comp.threshold.setTargetAtTime(params.threshold,      t, 0.01);
      comp.ratio.setTargetAtTime(params.ratio,              t, 0.01);
      comp.knee.setTargetAtTime(params.knee,                t, 0.01);
      comp.attack.setTargetAtTime(params.attack / 1000,     t, 0.01);
      comp.release.setTargetAtTime(params.release / 1000,   t, 0.01);
      makeup.gain.setTargetAtTime(10 ** (params.makeup / 20), t, 0.01);
    }
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

  // ── Wet/dry blend sync ────────────────────────────────────────────────────
  useEffect(() => {
    if (!ctxRef.current) return;
    const t = ctxRef.current.currentTime;
    dryBlendRef.current?.gain.setTargetAtTime(1 - wetDry, t, 0.01);
    wetBlendRef.current?.gain.setTargetAtTime(wetDry,     t, 0.01);
  }, [wetDry]);

  // ── Sidechain ref sync (no re-render, read from scheduler) ───────────────
  useEffect(() => { sidechainEnabledRef.current = sidechain; }, [sidechain]);

  // ── Scheduler ─────────────────────────────────────────────────────────────
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current; const mix = mixRef.current;
    if (!ctx || !mix) return;
    while (nextNoteRef.current < ctx.currentTime + 0.1) {
      scheduleStep(ctx, mix, currentStepRef.current, nextNoteRef.current,
        sidechainEnabledRef.current ? sidechainGainRef.current : null);
      currentStepRef.current = (currentStepRef.current + 1) % STEPS;
      nextNoteRef.current   += STEP_SEC;
    }
    schedulerRef.current = setTimeout(runScheduler, 25);
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────────
  const animate = useCallback(() => {
    if (compRef.current) setGR(compRef.current.reduction);
    const dryAnal = dryAnalRef.current; const wetAnal = wetAnalRef.current;
    if (dryAnal && dryRef.current) {
      const buf = new Float32Array(dryAnal.fftSize); dryAnal.getFloatTimeDomainData(buf);
      drawWaveform(dryRef.current, buf, '#3D3D52');
    }
    if (wetAnal && wetRef.current) {
      const buf = new Float32Array(wetAnal.fftSize); wetAnal.getFloatTimeDomainData(buf);
      drawWaveform(wetRef.current, buf, '#A78BFA');
    }
    animRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Start / Stop audio ────────────────────────────────────────────────────
  const startAudio = useCallback(() => {
    const ctx = new AudioContext(); ctxRef.current = ctx;

    // mix → scGain → dryAnal (viz tap) → dryBlend ─┐
    //             → delay → comp → makeup → wetAnal → wetBlend → output → destination
    const mix = ctx.createGain(); mix.gain.value = 0.85; mixRef.current = mix;
    const scGain = ctx.createGain(); scGain.gain.value = 1; sidechainGainRef.current = scGain;
    const dryAnal = ctx.createAnalyser(); dryAnal.fftSize = 1024; dryAnal.smoothingTimeConstant = 0.4; dryAnalRef.current = dryAnal;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = params.threshold; comp.ratio.value = params.ratio;
    comp.attack.value    = params.attack / 1000; comp.release.value = params.release / 1000;
    comp.knee.value      = params.knee; compRef.current = comp;
    const makeup = ctx.createGain(); makeup.gain.value = 10 ** (params.makeup / 20); makeupRef.current = makeup;
    const wetAnal = ctx.createAnalyser(); wetAnal.fftSize = 1024; wetAnal.smoothingTimeConstant = 0.4; wetAnalRef.current = wetAnal;

    // Wet/dry blend nodes
    const dryBlend = ctx.createGain(); dryBlend.gain.value = 1 - wetDry; dryBlendRef.current = dryBlend;
    const wetBlend = ctx.createGain(); wetBlend.gain.value = wetDry;     wetBlendRef.current = wetBlend;
    const output   = ctx.createGain(); output.gain.value   = 1;          outputRef.current   = output;

    mix.connect(scGain);
    scGain.connect(dryAnal);        // tap for dry waveform visualisation
    scGain.connect(dryBlend);       // dry leg (skips compressor)
    scGain.connect(comp);           // wet leg
    comp.connect(makeup); makeup.connect(wetAnal); wetAnal.connect(wetBlend);
    dryBlend.connect(output); wetBlend.connect(output);
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

    animRef.current = requestAnimationFrame(animate);
    setIsPlaying(true);
  }, [params, runScheduler, animate]);

  const stopAudio = useCallback(() => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    if (bufSourceRef.current) {
      try { bufSourceRef.current.stop(); } catch { /* ok */ }
      bufSourceRef.current.disconnect();
      bufSourceRef.current = null;
    }
    ctxRef.current?.close();
    ctxRef.current = null; compRef.current = null; makeupRef.current = null;
    dryAnalRef.current = null; wetAnalRef.current = null; mixRef.current = null;
    sidechainGainRef.current = null;
    dryBlendRef.current = null; wetBlendRef.current = null; outputRef.current = null;
    setGR(0); setIsPlaying(false);
    [dryRef, wetRef].forEach(r => {
      if (!r.current) return;
      const c = r.current.getContext('2d')!;
      c.fillStyle = '#22222E'; c.fillRect(0, 0, r.current.width, r.current.height);
    });
  }, []);

  useEffect(() => () => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    if (bufSourceRef.current) {
      try { bufSourceRef.current.stop(); } catch { /* ok */ }
    }
    ctxRef.current?.close();
  }, []);

  // ── Signal source: switch tab / upload new track ──────────────────────────
  // Sidechain ducking is wired to the built-in synth drum pattern's kick hits
  // (see scheduleStep/PAT_KICK) — it has no effect on an uploaded track, so
  // the control is disabled and forced off whenever a track is active.
  const handleSelectSource = useCallback((id: number | 'synth') => {
    stopAudio();
    setActiveSourceId(id);
    if (id !== 'synth') setSidechain(false);
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
      setSidechain(false);
    } catch (err) {
      console.error('Failed to decode audio file', err);
      setUploadError('Could not read that file — try an mp3, wav, or m4a.');
    } finally {
      tmpCtx?.close();
      setDecoding(false);
    }
  }, [stopAudio]);

  // ── Main lab knob drag ────────────────────────────────────────────────────
  const onMainKnobDown = useCallback((e: React.MouseEvent, spec: KnobSpec, val: number) => {
    e.preventDefault();
    mainDragRef.current = { key: spec.key, startY: e.clientY, startVal: val, min: spec.min, max: spec.max, step: spec.step };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = mainDragRef.current; if (!d) return;
      const sens    = (d.max - d.min) / 220;
      const raw     = d.startVal + (d.startY - e.clientY) * sens;
      const clamped = Math.min(d.max, Math.max(d.min, Math.round(raw / d.step) * d.step));
      setParams(p => ({ ...p, [d.key]: clamped }));
    };
    const onUp = () => { mainDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const reset = useCallback(() => setParams(DEFAULTS), []);

  // Derived
  const grAbs = Math.abs(gainReduction);
  const grPct = Math.min(100, (grAbs / 20) * 100);
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
      {uploadError && (
        <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--mono)', alignSelf: 'center' }}>
          {uploadError}
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
            <div className="lab-subtitle">LAB · CH 04 · DYNAMICS</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`toggle-btn${isPlaying ? ' on' : ''}`}
              style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-dim)' } : {}}
              onClick={isPlaying ? stopAudio : startAudio}
            >
              {isPlaying ? '⏹ STOP' : '▶ PLAY'}
            </button>
            <button className={`toggle-btn${bypass    ? ' on' : ''}`} onClick={() => setBypass(b => !b)}>
              {bypass ? 'BYPASS: ON' : 'BYPASS: OFF'}
            </button>
            <button
              className={`toggle-btn${sidechain ? ' on' : ''}`}
              onClick={() => setSidechain(s => !s)}
              disabled={activeSourceId !== 'synth'}
              title={activeSourceId !== 'synth' ? 'Sidechain only applies to the built-in drum loop' : undefined}
              style={activeSourceId !== 'synth' ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >
              SIDECHAIN
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
          <div className="knob-grid">
            {KNOBS.map(spec => {
              const val = params[spec.key] as number;
              const rot = knobRotation(val, spec.min, spec.max);
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
                </div>
              );
            })}
          </div>

          <div className="canvas-label" style={{ marginBottom: '0.5rem' }}>GAIN REDUCTION METER</div>
          <div className="gr-display">
            <div className="gr-label">0 dB</div>
            <div className="gr-meter">
              <div className="gr-fill" style={{ width: `${grPct}%`, transition: 'width 0.06s linear' }} />
              <div className="gr-needle" style={{ right: `${100 - grPct}%` }} />
            </div>
            <div className="gr-label">GR: <span className="gr-val">
              {isPlaying && gainReduction < -0.1 ? `${gainReduction.toFixed(1)} dB` : '0.0 dB'}
            </span></div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <div className="concept-callout" style={{ background: 'var(--purple-dim)', borderColor: 'rgba(167,139,250,0.2)' }}>
              <strong style={{ color: 'var(--purple)' }}>Concept: </strong>
              {params.ratio.toFixed(1)}:1 ratio — {params.ratio > 10 ? 'Limiting territory. Very aggressive.' : params.ratio > 6 ? 'Heavy compression. Peak control.' : params.ratio > 3 ? 'Classic glue. Musical.' : 'Gentle, transparent.'}
              {' '}Toggle <strong style={{ color: 'var(--purple)' }}>BYPASS</strong> while playing to A/B.
            </div>
          </div>
          {sidechain && <div className="tip-box" style={{ marginTop: '0.75rem', background: 'rgba(77,158,255,0.08)', borderColor: 'rgba(77,158,255,0.2)' }}><strong style={{ color: 'var(--blue)' }}>Sidechain:</strong> Compressor triggered by a separate control signal — voice-over ducking or kick-triggered bass pumping.</div>}
        </div>

        {/* Right: transfer + waveforms */}
        <div className="comp-visual">
          <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>
            TRANSFER FUNCTION — INPUT vs OUTPUT
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
              · shaped by THRESHOLD / RATIO / KNEE only — attack &amp; release are time-domain, see waveform below
            </span>
          </div>
          <div className="transfer-graph">
            <canvas ref={transferRef} width={400} height={200} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>
          <div className="canvas-label" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
            BEFORE / AFTER WAVEFORM {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
          </div>
          <div className="waveform-compare">
            <div className="compare-row">
              <div className="compare-lbl">DRY</div>
              <div className="mini-wave"><canvas ref={dryRef} width={300} height={30} style={{ width: '100%', height: '100%', display: 'block' }} /></div>
            </div>
            <div className="compare-row">
              <div className="compare-lbl" style={{ color: 'var(--purple)' }}>WET</div>
              <div className="mini-wave" style={{ borderColor: 'rgba(167,139,250,0.3)' }}><canvas ref={wetRef} width={300} height={30} style={{ width: '100%', height: '100%', display: 'block' }} /></div>
            </div>
          </div>

          {/* Wet / Dry mix slider */}
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="canvas-label" style={{ margin: 0 }}>WET / DRY MIX</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--purple)' }}>
                {wetDry === 1 ? '100% WET' : wetDry === 0 ? '100% DRY' : `${Math.round(wetDry * 100)}% WET · ${Math.round((1 - wetDry) * 100)}% DRY`}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>DRY</span>
              <input
                type="range"
                min={0} max={1} step={0.01}
                value={wetDry}
                onChange={e => setWetDry(parseFloat(e.target.value))}
                style={{
                  flex: 1,
                  accentColor: 'var(--purple)',
                  cursor: 'pointer',
                  height: 4,
                }}
              />
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--purple)', whiteSpace: 'nowrap' }}>WET</span>
            </div>
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
