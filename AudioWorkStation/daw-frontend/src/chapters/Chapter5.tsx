import { useRef, useState, useEffect, useCallback } from 'react';
import { Knob } from '../components/Knob';

// ── Types ──────────────────────────────────────────────────────────────────────
interface SoundSource {
  id:        string;
  name:      string;
  emoji:     string;
  color:     string;   // CSS hex
  colorRgb:  string;   // "R,G,B"
  azimuth:   number;   // degrees: −180 to 180 (0=front, −90=left, +90=right)
  elevation: number;   // degrees: −90 to 90
  distance:  number;   // metres: 0.5 to 20
  muted:     boolean;
}

interface ReverbParams {
  roomSize: number;   // 0–100
  decay:    number;   // RT60 in seconds (0.1–4)
  preDelay: number;   // ms (0–100)
  wetDry:   number;   // % (0–100)
}

// ── Initial state ──────────────────────────────────────────────────────────────
const INITIAL_SOURCES: SoundSource[] = [
  { id: 'guitar', name: 'GUITAR', emoji: '🎸', color: '#F5A623', colorRgb: '245,166,35',  azimuth: -45, elevation: 0, distance: 3,   muted: false },
  { id: 'keys',   name: 'KEYS',   emoji: '🎹', color: '#00FF87', colorRgb: '0,255,135',   azimuth:  30, elevation: 0, distance: 2,   muted: false },
  { id: 'drums',  name: 'DRUMS',  emoji: '🥁', color: '#FF4D6A', colorRgb: '255,77,106',  azimuth: -90, elevation: 0, distance: 4,   muted: false },
  { id: 'vocals', name: 'VOCALS', emoji: '🎤', color: '#A78BFA', colorRgb: '167,139,250', azimuth:  85, elevation: 0, distance: 3.5, muted: false },
];

const REVERB_DEFAULTS: ReverbParams = {
  roomSize: 45,
  decay:    1.8,
  preDelay: 24,
  wetDry:   40,
};

// ── Coordinate helpers ─────────────────────────────────────────────────────────
// Web Audio: +x right, +y up, −z forward
function toXYZ(az: number, el: number, dist: number) {
  const azR = (az * Math.PI) / 180;
  const elR = (el * Math.PI) / 180;
  const cosEl = Math.cos(elR);
  return {
    x:  dist * cosEl * Math.sin(azR),
    y:  dist * Math.sin(elR),
    z: -dist * cosEl * Math.cos(azR),
  };
}

// Stage view: front = top (−y screen), right = +x screen
// ICON_FRAC: fraction of container width for stage radius at MAX_DIST_M metres
const MAX_DIST_M = 10;
const ICON_FRAC  = 0.42;  // 0..0.5 of half-container

function toStagePercent(az: number, dist: number) {
  const azR  = (az * Math.PI) / 180;
  const normR = (Math.min(dist, MAX_DIST_M) / MAX_DIST_M) * ICON_FRAC;
  return {
    topPct:  (0.5 - normR * Math.cos(azR)) * 100,
    leftPct: (0.5 + normR * Math.sin(azR)) * 100,
    normR,
    angleDeg: az,
  };
}

function fromContainerXY(px: number, py: number, w: number, h: number) {
  const cx = w / 2, cy = h / 2;
  const dx = px - cx, dy = -(py - cy);    // invert y (up = front)
  const azimuth  = Math.round((Math.atan2(dx, dy) * 180) / Math.PI);
  const pixelR   = Math.sqrt(dx * dx + dy * dy);
  const maxR     = Math.min(w, h) / 2 * ICON_FRAC;
  const distance = parseFloat(Math.min(20, Math.max(0.5, (pixelR / maxR) * MAX_DIST_M)).toFixed(1));
  return { azimuth, distance };
}

// ── HiDPI canvas helper ────────────────────────────────────────────────────────
function hiDpi(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.clientWidth  || 200;
  const H   = canvas.clientHeight || 36;
  const tw  = Math.round(W * dpr), th = Math.round(H * dpr);
  if (canvas.width !== tw || canvas.height !== th) {
    canvas.width = tw; canvas.height = th;
  }
  const ctx2 = canvas.getContext('2d');
  if (!ctx2) return null;
  ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: ctx2, W, H };
}

function drawEarWave(canvas: HTMLCanvasElement, data: Float32Array, color: string, alpha = 1) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;
  ctx.fillStyle = '#22222E'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * W;
    const y = ((1 - data[i]) / 2) * H;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Draw idle static sine when not playing
