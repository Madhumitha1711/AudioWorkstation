import { useRef, useState, useEffect, useCallback } from 'react';
import { downloadAudioBufferAsWav } from '../audio/wavRender';

// ── Types ──────────────────────────────────────────────────────────────────────
type SatType = 'tape' | 'tube' | 'transistor' | 'digital';
type SrcType = 'sine' | 'bass' | 'square' | 'sawtooth' | 'triangle' | 'chord';

const SAT_TYPES: Array<{ id: SatType; name: string; desc: string }> = [
  { id: 'tape',       name: 'TAPE',       desc: 'soft, warm' },
  { id: 'tube',       name: 'TUBE',       desc: 'even harmonics' },
  { id: 'transistor', name: 'TRANSISTOR', desc: 'odd harmonics' },
  { id: 'digital',    name: 'DIGITAL',    desc: 'hard clip' },
];

// An uploaded audio track that can be used as the saturator's signal source
// instead of the built-in oscillators, so drive/tone can be heard on real
// material. Selected the same way as a built-in source, just keyed by id.
interface UploadedTrack { id: number; name: string; buffer: AudioBuffer; }

interface SrcOption {
  id: SrcType;
  label: string;
  desc: string;
  freq: number;
  oscType?: OscillatorType;
}

const SRC_OPTIONS: SrcOption[] = [
  { id: 'sine',      label: 'SINE',   desc: '440Hz · pure',    freq: 440,    oscType: 'sine' },
  { id: 'bass',      label: 'BASS',   desc: '110Hz · sub',     freq: 110,    oscType: 'sine' },
  { id: 'square',    label: 'SQUARE', desc: '440Hz · bright',  freq: 440,    oscType: 'square' },
  { id: 'sawtooth',  label: 'SAW',    desc: '440Hz · full',    freq: 440,    oscType: 'sawtooth' },
  { id: 'triangle',  label: 'TRI',    desc: '440Hz · mellow',  freq: 440,    oscType: 'triangle' },
  { id: 'chord',     label: 'CHORD',  desc: 'Cmaj · complex',  freq: 261.63 },
];

// ── Waveshaper curve generators ────────────────────────────────────────────────
const CURVE_SIZE = 512;

function makeShaperCurve(type: SatType, driveDb: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(CURVE_SIZE);
  const d = 1 + Math.pow(10, driveDb / 20) * 2;

  for (let i = 0; i < CURVE_SIZE; i++) {
    const x = (i * 2) / (CURVE_SIZE - 1) - 1;

    switch (type) {
      case 'tape': {
        const k = 0.15;
        const driven = d * (x + k * x * x);
        const norm   = Math.tanh(d * (1 + k));
        curve[i] = norm > 0 ? Math.tanh(driven) / norm : 0;
        break;
      }
      case 'tube': {
        const dk = d * x;
        const out = x >= 0
          ? 1 - Math.exp(-dk)
          : -(1 - Math.exp(dk * 0.6));
        const peak = 1 - Math.exp(-d);
        curve[i] = peak > 0 ? out / peak : out;
        break;
      }
      case 'transistor': {
        const y = d * x;
        curve[i] = Math.abs(y) <= 1
          ? y * (1 - (y * y) / 3) * 1.5
          : Math.sign(y);
        break;
      }
      case 'digital': {
        curve[i] = Math.max(-1, Math.min(1, d * x));
        break;
      }
    }
  }
  return curve;
}

// ── Harmonic DFT ──────────────────────────────────────────────────────────────
function computeHarmonics(type: SatType, driveDb: number): number[] {
  const curve = makeShaperCurve(type, driveDb);
  const N = 1024;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x   = Math.sin((2 * Math.PI * i) / N);
    const idx = Math.round(((x + 1) / 2) * (CURVE_SIZE - 1));
    out[i] = curve[Math.max(0, Math.min(CURVE_SIZE - 1, idx))];
  }
  const amps: number[] = [];
  for (let h = 1; h <= 7; h++) {
    let re = 0, im = 0;
    for (let i = 0; i < N; i++) {
      const angle = (2 * Math.PI * h * i) / N;
      re += out[i] * Math.cos(angle);
      im += out[i] * Math.sin(angle);
    }
    amps.push((Math.sqrt(re * re + im * im) * 2) / N);
  }
  const f0 = amps[0];
  return amps.map(a => (f0 > 0 ? (a / f0) * 100 : 0));
}

