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

interface ChallengeParams { threshold: number; ratio: number; knee: number; }

interface KnobSpec {
  key:   keyof CompParams;
  label: string;
  min:   number;
  max:   number;
  step:  number;
  fmt:   (v: number) => string;
}

interface ChallengeKnobSpec {
  key:   keyof ChallengeParams;
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

const CHALLENGE_KNOBS: ChallengeKnobSpec[] = [
  { key: 'threshold', label: 'THRESHOLD', min: -60, max: 0,  step: 0.5, fmt: v => `${v.toFixed(0)} dB` },
  { key: 'ratio',     label: 'RATIO',     min: 1,   max: 20, step: 0.1, fmt: v => `${v.toFixed(1)} : 1` },
  { key: 'knee',      label: 'KNEE',      min: 0,   max: 40, step: 0.5, fmt: v => v < 5 ? 'HARD' : v < 20 ? 'MED' : 'SOFT' },
];

const DEFAULTS: CompParams = {
  threshold: -24,
  ratio:      4,
  attack:     10,
  release:    200,
  knee:       20,
  makeup:      6,
};

const CHALLENGE_START: ChallengeParams = { threshold: -20, ratio: 2, knee: 15 };

// ── Challenge presets (hidden from student) ───────────────────────────────────
interface Preset { name: string; description: string; target: ChallengeParams; tip: string; }

const PRESETS: Preset[] = [
  {
    name: 'GENTLE GLUE',
    description: 'Smooth peaks without squashing energy. Classic mix bus setting.',
    target: { threshold: -28, ratio: 3, knee: 8 },
    tip: 'Low ratio + moderate knee = transparent glue. Set threshold deep so it catches most peaks.',
  },
  {
    name: 'PUNCHY DRUMS',
    description: 'Tight transient control. The kick hits hard but sits in the mix.',
    target: { threshold: -18, ratio: 8, knee: 2 },
    tip: 'Higher ratio + hard knee = punchy, controlled attack. Threshold just above the floor.',
  },
  {
    name: 'HARD LIMIT',
    description: 'Brick wall ceiling. Nothing above threshold makes it through.',
    target: { threshold: -8, ratio: 20, knee: 0 },
    tip: 'High ratio + zero knee = limiting. Threshold set where peaks just clip without it.',
  },
];

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

// Score: compare transfer curves at 61 sample points, RMS diff → 0-100
function calcScore(target: ChallengeParams, user: ChallengeParams): number {
  let sumSq = 0;
  const N = 60;
  for (let i = 0; i <= N; i++) {
    const db = -60 + i;
    const t  = applyCompression(db, target);
    const u  = applyCompression(db, user);
    sumSq   += (t - u) ** 2;
  }
  const rms = Math.sqrt(sumSq / (N + 1));
  return Math.max(0, Math.min(100, Math.round(100 * (1 - rms / 10))));
}

// Per-param closeness (0–100) for the accuracy bars
function paramAccuracy(
  key: keyof ChallengeParams,
  target: ChallengeParams,
  user: ChallengeParams,
): { pct: number; diff: string } {
  const ranges: Record<keyof ChallengeParams, number> = { threshold: 60, ratio: 19, knee: 40 };
  const err  = Math.abs(target[key] - user[key]);
  const pct  = Math.max(0, Math.min(100, Math.round(100 * (1 - err / (ranges[key] * 0.5)))));
  const diff = target[key] - user[key];
  const sign = diff > 0 ? '+' : '';
  const label = key === 'ratio'
    ? `${sign}${diff.toFixed(1)}`
    : `${sign}${diff.toFixed(1)} dB`;
  return { pct, diff: label };
}

// ── Canvas: main transfer function ────────────────────────────────────────────
function drawTransfer(canvas: HTMLCanvasElement, params: CompParams) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const W = canvas.width, H = canvas.height;
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