function drawIdleWave(canvas: HTMLCanvasElement, color: string, amp = 1) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;
  ctx.fillStyle = '#22222E'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.35 * amp + 0.05;
  ctx.beginPath();
  for (let i = 0; i <= W; i++) {
    const x = i;
    const y = H / 2 + Math.sin((i / W) * Math.PI * 6) * (H / 2 - 4) * amp;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ── Audio synthesis functions ──────────────────────────────────────────────────
function noiseBuffer(ctx: AudioContext, dur: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function synthGuitar(ctx: AudioContext, dest: AudioNode, t: number) {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.type = 'triangle'; osc.frequency.value = 220;
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
  osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + 1.1);
}

function synthKeys(ctx: AudioContext, dest: AudioNode, t: number) {
  const freqs = [261.63, 329.63, 392.0];
  freqs.forEach(f => {
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = f;
    g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + 0.9);
  });
}

function synthDrums(ctx: AudioContext, dest: AudioNode, t: number) {
  // Kick
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.07);
  g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + 0.4);
  // Snare body
  const body = ctx.createOscillator(); const bg = ctx.createGain();
  body.type = 'sine'; body.frequency.value = 200;
  bg.gain.setValueAtTime(0, t + 0.5); bg.gain.setValueAtTime(0.4, t + 0.5);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  body.connect(bg); bg.connect(dest); body.start(t + 0.5); body.stop(t + 0.7);
  // Snare noise
  const nb = ctx.createBufferSource(); nb.buffer = noiseBuffer(ctx, 0.15);
  const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 2200; filt.Q.value = 0.8;
  const ng   = ctx.createGain(); ng.gain.setValueAtTime(0, t + 0.5); ng.gain.setValueAtTime(0.5, t + 0.5);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  nb.connect(filt); filt.connect(ng); ng.connect(dest); nb.start(t + 0.5); nb.stop(t + 0.7);
}

function synthVocals(ctx: AudioContext, dest: AudioNode, t: number) {
  const osc  = ctx.createOscillator();
  const lfo  = ctx.createOscillator(); const lfoG = ctx.createGain();
  const g    = ctx.createGain();
  osc.type = 'sine'; osc.frequency.value = 440;
  lfo.type = 'sine'; lfo.frequency.value = 5; lfoG.gain.value = 6;
  lfo.connect(lfoG); lfoG.connect(osc.frequency);
  g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.45, t + 0.05);
  g.gain.setValueAtTime(0.45, t + 0.7); g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  osc.connect(g); g.connect(dest);
  lfo.start(t); osc.start(t); lfo.stop(t + 0.9); osc.stop(t + 0.9);
}

type SynthFn = (ctx: AudioContext, dest: AudioNode, t: number) => void;

const SYNTH_FNS: Record<string, SynthFn> = {
  guitar: synthGuitar,
  keys:   synthKeys,
  drums:  synthDrums,
  vocals: synthVocals,
};

// Beat patterns: which beat index (0-3) each source fires
const PATTERNS: Record<string, number[]> = {
  guitar: [0, 2],
  keys:   [1, 3],
  drums:  [0, 1, 2, 3],
  vocals: [0],
};

const BPM        = 110;
const BEAT_SEC   = 60 / BPM;
const BAR_SEC    = BEAT_SEC * 4;

