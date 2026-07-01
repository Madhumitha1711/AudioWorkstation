import { useRef, useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
type PresetKey = 'ROOM' | 'CHAMBER' | 'HALL' | 'CATHEDRAL' | 'PLATE';

interface RoomPreset {
  name: string;
  icon: string;
  rt60: number;       // seconds (visual only — IR generated from this)
  earlyCount: number; // number of early reflection spikes
  label: string;
}

interface ReverbParams {
  preDelay:  number; // ms  0 → 100
  hiCut:     number; // Hz  1000 → 20000
  loCut:     number; // Hz  20 → 500
  wetDry:    number; // %   0 → 100
  // ── Freeverb parameters (powered by daw-engine WASM) ──
  size:      number; // 0–100 %
  decay:     number; // 0–100 %
  damping:   number; // 0–100 %
  diffusion: number; // 0–100 %
}

// ── Room Presets ───────────────────────────────────────────────────────────────
const ROOM_PRESETS: Record<PresetKey, RoomPreset> = {
  ROOM:      { name: 'ROOM',      icon: '🚿', rt60: 0.4, earlyCount: 3, label: 'Small Room' },
  CHAMBER:   { name: 'CHAMBER',   icon: '🎙️', rt60: 0.9, earlyCount: 4, label: 'Vocal Chamber' },
  HALL:      { name: 'HALL',      icon: '⛪', rt60: 1.8, earlyCount: 5, label: 'Concert Hall' },
  CATHEDRAL: { name: 'CATHEDRAL', icon: '🏛️', rt60: 4.0, earlyCount: 7, label: 'Cathedral' },
  PLATE:     { name: 'PLATE',     icon: '🛠️', rt60: 2.5, earlyCount: 2, label: 'Plate Reverb' },
};

// Preset → sensible Freeverb defaults
const PRESET_FREEVERB: Record<PresetKey, Pick<ReverbParams, 'size'|'decay'|'damping'|'diffusion'>> = {
  ROOM:      { size: 30, decay: 35, damping: 65, diffusion: 50 },
  CHAMBER:   { size: 50, decay: 55, damping: 55, diffusion: 60 },
  HALL:      { size: 68, decay: 70, damping: 45, diffusion: 80 },
  CATHEDRAL: { size: 88, decay: 90, damping: 30, diffusion: 85 },
  PLATE:     { size: 55, decay: 60, damping: 70, diffusion: 40 },
};

const PRESET_ORDER: PresetKey[] = ['ROOM', 'CHAMBER', 'HALL', 'CATHEDRAL', 'PLATE'];

// ── Knob geometry helpers ──────────────────────────────────────────────────────
function knobRot(v: number, min: number, max: number) {
  return -140 + ((v - min) / (max - min)) * 280;
}
function polarXY(r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}
function arc(r: number, start: number, end: number) {
  if (Math.abs(end - start) < 0.1) end = start + 0.1;
  const s = polarXY(r, start), e = polarXY(r, end);
  const lg = end - start > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${lg} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
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

// ── Effective RT60 from Freeverb knobs ────────────────────────────────────────
// Mirrors the room_size formula in lib.rs: size × (0.05 + decay × 0.95)
// then scales to a visual RT60 range of 0.1 s – 5 s.
function calcEffectiveRt60(size: number, decay: number): number {
  const roomSize = (size / 100) * (0.05 + (decay / 100) * 0.95);
  return Math.max(0.1, roomSize * 5.0);
}

// ── IR Canvas drawing ──────────────────────────────────────────────────────────
interface FvParams { size: number; decay: number; damping: number; diffusion: number; }

function drawIR(canvas: HTMLCanvasElement, preset: RoomPreset, fv: FvParams) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0D0D0F'; ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const bottom = H - 20;

  // ── Freeverb-driven tail parameters ──────────────────────────────────────────
  const effectiveRt60 = calcEffectiveRt60(fv.size, fv.decay);
  // damping 0 = slow HF decay (bright), 1 = fast HF decay (dark) → exponent 1–6
  const dampExp   = 1 + (fv.damping / 100) * 5;
  // diffusion 0 = sparse/echo-y bars, 1 = dense/smooth bars
  const barSpacing = Math.max(4, 16 - (fv.diffusion / 100) * 12); // px between bars
  const barVariance = 1 - (fv.diffusion / 100) * 0.7;             // amplitude scatter

  // Direct
  ctx.strokeStyle = '#F5A623'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(20, bottom); ctx.lineTo(20, 20); ctx.stroke();

  // Early reflections
  // SIZE  → spreads arrival times (larger room = reflections arrive later / further right)
  // DAMPING → reduces amplitude (absorptive surfaces soak up energy)
  // DIFFUSION → high diffusion merges early reflections into the tail faster (fewer distinct spikes)
  const sizeSpread   = 0.5 + (fv.size     / 100) * 1.0;   // 0.5× … 1.5×
  const dampAtten    = 1.0 - (fv.damping  / 100) * 0.75;  // 1.0  … 0.25
  const visibleCount = Math.max(1, Math.round(
    preset.earlyCount * (1 - (fv.diffusion / 100) * 0.6)   // 40% … 100% of preset count
  ));

  const basePositions = [60, 85, 115, 145, 175, 210, 240];
  const baseHeights   = [60, 75,  55,  85,  70,  65,  80];

  basePositions.slice(0, visibleCount).forEach((baseX, i) => {
    const x = Math.min(W - 10, 20 + (baseX - 20) * sizeSpread);
    const h = baseHeights[i] * dampAtten;
    ctx.strokeStyle = `rgba(77,158,255,${0.8 - i * 0.08})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, bottom - h); ctx.stroke();
  });

  // Late decay tail — length driven by SIZE+DECAY, shape by DAMPING+DIFFUSION
  const tailStart = 200;
  const tailEnd   = Math.min(W - 10, tailStart + (effectiveRt60 / 5.0) * (W - tailStart - 10));

  // Envelope outline — slope steepness reflects damping
  ctx.strokeStyle = 'rgba(45,212,191,0.4)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tailStart, bottom - 30);
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t     = i / steps;
    const x     = tailStart + t * (tailEnd - tailStart);
    const decay = Math.exp(-t * dampExp);
    const y     = bottom - Math.max(1, 30 * decay);
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Noise bars — density from DIFFUSION, height from DAMPING
  ctx.lineWidth = 1.5;
  const barCount = Math.floor((tailEnd - tailStart) / barSpacing);
  for (let i = 0; i < barCount; i++) {
    const t   = i / barCount;
    const x   = tailStart + t * (tailEnd - tailStart);
    // Denser diffusion = smoother amplitude; low diffusion = more chaotic
    const scatter = barVariance > 0.1 ? 0.5 + Math.random() * barVariance : 1;
    const env = Math.exp(-t * dampExp) * 35 * scatter;
    const y   = bottom - Math.max(1, env);
    ctx.strokeStyle = `rgba(45,212,191,${0.55 - t * 0.3})`;
    ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, y); ctx.stroke();
  }

  // Labels
  ctx.font = '10px "JetBrains Mono", monospace'; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(245,166,35,0.15)'; ctx.fillRect(8, 6, 56, 18);
  ctx.fillStyle = '#F5A623'; ctx.fillText('DIRECT', 10, 8);
  ctx.fillStyle = 'rgba(77,158,255,0.12)'; ctx.fillRect(68, 6, 142, 18);
  ctx.fillStyle = '#4D9EFF'; ctx.fillText('EARLY REFLECTIONS', 70, 8);
  ctx.fillStyle = 'rgba(45,212,191,0.12)'; ctx.fillRect(tailStart - 5, 6, tailEnd - tailStart + 10, 18);
  ctx.fillStyle = '#2DD4BF'; ctx.fillText('LATE DECAY (TAIL)', tailStart, 8);

  // Time axis — last label shows effective RT60
  ctx.fillStyle = '#8A8A9A'; ctx.font = '10px "JetBrains Mono", monospace'; ctx.textBaseline = 'alphabetic';
  const timeLabels = ['0ms', '50ms', '200ms', '500ms', '1s', `${effectiveRt60.toFixed(1)}s`];
  const labelX     = [8, 55, 150, 330, 480, Math.min(W - 30, tailEnd - 5)];
  timeLabels.forEach((lbl, i) => { if (labelX[i] < W - 10) ctx.fillText(lbl, labelX[i], H - 4); });
}

// ── Synthetic IR generation ────────────────────────────────────────────────────
function generateIR(audioCtx: AudioContext, preset: RoomPreset): AudioBuffer {
  const sr  = audioCtx.sampleRate;
  const len = Math.ceil(sr * (preset.rt60 + 0.3));
  const buf = audioCtx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    data[0] = 1.0;
    const earlyDelays = [0.003, 0.008, 0.015, 0.023, 0.035, 0.050, 0.070];
    earlyDelays.slice(0, preset.earlyCount).forEach((t, i) => {
      const idx = Math.floor(t * sr) + (c === 1 ? 3 : 0);
      if (idx < len) data[idx] = 0.7 * Math.exp(-i * 0.35) * (c === 1 ? 0.93 : 1);
    });
    const tailStart = Math.floor(0.04 * sr);
    for (let i = tailStart; i < len; i++) {
      const t   = (i - tailStart) / sr;
      const env = Math.exp(-t * 6.91 / preset.rt60);
      data[i] += (Math.random() * 2 - 1) * env * 0.28;
    }
  }
  return buf;
}

// ── Drum synth ────────────────────────────────────────────────────────────────
const BPM       = 120;
const STEP_SEC  = 60 / BPM / 2;
const STEPS     = 16;
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
function synthKick(ctx: AudioContext, dest: AudioNode, t: number) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.06);
  g.gain.setValueAtTime(0.85, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.4);
}
function synthSnare(ctx: AudioContext, dest: AudioNode, t: number) {
  const b = ctx.createOscillator(), bg = ctx.createGain();
  b.type = 'sine'; b.frequency.setValueAtTime(200, t); b.frequency.exponentialRampToValueAtTime(100, t + 0.06);
  bg.gain.setValueAtTime(0.45, t); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  b.connect(bg); bg.connect(dest); b.start(t); b.stop(t + 0.15);
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 0.15);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.6;
  const ng = ctx.createGain(); ng.gain.setValueAtTime(0.55, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  n.connect(f); f.connect(ng); ng.connect(dest); n.start(t); n.stop(t + 0.15);
}
function synthHihat(ctx: AudioContext, dest: AudioNode, t: number, open = false) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, open ? 0.3 : 0.05);
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 9000;
  const g = ctx.createGain(); const d = open ? 0.25 : 0.04;
  g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  n.connect(f); f.connect(g); g.connect(dest); n.start(t); n.stop(t + d + 0.01);
}
function synthBass(ctx: AudioContext, dest: AudioNode, t: number, freq: number) {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.value = freq;
  f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(180, t + 0.25); f.Q.value = 3;
  g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
  o.connect(f); f.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.4);
}
function scheduleStep(ctx: AudioContext, dest: AudioNode, step: number, t: number) {
  if (PAT_KICK[step])  synthKick (ctx, dest, t);
  if (PAT_SNARE[step]) synthSnare(ctx, dest, t);
  if (PAT_HAT[step])   synthHihat(ctx, dest, t, false);
  if (PAT_OPEN[step])  synthHihat(ctx, dest, t, true);
  if (PAT_BASS[step])  synthBass (ctx, dest, t, PAT_BASS[step]);
}

// ── Knob component (shared for all knobs) ─────────────────────────────────────
interface KnobSpec {
  label: string;
  min:   number;
  max:   number;
  step:  number;
  fmt:   (v: number) => string;
  accent?: string; // CSS color variable name e.g. 'var(--teal)'
}

function ActiveKnob({ spec, value, onChange, disabled = false }: {
  spec: KnobSpec;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const rot     = knobRot(value, spec.min, spec.max);
  const accent  = spec.accent ?? 'var(--teal)';
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);

  const onDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startVal: value };
  }, [value, disabled]);

  useEffect(() => {
    if (disabled) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current; if (!d) return;
      const sens    = (spec.max - spec.min) / 220;
      const raw     = d.startVal + (d.startY - e.clientY) * sens;
      const snapped = Math.round(raw / spec.step) * spec.step;
      onChange(Math.min(spec.max, Math.max(spec.min, snapped)));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [spec, onChange, disabled]);

  return (
    <div className="knob-wrap" style={disabled ? { opacity: 0.35, pointerEvents: 'none' } : {}}>
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <svg style={{ position: 'absolute', top: 0, left: 0 }} width={64} height={64} viewBox="-32 -32 64 64">
          <path d={arc(28, -140, 140)} fill="none" stroke="#2E2E3D" strokeWidth={3} strokeLinecap="round" />
          <path d={arc(28, -140, rot)} fill="none" stroke={accent}  strokeWidth={3} strokeLinecap="round" opacity={0.85} />
        </svg>
        <div
          className="big-knob"
          style={{
            position: 'absolute', top: 6, left: 6, width: 52, height: 52,
            background: disabled
              ? 'radial-gradient(circle at 35% 35%, #222230, var(--console))'
              : 'radial-gradient(circle at 35% 35%, #1F4F49, var(--console))',
            cursor: disabled ? 'not-allowed' : 'ns-resize',
            userSelect: 'none',
          }}
          onMouseDown={onDown}
        >
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 3, height: 16,
            background: disabled ? '#4A4A5A' : '#E8E8EC',
            borderRadius: 2,
            transformOrigin: 'bottom center',
            transform: `translate(-50%, -100%) rotate(${rot}deg)`,
            marginTop: -2,
          }} />
        </div>
      </div>
      <div className="knob-name" style={disabled ? { color: 'var(--text-faint)' } : {}}>{spec.label}</div>
      <div className="knob-val" style={{ color: disabled ? 'var(--text-faint)' : accent }}>
        {spec.fmt(value)}
      </div>
    </div>
  );
}

// ── Decay bars ─────────────────────────────────────────────────────────────────
function DecayBars({ rt60, damping }: { rt60: number; damping: number }) {
  const COUNT   = 18;
  // damping 0 = gentle slope, 1 = steep slope — mirrors drawIR dampExp
  const dampExp = 1 + (damping / 100) * 5;
  const bars  = Array.from({ length: COUNT }, (_, i) => {
    const t   = i / (COUNT - 1);
    const env = Math.exp(-t * dampExp * (1.8 / rt60));
    return Math.max(2, Math.round(env * 100));
  });
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60, marginBottom: '0.5rem' }}>
      {bars.map((h, i) => (
        <div key={i} style={{
          flex: 1, height: `${h}%`,
          background: 'var(--teal)',
          borderRadius: '1px 1px 0 0',
          opacity: 0.9,
          transition: 'height 0.4s ease',
        }} />
      ))}
    </div>
  );
}

// ── Knob specs ─────────────────────────────────────────────────────────────────
const KNOB_SPECS: Record<keyof ReverbParams, KnobSpec> = {
  preDelay:  { label: 'PRE-DELAY', min: 0,    max: 100,   step: 1,   fmt: v => `${Math.round(v)}ms`,  accent: 'var(--teal)' },
  hiCut:     { label: 'HI-CUT',   min: 1000,  max: 20000, step: 100, fmt: v => v >= 1000 ? `${(v/1000).toFixed(1)}kHz` : `${v}Hz`, accent: 'var(--teal)' },
  loCut:     { label: 'LO-CUT',   min: 20,    max: 500,   step: 5,   fmt: v => `${Math.round(v)}Hz`,  accent: 'var(--teal)' },
  wetDry:    { label: 'WET/DRY',  min: 0,     max: 100,   step: 1,   fmt: v => `${Math.round(v)}%`,   accent: 'var(--teal)' },
  // Freeverb knobs
  size:      { label: 'SIZE',      min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`,  accent: 'var(--purple)' },
  decay:     { label: 'DECAY',     min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`,  accent: 'var(--purple)' },
  damping:   { label: 'DAMPING',   min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`,  accent: 'var(--purple)' },
  diffusion: { label: 'DIFFUSION', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`,  accent: 'var(--purple)' },
};

// ── Defaults ───────────────────────────────────────────────────────────────────
const DEFAULTS: ReverbParams = {
  preDelay:  24,
  hiCut:     8000,
  loCut:     120,
  wetDry:    35,
  ...PRESET_FREEVERB['HALL'],
};
const DEFAULT_PRESET: PresetKey = 'HALL';

// ── WASM status type ───────────────────────────────────────────────────────────
type EngineStatus = 'idle' | 'loading' | 'ready';

// ── Component ──────────────────────────────────────────────────────────────────
export default function Chapter6() {
  const [preset,     setPreset]     = useState<PresetKey>(DEFAULT_PRESET);
  const [params,     setParams]     = useState<ReverbParams>({ ...DEFAULTS });
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [hasPlayed,  setHasPlayed]  = useState(false);
  const [tasks,      setTasks]      = useState([true, false, false]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');

  // Canvas
  const irRef = useRef<HTMLCanvasElement>(null);

  // Audio refs
  const ctxRef        = useRef<AudioContext | null>(null);
  const reverbNodeRef = useRef<AudioWorkletNode | null>(null); // Freeverb WASM node
  const convolverRef  = useRef<ConvolverNode | null>(null);    // fallback
  const preDelayRef   = useRef<DelayNode | null>(null);
  const hiCutRef      = useRef<BiquadFilterNode | null>(null);
  const loCutRef      = useRef<BiquadFilterNode | null>(null);
  const wetGainRef    = useRef<GainNode | null>(null);
  const dryGainRef    = useRef<GainNode | null>(null);
  const mixRef        = useRef<GainNode | null>(null);
  const schedulerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextNoteRef   = useRef(0);
  const stepRef       = useRef(0);

  // Mirror params into a ref so audio callbacks always see fresh values
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);

  // ── Redraw IR whenever preset OR any Freeverb knob changes ──────────────────
  useEffect(() => {
    if (irRef.current) drawIR(irRef.current, ROOM_PRESETS[preset], {
      size:      params.size,
      decay:     params.decay,
      damping:   params.damping,
      diffusion: params.diffusion,
    });
  }, [preset, params.size, params.decay, params.damping, params.diffusion]);

  // ── Task tracking ────────────────────────────────────────────────────────────
  useEffect(() => {
    setTasks([preset === 'HALL', hasPlayed, params.preDelay >= 15]);
  }, [preset, hasPlayed, params.preDelay]);

  // ── Sync Web Audio params live ───────────────────────────────────────────────
  useEffect(() => {
    const ctx = ctxRef.current; if (!ctx) return;
    const t = ctx.currentTime;
    if (preDelayRef.current) preDelayRef.current.delayTime.setTargetAtTime(params.preDelay / 1000, t, 0.01);
    if (hiCutRef.current)    hiCutRef.current.frequency.setTargetAtTime(params.hiCut,  t, 0.01);
    if (loCutRef.current)    loCutRef.current.frequency.setTargetAtTime(params.loCut,  t, 0.01);
    if (wetGainRef.current)  wetGainRef.current.gain.setTargetAtTime(params.wetDry / 100, t, 0.01);
    if (dryGainRef.current)  dryGainRef.current.gain.setTargetAtTime(1 - params.wetDry / 100, t, 0.01);
  }, [params.preDelay, params.hiCut, params.loCut, params.wetDry]);

  // ── Send Freeverb params to AudioWorklet ─────────────────────────────────────
  useEffect(() => {
    const node = reverbNodeRef.current; if (!node) return;
    node.port.postMessage({ type: 'set_size',      value: params.size      / 100 });
    node.port.postMessage({ type: 'set_decay',     value: params.decay     / 100 });
    node.port.postMessage({ type: 'set_damping',   value: params.damping   / 100 });
    node.port.postMessage({ type: 'set_diffusion', value: params.diffusion / 100 });
  }, [params.size, params.decay, params.damping, params.diffusion]);

  // ── Update convolver when preset changes ─────────────────────────────────────
  useEffect(() => {
    const ctx = ctxRef.current; const conv = convolverRef.current;
    if (!ctx || !conv) return;
    conv.buffer = generateIR(ctx, ROOM_PRESETS[preset]);
  }, [preset]);

  // ── Apply preset Freeverb defaults ───────────────────────────────────────────
  const applyPreset = useCallback((key: PresetKey) => {
    setPreset(key);
    setParams(p => ({ ...p, ...PRESET_FREEVERB[key] }));
  }, []);

  // ── Scheduler ────────────────────────────────────────────────────────────────
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current; const mix = mixRef.current;
    if (!ctx || !mix) return;
    while (nextNoteRef.current < ctx.currentTime + 0.1) {
      scheduleStep(ctx, mix, stepRef.current, nextNoteRef.current);
      stepRef.current    = (stepRef.current + 1) % STEPS;
      nextNoteRef.current += STEP_SEC;
    }
    schedulerRef.current = setTimeout(runScheduler, 25);
  }, []);

  // ── Start audio ──────────────────────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    const ctx = new AudioContext(); ctxRef.current = ctx;

    // ── Mix bus (synth input) ──
    const mix = ctx.createGain(); mix.gain.value = 0.8; mixRef.current = mix;

    // ── Pre-delay ──
    const preDelay = ctx.createDelay(0.2);
    preDelay.delayTime.value = paramsRef.current.preDelay / 1000;
    preDelayRef.current = preDelay;

    // ── Wet chain tail: hiCut → loCut → wetGain → destination ──
    const hiCut = ctx.createBiquadFilter(); hiCut.type = 'lowpass';  hiCut.frequency.value = paramsRef.current.hiCut;
    const loCut = ctx.createBiquadFilter(); loCut.type = 'highpass'; loCut.frequency.value = paramsRef.current.loCut;
    const wetGain = ctx.createGain(); wetGain.gain.value = paramsRef.current.wetDry / 100;
    const dryGain = ctx.createGain(); dryGain.gain.value = 1 - paramsRef.current.wetDry / 100;
    hiCutRef.current = hiCut; loCutRef.current = loCut;
    wetGainRef.current = wetGain; dryGainRef.current = dryGain;

    // ── Dry path ──
    mix.connect(dryGain);
    dryGain.connect(ctx.destination);

    // ── Load AudioWorklet (JS Freeverb runs immediately; WASM upgrades async) ──
    setEngineStatus('loading');
    await ctx.audioWorklet.addModule('/worklets/reverb-processor.js');

    const reverbNode = new AudioWorkletNode(ctx, 'reverb-processor', {
      numberOfInputs:  1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    reverbNode.port.onmessage = (e) => {
      if (e.data.type === 'ready') setEngineStatus('ready');
    };

    // Send current params — worklet applies them to JS engine right away
    const p = paramsRef.current;
    reverbNode.port.postMessage({ type: 'set_size',      value: p.size      / 100 });
    reverbNode.port.postMessage({ type: 'set_decay',     value: p.decay     / 100 });
    reverbNode.port.postMessage({ type: 'set_damping',   value: p.damping   / 100 });
    reverbNode.port.postMessage({ type: 'set_diffusion', value: p.diffusion / 100 });

    reverbNodeRef.current = reverbNode;
    const reverbWet: AudioNode = reverbNode;

    // ── Wire wet path ──
    // mix → preDelay → reverb → hiCut → loCut → wetGain → destination
    mix.connect(preDelay);
    preDelay.connect(reverbWet);
    reverbWet.connect(hiCut);
    hiCut.connect(loCut);
    loCut.connect(wetGain);
    wetGain.connect(ctx.destination);

    nextNoteRef.current = ctx.currentTime + 0.05;
    stepRef.current     = 0;
    runScheduler();
    setIsPlaying(true);
    setHasPlayed(true);
  }, [preset, runScheduler]);

  // ── Stop audio ───────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    reverbNodeRef.current = null;
    convolverRef.current  = null;
    preDelayRef.current   = null;
    hiCutRef.current      = null;
    loCutRef.current      = null;
    wetGainRef.current    = null;
    dryGainRef.current    = null;
    mixRef.current        = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    setIsPlaying(false);
    setEngineStatus('idle');
  }, []);

  useEffect(() => () => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    ctxRef.current?.close();
  }, []);

  const currentPreset = ROOM_PRESETS[preset];
  const TASK_LABELS   = ['Select Hall preset', 'Audition reverb', 'Set pre-delay ≥ 15ms'];

  const freeverbActive = engineStatus === 'ready' || engineStatus === 'loading';

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="reverb-lab">

      {/* ── Top bar ── */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--teal-dim)', border: '1px solid rgba(45,212,191,0.4)' }}>∿</div>
          <div>
            <div className="lab-name">Reverb Designer</div>
            <div className="lab-subtitle">LAB · CH 06 · FREEVERB WASM · DRUM GROOVE @ {BPM} BPM</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* WASM status badge */}
          <span className="badge" style={{
            background: engineStatus === 'ready'   ? 'rgba(168,85,247,0.15)'  :
                        engineStatus === 'loading' ? 'rgba(245,166,35,0.15)'  : 'var(--surface)',
            borderColor: engineStatus === 'ready'  ? 'rgba(168,85,247,0.4)'   :
                         engineStatus === 'loading'? 'rgba(245,166,35,0.4)'   : 'var(--border)',
            color: engineStatus === 'ready'   ? '#A855F7'        :
                   engineStatus === 'loading' ? 'var(--amber)'   : 'var(--text-faint)',
            fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.06em',
          }}>
            {engineStatus === 'ready'   ? '● FREEVERB JS'     :
             engineStatus === 'loading' ? '◌ LOADING…'        : '○ IDLE'}
          </span>
          <button
            className={`toggle-btn${isPlaying ? ' on' : ''}`}
            style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-dim)' } : {}}
            onClick={isPlaying ? stopAudio : startAudio}
          >
            {isPlaying ? '⏹ STOP' : '▶ PLAY'}
          </button>
          <span className="badge" style={{ background: 'var(--teal-dim)', borderColor: 'rgba(45,212,191,0.3)', color: 'var(--teal)' }}>
            ◐ ROOM: {currentPreset.name}
          </span>
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

      {/* ── Body ── */}
      <div className="reverb-body">

        {/* ── Left panel ── */}
        <div className="reverb-left">
          <div className="canvas-label">IMPULSE RESPONSE — DECAY OVER TIME</div>
          <div className="ir-display">
            <canvas
              ref={irRef}
              width={760}
              height={160}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          </div>

          <div className="canvas-label">ROOM PRESET</div>
          <div className="room-preset-row">
            {PRESET_ORDER.map(key => {
              const p = ROOM_PRESETS[key];
              return (
                <div
                  key={key}
                  className={`room-preset${preset === key ? ' active' : ''}`}
                  onClick={() => applyPreset(key)}
                >
                  <div className="room-preset-icon">{p.icon}</div>
                  <div className="room-preset-name">{p.name}</div>
                </div>
              );
            })}
          </div>

          <div className="concept-callout" style={{ background: 'var(--teal-dim)', borderColor: 'rgba(45,212,191,0.2)' }}>
            <strong style={{ color: 'var(--teal)' }}>Concept check:</strong> Early reflections tell your
            brain the room's size and shape. The late, dense tail tells it the surface material — hard
            walls decay slower than soft ones. Current RT60:{' '}
            <strong style={{ color: 'var(--teal)' }}>{currentPreset.rt60}s</strong> ({currentPreset.label}).
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="reverb-right">
          <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>RT60 DECAY ENVELOPE</div>
          <div className="reverb-decay-viz">
            <DecayBars rt60={calcEffectiveRt60(params.size, params.decay)} damping={params.damping} />
            <div className="decay-readout">
              <span>RT60: <strong style={{ color: 'var(--teal)' }}>{calcEffectiveRt60(params.size, params.decay).toFixed(1)}s</strong></span>
              <span>−60dB POINT</span>
            </div>
          </div>

          {/* ── Knob grid ── */}
          <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>REVERB PARAMETERS</div>

          {/* Freeverb section header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            fontFamily: 'var(--mono)', fontSize: '0.55rem',
            marginBottom: '0.6rem',
            background: freeverbActive ? 'rgba(168,85,247,0.08)' : 'var(--surface)',
            border: `1px solid ${freeverbActive ? 'rgba(168,85,247,0.3)' : 'var(--border)'}`,
            borderRadius: 4, padding: '0.3rem 0.6rem',
          }}>
            <span style={{ color: freeverbActive ? '#A855F7' : 'var(--text-faint)', fontWeight: 600 }}>
              {'◈'}
            </span>
            <span style={{ color: freeverbActive ? '#A855F7' : 'var(--text-faint)' }}>
              SIZE · DECAY · DAMPING · DIFFUSION
            </span>
            <span style={{ color: 'var(--text-faint)', marginLeft: 2 }}>
              — powered by{' '}
              <span style={{ color: freeverbActive ? '#A855F7' : 'var(--text-faint)' }}>
                Freeverb JS AudioWorklet
              </span>
            </span>
          </div>

          <div className="reverb-knob-grid">
            {/* Row 1: SIZE (Freeverb), DECAY (Freeverb), PRE-DELAY (Web Audio), DAMPING (Freeverb) */}
            <ActiveKnob
              spec={KNOB_SPECS.size}
              value={params.size}
              onChange={v => setParams(p => ({ ...p, size: v }))}
            />
            <ActiveKnob
              spec={KNOB_SPECS.decay}
              value={params.decay}
              onChange={v => setParams(p => ({ ...p, decay: v }))}
            />
            <ActiveKnob
              spec={KNOB_SPECS.preDelay}
              value={params.preDelay}
              onChange={v => setParams(p => ({ ...p, preDelay: v }))}
            />
            <ActiveKnob
              spec={KNOB_SPECS.damping}
              value={params.damping}
              onChange={v => setParams(p => ({ ...p, damping: v }))}
            />

            {/* Row 2: DIFFUSION (Freeverb), HI-CUT, LO-CUT, WET/DRY */}
            <ActiveKnob
              spec={KNOB_SPECS.diffusion}
              value={params.diffusion}
              onChange={v => setParams(p => ({ ...p, diffusion: v }))}
            />
            <ActiveKnob
              spec={KNOB_SPECS.hiCut}
              value={params.hiCut}
              onChange={v => setParams(p => ({ ...p, hiCut: v }))}
            />
            <ActiveKnob
              spec={KNOB_SPECS.loCut}
              value={params.loCut}
              onChange={v => setParams(p => ({ ...p, loCut: v }))}
            />
            <ActiveKnob
              spec={KNOB_SPECS.wetDry}
              value={params.wetDry}
              onChange={v => setParams(p => ({ ...p, wetDry: v }))}
            />
          </div>

          {/* Live param readout */}
          <div style={{
            marginTop: '0.75rem',
            background: 'var(--black)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '0.6rem 0.75rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.5rem',
          }}>
            {(['size','decay','damping','diffusion'] as const).map(key => (
              <div key={key} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: '#A855F7', fontWeight: 500 }}>
                  {KNOB_SPECS[key].fmt(params[key])}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.5rem', color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
                  {KNOB_SPECS[key].label}
                </div>
              </div>
            ))}
          </div>

          <div className="tip-box" style={{ marginTop: '0.75rem', background: 'rgba(45,212,191,0.07)', borderColor: 'rgba(45,212,191,0.2)' }}>
            <strong style={{ color: 'var(--teal)' }}>Architecture:</strong> SIZE, DECAY, DAMPING,
            DIFFUSION are processed by{' '}
            <span style={{ color: '#A855F7' }}>Freeverb (Rust → WASM)</span> via{' '}
            <span style={{ color: 'var(--text)' }}>AudioWorkletNode</span>.
            Pre-delay, Hi/Lo-Cut and Wet/Dry remain Web Audio API nodes. Drag knobs vertically to adjust.
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
            onClick={isPlaying ? stopAudio : startAudio}
          >
            {isPlaying ? '⏹ STOP' : '▶ Audition'}
          </button>
          <button
            className="btn-secondary"
            onClick={() => { applyPreset(DEFAULT_PRESET); setParams({ ...DEFAULTS }); }}
          >
            Reset
          </button>
          <button className="btn-primary">Submit &amp; Continue →</button>
        </div>
      </div>
    </div>
  );
}
