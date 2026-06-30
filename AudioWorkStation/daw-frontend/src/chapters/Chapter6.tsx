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
  preDelay: number;   // ms  0 → 100
  hiCut:    number;   // Hz  1000 → 20000
  loCut:    number;   // Hz  20 → 500
  wetDry:   number;   // %   0 → 100
}

// ── Room Presets ───────────────────────────────────────────────────────────────
const ROOM_PRESETS: Record<PresetKey, RoomPreset> = {
  ROOM:      { name: 'ROOM',      icon: '🚿', rt60: 0.4, earlyCount: 3, label: 'Small Room' },
  CHAMBER:   { name: 'CHAMBER',   icon: '🎙️', rt60: 0.9, earlyCount: 4, label: 'Vocal Chamber' },
  HALL:      { name: 'HALL',      icon: '⛪', rt60: 1.8, earlyCount: 5, label: 'Concert Hall' },
  CATHEDRAL: { name: 'CATHEDRAL', icon: '🏛️', rt60: 4.0, earlyCount: 7, label: 'Cathedral' },
  PLATE:     { name: 'PLATE',     icon: '🛠️', rt60: 2.5, earlyCount: 2, label: 'Plate Reverb' },
};

const PRESET_ORDER: PresetKey[] = ['ROOM', 'CHAMBER', 'HALL', 'CATHEDRAL', 'PLATE'];

// Visual-only disabled knob specs (SIZE, DECAY, DAMPING, DIFFUSION)
const DISABLED_KNOBS = [
  { label: 'SIZE',      value: 68,  fmt: (v: number) => `${v}%`    },
  { label: 'DECAY',     value: 1.8, fmt: (v: number) => `${v}s`    },
  { label: 'DAMPING',   value: 45,  fmt: (v: number) => `${v}%`    },
  { label: 'DIFFUSION', value: 80,  fmt: (v: number) => `${v}%`    },
];

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