// ── Component ──────────────────────────────────────────────────────────────────
export default function Chapter5() {
  const [sources,    setSources]    = useState<SoundSource[]>(INITIAL_SOURCES);
  const [selectedId, setSelectedId] = useState<string>('guitar');
  const [reverb,     setReverb]     = useState<ReverbParams>(REVERB_DEFAULTS);
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [tasks,      setTasks]      = useState([false, false, false, false]);

  // ITD/ILD for current selected source
  const [itd, setItd] = useState(0);  // ms, positive = left ear leads
  const [ild, setIld] = useState(0);  // dB for right ear vs left (negative = right quieter)
  const [engineStatus, setEngineStatus] = useState<'idle' | 'loading' | 'ready'>('idle');

  // ── Refs ───────────────────────────────────────────────────────────────────
  const stageRef      = useRef<HTMLDivElement>(null);
  const leftEarRef    = useRef<HTMLCanvasElement>(null);
  const rightEarRef   = useRef<HTMLCanvasElement>(null);
  const stageDragRef  = useRef<{ id: string; rect: DOMRect } | null>(null);

  // Audio
  const ctxRef         = useRef<AudioContext | null>(null);
  const pannersRef     = useRef<Map<string, PannerNode>>(new Map());
  const elevFiltersRef = useRef<Map<string, BiquadFilterNode>>(new Map());
  const reverbNodeRef  = useRef<AudioWorkletNode | null>(null);
  const preDelayRef    = useRef<DelayNode | null>(null);
  const reverbGainRef  = useRef<GainNode | null>(null);
  const dryGainRef     = useRef<GainNode | null>(null);
  const leftAnalRef   = useRef<AnalyserNode | null>(null);
  const rightAnalRef  = useRef<AnalyserNode | null>(null);
  const schedulerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextBarRef    = useRef(0);
  const animRef       = useRef<number>(0);

  // Stable refs for closures
  const sourcesRef    = useRef(sources);
  const selectedIdRef = useRef(selectedId);
  const reverbRef     = useRef(reverb);
  const isPlayingRef  = useRef(isPlaying);

  useEffect(() => { sourcesRef.current = sources; },    [sources]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { reverbRef.current = reverb; },      [reverb]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const selected = sources.find(s => s.id === selectedId) ?? sources[0];

  // ── ITD / ILD readout for selected source ─────────────────────────────────
  useEffect(() => {
    const azR = (selected.azimuth * Math.PI) / 180;
    // Woodworth simplified ITD: head radius 8.75cm
    const itdVal = -(0.0875 / 343) * Math.sin(azR) * 1000;
    // Simplified ILD: right ear dB relative to left
    const ildVal = 10 * Math.sin(azR);
    setItd(parseFloat(itdVal.toFixed(2)));
    setIld(parseFloat(ildVal.toFixed(1)));
    // Draw idle ear waveforms when not playing
    if (!isPlayingRef.current) {
      const amp = 1 - Math.abs(azR) * 0.35;
      const rAmp = Math.max(0.15, 1 + Math.sin(azR) * 0.7);
      if (leftEarRef.current)  drawIdleWave(leftEarRef.current,  '#F5A623', Math.min(1, amp));
      if (rightEarRef.current) drawIdleWave(rightEarRef.current, '#F5A623', Math.min(1, rAmp));
    }
  }, [selected.azimuth, selected.id]);

  // ── Panner position sync ───────────────────────────────────────────────────
  useEffect(() => {
    const ctx = ctxRef.current; if (!ctx) return;
    const t   = ctx.currentTime;
    sources.forEach(src => {
      const panner = pannersRef.current.get(src.id); if (!panner) return;
      const { x, y, z } = toXYZ(src.azimuth, src.elevation, src.distance);
      if (panner.positionX) {
        panner.positionX.setTargetAtTime(x, t, 0.02);
        panner.positionY.setTargetAtTime(y, t, 0.02);
        panner.positionZ.setTargetAtTime(z, t, 0.02);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (panner as any).setPosition(x, y, z);
      }
      panner.refDistance = Math.max(1, src.distance * 0.25);
      // Elevation spectral cue: high-shelf gain mimics pinna filtering
      // +90° above → +20 dB treble boost; −90° below → −20 dB cut
      const elevFilter = elevFiltersRef.current.get(src.id);
      if (elevFilter) {
        elevFilter.gain.setTargetAtTime(src.elevation * 0.22, t, 0.05);
      }
    });
  }, [sources]);

  // ── Reverb param sync ──────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = ctxRef.current; if (!ctx) return;
    const t = ctx.currentTime;
    // Pre-delay
    if (preDelayRef.current)
      preDelayRef.current.delayTime.setTargetAtTime(reverb.preDelay / 1000, t, 0.01);
    // Freeverb params via worklet message port
    const node = reverbNodeRef.current;
    if (node) {
      node.port.postMessage({ type: 'set_size',      value: reverb.roomSize / 100 });
      node.port.postMessage({ type: 'set_decay',     value: Math.max(0, Math.min(1, (reverb.decay - 0.1) / 3.9)) });
      node.port.postMessage({ type: 'set_damping',   value: 0.3 }); // neutral damping
      node.port.postMessage({ type: 'set_diffusion', value: reverb.roomSize / 100 });
    }
    reverbGainRef.current?.gain.setTargetAtTime(reverb.wetDry / 100,       t, 0.05);
    dryGainRef.current?.gain.setTargetAtTime(1 - reverb.wetDry / 100, t, 0.05);
  }, [reverb]);

  // ── Task tracking ──────────────────────────────────────────────────────────
  useEffect(() => {
    const guitar = sources.find(s => s.id === 'guitar');
    const drums  = sources.find(s => s.id === 'drums');
    setTasks([
      !!guitar && Math.abs(guitar.azimuth - (-45)) <= 10,
      !!drums  && Math.abs(drums.azimuth) >= 120,
      reverb.decay < 2.0,
      Math.abs(itd) >= 0.1,
    ]);
  }, [sources, reverb, itd]);

  // ── Scheduler ─────────────────────────────────────────────────────────────
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current; if (!ctx) return;
    while (nextBarRef.current < ctx.currentTime + 0.25) {
      const barStart = nextBarRef.current;
      Object.entries(PATTERNS).forEach(([id, beats]) => {
        const panner = pannersRef.current.get(id); if (!panner) return;
        const src = sourcesRef.current.find(s => s.id === id);
        if (src?.muted) return;   // skip muted sources
        const fn = SYNTH_FNS[id];
        beats.forEach(beat => fn(ctx, panner, barStart + beat * BEAT_SEC));
      });
      nextBarRef.current = barStart + BAR_SEC;
    }
    schedulerRef.current = setTimeout(runScheduler, 50);
  }, []);

  // ── Animation loop (ear waveforms) ─────────────────────────────────────────
  const animate = useCallback(() => {
    const lA = leftAnalRef.current; const rA = rightAnalRef.current;
    if (lA && leftEarRef.current) {
      const buf = new Float32Array(lA.fftSize); lA.getFloatTimeDomainData(buf);
      drawEarWave(leftEarRef.current, buf, '#F5A623');
    }
    if (rA && rightEarRef.current) {
      const buf = new Float32Array(rA.fftSize); rA.getFloatTimeDomainData(buf);
      // Draw at full opacity — HRTF already encodes ILD, so the actual amplitudes differ
      drawEarWave(rightEarRef.current, buf, '#F5A623', 1);
    }
    animRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Start audio ────────────────────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    const ctx = new AudioContext(); ctxRef.current = ctx;
    const curSources = sourcesRef.current;
    const curReverb  = reverbRef.current;

    const master = ctx.createGain(); master.gain.value = 0.75;
    // Force stereo so ChannelSplitter correctly separates L/R HRTF output
    master.channelCount          = 2;
    master.channelCountMode      = 'explicit';
    master.channelInterpretation = 'speakers';

    // ── Dry path ──────────────────────────────────────────────────────────────
    const dryGain    = ctx.createGain(); dryGain.gain.value    = 1 - curReverb.wetDry / 100;
    const reverbGain = ctx.createGain(); reverbGain.gain.value = curReverb.wetDry / 100;
    dryGainRef.current    = dryGain;
    reverbGainRef.current = reverbGain;
    master.connect(dryGain); dryGain.connect(ctx.destination);

    // ── Freeverb AudioWorklet reverb chain ────────────────────────────────────
    // master → preDelay → reverbNode (Freeverb JS worklet) → reverbGain → destination
    setEngineStatus('loading');
    await ctx.audioWorklet.addModule('/worklets/reverb-processor.js');

    const reverbNode = new AudioWorkletNode(ctx, 'reverb-processor', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
    });
    reverbNode.port.onmessage = (e) => {
      if (e.data.type === 'ready') setEngineStatus('ready');
    };
    // Send initial Freeverb params
    reverbNode.port.postMessage({ type: 'set_size',      value: curReverb.roomSize / 100 });
    reverbNode.port.postMessage({ type: 'set_decay',     value: Math.max(0, Math.min(1, (curReverb.decay - 0.1) / 3.9)) });
    reverbNode.port.postMessage({ type: 'set_damping',   value: 0.3 });
    reverbNode.port.postMessage({ type: 'set_diffusion', value: curReverb.roomSize / 100 });
    reverbNodeRef.current = reverbNode;

    const preDelay = ctx.createDelay(0.2);
    preDelay.delayTime.value = curReverb.preDelay / 1000;
    preDelayRef.current = preDelay;

    master.connect(preDelay);
    preDelay.connect(reverbNode);
    reverbNode.connect(reverbGain);
    reverbGain.connect(ctx.destination);

    // Channel split for L/R ear analysis
    const splitter  = ctx.createChannelSplitter(2);
    const leftAnal  = ctx.createAnalyser(); leftAnal.fftSize  = 512; leftAnal.smoothingTimeConstant  = 0.7;
    const rightAnal = ctx.createAnalyser(); rightAnal.fftSize = 512; rightAnal.smoothingTimeConstant = 0.7;
    leftAnalRef.current  = leftAnal;
    rightAnalRef.current = rightAnal;
    master.connect(splitter);
    splitter.connect(leftAnal,  0);
    splitter.connect(rightAnal, 1);
    // analysers are "dead ends" — no downstream connection needed for analysis

    // Create one HRTF panner per source
    curSources.forEach(src => {
      const panner = ctx.createPanner();
      panner.panningModel  = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance   = Math.max(1, src.distance * 0.25);
      panner.maxDistance   = 20;
      panner.rolloffFactor = 1;
      panner.coneInnerAngle = 360;
      const { x, y, z } = toXYZ(src.azimuth, src.elevation, src.distance);
      if (panner.positionX) {
        panner.positionX.value = x;
        panner.positionY.value = y;
        panner.positionZ.value = z;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (panner as any).setPosition(x, y, z);
      }
      // Elevation spectral cue filter: high-shelf at 5.5 kHz, gain ∝ elevation
      // Simulates pinna HRTF coloration (+20 dB above, −20 dB below at ±90°)
      const elevFilter = ctx.createBiquadFilter();
      elevFilter.type = 'highshelf';
      elevFilter.frequency.value = 5500;
      elevFilter.gain.value = src.elevation * 0.22;
      panner.connect(elevFilter);
      elevFilter.connect(master);
      elevFiltersRef.current.set(src.id, elevFilter);
      pannersRef.current.set(src.id, panner);
    });

    // Listener: at origin, facing front (−z)
    if (ctx.listener.forwardX) {
      ctx.listener.forwardX.value = 0; ctx.listener.forwardY.value = 0; ctx.listener.forwardZ.value = -1;
      ctx.listener.upX.value      = 0; ctx.listener.upY.value      = 1; ctx.listener.upZ.value      =  0;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx.listener as any).setOrientation(0, 0, -1, 0, 1, 0);
    }

    nextBarRef.current = ctx.currentTime + 0.05;
    runScheduler();
    animRef.current = requestAnimationFrame(animate);
    setIsPlaying(true);
  }, [runScheduler, animate]);

  // ── Stop audio ─────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    ctxRef.current?.close();
    ctxRef.current     = null;
    pannersRef.current.clear();
    elevFiltersRef.current.clear();
    reverbNodeRef.current = null; preDelayRef.current   = null;
    reverbGainRef.current = null; dryGainRef.current    = null;
    leftAnalRef.current   = null; rightAnalRef.current  = null;
    setIsPlaying(false);
    setEngineStatus('idle');
    // Redraw idle waves
    const sel = sourcesRef.current.find(s => s.id === selectedIdRef.current) ?? sourcesRef.current[0];
    const azR = (sel.azimuth * Math.PI) / 180;
    if (leftEarRef.current)  drawIdleWave(leftEarRef.current,  '#F5A623', Math.min(1, 1 - Math.abs(azR) * 0.35));
    if (rightEarRef.current) drawIdleWave(rightEarRef.current, '#F5A623', Math.min(1, Math.max(0.15, 1 + Math.sin(azR) * 0.7)));
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    ctxRef.current?.close();
  }, []);

  // ── Source update helper ───────────────────────────────────────────────────
  const updateSource = useCallback((id: string, patch: Partial<SoundSource>) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }, []);

  // ── Stage drag ─────────────────────────────────────────────────────────────
  const onSourceMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setSelectedId(id);
    if (!stageRef.current) return;
    stageDragRef.current = { id, rect: stageRef.current.getBoundingClientRect() };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = stageDragRef.current; if (!d) return;
      const { rect } = d;
      const { azimuth, distance } = fromContainerXY(
        e.clientX - rect.left, e.clientY - rect.top,
        rect.width, rect.height,
      );
      updateSource(d.id, { azimuth, distance });
    };
    const onUp = () => { stageDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [updateSource]);

  // ── Initial ear canvas render ──────────────────────────────────────────────
  useEffect(() => {
    if (leftEarRef.current)  drawIdleWave(leftEarRef.current,  '#F5A623', 0.9);
    if (rightEarRef.current) drawIdleWave(rightEarRef.current, '#F5A623', 0.4);
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const roomSizeName = (v: number) =>
    v < 20 ? 'BOOTH' : v < 40 ? 'STUDIO' : v < 60 ? 'MED HALL' : v < 80 ? 'LARGE HALL' : 'CATHEDRAL';

  const setReverbParam = (key: keyof ReverbParams, value: number) =>
    setReverb(prev => ({ ...prev, [key]: value }));

  const reset = () => {
    setSources(INITIAL_SOURCES);
    setReverb(REVERB_DEFAULTS);
    setSelectedId('guitar');
  };

  const TASK_LABELS = [
    'Place guitar at −45°',
    'Separate drums to rear',
    'Adjust reverb RT60 < 2s',
    'Pass binaural test',
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="spatial-lab">

      {/* ── Top bar ── */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'rgba(77,158,255,0.12)', border: '1px solid rgba(77,158,255,0.4)' }}>⊕</div>
          <div>
            <div className="lab-name">3D Stage Placement</div>
            <div className="lab-subtitle">LAB · CH 05 · SPATIAL AUDIO</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className={`toggle-btn${isPlaying ? ' on' : ''}`}
            style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-dim)' } : {}}
            onClick={isPlaying ? stopAudio : startAudio}
          >
            {isPlaying ? '⏹ STOP' : '▶ AUDITION SCENE'}
          </button>
          <span className="badge" style={{ background: 'rgba(77,158,255,0.12)', borderColor: 'rgba(77,158,255,0.3)', color: 'var(--blue)' }}>◈ HRTF</span>
          <span className="badge" style={{
            background:  engineStatus === 'ready'   ? 'rgba(168,85,247,0.15)'
                       : engineStatus === 'loading' ? 'rgba(245,166,35,0.15)'
                       : 'var(--surface)',
            borderColor: engineStatus === 'ready'   ? 'rgba(168,85,247,0.4)'
                       : engineStatus === 'loading' ? 'rgba(245,166,35,0.4)'
                       : 'var(--border)',
            color:       engineStatus === 'ready'   ? '#A855F7'
                       : engineStatus === 'loading' ? 'var(--amber)'
                       : 'var(--text-faint)',
            fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.06em',
          }}>
            {engineStatus === 'ready'   ? '● FREEVERB JS'
           : engineStatus === 'loading' ? '◌ LOADING…'
           : '○ REVERB'}
          </span>
          <div className="lab-status" style={{ color: isPlaying ? 'var(--green)' : 'var(--text-dim)' }}>
            <div className="status-dot" style={{
              background:  isPlaying ? 'var(--green)' : 'var(--text-faint)',
              boxShadow:   isPlaying ? '0 0 6px var(--green)' : 'none',
              animation:   isPlaying ? undefined : 'none',
            }} />
            {isPlaying ? 'LIVE' : 'STOPPED'}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="spatial-body">

        {/* LEFT: stage + source list */}
        <div className="spatial-stage-wrap">
          <div className="canvas-label" style={{ marginBottom: '0.5rem' }}>TOP-DOWN STAGE VIEW · DRAG SOURCES</div>

          <div ref={stageRef} className="stage-display" style={{ userSelect: 'none' }}>
            {/* Concentric distance rings */}
            <div className="stage-rings">
              <div className="stage-ring" style={{ width: '75%', height: '75%' }} />
              <div className="stage-ring" style={{ width: '50%', height: '50%' }} />
              <div className="stage-ring" style={{ width: '25%', height: '25%' }} />
            </div>

            {/* Dashed azimuth circle */}
            <div className="azimuth-indicator" />

            {/* Compass labels */}
            <span className="compass-label top">0° FRONT</span>
            <span className="compass-label bot">180° BACK</span>
            <span className="compass-label lft">−90°</span>
            <span className="compass-label rgt">90°</span>

            {/* Listener */}
            <div className="listener-icon">👤</div>

            {/* Source lines + icons */}
            {sources.map(src => {
              const { topPct, leftPct, normR, angleDeg } = toStagePercent(src.azimuth, src.distance);
              const isSelected = src.id === selectedId;

              // Line: from stage center, rotated to angle, length = normR * 2 * 100%
              const lineLenPct = normR * 2 * 100;
              const lineAngle  = angleDeg;

              return (
                <div key={src.id}>
                  {/* Connector line */}
                  <div
                    className="source-line"
                    style={{
                      width:           `${lineLenPct}%`,
                      transform:       `rotate(${lineAngle}deg)`,
                      background:      src.color,
                    }}
                  />
                  {/* Source icon */}
                  <div
                    className="sound-source"
                    style={{
                      top:         `${topPct}%`,
                      left:        `${leftPct}%`,
                      background:  src.muted
                        ? 'rgba(74,74,90,0.3)'
                        : `rgba(${src.colorRgb},0.15)`,
                      borderColor: src.muted ? 'var(--text-faint)' : src.color,
                      color:       src.muted ? 'var(--text-faint)' : src.color,
                      opacity:     src.muted ? 0.45 : 1,
                      boxShadow:   isSelected && !src.muted
                        ? `0 0 0 2px ${src.color}, 0 0 10px rgba(${src.colorRgb},0.4)`
                        : undefined,
                      zIndex:      isSelected ? 4 : 3,
                    }}
                    onMouseDown={e => onSourceMouseDown(e, src.id)}
                  >
                    {src.muted ? '🔇' : src.emoji}
                    {src.elevation !== 0 && (
                      <span style={{
                        position: 'absolute',
                        bottom: '-13px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: '0.52rem',
                        color: src.muted ? 'var(--text-faint)' : src.color,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        fontWeight: 600,
                        letterSpacing: '0.02em',
                      }}>
                        {src.elevation > 0 ? '▲' : '▼'}{Math.abs(src.elevation)}°
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Source list */}
          <div className="sources-list">
            {sources.map(src => (
              <div
                key={src.id}
                className={`source-item${src.id === selectedId ? ' active' : ''}`}
                style={src.id === selectedId
                  ? { borderColor: src.color, background: `rgba(${src.colorRgb},0.10)` }
                  : {}}
                onClick={() => setSelectedId(src.id)}
              >
                <div className="source-swatch" style={{
                  background: src.muted ? 'var(--text-faint)' : src.color,
                  opacity: src.muted ? 0.5 : 1,
                }} />
                <div className="source-item-name" style={{ opacity: src.muted ? 0.45 : 1 }}>
                  {src.name}
                </div>
                <div className="source-item-pos">
                  {src.azimuth >= 0 ? '+' : ''}{src.azimuth}° az&nbsp;
                  <span style={{ color: src.elevation !== 0 ? src.color : undefined, opacity: src.elevation !== 0 ? 1 : 0.5 }}>
                    {src.elevation >= 0 ? '+' : ''}{src.elevation}° el
                  </span>
                  &nbsp;/ {src.distance}m
                </div>
                {/* Mute button — stop propagation so click doesn't also select */}
                <button
                  className={`ch-btn${src.muted ? ' m-active' : ''}`}
                  title={src.muted ? 'Unmute' : 'Mute'}
                  onClick={e => {
                    e.stopPropagation();
                    updateSource(src.id, { muted: !src.muted });
                  }}
                >
                  M
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: params */}
        <div className="spatial-params">

          {/* Positioning sliders */}
          <div className="param-block">
            <div className="param-block-title">
              SOURCE: {selected.name} — POSITIONING
            </div>

            <div className="knob-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '0.25rem' }}>
              <Knob
                spec={{
                  label: 'AZIMUTH',
                  min: -180, max: 180, step: 1,
                  fmt: v => `${v >= 0 ? '+' : ''}${Math.round(v)}°`,
                  accent: selected.color,
                }}
                value={selected.azimuth}
                onChange={v => updateSource(selectedId, { azimuth: Math.round(v) })}
              />
              <Knob
                spec={{
                  label: 'ELEVATION',
                  min: -90, max: 90, step: 1,
                  fmt: v => `${v >= 0 ? '+' : ''}${Math.round(v)}°`,
                  accent: selected.color,
                }}
                value={selected.elevation}
                onChange={v => updateSource(selectedId, { elevation: Math.round(v) })}
              />
              <Knob
                spec={{
                  label: 'DISTANCE',
                  min: 0.5, max: 20, step: 0.1,
                  fmt: v => `${v.toFixed(1)} m`,
                  accent: selected.color,
                }}
                value={selected.distance}
                onChange={v => updateSource(selectedId, { distance: v })}
              />
            </div>

            {/* Side-view elevation arc */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.6rem', padding: '0.5rem 0.25rem' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, lineHeight: 1.3 }}>
                SIDE<br/>VIEW
              </div>
              <svg viewBox="0 0 100 100" style={{ width: '80px', height: '80px', flexShrink: 0 }}>
                {/* Background ring */}
                <circle cx="50" cy="50" r="36" fill="none" stroke="#252535" strokeWidth="1" />
                {/* Horizontal 0° reference line */}
                <line x1="14" y1="50" x2="86" y2="50" stroke="#2E2E45" strokeWidth="1" strokeDasharray="2,3" />
                {/* Elevation arc: right semicircle, −90° (bottom) → +90° (top) */}
                <path d="M 50,86 A 36,36 0 0 1 50,14" fill="none" stroke="#3A3A55" strokeWidth="1.5" />
                {/* Tick marks */}
                <line x1="82" y1="50" x2="86" y2="50" stroke="#3A3A55" strokeWidth="1" />
                <line x1="50" y1="14" x2="50" y2="18" stroke="#3A3A55" strokeWidth="1" />
                <line x1="50" y1="82" x2="50" y2="86" stroke="#3A3A55" strokeWidth="1" />
                {/* Listener dot */}
                <circle cx="50" cy="50" r="4" fill="#4A9EFF" />
                {/* Source position */}
                {(() => {
                  const elR = (selected.elevation * Math.PI) / 180;
                  const sx  = 50 + 36 * Math.cos(elR);
                  const sy  = 50 - 36 * Math.sin(elR);
                  return (
                    <>
                      <line x1="50" y1="50" x2={sx} y2={sy}
                        stroke={selected.color} strokeWidth="1.5" opacity="0.7" />
                      <circle cx={sx} cy={sy} r="5" fill={selected.color} />
                    </>
                  );
                })()}
                {/* Labels */}
                <text x="50" y="10" textAnchor="middle" fontSize="6.5" fill="#4A4A6A">+90°</text>
                <text x="50" y="98" textAnchor="middle" fontSize="6.5" fill="#4A4A6A">−90°</text>
                <text x="92" y="53" textAnchor="end"   fontSize="6.5" fill="#4A4A6A">0°</text>
              </svg>
              <div style={{ fontSize: '0.58rem', color: 'var(--text-dim)', lineHeight: 1.5, minWidth: '4rem' }}>
                <div style={{ color: 'var(--text-faint)' }}>+90° above</div>
                <div style={{ color: 'var(--text-faint)' }}>  0° level</div>
                <div style={{ color: 'var(--text-faint)' }}>−90° below</div>
                <div style={{ marginTop: '0.4rem', color: selected.color, fontWeight: 700, fontSize: '0.65rem' }}>
                  {selected.elevation >= 0 ? '+' : ''}{selected.elevation}°
                </div>
              </div>
            </div>
          </div>

          {/* HRTF binaural output */}
          <div className="param-block">
            <div className="param-block-title">HRTF — BINAURAL OUTPUT</div>

            <div className="hrtf-display">
              <div className="ear-channel">
                <div className="ear-label">
                  LEFT EAR (ITD: {itd >= 0 ? '+' : ''}{itd} ms)
                </div>
                <div className="ear-waveform">
                  <canvas
                    ref={leftEarRef}
                    width={200} height={36}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                  />
                </div>
              </div>
              <div className="ear-channel">
                <div className="ear-label">
                  RIGHT EAR (ILD: {ild >= 0 ? '+' : ''}{ild} dB)
                </div>
                <div className="ear-waveform">
                  <canvas
                    ref={rightEarRef}
                    width={200} height={36}
                    style={{ width: '100%', height: '100%', display: 'block' }}
                  />
                </div>
              </div>
            </div>

            <div className="tip-box" style={{ background: 'rgba(245,166,35,0.08)', borderColor: 'rgba(245,166,35,0.2)' }}>
              <strong style={{ color: 'var(--amber)' }}>ITD &amp; ILD: </strong>
              Your brain uses inter-aural timing (ITD) and level (ILD) differences to locate sound.
              {selected.azimuth < -10
                ? ` ${selected.name} is to your left — left ear leads by ${Math.abs(itd).toFixed(2)} ms.`
                : selected.azimuth > 10
                ? ` ${selected.name} is to your right — right ear leads by ${Math.abs(itd).toFixed(2)} ms.`
                : ` ${selected.name} is near front-centre.`}
            </div>
          </div>

          {/* Reverb controls */}
          <div className="param-block">
            <div className="param-block-title">REVERB — ROOM ACOUSTIC</div>

            <div className="reverb-tank">
              <div className="reverb-knob-grid" style={{ marginBottom: 0 }}>
                <Knob
                  spec={{
                    label: 'ROOM SIZE',
                    min: 0, max: 100, step: 1,
                    fmt: v => roomSizeName(v),
                    accent: 'var(--purple)',
                  }}
                  value={reverb.roomSize}
                  onChange={v => setReverbParam('roomSize', v)}
                />
                <Knob
                  spec={{
                    label: 'DECAY (RT60)',
                    min: 0.1, max: 4, step: 0.05,
                    fmt: v => `${v.toFixed(2)} s`,
                    accent: reverb.decay < 2 ? 'var(--green)' : 'var(--purple)',
                  }}
                  value={reverb.decay}
                  onChange={v => setReverbParam('decay', v)}
                />
                <Knob
                  spec={{
                    label: 'PRE-DELAY',
                    min: 0, max: 100, step: 1,
                    fmt: v => `${Math.round(v)} ms`,
                    accent: 'var(--purple)',
                  }}
                  value={reverb.preDelay}
                  onChange={v => setReverbParam('preDelay', v)}
                />
                <Knob
                  spec={{
                    label: 'WET / DRY',
                    min: 0, max: 100, step: 1,
                    fmt: v => `${Math.round(v)}%`,
                    accent: 'var(--purple)',
                  }}
                  value={reverb.wetDry}
                  onChange={v => setReverbParam('wetDry', v)}
                />
              </div>
            </div>
          </div>

        </div>{/* end spatial-params */}
      </div>{/* end spatial-body */}

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
          <button className="btn-secondary" onClick={reset}>Reset</button>
          <button className="btn-primary">Complete Chapter →</button>
        </div>
      </div>

    </div>
  );
}
