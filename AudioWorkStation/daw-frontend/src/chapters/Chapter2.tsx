import { useRef, useState, useEffect, useCallback } from 'react';
import { Knob } from '../components/Knob';

// ── Band config ───────────────────────────────────────────────────────────────
interface EQBand { freq: number; label: string; sub: string; }

const BANDS: EQBand[] = [
  { freq: 60,    label: '60Hz',  sub: 'SUB'      },
  { freq: 120,   label: '120Hz', sub: 'BASS'     },
  { freq: 250,   label: '250Hz', sub: 'LO-MID'   },
  { freq: 500,   label: '500Hz', sub: 'MID'      },
  { freq: 1000,  label: '1kHz',  sub: 'HI-MID'   },
  { freq: 3000,  label: '3kHz',  sub: 'PRESENCE' },
  { freq: 8000,  label: '8kHz',  sub: 'AIR'      },
  { freq: 16000, label: '16kHz', sub: 'SHEEN'    },
];

const GAIN_MIN = -12;
const GAIN_MAX = +12;

// ── Canvas helpers ────────────────────────────────────────────────────────────
const FMIN = 20, FMAX = 20000;

function fToX(f: number, W: number) {
  return (Math.log10(f / FMIN) / Math.log10(FMAX / FMIN)) * W;
}
function gainToY(g: number, H: number) {
  return ((GAIN_MAX - g) / (GAIN_MAX - GAIN_MIN)) * H;
}

function pathThrough(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
      p2.x, p2.y,
    );
  }
}

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

function drawSpectrum(
  canvas: HTMLCanvasElement,
  userGains: number[],
  targetGains: number[],
  showTarget: boolean,
) {
  const hd = hiDpi(canvas); if (!hd) return;
  const { ctx, W, H } = hd;

  ctx.fillStyle = '#0D0D0F';
  ctx.fillRect(0, 0, W, H);

  // Vertical grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1; ctx.setLineDash([]);
  for (const f of [20,50,100,200,500,1000,2000,5000,10000,20000]) {
    const x = fToX(f, W);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }

  // Horizontal dB grid
  const y0 = gainToY(0, H);
  for (const db of [-12, -6, 0, 6, 12]) {
    const y = gainToY(db, H);
    ctx.strokeStyle = db === 0 ? '#2E2E3D' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = db === 0 ? 1.5 : 1;
    ctx.setLineDash(db === 0 ? [5, 5] : []);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.setLineDash([]);

  // dB labels
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px "JetBrains Mono", monospace';
  for (const db of [-12, -6, 0, 6, 12]) {
    ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 4, gainToY(db, H) + 4);
  }

  const makePts = (gains: number[]) => [
    { x: 0, y: gainToY(gains[0], H) },
    ...BANDS.map((b, i) => ({ x: fToX(b.freq, W), y: gainToY(gains[i], H) })),
    { x: W, y: gainToY(gains[gains.length - 1], H) },
  ];

  const drawCurve = (
    gains: number[], stroke: string, strokeA: number,
    fill: string, fillA: number,
  ) => {
    const pts = makePts(gains);
    if (fillA > 0) {
      ctx.save(); ctx.globalAlpha = fillA; ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, y0); ctx.lineTo(pts[0].x, pts[0].y);
      pathThrough(ctx, pts);
      ctx.lineTo(pts[pts.length - 1].x, y0);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = strokeA;
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath(); pathThrough(ctx, pts); ctx.stroke(); ctx.restore();
  };

  if (showTarget) {
    drawCurve(targetGains, '#F5A623', 0.85, '#F5A623', 0.08);
  } else {
    ctx.fillStyle = 'rgba(245,166,35,0.25)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText('TARGET HIDDEN — LISTEN & MATCH BY EAR', W / 2 - 160, 18);
  }

  // User curve (always visible)
  drawCurve(userGains, '#4D9EFF', 0.9, '#4D9EFF', 0.06);

  // Freq labels
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '9px "JetBrains Mono", monospace';
  const lbls: [number, string][] = [
    [20,'20'],[50,'50'],[100,'100'],[200,'200'],[500,'500'],
    [1000,'1k'],[2000,'2k'],[5000,'5k'],[10000,'10k'],[20000,'20k'],
  ];
  for (const [f, l] of lbls) ctx.fillText(l, fToX(f, W) - 6, H - 4);
}

// ── Audio synthesis ───────────────────────────────────────────────────────────

/** Normalise buffer to a peak target and apply short fade-in/fade-out. */
function normAndFade(buf: AudioBuffer, peakTarget = 0.28) {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const scale = peakTarget / Math.max(peak, 0.001);
  for (let i = 0; i < L.length; i++) { L[i] *= scale; R[i] *= scale; }
  const sr = buf.sampleRate;
  const fadeIn  = Math.round(sr * 0.01);
  const fadeOut = Math.round(sr * 0.06);
  for (let i = 0; i < fadeIn;  i++) { L[i] *= i / fadeIn;  R[i] *= i / fadeIn; }
  for (let i = 0; i < fadeOut; i++) {
    const idx = L.length - 1 - i;
    const f = i / fadeOut;
    L[idx] *= f; R[idx] *= f;
  }
}

