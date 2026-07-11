import { useRef, useState, useEffect, useCallback } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { Knob, type KnobSpec } from '../components/Knob';
import { compileFaustWasm, type FaustDspMeta, type FaustNodeLike } from '../faust/faustTypes';
import { downloadAudioBufferAsWav } from '../audio/wavRender';

// ── Types ──────────────────────────────────────────────────────────────────────
type PresetKey = 'ROOM' | 'CHAMBER' | 'HALL' | 'CATHEDRAL' | 'PLATE';

interface RoomPreset {
  name: string;
  icon: string;
  rt60: number;       // seconds (visual only — IR generated from this)
  earlyCount: number; // number of early reflection spikes
  label: string;
}

// An uploaded audio track that can be used as the signal source instead of
// the built-in drum groove, so reverb can be auditioned on real material.
interface UploadedTrack { id: number; name: string; buffer: AudioBuffer; }

interface ReverbParams {
  preDelay:     number; // ms  0 → 100
  // ── Shelving filters (replace the old HPF/LPF hi-cut/lo-cut) ──
  hiShelfFreq:  number; // Hz  20 → 20000 — corner freq of the high shelf
  hiShelfGain:  number; // dB -24 → 6
  loShelfFreq:  number; // Hz  20 → 2000  — corner freq of the low shelf
  loShelfGain:  number; // dB -24 → 6
  wetDry:       number; // %   0 → 100
  // ── Freeverb parameters (powered by the Faust reverbs.lib stereo_freeverb) ──
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
  // Positions/amplitudes are an illustrative model of how a real IR would
  // look for these knob settings (the actual audio comes from the Faust
  // reverb node, which doesn't expose this shape directly):
  //   - line X (distance) = the reflection's modeled arrival time, mapped through
  //     the same time→x scale as the axis labels at the bottom.
  //   - line height (amplitude) = the reflection's real gain, on the same 0–1
  //     scale as the direct spike (whose height = bottom-20 = amplitude 1.0).
  // SIZE  → spreads arrival times (larger room = reflections arrive later / further right)
  // DAMPING → reduces amplitude (absorptive surfaces soak up energy)
  // DIFFUSION → high diffusion merges early reflections into the tail faster (fewer distinct spikes)
  const sizeSpread   = 0.5 + (fv.size     / 100) * 1.0;   // 0.5× … 1.5×
  const dampAtten    = 1.0 - (fv.damping  / 100) * 0.75;  // 1.0  … 0.25
  const visibleCount = Math.max(1, Math.round(
    preset.earlyCount * (1 - (fv.diffusion / 100) * 0.6)   // 40% … 100% of preset count
  ));

  // Illustrative early-reflection delays (ms) and their amplitude falloff
  const EARLY_DELAYS_MS = [3, 8, 15, 23, 35, 50, 70];
  const EARLY_AMPS = EARLY_DELAYS_MS.map((_, i) => 0.7 * Math.exp(-i * 0.35));

  // Piecewise-linear time→x mapping, anchored to the same points the time
  // axis labels below claim (0ms, 50ms, 200ms, 500ms, 1s) so a reflection's
  // x-position is honest about when it actually arrives.
  const TIME_STOPS = [
    { ms: 0,    x: 20  },
    { ms: 50,   x: 55  },
    { ms: 200,  x: 150 },
    { ms: 500,  x: 330 },
    { ms: 1000, x: 480 },
  ];
  function timeToX(ms: number): number {
    for (let i = 0; i < TIME_STOPS.length - 1; i++) {
      const a = TIME_STOPS[i], b = TIME_STOPS[i + 1];
      if (ms <= b.ms) return a.x + ((ms - a.ms) / (b.ms - a.ms)) * (b.x - a.x);
    }
    const last = TIME_STOPS[TIME_STOPS.length - 1];
    const prev = TIME_STOPS[TIME_STOPS.length - 2];
    const slope = (last.x - prev.x) / (last.ms - prev.ms);
    return last.x + (ms - last.ms) * slope;
  }

  const directAmpHeight = bottom - 20; // px per unit amplitude (direct spike = amplitude 1.0)