// ── IR Canvas drawing ──────────────────────────────────────────────────────────
function drawIR(canvas: HTMLCanvasElement, preset: RoomPreset) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0D0D0F'; ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const bottom = H - 20; // leave room for time labels

  // ─ Direct sound spike (amber) ─
  ctx.strokeStyle = '#F5A623'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(20, bottom); ctx.lineTo(20, 20); ctx.stroke();

  // ─ Early reflections (blue) ─
  const earlyPositions = [60, 85, 115, 145, 175, 210, 240].slice(0, preset.earlyCount);
  const earlyHeights   = [60, 75, 55, 85, 70, 65, 80].slice(0, preset.earlyCount);
  earlyPositions.forEach((x, i) => {
    ctx.strokeStyle = `rgba(77,158,255,${0.8 - i * 0.08})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, bottom - earlyHeights[i]); ctx.stroke();
  });

  // ─ Late decay tail (teal) ─
  const tailStart = 200;
  const tailEnd   = Math.min(W - 10, tailStart + (preset.rt60 / 4.0) * (W - tailStart - 10));

  // Envelope outline
  ctx.strokeStyle = 'rgba(45,212,191,0.4)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tailStart, bottom - 30);
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = tailStart + t * (tailEnd - tailStart);
    const decay = Math.exp(-t * 6.91 * (tailStart / tailEnd));
    const y = bottom - Math.max(1, 30 * decay);
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Dense noise bars
  ctx.lineWidth = 1.5;
  const barCount = Math.floor((tailEnd - tailStart) / 12);
  for (let i = 0; i < barCount; i++) {
    const t   = i / barCount;
    const x   = tailStart + t * (tailEnd - tailStart);
    const env = Math.exp(-t * 3.5) * 35 * (0.7 + 0.3 * Math.random());
    const y   = bottom - Math.max(1, env);
    ctx.strokeStyle = `rgba(45,212,191,${0.55 - t * 0.3})`;
    ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, y); ctx.stroke();
  }

  // ─ Stage label background bands ─
  ctx.font = '8px JetBrains Mono, monospace'; ctx.textBaseline = 'top';

  // Direct
  ctx.fillStyle = 'rgba(245,166,35,0.15)'; ctx.fillRect(8, 6, 44, 14);
  ctx.fillStyle = '#F5A623'; ctx.fillText('DIRECT', 10, 8);

  // Early
  ctx.fillStyle = 'rgba(77,158,255,0.12)'; ctx.fillRect(55, 6, 110, 14);
  ctx.fillStyle = '#4D9EFF'; ctx.fillText('EARLY REFLECTIONS', 58, 8);

  // Late
  ctx.fillStyle = 'rgba(45,212,191,0.12)'; ctx.fillRect(tailStart - 5, 6, tailEnd - tailStart + 10, 14);
  ctx.fillStyle = '#2DD4BF'; ctx.fillText('LATE DECAY (TAIL)', tailStart, 8);

  // ─ Time labels ─
  ctx.fillStyle = '#4A4A5A'; ctx.font = '8px JetBrains Mono, monospace'; ctx.textBaseline = 'alphabetic';
  const timeLabels = ['0ms', '50ms', '200ms', '500ms', '1s', `${preset.rt60.toFixed(1)}s`];
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
    // Direct
    data[0] = 1.0;

    // Early reflections (sparse spikes)
    const earlyDelays = [0.003, 0.008, 0.015, 0.023, 0.035, 0.050, 0.070];
    earlyDelays.slice(0, preset.earlyCount).forEach((t, i) => {
      const idx = Math.floor(t * sr) + (c === 1 ? 3 : 0);
      if (idx < len) data[idx] = 0.7 * Math.exp(-i * 0.35) * (c === 1 ? 0.93 : 1);
    });

    // Diffuse exponential tail
    const tailStart = Math.floor(0.04 * sr);
    for (let i = tailStart; i < len; i++) {
      const t   = (i - tailStart) / sr;
      const env = Math.exp(-t * 6.91 / preset.rt60);
      data[i] += (Math.random() * 2 - 1) * env * 0.28;
    }
  }
  return buf;
}

// ── Drum synth (same as Chapter 4) ────────────────────────────────────────────
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

// ── Active Knob component ──────────────────────────────────────────────────────
interface KnobSpec {
  label: string;
  min:   number;
  max:   number;
  step:  number;
  fmt:   (v: number) => string;
}

function ActiveKnob({ spec, value, onChange }: {
  spec: KnobSpec; value: number; onChange: (v: number) => void;
}) {
  const rot      = knobRot(value, spec.min, spec.max);
  const dragRef  = useRef<{ startY: number; startVal: number } | null>(null);

  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startVal: value };
  }, [value]);

  useEffect(() => {
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
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [spec, onChange]);

  return (
    <div className="knob-wrap">
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <svg style={{ position: 'absolute', top: 0, left: 0 }} width={64} height={64} viewBox="-32 -32 64 64">
          <path d={arc(28, -140, 140)} fill="none" stroke="#2E2E3D" strokeWidth={3} strokeLinecap="round" />
          <path d={arc(28, -140, rot)} fill="none" stroke="#2DD4BF" strokeWidth={3} strokeLinecap="round" opacity={0.85} />
        </svg>
        <div
          className="big-knob"
          style={{
            position: 'absolute', top: 6, left: 6, width: 52, height: 52,
            background: 'radial-gradient(circle at 35% 35%, #1F4F49, var(--console))',
            cursor: 'ns-resize', userSelect: 'none',
          }}
          onMouseDown={onDown}
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
      <div className="knob-val" style={{ color: 'var(--teal)' }}>{spec.fmt(value)}</div>
    </div>
  );
}

// ── Disabled (visual-only) Knob component ─────────────────────────────────────
function DisabledKnob({ label, value, fmt, pos }: {
  label: string; value: number; fmt: (v: number) => string; pos: number;
}) {
  const rot = -140 + ((pos - 1) / 4) * 280; // spread across range for visual variety
  return (
    <div className="knob-wrap" style={{ opacity: 0.4, pointerEvents: 'none' }}>
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <svg style={{ position: 'absolute', top: 0, left: 0 }} width={64} height={64} viewBox="-32 -32 64 64">
          <path d={arc(28, -140, 140)} fill="none" stroke="#2E2E3D" strokeWidth={3} strokeLinecap="round" />
          <path d={arc(28, -140, rot)} fill="none" stroke="#3D3D52" strokeWidth={3} strokeLinecap="round" opacity={0.6} />
        </svg>
        <div
          className="big-knob"
          style={{
            position: 'absolute', top: 6, left: 6, width: 52, height: 52,
            background: 'radial-gradient(circle at 35% 35%, #222230, var(--console))',
            cursor: 'not-allowed',
          }}
        >
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 3, height: 16, background: '#4A4A5A', borderRadius: 2,
            transformOrigin: 'bottom center',
            transform: `translate(-50%, -100%) rotate(${rot}deg)`,
            marginTop: -2,
          }} />
        </div>
      </div>
      <div className="knob-name" style={{ color: 'var(--text-faint)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--text-faint)', textAlign: 'center' }}>
        {fmt(value)}
      </div>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: '0.45rem', color: 'var(--text-faint)',
        textAlign: 'center', letterSpacing: '0.04em', marginTop: 1,
      }}>N/A</div>
    </div>
  );
}

// ── Decay bars ─────────────────────────────────────────────────────────────────
function DecayBars({ rt60 }: { rt60: number }) {
  const COUNT  = 18;
  const bars   = Array.from({ length: COUNT }, (_, i) => {
    const t   = i / (COUNT - 1);
    const env = Math.exp(-t * 6.91 * (1.8 / rt60));
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

// ── Active knob specs ──────────────────────────────────────────────────────────
const ACTIVE_KNOBS: Record<keyof ReverbParams, KnobSpec> = {
  preDelay: { label: 'PRE-DELAY', min: 0,    max: 100,   step: 1,    fmt: v => `${Math.round(v)}ms` },
  hiCut:    { label: 'HI-CUT',   min: 1000,  max: 20000, step: 100,  fmt: v => v >= 1000 ? `${(v/1000).toFixed(1)}kHz` : `${v}Hz` },
  loCut:    { label: 'LO-CUT',   min: 20,    max: 500,   step: 5,    fmt: v => `${Math.round(v)}Hz` },
  wetDry:   { label: 'WET/DRY',  min: 0,     max: 100,   step: 1,    fmt: v => `${Math.round(v)}%` },
};

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULTS: ReverbParams = {
  preDelay: 24,
  hiCut:    8000,
  loCut:    120,
  wetDry:   35,
};
const DEFAULT_PRESET: PresetKey = 'HALL';

// ── Component ──────────────────────────────────────────────────────────────────
export default function Chapter6() {
  const [preset,    setPreset]    = useState<PresetKey>(DEFAULT_PRESET);
  const [params,    setParams]    = useState<ReverbParams>({ ...DEFAULTS });
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [tasks, setTasks] = useState([true, false, false]); // Hall is default

  // Canvas
  const irRef = useRef<HTMLCanvasElement>(null);

  // Audio refs
  const ctxRef        = useRef<AudioContext | null>(null);
  const convolverRef  = useRef<ConvolverNode | null>(null);
  const preDelayRef   = useRef<DelayNode | null>(null);
  const hiCutRef      = useRef<BiquadFilterNode | null>(null);
  const loCutRef      = useRef<BiquadFilterNode | null>(null);
  const wetGainRef    = useRef<GainNode | null>(null);
  const dryGainRef    = useRef<GainNode | null>(null);
  const mixRef        = useRef<GainNode | null>(null);
  const schedulerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextNoteRef   = useRef(0);
  const stepRef       = useRef(0);

  // ── Draw IR on preset change ─────────────────────────────────────────────────
  useEffect(() => {
    if (irRef.current) drawIR(irRef.current, ROOM_PRESETS[preset]);
  }, [preset]);

  // ── Task tracking ────────────────────────────────────────────────────────────
  useEffect(() => {
    setTasks([
      preset === 'HALL',
      hasPlayed,
      params.preDelay >= 15,
    ]);
  }, [preset, hasPlayed, params.preDelay]);

  // ── Sync audio params live ───────────────────────────────────────────────────
  useEffect(() => {
    const ctx = ctxRef.current; if (!ctx) return;
    const t = ctx.currentTime;
    if (preDelayRef.current) preDelayRef.current.delayTime.setTargetAtTime(params.preDelay / 1000, t, 0.01);
    if (hiCutRef.current)    hiCutRef.current.frequency.setTargetAtTime(params.hiCut,  t, 0.01);
    if (loCutRef.current)    loCutRef.current.frequency.setTargetAtTime(params.loCut,  t, 0.01);
    if (wetGainRef.current)  wetGainRef.current.gain.setTargetAtTime(params.wetDry / 100, t, 0.01);
    if (dryGainRef.current)  dryGainRef.current.gain.setTargetAtTime(1 - params.wetDry / 100, t, 0.01);
  }, [params]);

  // ── Update convolver when preset changes during playback ─────────────────────
  useEffect(() => {
    const ctx = ctxRef.current; const conv = convolverRef.current;
    if (!ctx || !conv) return;
    conv.buffer = generateIR(ctx, ROOM_PRESETS[preset]);
  }, [preset]);

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

    // Mix bus (synth input)
    const mix = ctx.createGain(); mix.gain.value = 0.8; mixRef.current = mix;

    // Reverb chain: delay → convolver → hiCut → loCut → wetGain
    const preDelay  = ctx.createDelay(0.2); preDelay.delayTime.value  = params.preDelay / 1000; preDelayRef.current  = preDelay;
    const convolver = ctx.createConvolver(); convolver.buffer          = generateIR(ctx, ROOM_PRESETS[preset]); convolverRef.current = convolver;
    const hiCut     = ctx.createBiquadFilter(); hiCut.type = 'lowpass';  hiCut.frequency.value  = params.hiCut;  hiCutRef.current  = hiCut;
    const loCut     = ctx.createBiquadFilter(); loCut.type = 'highpass'; loCut.frequency.value  = params.loCut;  loCutRef.current  = loCut;
    const wetGain   = ctx.createGain(); wetGain.gain.value   = params.wetDry / 100; wetGainRef.current  = wetGain;
    const dryGain   = ctx.createGain(); dryGain.gain.value   = 1 - params.wetDry / 100; dryGainRef.current  = dryGain;

    // Connections
    mix.connect(dryGain);
    mix.connect(preDelay); preDelay.connect(convolver); convolver.connect(hiCut); hiCut.connect(loCut); loCut.connect(wetGain);
    dryGain.connect(ctx.destination);
    wetGain.connect(ctx.destination);

    nextNoteRef.current = ctx.currentTime + 0.05; stepRef.current = 0;
    runScheduler();
    setIsPlaying(true);
    setHasPlayed(true);
  }, [params, preset, runScheduler]);

  // ── Stop audio ───────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    ctxRef.current?.close();
    ctxRef.current = null; convolverRef.current = null; preDelayRef.current = null;
    hiCutRef.current = null; loCutRef.current = null; wetGainRef.current = null;
    dryGainRef.current = null; mixRef.current = null;
    setIsPlaying(false);
  }, []);

  useEffect(() => () => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    ctxRef.current?.close();
  }, []);

  const currentPreset = ROOM_PRESETS[preset];
  const TASK_LABELS   = ['Select Hall preset', 'Audition reverb', 'Set pre-delay ≥ 15ms'];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="reverb-lab">
      {/* ── Top bar ── */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--teal-dim)', border: '1px solid rgba(45,212,191,0.4)' }}>∿</div>
          <div>
            <div className="lab-name">Reverb Designer</div>
            <div className="lab-subtitle">LAB · CH 06 · IMPULSE RESPONSE · DRUM GROOVE @ {BPM} BPM</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className={`toggle-btn${isPlaying ? ' on' : ''}`}
            style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-dim)' } : {}}
            onClick={isPlaying ? stopAudio : startAudio}
          >
            {isPlaying ? '⏹ STOP' : '▶ PLAY'}
          </button>
          <span
            className="badge"
            style={{ background: 'var(--teal-dim)', borderColor: 'rgba(45,212,191,0.3)', color: 'var(--teal)' }}
          >
            ◐ ROOM: {currentPreset.name}
          </span>
          <div className="lab-status" style={{ color: isPlaying ? 'var(--teal)' : 'var(--text-dim)' }}>
            <div className="status-dot" style={{
              background:  isPlaying ? 'var(--teal)' : 'var(--text-faint)',
              boxShadow:   isPlaying ? '0 0 6px var(--teal)' : 'none',
              animation:   isPlaying ? undefined : 'none',
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
                  onClick={() => setPreset(key)}
                >
                  <div className="room-preset-icon">{p.icon}</div>
                  <div className="room-preset-name">{p.name}</div>
                </div>
              );
            })}
          </div>

          <div
            className="concept-callout"
            style={{ background: 'var(--teal-dim)', borderColor: 'rgba(45,212,191,0.2)' }}
          >
            <strong style={{ color: 'var(--teal)' }}>Concept check:</strong> Early reflections tell your
            brain the room's size and shape. The late, dense tail tells it the surface material — hard
            walls decay slower than soft ones. Current RT60: <strong style={{ color: 'var(--teal)' }}>
            {currentPreset.rt60}s</strong> ({currentPreset.label}).
          </div>
        </div>

        {/* ── Right panel ── */}
        <div className="reverb-right">
          <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>RT60 DECAY ENVELOPE</div>
          <div className="reverb-decay-viz">
            <DecayBars rt60={currentPreset.rt60} />
            <div className="decay-readout">
              <span>RT60: <strong style={{ color: 'var(--teal)' }}>{currentPreset.rt60}s</strong></span>
              <span>−60dB POINT</span>
            </div>
          </div>

          {/* ── Knob grid ── */}
          <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>REVERB PARAMETERS</div>

          {/* Disabled knobs — visual only notice */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            fontFamily: 'var(--mono)', fontSize: '0.55rem',
            color: 'var(--text-faint)', marginBottom: '0.6rem',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '0.3rem 0.6rem',
          }}>
            <span style={{ color: 'var(--amber)', fontWeight: 600 }}>⚠</span>
            SIZE · DECAY · DAMPING · DIFFUSION are display-only — not exposed by the Web Audio API ConvolverNode.
          </div>

          <div className="reverb-knob-grid">
            {/* Row 1: SIZE (disabled), DECAY (disabled), PRE-DELAY (active), DAMPING (disabled) */}
            <DisabledKnob label="SIZE"      value={DISABLED_KNOBS[0].value} fmt={DISABLED_KNOBS[0].fmt} pos={2} />
            <DisabledKnob label="DECAY"     value={DISABLED_KNOBS[1].value} fmt={DISABLED_KNOBS[1].fmt} pos={3} />
            <ActiveKnob
              spec={ACTIVE_KNOBS.preDelay}
              value={params.preDelay}
              onChange={v => setParams(p => ({ ...p, preDelay: v }))}
            />
            <DisabledKnob label="DAMPING"   value={DISABLED_KNOBS[2].value} fmt={DISABLED_KNOBS[2].fmt} pos={1} />

            {/* Row 2: DIFFUSION (disabled), HI-CUT (active), LO-CUT (active), WET/DRY (active) */}
            <DisabledKnob label="DIFFUSION" value={DISABLED_KNOBS[3].value} fmt={DISABLED_KNOBS[3].fmt} pos={4} />
            <ActiveKnob
              spec={ACTIVE_KNOBS.hiCut}
              value={params.hiCut}
              onChange={v => setParams(p => ({ ...p, hiCut: v }))}
            />
            <ActiveKnob
              spec={ACTIVE_KNOBS.loCut}
              value={params.loCut}
              onChange={v => setParams(p => ({ ...p, loCut: v }))}
            />
            <ActiveKnob
              spec={ACTIVE_KNOBS.wetDry}
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
            {(['preDelay', 'hiCut', 'loCut', 'wetDry'] as (keyof ReverbParams)[]).map(key => (
              <div key={key} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--teal)', fontWeight: 500 }}>
                  {ACTIVE_KNOBS[key].fmt(params[key])}
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.5rem', color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
                  {ACTIVE_KNOBS[key].label}
                </div>
              </div>
            ))}
          </div>

          <div className="tip-box" style={{ marginTop: '0.75rem', background: 'rgba(45,212,191,0.07)', borderColor: 'rgba(45,212,191,0.2)' }}>
            <strong style={{ color: 'var(--teal)' }}>Web Audio:</strong> Uses{' '}
            <span style={{ color: 'var(--text)' }}>ConvolverNode</span> with a synthetic impulse response.
            Pre-delay, Hi-Cut, Lo-Cut and Wet/Dry are fully functional. Drag knobs vertically to adjust.
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
            onClick={() => { setPreset(DEFAULT_PRESET); setParams({ ...DEFAULTS }); }}
          >
            Reset
          </button>
          <button className="btn-primary">Submit &amp; Continue →</button>
        </div>
      </div>
    </div>
  );
}