// ── Mathematical waveform for static preview ───────────────────────────────────
function computeSourceSample(srcType: SrcType, t: number): number {
  switch (srcType) {
    case 'sine':
    case 'bass':     return Math.sin(t);
    case 'square':   return Math.sign(Math.sin(t));
    case 'sawtooth': {
      const p = ((t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return p / Math.PI - 1;
    }
    case 'triangle': return (2 / Math.PI) * Math.asin(Math.sin(t));
    case 'chord':    return (
      Math.sin(t) * 0.5 +
      Math.sin(t * 329.63 / 261.63) * 0.35 +
      Math.sin(t * 392.00 / 261.63) * 0.25
    ) * 0.78;
    default: return Math.sin(t);
  }
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

// ── Canvas: transfer curve ─────────────────────────────────────────────────────
function drawTransferCurve(canvas: HTMLCanvasElement, type: SatType, driveDb: number) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;

  ctx.fillStyle = '#0D0D0F';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const gx = (g / 4) * W, gy = (g / 4) * H;
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }

  ctx.strokeStyle = '#2E2E3D'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(W, 0); ctx.stroke();
  ctx.setLineDash([]);

  const curve = makeShaperCurve(type, driveDb);

  ctx.strokeStyle = 'rgba(255,122,69,0.06)'; ctx.lineWidth = 12;
  ctx.beginPath();
  for (let px = 0; px < W; px++) {
    const x   = (px / (W - 1)) * 2 - 1;
    const idx = Math.max(0, Math.min(CURVE_SIZE - 1, Math.round(((x + 1) / 2) * (CURVE_SIZE - 1))));
    const cy  = H / 2 - curve[idx] * H * 0.46;
    px === 0 ? ctx.moveTo(px, cy) : ctx.lineTo(px, cy);
  }
  ctx.stroke();

  ctx.strokeStyle = '#FF7A45'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let px = 0; px < W; px++) {
    const x   = (px / (W - 1)) * 2 - 1;
    const idx = Math.max(0, Math.min(CURVE_SIZE - 1, Math.round(((x + 1) / 2) * (CURVE_SIZE - 1))));
    const cy  = H / 2 - curve[idx] * H * 0.46;
    px === 0 ? ctx.moveTo(px, cy) : ctx.lineTo(px, cy);
  }
  ctx.stroke();

  ctx.fillStyle = '#8A8A9A'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('INPUT →', W - 62, H - 6);
  ctx.save(); ctx.translate(12, H * 0.42); ctx.rotate(-Math.PI / 2);
  ctx.fillText('↑ OUTPUT', 0, 0); ctx.restore();
}

// ── Canvas: static oscilloscope (math preview when paused) ────────────────────
function drawStaticOscilloscope(
  canvas: HTMLCanvasElement,
  mode: 'dry' | 'sat',
  srcType: SrcType,
  satType: SatType,
  driveDb: number,
) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;

  ctx.fillStyle = '#0D0D0F';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  [H / 4, H / 2, H * 3 / 4].forEach(y => {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  });

  const shaper = mode === 'sat' ? makeShaperCurve(satType, driveDb) : null;
  const color  = mode === 'dry' ? '#4D9EFF' : '#FF7A45';
  const glow   = mode === 'dry' ? 'rgba(77,158,255,0.09)' : 'rgba(255,122,69,0.09)';
  const cycles = 3;

  const drawLine = (lw: number, stroke: string) => {
    ctx.strokeStyle = stroke; ctx.lineWidth = lw;
    ctx.beginPath();
    for (let px = 0; px < W; px++) {
      const t   = (px / W) * cycles * 2 * Math.PI;
      let   y   = computeSourceSample(srcType, t);
      if (shaper) {
        const idx = Math.max(0, Math.min(CURVE_SIZE - 1, Math.round(((y + 1) / 2) * (CURVE_SIZE - 1))));
        y = shaper[idx];
      }
      const cy = H / 2 - y * H * 0.42;
      px === 0 ? ctx.moveTo(0, cy) : ctx.lineTo(px, cy);
    }
    ctx.stroke();
  };

  drawLine(8, glow);
  drawLine(2, color);

  ctx.font = 'bold 10px "JetBrains Mono", monospace'; ctx.fillStyle = color;
  ctx.fillText(mode === 'dry' ? 'DRY' : 'SATURATED', 8, 14);

  ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = '#8A8A9A';
  ctx.fillText(
    mode === 'dry'
      ? 'original signal — before the waveshaper'
      : `${satType} waveshaper output`,
    8, H - 6,
  );

  ctx.fillStyle = '#7A7A8A'; ctx.font = '9px "JetBrains Mono", monospace';
  ctx.fillText('◉ PREVIEW', W - 76, 12);
}

// ── Canvas: live oscilloscope (AnalyserNode data, shown while playing) ─────────
function drawLiveOscilloscope(
  canvas: HTMLCanvasElement,
  data: Float32Array,
  windowLen: number,
  mode: 'dry' | 'sat',
  satType: SatType,
) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;

  ctx.fillStyle = '#0D0D0F';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  [H / 4, H / 2, H * 3 / 4].forEach(y => {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  });

  // Zero-crossing trigger: stable picture
  let trigIdx = 0;
  const maxSearch = Math.min(data.length - windowLen, Math.floor(data.length * 0.5));
  for (let i = 1; i < maxSearch; i++) {
    if (data[i - 1] < 0 && data[i] >= 0) { trigIdx = i; break; }
  }

  const color = mode === 'dry' ? '#4D9EFF' : '#FF7A45';
  const glow  = mode === 'dry' ? 'rgba(77,158,255,0.08)' : 'rgba(255,122,69,0.08)';

  const drawLine = (lw: number, stroke: string) => {
    ctx.strokeStyle = stroke; ctx.lineWidth = lw;
    ctx.beginPath();
    for (let px = 0; px < W; px++) {
      const idx = trigIdx + Math.floor((px / W) * windowLen);
      const v   = idx < data.length ? data[idx] : 0;
      const cy  = H / 2 - v * H * 0.42;
      px === 0 ? ctx.moveTo(0, cy) : ctx.lineTo(px, cy);
    }
    ctx.stroke();
  };

  drawLine(8, glow);
  drawLine(2, color);

  ctx.font = 'bold 10px "JetBrains Mono", monospace'; ctx.fillStyle = color;
  ctx.fillText(mode === 'dry' ? 'DRY' : 'SATURATED', 8, 14);

  ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = '#8A8A9A';
  ctx.fillText(
    mode === 'dry'
      ? 'original — pre-shaper input'
      : `${satType} waveshaper output`,
    8, H - 6,
  );

  ctx.fillStyle = '#00FF87'; ctx.font = '9px "JetBrains Mono", monospace';
  ctx.fillText('● LIVE', W - 44, 12);
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