// ── 1. Acoustic Guitar (Karplus-Strong physical model) ────────────────────────
function createGuitarBuffer(actx: AudioContext): AudioBuffer {
  const sr = actx.sampleRate;
  const buf = actx.createBuffer(2, sr * 6, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);

  function pluck(freq: number, startSample: number, t60: number, amp: number, pL: number, pR: number) {
    const period = Math.round(sr / freq);
    const dl     = new Float32Array(period);
    const decay  = Math.pow(0.001, 1 / (t60 * sr));
    for (let i = 0; i < period; i++) dl[i] = Math.random() * 2 - 1;
    for (let i = 1; i < period; i++) dl[i] = 0.5 * (dl[i] + dl[i - 1]);
    let env = amp;
    for (let n = startSample; n < L.length; n++) {
      if (env < 1e-6) break;
      const idx  = (n - startSample) % period;
      const prev = (idx - 1 + period) % period;
      const s = dl[idx] * env;
      L[n] += s * pL; R[n] += s * pR;
      dl[idx] = 0.999 * 0.5 * (dl[idx] + dl[prev]);
      env *= decay;
    }
  }

  // G – C – Am – D progression
  const chords: { t: number; strings: [number, number][] }[] = [
    { t: 0.0, strings: [[98.00,-0.25],[123.47,-0.15],[146.83,-0.05],[196.00,0.05],[246.94,0.15],[392.00,0.25]] },
    { t: 1.5, strings: [[0,-0.25],[130.81,-0.15],[164.81,-0.05],[196.00,0.05],[261.63,0.15],[329.63,0.25]] },
    { t: 3.0, strings: [[0,-0.25],[110.00,-0.15],[164.81,-0.05],[220.00,0.05],[261.63,0.15],[329.63,0.25]] },
    { t: 4.5, strings: [[0,-0.25],[0,-0.15],[146.83,-0.05],[220.00,0.05],[293.66,0.15],[369.99,0.25]] },
  ];

  for (const chord of chords) {
    chord.strings.forEach(([freq, pan], si) => {
      if (freq === 0) return;
      const ss = Math.round((chord.t + si * 0.018) * sr);
      pluck(freq, ss, 1.4, 0.6, Math.sqrt(0.5 - pan * 0.5), Math.sqrt(0.5 + pan * 0.5));
    });
  }

  // Pick-noise burst (covers PRESENCE / AIR / SHEEN)
  const PICK_DUR = Math.round(sr * 0.035);
  for (const chord of chords) {
    chord.strings.forEach(([freq, pan], si) => {
      if (freq === 0) return;
      const start = Math.round((chord.t + si * 0.018) * sr);
      const pL = Math.sqrt(0.5 - pan * 0.5), pR = Math.sqrt(0.5 + pan * 0.5);
      for (let i = 0; i < PICK_DUR && (start + i) < L.length; i++) {
        const env = Math.exp(-i / (sr * 0.008)) * 0.045;
        L[start + i] += (Math.random() * 2 - 1) * env * pL;
        R[start + i] += (Math.random() * 2 - 1) * env * pR;
      }
    });
  }

  // Sustained HF (AIR 8 kHz + SHEEN 15.5 kHz)
  for (const [hf, hAmp] of [[8000, 0.04], [15500, 0.025]] as [number, number][]) {
    for (let i = 0; i < L.length; i++) {
      const t = i / sr;
      let env = 0;
      for (const chord of chords) {
        const dt = t - chord.t;
        if (dt >= 0 && dt < 1.5) env = Math.max(env, Math.exp(-dt * 2.5));
      }
      L[i] += hAmp * env * Math.sin(2 * Math.PI * hf * t);
      R[i] += hAmp * env * Math.sin(2 * Math.PI * hf * t + 0.15);
    }
  }

  normAndFade(buf);
  return buf;
}