  // Unity line
  ctx.strokeStyle = '#2E2E3D'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(toX(DB_MIN), toY(DB_MIN)); ctx.lineTo(toX(DB_MAX), toY(DB_MAX)); ctx.stroke();
  ctx.setLineDash([]);

  // Threshold marker
  ctx.strokeStyle = '#3D3D52'; ctx.setLineDash([2, 3]);
  const tx = toX(params.threshold);
  ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, H); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#4A4A5A'; ctx.font = '8px JetBrains Mono, monospace';
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

  // Labels
  ctx.fillStyle = '#4A4A5A'; ctx.font = '7px JetBrains Mono, monospace';
  ctx.fillText('INPUT →', W - 46, H - 5);
  ctx.save(); ctx.translate(9, H * 0.38); ctx.rotate(-Math.PI / 2);
  ctx.fillText('↑ OUT', 0, 0); ctx.restore();
}

// ── Canvas: challenge transfer ─────────────────────────────────────────────────
// showTarget=false (during challenge): only user curve, "MATCH BY EAR" hint
// showTarget=true  (after submit):     both curves revealed
function drawChallenge(
  canvas: HTMLCanvasElement,
  target: ChallengeParams,
  user:   ChallengeParams,
  showTarget: boolean,
) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const DB_MIN = -60, DB_MAX = 0;
  const toX = (db: number) => ((db - DB_MIN) / (DB_MAX - DB_MIN)) * W;
  const toY = (db: number) => H - ((db - DB_MIN) / (DB_MAX - DB_MIN)) * H;

  // Background + grid
  ctx.fillStyle = '#0D0D0F'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
  for (let db = DB_MIN; db <= DB_MAX; db += 10) {
    ctx.beginPath(); ctx.moveTo(toX(db), 0); ctx.lineTo(toX(db), H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, toY(db)); ctx.lineTo(W, toY(db)); ctx.stroke();
  }

  // Unity line
  ctx.strokeStyle = '#2E2E3D'; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(toX(DB_MIN), toY(DB_MIN)); ctx.lineTo(toX(DB_MAX), toY(DB_MAX)); ctx.stroke();
  ctx.setLineDash([]);

  // dB axis labels
  ctx.fillStyle = '#3D3D52'; ctx.font = '7px JetBrains Mono, monospace';
  for (let db = -60; db <= 0; db += 10) {
    ctx.fillText(`${db}`, toX(db) + 2, H - 3);
  }

  const drawCurve = (p: ShapeParams, strokeColor: string, fillColor: string, lineW: number, dash: number[]) => {
    ctx.setLineDash(dash);
    ctx.fillStyle = fillColor;
    ctx.beginPath(); let first = true;
    for (let db = DB_MIN; db <= DB_MAX; db += 0.5) {
      const x = toX(db), y = toY(applyCompression(db, p));
      first ? (ctx.moveTo(x, H), ctx.lineTo(x, y), (first = false)) : ctx.lineTo(x, y);
    }
    ctx.lineTo(toX(DB_MAX), H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = strokeColor; ctx.lineWidth = lineW;
    ctx.beginPath(); first = true;
    for (let db = DB_MIN; db <= DB_MAX; db += 0.5) {
      const x = toX(db), y = toY(applyCompression(db, p));
      first ? (ctx.moveTo(x, y), (first = false)) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // Target — only revealed after submit
  if (showTarget) {
    drawCurve(target, '#F5A623', 'rgba(245,166,35,0.07)', 2, [6, 4]);
  } else {
    // "Match by ear" hint watermark
    ctx.fillStyle = 'rgba(245,166,35,0.22)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText('TARGET HIDDEN — USE HEAR TARGET TO LISTEN & MATCH', W / 2 - 196, 18);
  }

  // User curve (always visible)
  drawCurve(user, '#A78BFA', 'rgba(167,139,250,0.08)', 2.5, []);

  // Axis labels
  ctx.fillStyle = '#4A4A5A'; ctx.font = '7px JetBrains Mono, monospace';
  ctx.fillText('INPUT →', W - 46, H - 5);
  ctx.save(); ctx.translate(9, H * 0.38); ctx.rotate(-Math.PI / 2);
  ctx.fillText('↑ OUT', 0, 0); ctx.restore();
}

// ── Canvas: waveform ──────────────────────────────────────────────────────────
function drawWaveform(canvas: HTMLCanvasElement, data: Float32Array, color: string) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const W = canvas.width, H = canvas.height;
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

function Knob({
  spec, value, arcColor, onChange,
}: {
  spec: { label: string; min: number; max: number; step: number; fmt: (v: number) => string };
  value: number;
  arcColor: string;
  onChange: (delta: number) => void;
}) {
  const rot       = knobRotation(value, spec.min, spec.max);
  const dragState = useRef<{ startY: number; startVal: number } | null>(null);

  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = { startY: e.clientY, startVal: value };
  }, [value]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragState.current; if (!d) return;
      const sens  = (spec.max - spec.min) / 220;
      const raw   = d.startVal + (d.startY - e.clientY) * sens;
      const snapped = Math.round(raw / spec.step) * spec.step;
      const clamped = Math.min(spec.max, Math.max(spec.min, snapped));
      onChange(clamped);
    };
    const onUp = () => { dragState.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [spec, onChange]);

  return (
    <div className="knob-wrap">
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <svg style={{ position: 'absolute', top: 0, left: 0 }} width={64} height={64} viewBox="-32 -32 64 64">
          <path d={describeArc(28, -140, 140)} fill="none" stroke="#2E2E3D" strokeWidth={3} strokeLinecap="round" />
          <path d={describeArc(28, -140, rot)} fill="none" stroke={arcColor} strokeWidth={3} strokeLinecap="round" opacity={0.85} />
        </svg>
        <div
          className="big-knob"
          style={{ position: 'absolute', top: 6, left: 6, width: 52, height: 52, cursor: 'ns-resize', userSelect: 'none' }}
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
      <div className="knob-val" style={{ color: arcColor }}>{spec.fmt(value)}</div>
    </div>
  );
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

  // Challenge state
  const [presetIdx,      setPresetIdx]      = useState(0);
  const [challengeParams, setChallengeParams] = useState<ChallengeParams>(CHALLENGE_START);
  const [submitted,      setSubmitted]      = useState(false);
  const [hearingMode,    setHearingMode]    = useState<'none' | 'target' | 'mine'>('none');
  const hearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const preset = PRESETS[presetIdx];
  const score  = calcScore(preset.target, challengeParams);
  const passed = score >= 88;

  // Canvas refs
  const transferRef  = useRef<HTMLCanvasElement>(null);
  const challengeRef = useRef<HTMLCanvasElement>(null);
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

  // ── Challenge canvas ──────────────────────────────────────────────────────
  useEffect(() => {
    if (challengeRef.current) drawChallenge(challengeRef.current, preset.target, challengeParams, submitted);
  }, [preset, challengeParams, submitted]);

  // Reset challenge when preset changes
  useEffect(() => {
    setChallengeParams(CHALLENGE_START);
    setSubmitted(false);
    setHearingMode('none');
  }, [presetIdx]);

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

    nextNoteRef.current = ctx.currentTime + 0.05; currentStepRef.current = 0;
    runScheduler(); animRef.current = requestAnimationFrame(animate);
    setIsPlaying(true);
  }, [params, runScheduler, animate]);

  // ── Hearing mode: persistent A/B toggle ───────────────────────────────────
  // Click a mode button to lock into it; click the same button again to release.
  // Target mode compensates makeup gain for GR so volume is level-matched —
  // the student hears compression CHARACTER, not just "quieter".
  const handleHear = useCallback((mode: 'target' | 'mine') => {
    if (!ctxRef.current) startAudio();
    const comp   = compRef.current;
    const ctx    = ctxRef.current;
    if (!comp || !ctx) return;

    if (hearTimerRef.current) clearTimeout(hearTimerRef.current);
    const t = ctx.currentTime;

    // Toggle off: same button clicked again → restore main lab params
    if (hearingMode === mode) {
      comp.threshold.setTargetAtTime(params.threshold, t, 0.01);
      comp.ratio.setTargetAtTime(params.ratio,     t, 0.01);
      comp.knee.setTargetAtTime(params.knee,       t, 0.01);
      if (makeupRef.current)
        makeupRef.current.gain.setTargetAtTime(10 ** (params.makeup / 20), t, 0.01);
      setHearingMode('none');
      return;
    }

    // Switch to requested mode
    const p = mode === 'target' ? preset.target : challengeParams;
    comp.threshold.setTargetAtTime(p.threshold, t, 0.01);
    comp.ratio.setTargetAtTime(p.ratio,     t, 0.01);
    comp.knee.setTargetAtTime(p.knee,       t, 0.01);

    // Mine = no extra compensation (challengeParams usually has low/no compression)
    if (makeupRef.current)
      makeupRef.current.gain.setTargetAtTime(10 ** (params.makeup / 20), t, 0.01);

    setHearingMode(mode);

    // Target mode: after 250 ms let compression settle, then read actual GR
    // and compensate makeup gain so loudness matches Mine. Student hears
    // texture/dynamics difference, not just "it got quieter".
    if (mode === 'target') {
      hearTimerRef.current = setTimeout(() => {
        if (!compRef.current || !ctxRef.current || !makeupRef.current) return;
        const gr = compRef.current.reduction; // e.g. -8 dB
        const compensated = 10 ** ((params.makeup - gr) / 20);
        makeupRef.current.gain.setTargetAtTime(compensated, ctxRef.current.currentTime, 0.05);
      }, 250);
    }
  }, [hearingMode, preset.target, challengeParams, params, startAudio]);

  const stopAudio = useCallback(() => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    if (hearTimerRef.current)  clearTimeout(hearTimerRef.current);
    cancelAnimationFrame(animRef.current);
    ctxRef.current?.close();
    ctxRef.current = null; compRef.current = null; makeupRef.current = null;
    dryAnalRef.current = null; wetAnalRef.current = null; mixRef.current = null;
    sidechainGainRef.current = null;
    dryBlendRef.current = null; wetBlendRef.current = null; outputRef.current = null;
    setGR(0); setIsPlaying(false); setHearingMode('none');
    [dryRef, wetRef].forEach(r => {
      if (!r.current) return;
      const c = r.current.getContext('2d')!;
      c.fillStyle = '#22222E'; c.fillRect(0, 0, r.current.width, r.current.height);
    });
  }, []);

  useEffect(() => () => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    if (hearTimerRef.current)  clearTimeout(hearTimerRef.current);
    cancelAnimationFrame(animRef.current);
    ctxRef.current?.close();
  }, []);

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
    {/* ══ MAIN LAB ══ */}
    <div className="comp-lab">
      {/* Top bar */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--purple-dim)', border: '1px solid rgba(167,139,250,0.4)' }}>⬡</div>
          <div>
            <div className="lab-name">Compressor Studio</div>
            <div className="lab-subtitle">LAB · CH 04 · DYNAMICS · DRUM GROOVE @ {BPM} BPM</div>
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
            <button className={`toggle-btn${sidechain ? ' on' : ''}`} onClick={() => setSidechain(s => !s)}>SIDECHAIN</button>
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
              <strong style={{ color: 'var(--amber)' }}>Signal:</strong> Synthesised drum groove — kick, snare, hi-hat + bass. Percussive transients make compression clearly audible.
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

    {/* ══ CHALLENGE PANEL ══ */}
    <div className="comp-lab" style={{ marginTop: '1.5rem' }}>
      {/* Top bar */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--amber-dim)', border: '1px solid var(--amber-glow)' }}>★</div>
          <div>
            <div className="lab-name">Transfer Curve Challenge</div>
            <div className="lab-subtitle">LAB · CH 04 · MATCH THE TARGET COMPRESSION SHAPE</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Preset selector */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {PRESETS.map((p, i) => (
              <button
                key={i}
                className={`toggle-btn${presetIdx === i ? ' on' : ''}`}
                style={presetIdx === i ? { borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-dim)' } : {}}
                onClick={() => setPresetIdx(i)}
              >
                {p.name}
              </button>
            ))}
          </div>
          {submitted && (
            <div className="lab-status" style={{ color: passed ? 'var(--green)' : 'var(--amber)' }}>
              <div className="status-dot" style={{
                background: passed ? 'var(--green)' : 'var(--amber)',
                boxShadow: passed ? '0 0 6px var(--green)' : '0 0 6px var(--amber)',
              }} />
              SCORE: {score}%
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="comp-body">
        {/* Left: challenge canvas + 3 knobs */}
        <div className="comp-controls">
          {/* Legend */}
          <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.75rem' }}>
            {submitted && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--text-dim)' }}>
                <div style={{ width: 24, height: 2, background: 'var(--amber)', borderRadius: 1 }} />
                TARGET CURVE
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--text-dim)' }}>
              <div style={{ width: 24, height: 2, background: 'var(--purple)', borderRadius: 1 }} />
              YOUR CURVE
            </div>
          </div>

          {/* Challenge canvas */}
          <div className="transfer-graph" style={{ height: 220, marginBottom: '1.25rem' }}>
            <canvas ref={challengeRef} width={400} height={220}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          </div>

          {/* Challenge description */}
          <div className="canvas-label" style={{ marginBottom: '0.5rem' }}>DIAL IN THRESHOLD · RATIO · KNEE</div>
          <div className="knob-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            {CHALLENGE_KNOBS.map(spec => (
              <Knob
                key={spec.key}
                spec={spec}
                value={challengeParams[spec.key]}
                arcColor="var(--amber)"
                onChange={val => setChallengeParams(p => ({ ...p, [spec.key]: val }))}
              />
            ))}
          </div>
        </div>

        {/* Right: score + accuracy bars + tip */}
        <div className="comp-visual" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Score ring — hidden until submit */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem' }}>
            {submitted ? (
              <>
                <svg width={100} height={100} viewBox="-50 -50 100 100">
                  <circle cx={0} cy={0} r={42} fill="none" stroke="var(--surface)" strokeWidth={7} />
                  <path
                    d={describeArc(42, -140, -140 + 280 * (score / 100))}
                    fill="none"
                    stroke={passed ? 'var(--green)' : score > 60 ? 'var(--amber)' : 'var(--purple)'}
                    strokeWidth={7}
                    strokeLinecap="round"
                  />
                  <text x={0} y={6} textAnchor="middle" fontFamily="var(--display)" fontWeight={700} fontSize={22}
                    fill={passed ? 'var(--green)' : score > 60 ? 'var(--amber)' : 'var(--purple)'}>
                    {score}
                  </text>
                  <text x={0} y={20} textAnchor="middle" fontFamily="var(--mono)" fontSize={7} fill="var(--text-faint)" letterSpacing={1}>
                    SCORE
                  </text>
                </svg>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: passed ? 'var(--green)' : 'var(--text-dim)', letterSpacing: '0.08em' }}>
                  {passed ? '✓ CURVE MATCHED' : score > 60 ? 'GETTING CLOSE' : 'KEEP DIALING'}
                </div>
              </>
            ) : (
              <>
                <svg width={100} height={100} viewBox="-50 -50 100 100">
                  <circle cx={0} cy={0} r={42} fill="none" stroke="var(--surface)" strokeWidth={7} />
                  <text x={0} y={5} textAnchor="middle" fontFamily="var(--mono)" fontSize={11} fill="var(--text-faint)" letterSpacing={1}>SUBMIT</text>
                  <text x={0} y={18} textAnchor="middle" fontFamily="var(--mono)" fontSize={9} fill="var(--text-faint)" letterSpacing={1}>TO SEE</text>
                </svg>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--text-faint)', letterSpacing: '0.08em' }}>
                  SCORE HIDDEN
                </div>
              </>
            )}
          </div>

          {/* Per-param accuracy bars — hidden until submit */}
          <div>
            <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>PARAMETER ACCURACY</div>
            {submitted ? (
              CHALLENGE_KNOBS.map(spec => {
                const { pct, diff } = paramAccuracy(spec.key, preset.target, challengeParams);
                const barColor = pct > 85 ? 'var(--green)' : pct > 55 ? 'var(--amber)' : 'var(--red)';
                return (
                  <div key={spec.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--text-dim)', width: 64 }}>{spec.label}</div>
                    <div style={{ flex: 1, height: 4, background: 'var(--surface)', borderRadius: 2 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.15s, background 0.15s' }} />
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: barColor, width: 44, textAlign: 'right' }}>
                      {pct === 100 ? '✓' : diff}
                    </div>
                  </div>
                );
              })
            ) : (
              CHALLENGE_KNOBS.map(spec => (
                <div key={spec.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--text-dim)', width: 64 }}>{spec.label}</div>
                  <div style={{ flex: 1, height: 4, background: 'var(--surface)', borderRadius: 2 }}>
                    <div style={{ width: '0%', height: '100%', background: 'var(--surface-2)', borderRadius: 2 }} />
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '0.6rem', color: 'var(--text-faint)', width: 44, textAlign: 'right' }}>—</div>
                </div>
              ))
            )}
          </div>

          {/* Tip */}
          <div className="tip-box" style={{ background: 'rgba(245,166,35,0.07)', borderColor: 'rgba(245,166,35,0.2)', flex: 1 }}>
            <strong style={{ color: 'var(--amber)' }}>{preset.name}:</strong>{' '}
            {preset.description}
            <br /><br />
            <em style={{ color: 'var(--text-faint)' }}>{preset.tip}</em>
          </div>

          {/* Hear hint */}
          <div className="tip-box" style={{ background: 'rgba(77,158,255,0.06)', borderColor: 'rgba(77,158,255,0.18)' }}>
            <strong style={{ color: 'var(--blue)' }}>Hear Target</strong> locks into target compression — click again to release. <strong style={{ color: 'var(--purple)' }}>Hear Mine</strong> switches to your current knob settings. Toggle back and forth to compare.
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="lab-footer">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--text-faint)' }}>
            {submitted
              ? `Score: ${score}% — target curve revealed above`
              : 'Use Hear Target & Hear Mine to match by ear, then submit'}
          </div>
          {submitted && passed && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: '0.65rem', color: 'var(--green)', background: 'var(--green-dim)', padding: '0.2rem 0.6rem', borderRadius: 3, border: '1px solid rgba(0,255,135,0.3)' }}>
              ✓ PASSED
            </div>
          )}
        </div>
        <div className="btn-row">
          <button
            className={`toggle-btn${isPlaying ? ' on' : ''}`}
            style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-dim)' } : {}}
            onClick={isPlaying ? stopAudio : startAudio}
          >
            {isPlaying ? '⏹ STOP' : '▶ PLAY'}
          </button>
          <button
            className="btn-secondary"
            style={hearingMode === 'target' ? { borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-dim)' } : {}}
            onClick={() => handleHear('target')}
          >
            {hearingMode === 'target' ? '◼ Target (on)' : '▶ Hear Target'}
          </button>
          <button
            className="btn-secondary"
            style={hearingMode === 'mine' ? { borderColor: 'var(--purple)', color: 'var(--purple)', background: 'var(--purple-dim)' } : {}}
            onClick={() => handleHear('mine')}
          >
            {hearingMode === 'mine' ? '◼ Mine (on)' : '▶ Hear Mine'}
          </button>
          <button
            className="btn-primary"
            onClick={() => setSubmitted(true)}
          >
            {submitted ? 'Score Submitted ✓' : 'Submit Score →'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