// Find the window of real buffer samples with the most energy, so the static
// preview (drawn when paused) shows something audible rather than silence.
function pickPreviewWindow(data: Float32Array, windowLen: number): number {
  const candidates = 12;
  const span = Math.max(1, data.length - windowLen);
  const step = Math.max(1, Math.floor(span / candidates));
  let bestStart = 0, bestEnergy = -1;
  for (let start = 0; start + windowLen <= data.length; start += step) {
    let sum = 0;
    for (let i = 0; i < windowLen; i += 4) sum += data[start + i] * data[start + i];
    if (sum > bestEnergy) { bestEnergy = sum; bestStart = start; }
  }
  return bestStart;
}

// ── Canvas: static preview for uploaded audio (real buffer samples run
// through the pure waveshaper function — no audio graph needed while paused) ──
function drawStaticBufferPreview(
  canvas: HTMLCanvasElement,
  mode: 'dry' | 'sat',
  buffer: AudioBuffer,
  satType: SatType,
  driveDb: number,
) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;

  ctx.fillStyle = '#0D0D0F';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  [H / 4, H / 2, H * 3 / 4].forEach(y => {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  });

  const data      = buffer.getChannelData(0);
  const windowLen = Math.min(data.length, Math.max(1, Math.round(buffer.sampleRate * 0.03))); // ~30ms
  const startIdx  = pickPreviewWindow(data, windowLen);
  const shaper    = mode === 'sat' ? makeShaperCurve(satType, driveDb) : null;
  const color     = mode === 'dry' ? '#4D9EFF' : '#FF7A45';
  const glow      = mode === 'dry' ? 'rgba(77,158,255,0.09)' : 'rgba(255,122,69,0.09)';

  const drawLine = (lw: number, stroke: string) => {
    ctx.strokeStyle = stroke; ctx.lineWidth = lw;
    ctx.beginPath();
    for (let px = 0; px < W; px++) {
      const idx = startIdx + Math.floor((px / W) * windowLen);
      let y = idx < data.length ? data[idx] : 0;
      if (shaper) {
        const sIdx = Math.max(0, Math.min(CURVE_SIZE - 1, Math.round(((y + 1) / 2) * (CURVE_SIZE - 1))));
        y = shaper[sIdx];
      }
      const cy = H / 2 - y * H * 0.42;
      px === 0 ? ctx.moveTo(0, cy) : ctx.lineTo(px, cy);
    }
    ctx.stroke();
  };

  drawLine(8, glow);
  drawLine(2, color);

  ctx.font = 'bold 10px "JetBrains Mono", monospace'; ctx.fillStyle = color;
  ctx.fillText(mode === 'dry' ? 'DRY' : 'SATURATED', 8, 14);

  ctx.font = '10px "JetBrains Mono", monospace'; ctx.fillStyle = '#8A8A9A';
  ctx.fillText(
    mode === 'dry'
      ? 'your uploaded audio — before the waveshaper'
      : `${satType} waveshaper output`,
    8, H - 6,
  );

  ctx.fillStyle = '#7A7A8A'; ctx.font = '9px "JetBrains Mono", monospace';
  ctx.fillText('◉ PREVIEW', W - 76, 12);
}

// ── Knob rotation helper ───────────────────────────────────────────────────────
function knobDeg(value: number, min: number, max: number): number {
  return -135 + ((value - min) / (max - min)) * 270;
}