// ── 2. Electric Bass (Karplus-Strong, low pitches + sub sine) ─────────────────
function createBassBuffer(actx: AudioContext): AudioBuffer {
  const sr = actx.sampleRate;
  const buf = actx.createBuffer(2, sr * 6, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);

  function pluckBass(freq: number, start: number, t60: number, amp: number) {
    const period = Math.round(sr / freq);
    const dl     = new Float32Array(period);
    const decay  = Math.pow(0.001, 1 / (t60 * sr));
    for (let i = 0; i < period; i++) dl[i] = Math.random() * 2 - 1;
    // Extra smoothing passes for a round, low-end tone
    for (let p = 0; p < 4; p++) for (let i = 1; i < period; i++) dl[i] = 0.5 * (dl[i] + dl[i - 1]);
    let env = amp;
    for (let n = start; n < L.length; n++) {
      if (env < 1e-6) break;
      const idx  = (n - start) % period;
      const prev = (idx - 1 + period) % period;
      const s = dl[idx] * env;
      L[n] += s * 0.65; R[n] += s * 0.65;
      dl[idx] = 0.9998 * 0.5 * (dl[idx] + dl[prev]);
      env *= decay;
    }
  }

  // Driving bass groove: E2 – A2 – D2 – G2
  const notes = [
    { freq: 82.41, t: 0.0 }, { freq: 82.41, t: 0.5 },
    { freq: 110.0, t: 1.0 }, { freq: 110.0, t: 1.5 },
    { freq: 73.42, t: 2.0 }, { freq: 98.00, t: 2.5 },
    { freq: 82.41, t: 3.0 }, { freq: 110.0, t: 3.5 },
    { freq: 73.42, t: 4.0 }, { freq: 73.42, t: 4.5 },
    { freq: 98.00, t: 5.0 }, { freq: 82.41, t: 5.5 },
  ];

  for (const n of notes) {
    const start = Math.round(n.t * sr);
    pluckBass(n.freq, start, 2.0, 0.7);
    // Sub-octave sine for deep low end
    for (let i = 0; i < Math.round(0.45 * sr) && start + i < L.length; i++) {
      const t   = i / sr;
      const env = Math.exp(-t * 3) * 0.18;
      const s   = Math.sin(2 * Math.PI * (n.freq * 0.5) * t) * env;
      L[start + i] += s; R[start + i] += s;
    }
    // Finger-thump transient
    for (let i = 0; i < Math.round(0.015 * sr) && start + i < L.length; i++) {
      const env = Math.exp(-i / (sr * 0.005)) * 0.06;
      L[start + i] += (Math.random() * 2 - 1) * env;
      R[start + i] += (Math.random() * 2 - 1) * env;
    }
  }

  normAndFade(buf);
  return buf;
}

// ── 3. Piano (additive synthesis, harmonic series) ────────────────────────────
function createPianoBuffer(actx: AudioContext): AudioBuffer {
  const sr = actx.sampleRate;
  const buf = actx.createBuffer(2, sr * 6, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);

  function pianoNote(fund: number, start: number, amp: number, pan: number) {
    const pL = Math.sqrt(0.5 - pan * 0.5);
    const pR = Math.sqrt(0.5 + pan * 0.5);
    // [harmonic ratio, relative amplitude, decay multiplier]
    const harmonics: [number, number, number][] = [
      [1, 1.00, 1.0], [2, 0.45, 1.8], [3, 0.30, 2.5], [4, 0.18, 3.5],
      [5, 0.10, 5.0], [6, 0.07, 7.0], [7, 0.04, 9.0], [8, 0.025, 12.0],
    ];
    for (const [ratio, hAmp, hDecay] of harmonics) {
      const freq = fund * ratio;
      if (freq > sr / 2) continue;
      const baseDecay = 0.7 * hDecay;
      for (let n = start; n < L.length; n++) {
        const t   = (n - start) / sr;
        const env = amp * hAmp * Math.exp(-t * baseDecay);
        if (env < 1e-5) break;
        const hammer = t < 0.005 ? 1 + Math.random() * 0.2 : 1; // attack transient
        const s = Math.sin(2 * Math.PI * freq * t) * env * hammer;
        L[n] += s * pL; R[n] += s * pR;
      }
    }
  }

  // C – G – Am – F progression (each chord lightly arpeggiated)
  const progression = [
    { t: 0.0, notes: [[261.63,-0.3],[329.63, 0.0],[392.00, 0.2],[523.25,-0.1]] },
    { t: 1.5, notes: [[196.00,-0.3],[246.94, 0.0],[392.00, 0.2],[493.88,-0.1]] },
    { t: 3.0, notes: [[220.00,-0.3],[261.63, 0.0],[329.63, 0.2],[440.00,-0.1]] },
    { t: 4.5, notes: [[174.61,-0.3],[220.00, 0.0],[349.23, 0.2],[523.25,-0.1]] },
  ];

  for (const chord of progression) {
    chord.notes.forEach(([freq, pan], si) => {
      pianoNote(freq, Math.round((chord.t + si * 0.04) * sr), 0.5, pan);
    });
  }

  normAndFade(buf);
  return buf;
}