  EARLY_DELAYS_MS.slice(0, visibleCount).forEach((ms, i) => {
    const delayedMs = ms * sizeSpread;                    // SIZE stretches arrival time
    const x = Math.min(W - 10, timeToX(delayedMs));        // distance = real arrival time
    const h = Math.max(2, directAmpHeight * EARLY_AMPS[i] * dampAtten); // height = real amplitude
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

// ── Live Reverb Tail Scope ───────────────────────────────────────────────────
// The IR diagram above is illustrative — a formula-driven approximation of
// what a room like this *should* look like, redrawn whenever a knob moves,
// but never actually reacting to real audio. This is the real counterpart:
// a scrolling, real audio-driven analyzer tapping the actual dry input and
// the actual Faust reverb output, so students can watch the tail literally
// ring out after a drum hit and see it change live as SIZE / DECAY / DAMPING
// / DIFFUSION / PRE-DELAY / WET-DRY are adjusted — instead of only seeing a
// static diagram redraw. The window is long (6s) since reverb tails run much
// longer than the transients the compressor/gate/limiter scopes track.
const SCOPE_WINDOW_S = 6;
const SCOPE_MIN_DB   = -72;
const SCOPE_MAX_DB   = 6;

interface ScopePoint { t: number; inputDb: number; outputDb: number; }

function drawReverbScope(canvas: HTMLCanvasElement, history: ScopePoint[], nowT: number, active: boolean) {
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
    ctx.fillText('HIT PLAY TO SEE THE TAIL RING OUT', W / 2 - 110, H / 2);
    return;
  }

  const visible = history.filter(p => p.t >= nowT - SCOPE_WINDOW_S - 0.25);
  if (visible.length < 2) return;

  const inPts  = visible.map(p => ({ x: toX(p.t), y: toY(p.inputDb) }));
  const outPts = visible.map(p => ({ x: toX(p.t), y: toY(p.outputDb) }));

  // Shaded gap — the reverb tail itself. Wherever the wet output persists
  // once the dry input has already died away (right after a drum hit), the
  // widening/lingering teal region is literally the room's contribution —
  // the same color as the "LATE DECAY (TAIL)" label in the IR diagram above.
  ctx.save(); ctx.globalAlpha = 0.24; ctx.fillStyle = '#2DD4BF';
  ctx.beginPath();
  ctx.moveTo(inPts[0].x, inPts[0].y);
  for (const p of inPts.slice(1)) ctx.lineTo(p.x, p.y);
  for (let i = outPts.length - 1; i >= 0; i--) ctx.lineTo(outPts[i].x, outPts[i].y);
  ctx.closePath(); ctx.fill(); ctx.restore();

  // Dry (input) trace — amber, matching the "DIRECT" color in the IR diagram
  ctx.save(); ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#F5A623'; ctx.lineWidth = 1.25;
  ctx.beginPath(); ctx.moveTo(inPts[0].x, inPts[0].y);
  for (const p of inPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke(); ctx.restore();

  // Wet (output) trace — the actual reverb tail reaching the ear
  ctx.strokeStyle = '#2DD4BF'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(outPts[0].x, outPts[0].y);
  for (const p of outPts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

// ── Level ballistics — feeds the live scope's smoothed input/output dB,
// same fast-attack/slow-release approach as the compressor/gate/limiter
// scopes elsewhere in this app.
const METER_FLOOR_DB = -70;
const LEVEL_ATTACK_S  = 0.015;
const LEVEL_RELEASE_S = 0.35;

function levelBallistic(prev: number, target: number, dt: number): number {
  if (dt <= 0) return prev;
  const tau = target > prev ? LEVEL_ATTACK_S : LEVEL_RELEASE_S;
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
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
  // `peakTarget / peak` alone would also turn a quiet file UP to hit
  // peakTarget, baking a silent gain boost into the uploaded buffer itself —
  // audible even with the effect bypassed, since it happens once at upload
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

function scheduleStep(ctx: AudioContext, dest: AudioNode, step: number, t: number) {
  if (PAT_KICK[step])  synthKick (ctx, dest, t);
  if (PAT_SNARE[step]) synthSnare(ctx, dest, t);
  if (PAT_HAT[step])   synthHihat(ctx, dest, t, false);
  if (PAT_OPEN[step])  synthHihat(ctx, dest, t, true);
  if (PAT_BASS[step])  synthBass (ctx, dest, t, PAT_BASS[step]);
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
  preDelay:    { label: 'PRE-DELAY',      min: 0,   max: 100,   step: 1,   fmt: v => `${Math.round(v)}ms`, accent: 'var(--teal)' },
  // Shelving filters — replace the old HI-CUT (lowpass) / LO-CUT (highpass)
  hiShelfFreq: { label: 'HI-SHELF FREQ', min: 20,  max: 20000, step: 100, fmt: v => v >= 1000 ? `${(v/1000).toFixed(1)}kHz` : `${Math.round(v)}Hz`, accent: 'var(--teal)' },
  hiShelfGain: { label: 'HI-SHELF GAIN', min: -24, max: 6,     step: 0.1, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`, accent: 'var(--teal)' },
  loShelfFreq: { label: 'LO-SHELF FREQ', min: 20,  max: 2000,  step: 1,   fmt: v => `${Math.round(v)}Hz`, accent: 'var(--teal)' },
  loShelfGain: { label: 'LO-SHELF GAIN', min: -24, max: 6,     step: 0.1, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`, accent: 'var(--teal)' },
  wetDry:      { label: 'WET/DRY',       min: 0,   max: 100,   step: 1,   fmt: v => `${Math.round(v)}%`, accent: 'var(--teal)' },
  // Freeverb knobs
  size:      { label: 'SIZE',      min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`,  accent: 'var(--purple)' },
  decay:     { label: 'DECAY',     min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`,  accent: 'var(--purple)' },
  damping:   { label: 'DAMPING',   min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`,  accent: 'var(--purple)' },
  diffusion: { label: 'DIFFUSION', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`,  accent: 'var(--purple)' },
};

// ── Defaults — mirror the `init` values in public/faust/reverb/dsp-meta.json ──
const DEFAULTS: ReverbParams = {
  preDelay:     24,
  hiShelfFreq:  8000,
  hiShelfGain:  -6,
  loShelfFreq:  120,
  loShelfGain:  -6,
  wetDry:       35,
  ...PRESET_FREEVERB['HALL'],
};
const DEFAULT_PRESET: PresetKey = 'HALL';

// ── Faust reverb engine wiring ────────────────────────────────────────────────
// Real DSP: public/faust/reverb/ (dsp-module.wasm + dsp-meta.json), a Faust
// patch built on reverbs.lib's stereo_freeverb, exported straight from the
// Faust IDE — replaces the old hand-rolled Freeverb AudioWorklet + separate
// BiquadFilterNode hi-cut/lo-cut chain with the real Faust DSP, driven the
// same way as the ParamEQ patch in Chapter2b and the compressor in Chapter4.
// The patch owns pre-delay, the high/low shelving filters, and the wet/dry
// mix internally, so no external DelayNode/BiquadFilterNode/GainNode chain
// is needed around it anymore.
const FAUST_BASE_PATH = '/faust/reverb';

// Faust addresses, from public/faust/reverb/dsp-meta.json's `ui` tree.
const ADDR = {
  damping:     '/Reverb_Parameters/DAMPING',
  decay:       '/Reverb_Parameters/DECAY',
  diffusion:   '/Reverb_Parameters/DIFFUSION',
  hiShelfFreq: '/Reverb_Parameters/HI-CUT_Freq',
  hiShelfGain: '/Reverb_Parameters/HI-SHELF_Gain',
  loShelfFreq: '/Reverb_Parameters/LO-CUT_Freq',
  loShelfGain: '/Reverb_Parameters/LO-SHELF_Gain',
  preDelay:    '/Reverb_Parameters/PRE-DELAY',
  size:        '/Reverb_Parameters/SIZE',
  wetDry:      '/Reverb_Parameters/WET-DRY',
} as const;

// Pushes every UI param onto a live Faust node. SIZE/DECAY/DAMPING/DIFFUSION/
// WET-DRY are 0..1 in the patch but 0..100 (%) on the knobs; the shelving
// filter freqs/gains and pre-delay already match the patch's own units.
function pushFaustParams(node: FaustNodeLike, p: ReverbParams) {
  node.setParamValue(ADDR.damping,     p.damping     / 100);
  node.setParamValue(ADDR.decay,       p.decay       / 100);
  node.setParamValue(ADDR.diffusion,   p.diffusion   / 100);
  node.setParamValue(ADDR.hiShelfFreq, p.hiShelfFreq);
  node.setParamValue(ADDR.hiShelfGain, p.hiShelfGain);
  node.setParamValue(ADDR.loShelfFreq, p.loShelfFreq);
  node.setParamValue(ADDR.loShelfGain, p.loShelfGain);
  node.setParamValue(ADDR.preDelay,    p.preDelay);
  node.setParamValue(ADDR.size,        p.size        / 100);
  node.setParamValue(ADDR.wetDry,      p.wetDry      / 100);
}

// Renders an uploaded track through the same Faust reverb patch offline, so
// it can be exported as a WAV — mirrors the live graph in startAudio() but
// with no scheduler/meters.
async function renderReverbOffline(
  generator: FaustMonoDspGenerator,
  meta: FaustDspMeta,
  dspModule: WebAssembly.Module,
  source: AudioBuffer,
  params: ReverbParams,
): Promise<AudioBuffer> {
  // The reverb tail rings on well past the end of the dry input — rendering
  // at only source.length would chop the decay off mid-tail. Pad the render
  // by the room's own effective RT60 (+ a little headroom), capped so an
  // extreme SIZE/DECAY setting can't produce an unreasonably long file.
  const tailSeconds = Math.min(12, calcEffectiveRt60(params.size, params.decay) + 1);
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

// ── Faust engine status type ───────────────────────────────────────────────────
type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

// ── Component ──────────────────────────────────────────────────────────────────
export default function Chapter6() {
  const [preset,     setPreset]     = useState<PresetKey>(DEFAULT_PRESET);
  const [params,     setParams]     = useState<ReverbParams>({ ...DEFAULTS });
  const [isPlaying,  setIsPlaying]  = useState(false);
  const [hasPlayed,  setHasPlayed]  = useState(false);
  const [tasks,      setTasks]      = useState([true, false, false]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');

  // Signal source — the built-in synth drum loop, or one of any number of
  // uploaded tracks, so reverb can be auditioned on real material.
  const [uploadedTracks, setUploadedTracks] = useState<UploadedTrack[]>([]);
  const [activeSourceId, setActiveSourceId] = useState<number | 'synth'>('synth');
  const [decoding,       setDecoding]       = useState(false);
  const [uploadError,    setUploadError]    = useState('');
  const [downloading,    setDownloading]    = useState(false);
  const [downloadError,  setDownloadError]  = useState('');
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const uploadIdSeqRef = useRef(0);
  const activeSourceIdRef = useRef(activeSourceId);
  const uploadedTracksRef = useRef(uploadedTracks);
  const bufSourceRef      = useRef<AudioBufferSourceNode | null>(null);
  useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
  useEffect(() => { uploadedTracksRef.current = uploadedTracks; }, [uploadedTracks]);

  const activeTrack = activeSourceId !== 'synth' ? uploadedTracks.find(t => t.id === activeSourceId) : undefined;

  // Canvas
  const irRef       = useRef<HTMLCanvasElement>(null);
  const scopeRef     = useRef<HTMLCanvasElement>(null);
  const scopeHistoryRef = useRef<ScopePoint[]>([]);

  // ── Faust engine (module + meta loaded once on mount; one node instantiated
  // per AudioContext in startAudio) — same pattern as Chapter4's compressor
  // and Chapter2b's ParamEQ.
  const [engineError, setEngineError] = useState<string | null>(null);
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
        console.error('[Chapter6] failed to load Faust reverb DSP', err);
        setEngineError(err instanceof Error ? err.message : String(err));
        setEngineStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Audio refs
  const ctxRef       = useRef<AudioContext | null>(null);
  const faustNodeRef = useRef<FaustNodeLike | null>(null); // Faust reverb node
  const mixRef       = useRef<GainNode | null>(null);
  const dryAnalRef   = useRef<AnalyserNode | null>(null);   // pre-reverb tap, for the live scope
  const wetAnalRef   = useRef<AnalyserNode | null>(null);   // post-reverb tap, for the live scope
  const animRef      = useRef<number>(0);
  const meterClockRef = useRef<number | null>(null);
  const smoothedInputDbRef  = useRef(METER_FLOOR_DB);
  const smoothedOutputDbRef = useRef(METER_FLOOR_DB);
  const schedulerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextNoteRef  = useRef(0);
  const stepRef      = useRef(0);
  const pingMuteUntilRef = useRef(0); // while ctx.currentTime < this, the drum loop is silenced for a clean test-tail ping
  const startTokenRef = useRef(0); // invalidates in-flight startAudio() on stop

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

  // ── Idle state for the live scope ───────────────────────────────────────────
  // While stopped, animate() isn't running, so this shows the "hit play"
  // placeholder on the scope canvas.
  useEffect(() => {
    if (isPlaying) return;
    if (scopeRef.current) drawReverbScope(scopeRef.current, [], 0, false);
  }, [isPlaying]);

  // ── Task tracking ────────────────────────────────────────────────────────────
  useEffect(() => {
    setTasks([preset === 'HALL', hasPlayed, params.preDelay >= 15]);
  }, [preset, hasPlayed, params.preDelay]);

  // ── Sync live params to the Faust reverb node ───────────────────────────────
  // The Faust patch owns pre-delay, both shelving filters, and the wet/dry
  // mix internally, so this one effect replaces what used to be a manual
  // BiquadFilterNode/DelayNode/GainNode sync plus a separate AudioWorklet
  // postMessage effect.
  useEffect(() => {
    const node = faustNodeRef.current; if (!node) return;
    pushFaustParams(node, params);
  }, [params]);

  // ── Apply preset Freeverb defaults ───────────────────────────────────────────
  const applyPreset = useCallback((key: PresetKey) => {
    setPreset(key);
    setParams(p => ({ ...p, ...PRESET_FREEVERB[key] }));
  }, []);

  // ── Scheduler ────────────────────────────────────────────────────────────────
  // While pingMuteUntilRef is in the future, steps still advance on the beat
  // (so the groove doesn't drift) but aren't actually triggered — this is
  // what gives triggerTestTail() a clean, uninterrupted 6s window to let a
  // single hit ring out in the tail scope below.
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current; const mix = mixRef.current;
    if (!ctx || !mix) return;
    while (nextNoteRef.current < ctx.currentTime + 0.1) {
      if (nextNoteRef.current >= pingMuteUntilRef.current) {
        scheduleStep(ctx, mix, stepRef.current, nextNoteRef.current);
      }
      stepRef.current    = (stepRef.current + 1) % STEPS;
      nextNoteRef.current += STEP_SEC;
    }
    schedulerRef.current = setTimeout(runScheduler, 25);
  }, []);

  // ── Test-tail ping ───────────────────────────────────────────────────────────
  // The drum groove's near-continuous 8th-note hi-hat means the reverb tail
  // almost never gets a quiet gap to ring out in — so SIZE/DECAY/DAMPING
  // changes barely show up in the scope even though the DSP is reacting
  // correctly. This fires one isolated kick hit, mutes the loop for one full
  // scope window so nothing else re-triggers the reverb, and resets the
  // scope history so the whole window is free to show that single tail.
  const triggerTestTail = useCallback(() => {
    const ctx = ctxRef.current; const mix = mixRef.current;
    if (!ctx || !mix) return;
    const t = ctx.currentTime + 0.03;
    pingMuteUntilRef.current = t + SCOPE_WINDOW_S + 0.5;
    scopeHistoryRef.current = [];
    meterClockRef.current = null;
    synthKick(ctx, mix, t);
  }, []);

  // ── Animation loop ───────────────────────────────────────────────────────────
  // Drives the live scope from the real dry/wet analyser taps — new to this
  // chapter (the illustrative IR diagram and decay bars never needed a live
  // loop, since they only redraw when a knob changes).
  const animate = useCallback(() => {
    const dryAnal = dryAnalRef.current; const wetAnal = wetAnalRef.current;

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
      const rawOutputDb = peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
      smoothedOutputDbRef.current = levelBallistic(smoothedOutputDbRef.current, rawOutputDb, dt);
    }

    if (dryAnal && wetAnal) {
      const history = scopeHistoryRef.current;
      history.push({ t: now, inputDb: smoothedInputDbRef.current, outputDb: smoothedOutputDbRef.current });
      const cutoff = now - SCOPE_WINDOW_S - 0.5;
      while (history.length > 0 && history[0].t < cutoff) history.shift();
      if (scopeRef.current) drawReverbScope(scopeRef.current, history, now, true);
    }

    animRef.current = requestAnimationFrame(animate);
  }, []);

  // ── Start audio ──────────────────────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
      // Faust engine still loading (or failed) — the topbar status/error
      // message covers user feedback; Play is also disabled until ready.
      return;
    }
    const myToken = ++startTokenRef.current;

    const ctx = new AudioContext();

    // ── Mix bus (synth input) ──
    const mix = ctx.createGain();

    // ── Live scope taps ── dryAnal reads the raw drum/track signal before
    // the reverb; wetAnal reads the actual Faust reverb output (including
    // its own internal pre-delay/shelves/wet-dry blend) — both feed the
    // live scope.
    const dryAnal = ctx.createAnalyser(); dryAnal.fftSize = 1024; dryAnal.smoothingTimeConstant = 0.4;
    const wetAnal = ctx.createAnalyser(); wetAnal.fftSize = 2048; wetAnal.smoothingTimeConstant = 0.75;

    // ── Faust reverb node ── owns pre-delay, both shelving filters (replacing
    // the old external HPF/LPF), SIZE/DECAY/DAMPING/DIFFUSION, and the
    // WET-DRY mix, all internally.
    const factory = { module: dspModuleRef.current, json: JSON.stringify(dspMetaRef.current), soundfiles: {} };
    let faustNode: FaustNodeLike;
    try {
      faustNode = await generatorRef.current.createNode(
        ctx, dspMetaRef.current.name, factory, false, 512,
      ) as unknown as FaustNodeLike;
    } catch (err) {
      console.error('[Chapter6] failed to build Faust reverb node', err);
      ctx.close();
      return;
    }

    // stopAudio() (or a second startAudio()) ran while we were awaiting — bail
    if (myToken !== startTokenRef.current) { try { ctx.close(); } catch { /* ok */ } return; }

    pushFaustParams(faustNode, paramsRef.current);

    ctxRef.current = ctx;
    mixRef.current = mix;
    faustNodeRef.current = faustNode;
    dryAnalRef.current = dryAnal;
    wetAnalRef.current = wetAnal;

    // ── Wire: mix → dryAnal (viz tap) ─┐
    //      └→ faustNode (reverb + shelves + pre-delay + wet/dry) → wetAnal (viz tap) → destination ──
    mix.connect(dryAnal);
    mix.connect(faustNode as unknown as AudioNode);
    (faustNode as unknown as AudioNode).connect(wetAnal);
    wetAnal.connect(ctx.destination);

    // ── Signal source: either the built-in synth drum loop, or a looping
    // uploaded track, feeding into the same `mix` node either way ──
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
      nextNoteRef.current = ctx.currentTime + 0.05;
      stepRef.current     = 0;
      pingMuteUntilRef.current = 0;
      runScheduler();
    }

    scopeHistoryRef.current = [];
    meterClockRef.current = null;
    animRef.current = requestAnimationFrame(animate);
    setIsPlaying(true);
    setHasPlayed(true);
  }, [engineStatus, runScheduler, animate]);

  // ── Stop audio ───────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    if (bufSourceRef.current) {
      try { bufSourceRef.current.stop(); } catch { /* ok */ }
      bufSourceRef.current.disconnect();
      bufSourceRef.current = null;
    }
    startTokenRef.current++; // invalidate any in-flight startAudio()
    if (faustNodeRef.current) {
      try { (faustNodeRef.current as unknown as AudioNode).disconnect(); } catch { /* ok */ }
      faustNodeRef.current = null;
    }
    mixRef.current     = null;
    dryAnalRef.current = null;
    wetAnalRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    smoothedInputDbRef.current = METER_FLOOR_DB;
    smoothedOutputDbRef.current = METER_FLOOR_DB;
    meterClockRef.current = null;
    scopeHistoryRef.current = [];
    pingMuteUntilRef.current = 0;
    setIsPlaying(false);
    if (scopeRef.current) drawReverbScope(scopeRef.current, [], 0, false);
  }, []);

  useEffect(() => () => {
    startTokenRef.current++;
    if (schedulerRef.current) clearTimeout(schedulerRef.current);
    cancelAnimationFrame(animRef.current);
    if (bufSourceRef.current) {
      try { bufSourceRef.current.stop(); } catch { /* ok */ }
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
    } catch (err) {
      console.error('Failed to decode audio file', err);
      setUploadError('Could not read that file — try an mp3, wav, or m4a.');
    } finally {
      tmpCtx?.close();
      setDecoding(false);
    }
  }, [stopAudio]);

  // Renders the currently active uploaded track through the reverb (with
  // current knob settings) and downloads it as a WAV — the "download after
  // processing" counterpart to the upload button above.
  const handleDownload = useCallback(async () => {
    const track = activeTrack;
    if (!track || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) return;
    setDownloadError('');
    setDownloading(true);
    try {
      const rendered = await renderReverbOffline(
        generatorRef.current, dspMetaRef.current, dspModuleRef.current,
        track.buffer, params,
      );
      downloadAudioBufferAsWav(rendered, `${track.name || 'reverb-designer'}-reverb.wav`);
    } catch (err) {
      console.error('[Chapter6] failed to render audio for download', err);
      setDownloadError('Could not render the audio for download — see console for details.');
    } finally {
      setDownloading(false);
    }
  }, [activeTrack, params]);

  const currentPreset = ROOM_PRESETS[preset];
  const TASK_LABELS   = ['Select Hall preset', 'Audition reverb', 'Set pre-delay ≥ 15ms'];

  const faustActive = engineStatus === 'ready' || engineStatus === 'loading';

  // Signal-source tab row — the drum loop, or any number of uploaded tracks,
  // so reverb can be auditioned on real material.
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
          background: activeSourceId === 'synth' ? 'rgba(45,212,191,0.13)' : 'var(--surface)',
          border: `1px solid ${activeSourceId === 'synth' ? 'rgba(45,212,191,0.5)' : 'var(--border)'}`,
          borderRadius: '3px',
          color: activeSourceId === 'synth' ? 'var(--teal)' : 'var(--text-dim)',
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
        title="Upload your own audio to run through the reverb"
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
          title="Render the active track through the reverb and download it as a WAV"
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

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="reverb-lab">

      {/* ── Top bar ── */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--teal-dim)', border: '1px solid rgba(45,212,191,0.4)' }}>∿</div>
          <div>
            <div className="lab-name">Reverb Designer</div>
            <div className="lab-subtitle">
              FAUST REVERBS.LIB · {activeTrack ? activeTrack.name : `DRUM GROOVE @ ${BPM} BPM`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* Faust engine status badge */}
          <span className="badge" style={{
            background: engineStatus === 'ready'   ? 'rgba(168,85,247,0.15)'  :
                        engineStatus === 'loading' ? 'rgba(245,166,35,0.15)'  :
                        engineStatus === 'error'   ? 'rgba(255,77,106,0.12)'  : 'var(--surface)',
            borderColor: engineStatus === 'ready'  ? 'rgba(168,85,247,0.4)'   :
                         engineStatus === 'loading'? 'rgba(245,166,35,0.4)'   :
                         engineStatus === 'error'  ? 'rgba(255,77,106,0.4)'   : 'var(--border)',
            color: engineStatus === 'ready'   ? '#A855F7'        :
                   engineStatus === 'loading' ? 'var(--amber)'   :
                   engineStatus === 'error'   ? 'var(--red)'     : 'var(--text-faint)',
            fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.06em',
          }}>
            {engineStatus === 'ready'   ? '● FAUST WASM'      :
             engineStatus === 'loading' ? '◌ LOADING…'        :
             engineStatus === 'error'   ? '⚠ ENGINE ERROR'    : '○ IDLE'}
          </span>
          <button
            className={`toggle-btn${isPlaying ? ' on' : ''}`}
            style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-dim)' } : {}}
            onClick={isPlaying ? stopAudio : () => { void startAudio(); }}
            disabled={!isPlaying && engineStatus !== 'ready'}
            title={engineStatus === 'loading' ? 'Loading Faust reverb engine…' : engineStatus === 'error' ? (engineError ?? 'Faust engine failed to load') : undefined}
          >
            {isPlaying ? '⏹ STOP' : engineStatus === 'loading' ? '⏳ LOADING…' : engineStatus === 'error' ? '⚠ ENGINE ERROR' : '▶ PLAY'}
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

      {/* Signal source selector — drum loop or any uploaded track */}
      <div style={{ padding: '0 1.25rem', borderBottom: '1px solid var(--border)' }}>
        {renderSourceRow()}
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

          <div className="canvas-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <span>
              LIVE REVERB TAIL SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
              <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
                · real dry input vs wet output over time — the diagram above is illustrative, this is the actual audio
              </span>
            </span>
            <button
              className="toggle-btn"
              style={{ fontSize: '0.6rem', padding: '0.25rem 0.6rem', whiteSpace: 'nowrap' }}
              onClick={triggerTestTail}
              disabled={!isPlaying || activeSourceId !== 'synth'}
              title={activeSourceId !== 'synth' ? 'Switch to the drum groove to use the test-tail ping' : 'Fire one isolated hit and mute the loop so the tail rings out cleanly'}
            >
              ⚡ PING TAIL
            </button>
          </div>
          <div className="reverb-scope-display">
            <canvas
              ref={scopeRef}
              width={760}
              height={150}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          </div>
          <div className="legend-row" style={{ marginBottom: '1rem' }}>
            <div className="legend-item"><span className="legend-line" style={{ background: '#F5A623' }} />DRY INPUT</div>
            <div className="legend-item"><span className="legend-line" style={{ background: '#2DD4BF' }} />WET OUTPUT (TAIL)</div>
          </div>
          <div className="concept-callout" style={{ marginTop: '-0.5rem', marginBottom: '1rem', background: 'rgba(45,212,191,0.05)', borderColor: 'rgba(45,212,191,0.15)' }}>
            The drum groove's near-continuous hi-hat keeps re-triggering the reverb, so SIZE/DECAY/DAMPING
            changes can be hard to see in a busy loop. Click <strong style={{ color: 'var(--teal)' }}>PING TAIL</strong>{' '}
            to hear (and see) one hit ring out with nothing else in the way.
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

          {/* Faust reverb section header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            fontFamily: 'var(--mono)', fontSize: '0.55rem',
            marginBottom: '0.6rem',
            background: faustActive ? 'rgba(168,85,247,0.08)' : 'var(--surface)',
            border: `1px solid ${faustActive ? 'rgba(168,85,247,0.3)' : 'var(--border)'}`,
            borderRadius: 4, padding: '0.3rem 0.6rem',
          }}>
            <span style={{ color: faustActive ? '#A855F7' : 'var(--text-faint)', fontWeight: 600 }}>
              {'◈'}
            </span>
            <span style={{ color: faustActive ? '#A855F7' : 'var(--text-faint)' }}>
              SIZE · DECAY · DAMPING · DIFFUSION · SHELVING FILTERS
            </span>
            <span style={{ color: 'var(--text-faint)', marginLeft: 2 }}>
              — powered by{' '}
              <span style={{ color: faustActive ? '#A855F7' : 'var(--text-faint)' }}>
                Faust reverbs.lib (stereo_freeverb)
              </span>
            </span>
          </div>

          <div className="reverb-knob-grid">
            {/* Row 1: SIZE, DECAY, PRE-DELAY, DAMPING, DIFFUSION (Faust freeverb core) */}
            <Knob
              spec={KNOB_SPECS.size}
              value={params.size}
              onChange={v => setParams(p => ({ ...p, size: v }))}
            />
            <Knob
              spec={KNOB_SPECS.decay}
              value={params.decay}
              onChange={v => setParams(p => ({ ...p, decay: v }))}
            />
            <Knob
              spec={KNOB_SPECS.preDelay}
              value={params.preDelay}
              onChange={v => setParams(p => ({ ...p, preDelay: v }))}
            />
            <Knob
              spec={KNOB_SPECS.damping}
              value={params.damping}
              onChange={v => setParams(p => ({ ...p, damping: v }))}
            />
            <Knob
              spec={KNOB_SPECS.diffusion}
              value={params.diffusion}
              onChange={v => setParams(p => ({ ...p, diffusion: v }))}
            />

            {/* Row 2: HI-SHELF freq/gain, LO-SHELF freq/gain (replace the old HPF/LPF), WET/DRY */}
            <Knob
              spec={KNOB_SPECS.hiShelfFreq}
              value={params.hiShelfFreq}
              onChange={v => setParams(p => ({ ...p, hiShelfFreq: v }))}
            />
            <Knob
              spec={KNOB_SPECS.hiShelfGain}
              value={params.hiShelfGain}
              onChange={v => setParams(p => ({ ...p, hiShelfGain: v }))}
            />
            <Knob
              spec={KNOB_SPECS.loShelfFreq}
              value={params.loShelfFreq}
              onChange={v => setParams(p => ({ ...p, loShelfFreq: v }))}
            />
            <Knob
              spec={KNOB_SPECS.loShelfGain}
              value={params.loShelfGain}
              onChange={v => setParams(p => ({ ...p, loShelfGain: v }))}
            />
            <Knob
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
            <strong style={{ color: 'var(--teal)' }}>SIZE</strong> sets the perceived room volume —
            bigger rooms mean longer gaps between reflections.{' '}
            <strong style={{ color: 'var(--teal)' }}>DECAY</strong> controls how long the tail takes
            to fade out.{' '}
            <strong style={{ color: 'var(--teal)' }}>DAMPING</strong> rolls off high frequencies as
            the tail decays, mimicking absorption from air and soft surfaces.{' '}
            <strong style={{ color: 'var(--teal)' }}>DIFFUSION</strong> thickens echo density into a
            smooth wash rather than distinct slaps.{' '}
            <strong style={{ color: 'var(--teal)' }}>HI-SHELF</strong> and{' '}
            <strong style={{ color: 'var(--teal)' }}>LO-SHELF</strong> tame the tail's brightness and
            boom — a gentle gain shift above/below their corner frequency, rather than a hard
            HPF/LPF cutoff — so the tail can darken or thin out without losing everything past a
            brick-wall point. Drag knobs vertically to adjust.
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