// ── Audio source builder ───────────────────────────────────────────────────────
// srcSel is either a built-in SrcType, or the numeric id of an uploaded track.
function buildSource(
  ac: AudioContext,
  srcSel: SrcType | number,
  uploadedTracks: UploadedTrack[],
): { output: AudioNode; nodes: AudioNode[] } {
  const nodes: AudioNode[] = [];

  if (typeof srcSel === 'number') {
    const track = uploadedTracks.find(t => t.id === srcSel);
    if (track) {
      const bufSrc = ac.createBufferSource();
      bufSrc.buffer = track.buffer;
      bufSrc.loop   = true;
      bufSrc.start();
      nodes.push(bufSrc);
      return { output: bufSrc, nodes };
    }
  }

  const srcType: SrcType = typeof srcSel === 'number' ? 'sine' : srcSel; // fallback if track missing

  if (srcType === 'chord') {
    const freqs  = [261.63, 329.63, 392.00]; // C4, E4, G4
    const merger = ac.createGain();
    merger.gain.value = 0.38;
    nodes.push(merger);
    freqs.forEach(f => {
      const o = ac.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(merger); o.start();
      nodes.push(o);
    });
    return { output: merger, nodes };
  }

  const opt = SRC_OPTIONS.find(o => o.id === srcType)!;
  const osc = ac.createOscillator();
  osc.type            = opt.oscType ?? 'sine';
  osc.frequency.value = opt.freq;
  osc.start();
  nodes.push(osc);
  return { output: osc, nodes };
}

// Renders an uploaded track through the same waveshaper/tone/mix chain used
// live (an OfflineAudioContext instead of a live one), so it can be exported
// as a WAV — mirrors the graph built in startAudio() but with no analysers.
async function renderSaturatorOffline(
  source: AudioBuffer,
  satType: SatType,
  drive: number,
  tone: number,
  mix: number,
): Promise<AudioBuffer> {
  const offlineCtx = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate);

  const bufSrc = offlineCtx.createBufferSource();
  bufSrc.buffer = source;

  const shaper = offlineCtx.createWaveShaper();
  shaper.curve      = makeShaperCurve(satType, drive);
  shaper.oversample = '4x';

  const toneFilter = offlineCtx.createBiquadFilter();
  toneFilter.type            = 'peaking';
  toneFilter.frequency.value = 3000;
  toneFilter.Q.value         = 0.7;
  toneFilter.gain.value      = (tone - 50) / 50 * 6;

  const wetGain = offlineCtx.createGain(); wetGain.gain.value = mix / 100;
  const dryGain = offlineCtx.createGain(); dryGain.gain.value = 1 - mix / 100;

  bufSrc.connect(shaper);
  shaper.connect(toneFilter);
  toneFilter.connect(wetGain);
  wetGain.connect(offlineCtx.destination);

  bufSrc.connect(dryGain);
  dryGain.connect(offlineCtx.destination);

  bufSrc.start();
  return offlineCtx.startRendering();
}