// ── 4. Drum Kit (physically modelled kick, snare, hi-hats) ───────────────────
function createDrumBuffer(actx: AudioContext): AudioBuffer {
  const sr = actx.sampleRate;
  const buf = actx.createBuffer(2, sr * 6, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);

  function kick(start: number, amp: number) {
    const durN = Math.round(sr * 0.45);
    for (let i = 0; i < durN && start + i < L.length; i++) {
      const t   = i / sr;
      const f   = 160 * Math.exp(-t * 28) + 45;         // pitch sweep 160→45 Hz
      const env = Math.exp(-t * 9) * amp;
      const click = Math.exp(-t * 350) * (Math.random() * 2 - 1) * 0.25 * amp;
      const s = (Math.sin(2 * Math.PI * f * t) * 0.85 +
                 Math.sin(Math.PI * f * t) * 0.25) * env + click;
      L[start + i] += s; R[start + i] += s;
    }
  }

  function snare(start: number, amp: number) {
    const durN = Math.round(sr * 0.25);
    // 2-pole resonant body ~200 Hz
    let y1 = 0, y2 = 0;
    const w0 = 2 * Math.PI * 200 / sr, r = 0.94;
    const a1 = -2 * r * Math.cos(w0), a2 = r * r;
    for (let i = 0; i < durN && start + i < L.length; i++) {
      const t      = i / sr;
      const eBody  = Math.exp(-t * 20) * amp * 0.5;
      const eNoise = Math.exp(-t * 14) * amp * 0.7;
      const x = Math.random() * 2 - 1;
      const y = x - a1 * y1 - a2 * y2; y2 = y1; y1 = y;
      const s = y * eBody + (Math.random() * 2 - 1) * eNoise;
      L[start + i] += s * 0.65; R[start + i] += s * 0.65;
    }
  }

  function hihat(start: number, amp: number, open: boolean) {
    const durN = Math.round(sr * (open ? 0.22 : 0.07));
    let prev = 0;
    for (let i = 0; i < durN && start + i < L.length; i++) {
      const t   = i / sr;
      const env = Math.exp(-t * (open ? 10 : 55)) * amp;
      const n   = Math.random() * 2 - 1;
      const hp  = n - prev * 0.96; prev = n;  // 1-pole hi-pass
      L[start + i] += hp * env * 0.25;
      R[start + i] += hp * env * 0.25;
    }
  }

  // 120 BPM, 3 bars of 4/4 groove
  const beat = 60 / 120, eighth = beat / 2;
  for (let bar = 0; bar < 3; bar++) {
    const bs = bar * beat * 4;
    kick(Math.round((bs) * sr), 0.9);
    kick(Math.round((bs + beat * 2) * sr), 0.85);
    snare(Math.round((bs + beat) * sr), 0.70);
    snare(Math.round((bs + beat * 3) * sr), 0.72);
    for (let e = 0; e < 8; e++) {
      hihat(Math.round((bs + e * eighth) * sr), 0.55, e === 3 || e === 7);
    }
  }

  normAndFade(buf);
  return buf;
}

// ── 5. Synth Pad (detuned oscillators, slow attack) ──────────────────────────
function createSynthPadBuffer(actx: AudioContext): AudioBuffer {
  const sr = actx.sampleRate;
  const buf = actx.createBuffer(2, sr * 6, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);

  function pad(fund: number, startS: number, durS: number, amp: number, pan: number) {
    const pL      = Math.sqrt(0.5 - pan * 0.5);
    const pR      = Math.sqrt(0.5 + pan * 0.5);
    const end     = Math.min(startS + Math.round(durS * sr), L.length);
    const attackN = Math.round(sr * 0.35);
    const relN    = Math.round(sr * 0.4);
    const detuneCents = [-8, -3, 3, 8];
    // [harmonic ratio, relative amplitude]
    const harmonics: [number, number][] = [[1,1.0],[2,0.35],[3,0.20],[4,0.08],[5,0.04]];
    for (let n = startS; n < end; n++) {
      const i   = n - startS;
      const t   = i / sr;
      const atk = Math.min(1, i / attackN);
      const rel = Math.min(1, (end - n) / relN);
      const env = amp * atk * rel;
      let s = 0;
      for (const dc of detuneCents) {
        const df = fund * (Math.pow(2, dc / 1200) - 1);
        for (const [hr, ha] of harmonics) {
          const f = (fund + df) * hr;
          if (f > sr / 2) continue;
          s += ha * Math.sin(2 * Math.PI * f * t) / detuneCents.length;
        }
      }
      L[n] += s * env * pL;
      R[n] += s * env * pR;
    }
  }

  // Am7 chord (A-C-E-G) — two sustained phrases
  const padNotes = [
    { freq: 110.00, pan: -0.3 },
    { freq: 130.81, pan:  0.0 },
    { freq: 164.81, pan:  0.2 },
    { freq: 196.00, pan: -0.1 },
    { freq: 261.63, pan:  0.15 },
  ];

  for (let rep = 0; rep < 2; rep++) {
    const rs = rep * 3.0;
    for (const n of padNotes) pad(n.freq, Math.round(rs * sr), 3.6, 0.28, n.pan);
  }

  normAndFade(buf);
  return buf;
}

// ── Instrument definitions ────────────────────────────────────────────────────
interface Instrument {
  name: string;
  icon: string;
  targetGains: number[];
  bandTips: string[];
  createBuffer: (ctx: AudioContext) => AudioBuffer;
}

const INSTRUMENTS: Instrument[] = [
  {
    name: 'ACOUSTIC GUITAR',
    icon: '🎸',
    targetGains: [-3, +6, +2, -1, +4, -3, +7, +3],
    bandTips: [
      'Sub (60Hz) adds rumble. The target cuts it slightly — notice the low end tighten.',
      'Bass (120Hz) carries warmth. Heavy boost here — hear the fullness increase.',
      'Low-mids (250Hz) shape body. A gentle boost adds thickness to the chord.',
      'Mids (500Hz) are nearly flat — slight cut for clarity.',
      'Hi-mids (1kHz) add presence and punch. Boost here for forward bite.',
      'Presence (3kHz) can sound harsh. The target cuts — notice the harshness recede.',
      'Air (8kHz) adds brilliance. Large boost — the chord should gain sparkle.',
      'Sheen (16kHz) is ultra-high shimmer. Boost to open the top end.',
    ],
    createBuffer: createGuitarBuffer,
  },
  {
    name: 'ELECTRIC BASS',
    icon: '🎵',
    targetGains: [+6, +8, +3, -4, -3, -6, -5, -7],
    bandTips: [
      'Sub (60Hz) is the foundation of bass. Heavy boost — feel the subsonic weight.',
      'Bass (120Hz) is the core bass frequency. Maximum boost — this is the body of the instrument.',
      'Low-mids (250Hz) add warmth. Gentle boost for a full, round tone.',
      'Mids (500Hz) can sound boxy on bass. Cut to clean up the mix.',
      'Hi-mids (1kHz) are less important for bass. Cut for a cleaner signal.',
      'Presence (3kHz) adds finger/pick attack. Heavy cut for a smoother, rounder tone.',
      'Air (8kHz) is outside the bass spectrum. Roll off here.',
      'Sheen (16kHz) is inaudible on bass. Deep cut removes hiss.',
    ],
    createBuffer: createBassBuffer,
  },
  {
    name: 'PIANO',
    icon: '🎹',
    targetGains: [-2, +2, +4, +3, +5, +6, +3, +1],
    bandTips: [
      'Sub (60Hz) adds rumble to piano. Slight cut keeps the low end clean.',
      'Bass (120Hz) warms the lower octaves. Gentle boost adds resonance.',
      'Low-mids (250Hz) give body to mid-range notes. Boost for a full, rich sound.',
      'Mids (500Hz) shape the piano\'s fundamental character. Boost adds presence.',
      'Hi-mids (1kHz) add note definition. Boost here for clarity and attack.',
      'Presence (3kHz) highlights the hammer strike. Boost makes the piano cut through.',
      'Air (8kHz) adds brightness and shimmer to the strings. Moderate boost opens the sound.',
      'Sheen (16kHz) adds a subtle sparkle. Slight boost for extra airiness.',
    ],
    createBuffer: createPianoBuffer,
  },
  {
    name: 'DRUM KIT',
    icon: '🥁',
    targetGains: [+5, +4, -3, -5, +4, +3, +8, +2],
    bandTips: [
      'Sub (60Hz) is the kick drum\'s power. Boost to add felt-in-the-chest impact.',
      'Bass (120Hz) carries the kick\'s body. Boost for a punchy, warm low end.',
      'Low-mids (250Hz) is where drums get muddy. Cut to tighten the kit.',
      'Mids (500Hz) add boxiness. Cut here for a cleaner, more professional sound.',
      'Hi-mids (1kHz) bring out the snare\'s snap. Boost for snare attack.',
      'Presence (3kHz) adds snare crack. Boost makes the snare cut through.',
      'Air (8kHz) is the hi-hat\'s home. Large boost adds that crisp, open hat shimmer.',
      'Sheen (16kHz) adds a subtle cymbal sizzle. Gentle boost for extra air.',
    ],
    createBuffer: createDrumBuffer,
  },
  {
    name: 'SYNTH PAD',
    icon: '🎛',
    targetGains: [-5, -2, +7, +6, +2, -4, -2, -4],
    bandTips: [
      'Sub (60Hz) muddies pads. Cut to keep the low end clean and focused.',
      'Bass (120Hz) is less important for pads. Slight cut for clarity.',
      'Low-mids (250Hz) is the warmth zone of synth pads. Heavy boost adds lush thickness.',
      'Mids (500Hz) define the pad\'s core character. Boost adds an immersive, full quality.',
      'Hi-mids (1kHz) add a gentle edge. Light boost for subtle definition.',
      'Presence (3kHz) can make pads harsh and fatiguing. Cut to keep them smooth.',
      'Air (8kHz) brightens pads but can be tiring. Cut for a rounder, warmer sound.',
      'Sheen (16kHz) adds upper-air brightness. Cut keeps the pad dark and warm.',
    ],
    createBuffer: createSynthPadBuffer,
  },
];