function stopSourceNodes(nodes: AudioNode[]) {
  for (const node of nodes) {
    if (node instanceof OscillatorNode || node instanceof AudioBufferSourceNode) {
      try { node.stop(); } catch { /* ok */ }
    }
    try { node.disconnect(); } catch { /* ok */ }
  }
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function Chapter7() {
  const [satType,   setSatType]   = useState<SatType>('tape');
  // srcType is either a built-in oscillator/chord id, or the numeric id of
  // an uploaded track — selected the same way, through handleSrcChange.
  const [srcType,   setSrcType]   = useState<SrcType | number>('sine');
  const [drive,     setDrive]     = useState(6.2);
  const [tone,      setTone]      = useState(50);
  const [mix,       setMix]       = useState(60);
  const [isPlaying, setIsPlaying] = useState(false);

  // ── Uploaded audio — any number of tracks, each selectable like a source ──
  const [uploadedTracks, setUploadedTracks] = useState<UploadedTrack[]>([]);
  const [decoding,       setDecoding]       = useState(false);
  const [uploadError,    setUploadError]    = useState('');
  const [downloading,    setDownloading]    = useState(false);
  const [downloadError,  setDownloadError]  = useState('');
  const fileInputRef      = useRef<HTMLInputElement>(null);
  const uploadIdSeqRef    = useRef(0);
  const uploadedTracksRef = useRef(uploadedTracks);
  useEffect(() => { uploadedTracksRef.current = uploadedTracks; }, [uploadedTracks]);
  const activeTrack = typeof srcType === 'number' ? uploadedTracks.find(t => t.id === srcType) : undefined;

  const [inputLevel,  setInputLevel]  = useState(0.70);
  const [outputLevel, setOutputLevel] = useState(0.85);
  const [harmonics,   setHarmonics]   = useState<number[]>(() => computeHarmonics('tape', 6.2));

  const [taskDriveOk,    setTaskDriveOk]    = useState(false);
  const [taskIdentified, setTaskIdentified] = useState(false);

  // ── Audio refs ─────────────────────────────────────────────────────────────
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const sourceNodesRef  = useRef<AudioNode[]>([]);
  const shaperRef       = useRef<WaveShaperNode | null>(null);
  const toneFilterRef   = useRef<BiquadFilterNode | null>(null);
  const wetGainRef      = useRef<GainNode | null>(null);
  const dryGainRef      = useRef<GainNode | null>(null);
  const inAnalyserRef   = useRef<AnalyserNode | null>(null);
  const outAnalyserRef  = useRef<AnalyserNode | null>(null);
  const animRef         = useRef<number>(0);
  const isPlayingRef    = useRef(false);

  // ── Canvas refs ────────────────────────────────────────────────────────────
  const transferRef = useRef<HTMLCanvasElement>(null);
  const dryWaveRef  = useRef<HTMLCanvasElement>(null);
  const satWaveRef  = useRef<HTMLCanvasElement>(null);

  // Stable params ref (read inside callbacks to avoid stale closures)
  const paramsRef = useRef({ satType, srcType, drive, tone, mix });
  useEffect(() => {
    paramsRef.current = { satType, srcType, drive, tone, mix };
  }, [satType, srcType, drive, tone, mix]);

  // ── Harmonic recompute ─────────────────────────────────────────────────────
  useEffect(() => { setHarmonics(computeHarmonics(satType, drive)); }, [satType, drive]);

  // ── Task tracking ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (satType !== 'digital' && drive <= 9) setTaskDriveOk(true);
  }, [drive, satType]);

  // Static-preview dispatcher: real buffer samples for an uploaded track,
  // the original math-based oscilloscope otherwise.
  const drawPreview = useCallback((
    canvas: HTMLCanvasElement | null,
    mode: 'dry' | 'sat',
    srcSel: SrcType | number,
    sat: SatType,
    driveDb: number,
  ) => {
    if (!canvas) return;
    if (typeof srcSel === 'number') {
      const track = uploadedTracksRef.current.find(t => t.id === srcSel);
      if (track) { drawStaticBufferPreview(canvas, mode, track.buffer, sat, driveDb); return; }
    }
    drawStaticOscilloscope(canvas, mode, srcSel as SrcType, sat, driveDb);
  }, []);

  // ── Canvas redraws ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (transferRef.current) drawTransferCurve(transferRef.current, satType, drive);
    // Only update waveforms with static preview when not playing
    if (!isPlayingRef.current) {
      drawPreview(dryWaveRef.current, 'dry', srcType, satType, drive);
      drawPreview(satWaveRef.current, 'sat', srcType, satType, drive);
    }
  }, [satType, srcType, drive, drawPreview, uploadedTracks]);

  // ── Live param updates (no graph rebuild) ──────────────────────────────────
  useEffect(() => {
    if (shaperRef.current) shaperRef.current.curve = makeShaperCurve(satType, drive);
  }, [satType, drive]);

  useEffect(() => {
    const filter = toneFilterRef.current, ac = audioCtxRef.current;
    if (!filter || !ac) return;
    filter.gain.setTargetAtTime((tone - 50) / 50 * 6, ac.currentTime, 0.01);
  }, [tone]);

  useEffect(() => {
    const wet = wetGainRef.current, dry = dryGainRef.current, ac = audioCtxRef.current;
    if (!wet || !dry || !ac) return;
    const w = mix / 100;
    wet.gain.setTargetAtTime(w,     ac.currentTime, 0.01);
    dry.gain.setTargetAtTime(1 - w, ac.currentTime, 0.01);
  }, [mix]);

  // ── Animation loop: level meters + live oscilloscopes ─────────────────────
  const animLoop = useCallback(() => {
    const inAn  = inAnalyserRef.current;
    const outAn = outAnalyserRef.current;

    if (inAn && outAn) {
      // RMS level meters
      const rms = (an: AnalyserNode) => {
        const td = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(td);
        let sum = 0; for (const v of td) sum += v * v;
        return Math.min(1, Math.sqrt(sum / td.length) * 5);
      };
      setInputLevel(rms(inAn));
      setOutputLevel(rms(outAn));

      // Oscilloscope window: ~3 cycles of fundamental (uploaded audio has no
      // single fundamental, so fall back to a generic musical frequency —
      // the zero-crossing trigger in drawLiveOscilloscope still stabilises it)
      const { srcType: st, satType: sat } = paramsRef.current;
      const uploadedFreq = typeof st === 'number' ? 220 : undefined;
      const freq       = uploadedFreq ?? SRC_OPTIONS.find(o => o.id === st)!.freq;
      const sampleRate = audioCtxRef.current?.sampleRate ?? 44100;
      const windowLen  = Math.min(Math.round((sampleRate / freq) * 3), inAn.fftSize);

      const inData  = new Float32Array(inAn.fftSize);
      const outData = new Float32Array(outAn.fftSize);
      inAn.getFloatTimeDomainData(inData);
      outAn.getFloatTimeDomainData(outData);

      if (dryWaveRef.current) drawLiveOscilloscope(dryWaveRef.current, inData,  windowLen, 'dry', sat);
      if (satWaveRef.current) drawLiveOscilloscope(satWaveRef.current, outData, windowLen, 'sat', sat);
    }

    animRef.current = requestAnimationFrame(animLoop);
  }, []);

  // ── Start audio ────────────────────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ac = audioCtxRef.current;
    if (ac.state === 'suspended') await ac.resume();

    const { satType, srcType, drive, tone, mix } = paramsRef.current;

    const { output: srcOut, nodes: srcNodes } = buildSource(ac, srcType, uploadedTracksRef.current);
    sourceNodesRef.current = srcNodes;

    const shaper = ac.createWaveShaper();
    shaper.curve      = makeShaperCurve(satType, drive);
    shaper.oversample = '4x';

    const toneFilter = ac.createBiquadFilter();
    toneFilter.type            = 'peaking';
    toneFilter.frequency.value = 3000;
    toneFilter.Q.value         = 0.7;
    toneFilter.gain.value      = (tone - 50) / 50 * 6;

    const wetGain = ac.createGain(); wetGain.gain.value = mix / 100;
    const dryGain = ac.createGain(); dryGain.gain.value = 1 - mix / 100;

    // Two analysers: pre-shaper (dry) and post-shaper (sat)
    const inAnalyser = ac.createAnalyser();
    inAnalyser.fftSize               = 2048;
    inAnalyser.smoothingTimeConstant = 0.1;

    const outAnalyser = ac.createAnalyser();
    outAnalyser.fftSize               = 2048;
    outAnalyser.smoothingTimeConstant = 0.1;

    // Graph:
    // src → inAnalyser → shaper → toneFilter → outAnalyser → wetGain → dest
    //     ↘ dryGain → dest   (dry bypass path)
    srcOut.connect(inAnalyser);
    inAnalyser.connect(shaper);
    shaper.connect(toneFilter);
    toneFilter.connect(outAnalyser);
    outAnalyser.connect(wetGain);
    wetGain.connect(ac.destination);

    srcOut.connect(dryGain);
    dryGain.connect(ac.destination);

    shaperRef.current      = shaper;
    toneFilterRef.current  = toneFilter;
    wetGainRef.current     = wetGain;
    dryGainRef.current     = dryGain;
    inAnalyserRef.current  = inAnalyser;
    outAnalyserRef.current = outAnalyser;

    isPlayingRef.current = true;
    setIsPlaying(true);
    animRef.current = requestAnimationFrame(animLoop);
  }, [animLoop]);

  // ── Stop audio ─────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    cancelAnimationFrame(animRef.current);

    stopSourceNodes(sourceNodesRef.current);
    sourceNodesRef.current = [];

    for (const ref of [
      shaperRef, toneFilterRef,
      wetGainRef, dryGainRef, inAnalyserRef, outAnalyserRef,
    ] as React.MutableRefObject<AudioNode | null>[]) {
      try { ref.current?.disconnect(); } catch { /* ok */ }
      ref.current = null;
    }

    isPlayingRef.current = false;
    setIsPlaying(false);
    setInputLevel(0.70);
    setOutputLevel(0.85);

    // Restore static previews
    const { srcType, satType, drive } = paramsRef.current;
    drawPreview(dryWaveRef.current, 'dry', srcType, satType, drive);
    drawPreview(satWaveRef.current, 'sat', srcType, satType, drive);
  }, [drawPreview]);

  // ── Source change — restart if playing ──────────────────────────────────────
  // newSrc is either a built-in SrcType or the numeric id of an uploaded track.
  const handleSrcChange = useCallback((newSrc: SrcType | number) => {
    const wasPlaying = isPlayingRef.current;
    paramsRef.current = { ...paramsRef.current, srcType: newSrc };
    setSrcType(newSrc);
    if (wasPlaying) {
      stopAudio();
      startAudio();
    }
  }, [stopAudio, startAudio]);

  // ── Upload your own audio ────────────────────────────────────────────────────
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

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

      // Update the ref synchronously (not just the state) so that if audio
      // is already playing, handleSrcChange's immediate restart below can
      // find this track without waiting for the next render's effect sync.
      const nextTracks = [...uploadedTracksRef.current, track];
      uploadedTracksRef.current = nextTracks;
      setUploadedTracks(nextTracks);
      handleSrcChange(track.id);
    } catch (err) {
      console.error('Failed to decode audio file', err);
      setUploadError('Could not read that file — try an mp3, wav, or m4a.');
    } finally {
      tmpCtx?.close();
      setDecoding(false);
    }
  }, [handleSrcChange]);

  // Renders the currently active uploaded track through the saturator (with
  // current drive/tone/mix settings) and downloads it as a WAV — the
  // "download after processing" counterpart to the upload button above.
  const handleDownload = useCallback(async () => {
    const track = activeTrack;
    if (!track) return;
    setDownloadError('');
    setDownloading(true);
    try {
      const rendered = await renderSaturatorOffline(track.buffer, satType, drive, tone, mix);
      downloadAudioBufferAsWav(rendered, `${track.name || 'saturation-lab'}-saturated.wav`);
    } catch (err) {
      console.error('[Chapter7] failed to render audio for download', err);
      setDownloadError('Could not render the audio for download — see console for details.');
    } finally {
      setDownloading(false);
    }
  }, [activeTrack, satType, drive, tone, mix]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    stopAudio();
    setSatType('tape');
    setSrcType('sine');
    setDrive(6.2);
    setTone(50);
    setMix(60);
    setTaskDriveOk(false);
    setTaskIdentified(false);
  }, [stopAudio]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      stopSourceNodes(sourceNodesRef.current);
      audioCtxRef.current?.close();
    };
  }, []);

  // ── Derived display values ─────────────────────────────────────────────────
  const driveDeg   = knobDeg(drive, 0, 12);
  const toneDeg    = knobDeg(tone,  0, 100);
  const mixDeg     = knobDeg(mix,   0, 100);
  const toneLabel  = tone < 33 ? 'DARK' : tone < 66 ? 'WARM' : 'BRIGHT';
  const isEvenType = satType === 'tape' || satType === 'tube';

  const harmonicColor = (idx: number): string => {
    if (idx === 0) return 'var(--text-faint)';
    return (idx + 1) % 2 === 0 ? 'var(--sat)' : 'var(--amber)';
  };
  const harmLabel = (idx: number) => {
    if (idx === 0) return 'F0';
    const n = idx + 1;
    return n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="sat-lab">

      {/* ── Top bar ── */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--sat-dim)', borderColor: 'rgba(255,122,69,0.4)' }}>
            ▲
          </div>
          <div>
            <div className="lab-name">Saturation Lab</div>
            <div className="lab-subtitle">
              HARMONIC DISTORTION{activeTrack ? ` · ${activeTrack.name}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="badge" style={{ background: 'var(--sat-dim)', borderColor: 'rgba(255,122,69,0.3)', color: 'var(--sat)' }}>
            🔥 DRIVE: {drive.toFixed(1)} dB
          </span>
          <div className="lab-status" style={{ color: 'var(--sat)' }}>
            <div className="status-dot" style={{ background: 'var(--sat)', boxShadow: '0 0 6px var(--sat)' }} />
            {isPlaying ? 'ACTIVE' : 'PAUSED'}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="sat-body">

        {/* ── LEFT PANEL ── */}
        <div className="sat-left">

          {/* Saturation type */}
          <div className="canvas-label">SATURATION TYPE</div>
          <div className="sat-type-row">
            {SAT_TYPES.map(({ id, name, desc }) => (
              <div
                key={id}
                className={`sat-type-btn${satType === id ? ' active' : ''}`}
                onClick={() => setSatType(id)}
              >
                <div className="sat-type-name">{name}</div>
                <div className="sat-type-desc">{desc}</div>
              </div>
            ))}
          </div>

          {/* Source audio selector */}
          <div className="canvas-label" style={{ marginTop: '0.85rem' }}>SOURCE AUDIO</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '0.85rem' }}>
            {SRC_OPTIONS.map(({ id, label, desc }) => (
              <div
                key={id}
                onClick={() => handleSrcChange(id)}
                style={{
                  padding: '0.35rem 0.4rem',
                  borderRadius: '4px',
                  border: `1px solid ${srcType === id ? 'rgba(77,158,255,0.55)' : 'var(--border)'}`,
                  background: srcType === id ? 'rgba(77,158,255,0.1)' : 'var(--surface)',
                  cursor: 'pointer',
                  textAlign: 'center' as const,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.07em',
                  color: srcType === id ? '#4D9EFF' : 'var(--text)',
                }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.57rem', color: 'var(--text-faint)', marginTop: '1px' }}>
                  {desc}
                </div>
              </div>
            ))}
          </div>

          {/* Uploaded audio tracks — any number, selectable like a built-in source */}
          <div className="eq-tabrow" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
            {uploadedTracks.map(track => {
              const active = srcType === track.id;
              return (
                <button
                  key={track.id}
                  onClick={() => handleSrcChange(track.id)}
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
              title="Upload your own audio to run through the saturator"
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
                title="Render the active track through the saturator and download it as a WAV"
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

          {/* Transfer curve */}
          <div className="canvas-label">TRANSFER CURVE — INPUT vs OUTPUT</div>
          <div className="curve-display">
            <canvas
              ref={transferRef}
              width={600} height={360}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          </div>

          {/* Level meters */}
          <div className="sat-input-output">
            <div className="io-meter-block">
              <div className="io-meter-label">INPUT LEVEL</div>
              <div className="io-meter-bar">
                <div className="io-meter-fill" style={{ width: `${(inputLevel * 100).toFixed(1)}%`, background: 'var(--blue)' }} />
              </div>
            </div>
            <div className="io-meter-block">
              <div className="io-meter-label">OUTPUT LEVEL</div>
              <div className="io-meter-bar">
                <div className="io-meter-fill" style={{ width: `${(outputLevel * 100).toFixed(1)}%`, background: 'var(--sat)' }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="sat-right">

          {/* Knobs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <div className="knob-wrap">
              <div className="sat-knob" style={{ '--knob-rot': `${driveDeg.toFixed(1)}deg` } as React.CSSProperties} />
              <div className="knob-name">DRIVE</div>
              <div className="knob-val" style={{ color: 'var(--sat)' }}>{drive.toFixed(1)} dB</div>
              <input type="range" className="param-slider" min={0} max={12} step={0.1} value={drive}
                style={{ marginTop: '0.3rem' }} onChange={e => setDrive(Number(e.target.value))} />
            </div>
            <div className="knob-wrap">
              <div className="sat-knob" style={{ '--knob-rot': `${toneDeg.toFixed(1)}deg` } as React.CSSProperties} />
              <div className="knob-name">TONE</div>
              <div className="knob-val" style={{ color: 'var(--sat)' }}>{toneLabel}</div>
              <input type="range" className="param-slider" min={0} max={100} step={1} value={tone}
                style={{ marginTop: '0.3rem' }} onChange={e => setTone(Number(e.target.value))} />
            </div>
            <div className="knob-wrap">
              <div className="sat-knob" style={{ '--knob-rot': `${mixDeg.toFixed(1)}deg` } as React.CSSProperties} />
              <div className="knob-name">MIX</div>
              <div className="knob-val" style={{ color: 'var(--sat)' }}>{mix.toFixed(0)}%</div>
              <input type="range" className="param-slider" min={0} max={100} step={1} value={mix}
                style={{ marginTop: '0.3rem' }} onChange={e => setMix(Number(e.target.value))} />
            </div>
          </div>

          {/* Harmonic spectrum */}
          <div className="canvas-label" style={{ marginBottom: '0.5rem' }}>HARMONIC SPECTRUM GENERATED</div>
          <div className="harmonics-display">
            <div className="harmonics-bars">
              {harmonics.map((h, i) => (
                <div key={i} className="harmonic-bar-wrap">
                  <div className="harmonic-bar" style={{ height: `${Math.max(2, h).toFixed(1)}%`, background: harmonicColor(i) }} />
                  <div className="harmonic-label">{harmLabel(i)}</div>
                </div>
              ))}
            </div>
            <div className="tip-box" style={{ background: 'rgba(255,122,69,0.08)', borderColor: 'rgba(255,122,69,0.2)', margin: 0 }}>
              <strong style={{ color: 'var(--sat)' }}>Even vs. odd: </strong>
              {isEvenType
                ? 'Tape and tube saturation emphasize even harmonics (2nd, 4th) for warmth — the signature colour of analog circuits.'
                : 'Transistor and digital clipping emphasize odd harmonics (3rd, 5th, 7th) for an edgier, more aggressive tone.'}
            </div>
          </div>

          {/* Waveform comparison */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '1rem 0 0.4rem' }}>
            <div className="canvas-label" style={{ margin: 0 }}>WAVEFORM COMPARISON</div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.65rem', color: 'var(--text-faint)' }}>
              <span><span style={{ color: '#4D9EFF' }}>■</span> DRY = pre-shaper</span>
              <span><span style={{ color: '#FF7A45' }}>■</span> SAT = post-shaper</span>
            </div>
          </div>

          <div className="waveform-compare">
            <div className="compare-row">
              <div className="compare-lbl" style={{ color: '#4D9EFF' }}>DRY</div>
              <div className="mini-wave" style={{ height: 68, borderColor: 'rgba(77,158,255,0.2)', background: '#0D0D0F' }}>
                <canvas ref={dryWaveRef} width={600} height={140}
                  style={{ width: '100%', height: '100%', display: 'block' }} />
              </div>
            </div>
            <div className="compare-row">
              <div className="compare-lbl" style={{ color: 'var(--sat)' }}>SAT</div>
              <div className="mini-wave" style={{ height: 68, borderColor: 'rgba(255,122,69,0.25)', background: '#0D0D0F' }}>
                <canvas ref={satWaveRef} width={600} height={140}
                  style={{ width: '100%', height: '100%', display: 'block' }} />
              </div>
            </div>
          </div>

          <div style={{
            marginTop: '0.5rem',
            padding: '0.45rem 0.65rem',
            background: 'rgba(255,122,69,0.05)',
            border: '1px solid rgba(255,122,69,0.12)',
            borderRadius: '4px',
            fontSize: '0.7rem',
            color: 'var(--text-faint)',
            lineHeight: 1.5,
          }}>
            Hit <strong style={{ color: 'var(--text)' }}>▶ Play</strong> to see live waveforms.
            Try <strong style={{ color: 'var(--text)' }}>SAW</strong> or{' '}
            <strong style={{ color: 'var(--text)' }}>SQUARE</strong> — they already have harmonics,
            so saturation stacks on top. <strong style={{ color: 'var(--text)' }}>CHORD</strong> simulates
            a real-world complex signal. <strong style={{ color: 'var(--text)' }}>BASS</strong> shows
            low-frequency waveshaping most clearly.
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="lab-footer">
        <div className="task-list" style={{ flexDirection: 'row', gap: '1rem' }}>
          <div className="task-item">
            <div className={`task-check${satType === 'tape' ? ' done' : ''}`}>{satType === 'tape' ? '✓' : ''}</div>
            Select TAPE saturation
          </div>
          <div className="task-item">
            <div className={`task-check${taskDriveOk ? ' done' : ''}`}>{taskDriveOk ? '✓' : ''}</div>
            Drive without harsh clipping
          </div>
          <div className="task-item">
            <div
              className={`task-check${taskIdentified ? ' done' : ''}`}
              style={{ cursor: 'pointer' }} title="Click to mark complete"
              onClick={() => setTaskIdentified(true)}
            >
              {taskIdentified ? '✓' : ''}
            </div>
            Identify even vs odd harmonics
          </div>
        </div>
        <div className="btn-row">
          <button className="btn-secondary" onClick={handleReset}>Reset</button>
          <button className="btn-primary" onClick={isPlaying ? stopAudio : startAudio}>
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
        </div>
      </div>
    </div>
  );
}