// ── Audio graph helpers ───────────────────────────────────────────────────────
function buildFilters(ctx: AudioContext, gains: number[]): BiquadFilterNode[] {
  return BANDS.map((band, i) => {
    const f = ctx.createBiquadFilter();
    const isShelf = i === 0 || i === BANDS.length - 1;
    f.type      = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
    f.frequency.value = band.freq;
    f.Q.value   = isShelf ? 0.707 : 0.8;
    f.gain.value = gains[i];
    return f;
  });
}

function chainAndConnect(filters: BiquadFilterNode[], destination: AudioNode): void {
  for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
  filters[filters.length - 1].connect(destination);
}

// ── Score ─────────────────────────────────────────────────────────────────────
function calcBandScores(userGains: number[], targetGains: number[]) {
  return BANDS.map((_, i) => {
    const diff  = userGains[i] - targetGains[i];
    const acc   = Math.max(0, 1 - Math.abs(diff) / 6);
    const color =
      Math.abs(diff) < 1 ? 'var(--green)' :
      Math.abs(diff) < 3 ? 'var(--amber)' : 'var(--red)';
    return { diff, acc, color };
  });
}

function overallScore(userGains: number[], targetGains: number[]) {
  const sc = calcBandScores(userGains, targetGains);
  return Math.round(sc.reduce((a, b) => a + b.acc, 0) / BANDS.length * 100);
}

type PlayMode = 'idle' | 'target' | 'mine';

// ── Component ─────────────────────────────────────────────────────────────────
export default function Chapter2() {
  const [instrumentIdx, setInstrumentIdx] = useState(0);
  const [userGains, setUserGains]   = useState<number[]>(Array(8).fill(0));
  const [playMode, setPlayMode]     = useState<PlayMode>('idle');
  const [revealed, setRevealed]     = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [hintUsed, setHintUsed]     = useState(false);

  const currentInstrument = INSTRUMENTS[instrumentIdx];

  const canvasRef          = useRef<HTMLCanvasElement>(null);
  const audioCtxRef        = useRef<AudioContext | null>(null);
  const sourceRef          = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef        = useRef<GainNode | null>(null);
  const filtersRef         = useRef<BiquadFilterNode[]>([]);
  const musicBufferRef     = useRef<AudioBuffer | null>(null);
  const userGainsRef       = useRef(userGains);
  const instrumentIdxRef   = useRef(instrumentIdx);

  useEffect(() => { userGainsRef.current = userGains; }, [userGains]);
  useEffect(() => { instrumentIdxRef.current = instrumentIdx; }, [instrumentIdx]);

  // Redraw on state change
  useEffect(() => {
    const c = canvasRef.current;
    if (c) drawSpectrum(c, userGains, currentInstrument.targetGains, revealed);
  }, [userGains, revealed, currentInstrument]);

  // Live-update filter gains while "Hear Mine" is playing
  useEffect(() => {
    if (playMode !== 'mine') return;
    filtersRef.current.forEach((f, i) => { f.gain.value = userGains[i]; });
  }, [userGains, playMode]);

  // ── Audio ─────────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* ok */ }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    setPlayMode('idle');
  }, []);

  const playAudio = useCallback(async (mode: 'target' | 'mine') => {
    if (playMode === mode) { stopAudio(); return; }
    stopAudio();

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
      musicBufferRef.current = null;
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    // Build buffer for current instrument
    if (!musicBufferRef.current) {
      musicBufferRef.current = INSTRUMENTS[instrumentIdxRef.current].createBuffer(ctx);
    }

    const targetGains = INSTRUMENTS[instrumentIdxRef.current].targetGains;
    const gains   = mode === 'target' ? targetGains : [...userGainsRef.current];
    const filters = buildFilters(ctx, gains);
    filtersRef.current = filters;

    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.72;
    gainNodeRef.current = gainNode;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value      = 6;
    limiter.ratio.value     = 8;
    limiter.attack.value    = 0.003;
    limiter.release.value   = 0.15;

    chainAndConnect(filters, gainNode);
    gainNode.connect(limiter);
    limiter.connect(ctx.destination);

    const source = ctx.createBufferSource();
    source.buffer = musicBufferRef.current;
    source.loop   = true;
    source.connect(filters[0]);
    source.start();
    sourceRef.current = source;
    setPlayMode(mode);
  }, [playMode, stopAudio]);

  // ── Instrument switching ──────────────────────────────────────────────────
  const handleInstrumentChange = useCallback((idx: number) => {
    stopAudio();
    musicBufferRef.current = null;  // clear cached buffer — different instrument needs a new one
    setInstrumentIdx(idx);
    setUserGains(Array(8).fill(0));
    setRevealed(false);
    setSubmitted(false);
    setHintUsed(false);
  }, [stopAudio]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    try { sourceRef.current?.stop(); } catch { /* ok */ }
    audioCtxRef.current?.close();
    audioCtxRef.current   = null;
    musicBufferRef.current = null;
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const score      = overallScore(userGains, currentInstrument.targetGains);
  const bandScores = calcBandScores(userGains, currentInstrument.targetGains);
  const scoreColor =
    score >= 90 ? 'var(--green)' :
    score >= 60 ? 'var(--amber)' : 'var(--red)';

  const worstIdx = bandScores.reduce(
    (w, b, i) => Math.abs(b.diff) > Math.abs(bandScores[w].diff) ? i : w, 0
  );

  const handleReset = () => {
    stopAudio();
    setUserGains(Array(8).fill(0));
    setRevealed(false);
    setSubmitted(false);
    setHintUsed(false);
  };

  const handleSubmit = () => {
    stopAudio();
    setRevealed(true);
    setSubmitted(true);
  };

  const handleHint = () => {
    setRevealed(true);
    setHintUsed(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="eq-lab">

      {/* Top bar */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--blue-dim)', borderColor: 'rgba(77,158,255,0.4)' }}>
            ≋
          </div>
          <div>
            <div className="lab-name">EQ Matching Challenge</div>
            <div className="lab-subtitle">LAB · CH 02 · EAR TRAINING · {INSTRUMENTS.length} INSTRUMENTS</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {submitted && (
            <span className="badge" style={{
              background: score >= 90 ? 'var(--green-dim)' : 'var(--amber-dim)',
              borderColor: score >= 90 ? 'rgba(0,255,135,0.3)' : 'rgba(245,166,35,0.3)',
              color: score >= 90 ? 'var(--green)' : 'var(--amber)',
            }}>
              {score >= 90 ? '✓ PASSED' : `${score}% — RETRY`}
            </span>
          )}
          {!submitted && (
            <span className="badge" style={{
              background: 'var(--blue-dim)',
              borderColor: 'rgba(77,158,255,0.3)',
              color: 'var(--blue)',
            }}>
              🎧 LISTEN TO MATCH
            </span>
          )}
          <div className="lab-status" style={{ color: 'var(--blue)' }}>
            <div className="status-dot" style={{ background: 'var(--blue)', boxShadow: '0 0 6px var(--blue)' }} />
            {submitted ? `SCORE: ${score}%` : 'MATCHING'}
          </div>
        </div>
      </div>

      {/* Instrument selector */}
      <div style={{
        display: 'flex',
        gap: '0.4rem',
        padding: '0.55rem 1rem',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
        flexShrink: 0,
      }}>
        {INSTRUMENTS.map((inst, idx) => (
          <button
            key={inst.name}
            onClick={() => handleInstrumentChange(idx)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.3rem 0.65rem',
              background: instrumentIdx === idx ? 'rgba(77,158,255,0.13)' : 'var(--surface)',
              border: `1px solid ${instrumentIdx === idx ? 'rgba(77,158,255,0.5)' : 'var(--border)'}`,
              borderRadius: '3px',
              color: instrumentIdx === idx ? 'var(--blue)' : 'var(--text-dim)',
              fontFamily: 'var(--mono)',
              fontSize: '0.6rem',
              letterSpacing: '0.06em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '0.85rem' }}>{inst.icon}</span>
            <span>{inst.name}</span>
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="eq-body">

        {/* Left */}
        <div className="eq-main">

          {/* Legend */}
          <div className="legend-row">
            <div className="legend-item">
              <div className="legend-line" style={{
                background: revealed ? 'var(--amber)' : 'var(--text-faint)',
                opacity: revealed ? 1 : 0.4,
              }} />
              {revealed ? 'TARGET CURVE' : 'TARGET (HIDDEN)'}
            </div>
            <div className="legend-item">
              <div className="legend-line" style={{ background: 'var(--blue)' }} />
              YOUR EQ
            </div>
            <div className="legend-item">
              <div className="legend-line" style={{ background: 'var(--text-faint)', height: '1px' }} />
              FLAT (0 dB)
            </div>
          </div>

          {/* Spectrum canvas */}
          <div className="spectrum-display">
            <canvas
              ref={canvasRef}
              width={900}
              height={170}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          </div>

          {/* Knobs */}
          <div className="canvas-label" style={{ margin: '0.75rem 0' }}>
            8-BAND EQ · DRAG KNOBS TO MATCH THE SOUND YOU HEAR
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.5rem' }}>
            {BANDS.map((band, i) => (
              <Knob
                key={band.sub}
                spec={{
                  label: <>{band.label}<br />{band.sub}</>,
                  min: GAIN_MIN,
                  max: GAIN_MAX,
                  step: 0.5,
                  fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`,
                  accent: submitted
                    ? (Math.abs(bandScores[i].diff) < 1 ? 'var(--green)' :
                       Math.abs(bandScores[i].diff) < 3 ? 'var(--amber)' : 'var(--red)')
                    : 'var(--blue)',
                }}
                value={userGains[i]}
                target={submitted ? currentInstrument.targetGains[i] : undefined}
                onChange={v => setUserGains(prev => {
                  const next = [...prev];
                  next[i] = v;
                  return next;
                })}
              />
            ))}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="eq-sidebar">

          {/* Ear training instructions */}
          {!submitted && (
            <div style={{
              background: 'rgba(77,158,255,0.08)',
              border: '1px solid rgba(77,158,255,0.2)',
              borderRadius: '4px',
              padding: '0.75rem',
              fontSize: '0.7rem',
              color: 'var(--text-dim)',
              lineHeight: 1.6,
            }}>
              <div style={{ color: 'var(--blue)', fontWeight: 600, marginBottom: '0.4rem', fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.08em' }}>
                🎧 HOW TO PLAY
              </div>
              1. Press <strong style={{ color: 'var(--amber)' }}>Hear Target</strong> to listen to the goal sound.<br />
              2. Press <strong style={{ color: 'var(--blue)' }}>Hear Mine</strong> to hear your current EQ.<br />
              3. Drag faders until they sound the same.<br />
              4. Submit when you're confident.
            </div>
          )}

          {/* Score ring — only shown after submit */}
          {submitted && (
            <div className="score-ring-wrap">
              <div
                className="score-ring"
                style={{ background: `conic-gradient(${scoreColor} 0% ${score}%, var(--surface) ${score}% 100%)` }}
              >
                <div className="score-ring-inner">
                  <div className="score-num" style={{ color: scoreColor }}>{score}</div>
                  <div className="score-lbl">SCORE</div>
                </div>
              </div>
              <div className="score-label">MATCH ACCURACY</div>
              {hintUsed && (
                <div style={{ fontSize: '0.55rem', color: 'var(--red)', fontFamily: 'var(--mono)', marginTop: '0.2rem' }}>
                  HINT USED
                </div>
              )}
            </div>
          )}

          {/* Band accuracy — only shown after submit */}
          {submitted && (
            <div className="band-analysis">
              <div className="canvas-label">BAND ACCURACY</div>
              {BANDS.map((band, i) => {
                const { diff, acc, color } = bandScores[i];
                return (
                  <div className="band-item" key={band.sub}>
                    <div className="band-name">{band.sub}</div>
                    <div className="band-bar-track">
                      <div className="band-bar-fill" style={{ width: `${acc * 100}%`, background: color }} />
                    </div>
                    <div className="band-diff" style={{ color }}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tip box */}
          <div className="tip-box">
            <strong>Tip:</strong>{' '}
            {submitted
              ? currentInstrument.bandTips[worstIdx]
              : 'Try to A/B compare quickly — your short-term memory for tone fades in about 5 seconds.'}
          </div>

          {/* Hint button before submit */}
          {!submitted && !revealed && (
            <button
              className="btn-secondary"
              onClick={handleHint}
              style={{ fontSize: '0.7rem', borderColor: 'rgba(245,166,35,0.3)', color: 'var(--amber)' }}
            >
              👁 Show Target Curve (reveals answer)
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="lab-footer">
        <div className="hint-text">
          {submitted
            ? (score >= 90
                ? <span style={{ color: 'var(--green)' }}>✓ Excellent ear! Orange markers show target positions.</span>
                : 'Orange markers on faders show the target positions. Retry to improve.')
            : <>Press <strong style={{ color: 'var(--amber)', margin: '0 0.25rem' }}>Hear Target</strong> then <strong style={{ color: 'var(--blue)', margin: '0 0.25rem' }}>Hear Mine</strong> — dial in until they match.</>
          }
        </div>
        <div className="btn-row">
          <button className="btn-secondary" onClick={handleReset}>Reset</button>
          <button
            className="btn-secondary"
            onClick={() => playAudio('target')}
            style={playMode === 'target' ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : {}}
          >
            {playMode === 'target' ? '⏸ Target' : '▶ Hear Target'}
          </button>
          <button
            className="btn-secondary"
            onClick={() => playAudio('mine')}
            style={playMode === 'mine' ? { borderColor: 'var(--blue)', color: 'var(--blue)' } : {}}
          >
            {playMode === 'mine' ? '⏸ Mine' : '▶ Hear Mine'}
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitted && score >= 90}>
            {submitted && score >= 90 ? '✓ Passed →' : 'Submit Score →'}
          </button>
        </div>
      </div>
    </div>
  );
}
