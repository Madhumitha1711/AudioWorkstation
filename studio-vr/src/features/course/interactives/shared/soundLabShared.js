import { canvasFont } from "../../../../theme/fonts";

const SCOPE_BG = "#0e0e11";
const SCOPE_GRID = "#232328";
export const COLORS = {
  amber: "#e8934a",
  green: "#5fd9a0",
  blue: "#5fa3d9",
  red: "#e8615f",
  textFaint: "#54525a",
  label: "#b8b6bf",
};

const LIGHT_SCOPE_BG = "#e7eae1";
const LIGHT_SCOPE_GRID = "#98a08c";
const LIGHT_COLORS = {
  amber: "#ad6a12",
  green: "#0f9d58",
  blue: "#2563eb",
  red: "#c0293f",
  textFaint: "#838a7c",
  label: "#3a3d33",
};

export function scopePalette(theme) {
  return theme === "light"
    ? { bg: LIGHT_SCOPE_BG, grid: LIGHT_SCOPE_GRID, colors: LIGHT_COLORS }
    : { bg: SCOPE_BG, grid: SCOPE_GRID, colors: COLORS };
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function noteNameForMidi(n) {
  const name = NOTE_NAMES[((n % 12) + 12) % 12];
  const octave = Math.floor(n / 12) - 1;
  return `${name}${octave}`;
}

function freqForMidi(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

export function exactNoteForFreq(freq) {
  if (!Number.isFinite(freq) || freq <= 0) return null;
  const rounded = Math.round(freq * 100) / 100;
  const nearestMidi = Math.round(12 * Math.log2(rounded / 440)) + 69;
  const exact = Math.round(freqForMidi(nearestMidi) * 100) / 100;
  return exact === rounded ? noteNameForMidi(nearestMidi) : null;
}

const NOTE_LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteNameToFreq(input) {
  const m = /^\s*([A-Ga-g])([#b]?)(-?\d{1,2})\s*$/.exec(input ?? "");
  if (!m) return null;
  const [, letter, accidental, octaveStr] = m;
  const base = NOTE_LETTER_SEMITONE[letter.toUpperCase()];
  const semitone = base + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0);
  const octave = parseInt(octaveStr, 10);
  const midi = (octave + 1) * 12 + semitone;
  return Math.round(freqForMidi(midi) * 100) / 100;
}

export function sliderToFreq(v) {
  const min = Math.log(20);
  const max = Math.log(20000);
  return Math.round(Math.exp(min + (v / 1000) * (max - min)));
}

export function sliderToFreqPrecise(v) {
  const min = Math.log(20);
  const max = Math.log(20000);
  const f = Math.exp(min + (v / 1000) * (max - min));
  return Math.round(f * 100) / 100;
}

export function visualCyclesFor(freq, base = 3, scale = 0.45) {
  return base + Math.log2(Math.max(freq, 20) / 20) * scale;
}

export function hiDpiCanvas(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return null;
  const targetW = Math.round(w * dpr);
  const targetH = Math.round(h * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function waveformValue(shape, t) {
  switch (shape) {
    case "triangle":
      return (2 / Math.PI) * Math.asin(Math.sin(t));
    case "sawtooth": {
      const frac = t / (Math.PI * 2);
      return 2 * (frac - Math.floor(frac + 0.5));
    }
    case "square":
      return Math.sin(t) >= 0 ? 1 : -1;
    case "sine":
    default:
      return Math.sin(t);
  }
}

export function drawScope(canvas, opts = {}) {
  const hd = hiDpiCanvas(canvas);
  if (!hd) return;
  const { ctx: c, w, h } = hd;
  const { cycles = 6, amp = 0.7, phaseDeg = 0, color, scroll = 0, label, shape = "sine", theme = "dark" } = opts;
  const pal = scopePalette(theme);
  c.clearRect(0, 0, w, h);
  c.strokeStyle = pal.grid;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, h / 2);
  c.lineTo(w, h / 2);
  c.stroke();
  c.beginPath();
  c.strokeStyle = color ?? pal.colors.amber;
  c.lineWidth = 2;
  for (let x = 0; x <= w; x++) {
    const t = (x / w) * cycles * Math.PI * 2 + (phaseDeg * Math.PI) / 180 + scroll;
    const y = h / 2 - waveformValue(shape, t) * ((h / 2) * amp);
    if (x === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  if (label) {
    c.font = canvasFont(11);
    c.textAlign = "right";
    c.textBaseline = "bottom";
    c.fillStyle = pal.colors.label;
    c.fillText(label, w - 10, h - 8);
  }
}

export function freqToSliderPrecise(f) {
  const min = Math.log(20);
  const max = Math.log(20000);
  return ((Math.log(f) - min) / (max - min)) * 1000;
}

export function timebaseFor(freq, targetCycles = 4) {
  const ideal = targetCycles / Math.max(freq, 1);
  const exp = Math.floor(Math.log10(ideal));
  let best = ideal;
  let bestErr = Infinity;
  for (const e of [exp - 1, exp, exp + 1]) {
    for (const s of [1, 2, 5]) {
      const v = s * Math.pow(10, e);
      const err = Math.abs(Math.log(v / ideal));
      if (err < bestErr) {
        bestErr = err;
        best = v;
      }
    }
  }
  return best;
}

export function formatDuration(sec) {
  if (sec >= 1) return `${sec.toFixed(2)} s`;
  if (sec >= 1e-3) return `${(sec * 1e3).toFixed(2)} ms`;
  return `${(sec * 1e6).toFixed(1)} µs`;
}

const trimNum = (v) => String(parseFloat(v.toPrecision(3)));

export function drawTimeScope(canvas, opts = {}) {
  const hd = hiDpiCanvas(canvas);
  if (!hd) return;
  const { ctx: c, w, h } = hd;
  const { freq, windowSec, amp = 0.8, color, scroll = 0, theme = "dark", divisions = 5 } = opts;
  if (!freq || !windowSec) return;
  const pal = scopePalette(theme);
  const top = 24;
  const bottom = h - 20;
  const mid = (top + bottom) / 2;
  const halfH = (bottom - top) / 2;
  const font = canvasFont(10.5);

  c.clearRect(0, 0, w, h);

  const useMs = windowSec >= 1e-3;
  const unitScale = useMs ? 1e3 : 1e6;
  const unit = useMs ? "ms" : "µs";
  c.font = font;
  c.textBaseline = "top";
  c.lineWidth = 1;
  for (let i = 0; i <= divisions; i++) {
    const x = Math.min(w - 0.5, Math.max(0.5, Math.round((i / divisions) * w) + 0.5));
    c.strokeStyle = pal.grid;
    c.globalAlpha = i === 0 || i === divisions ? 0.9 : 0.5;
    c.beginPath();
    c.moveTo(x, top);
    c.lineTo(x, bottom);
    c.stroke();
    c.globalAlpha = 1;
    const v = trimNum((windowSec * i * unitScale) / divisions);
    c.fillStyle = pal.colors.label;
    c.textAlign = i === 0 ? "left" : i === divisions ? "right" : "center";
    c.fillText(i === divisions ? `${v} ${unit}` : v, i === 0 ? 2 : i === divisions ? w - 2 : x, bottom + 5);
  }

  c.strokeStyle = pal.grid;
  c.beginPath();
  c.moveTo(0, mid);
  c.lineTo(w, mid);
  c.stroke();

  const cycles = freq * windowSec;
  const traceColor = color ?? pal.colors.amber;
  c.save();
  c.beginPath();
  c.rect(0, top, w, bottom - top);
  c.clip();
  c.beginPath();
  c.strokeStyle = traceColor;
  c.lineWidth = 2;
  for (let x = 0; x <= w; x++) {
    const t = (x / w) * cycles * Math.PI * 2 + scroll;
    const y = mid - Math.sin(t) * halfH * amp;
    if (x === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
  c.restore();

  const TWO_PI = Math.PI * 2;
  const periodPx = w / cycles;
  const phase0 = ((scroll % TWO_PI) + TWO_PI) % TWO_PI;
  let x0 = (((TWO_PI - phase0) % TWO_PI) / TWO_PI) * periodPx;
  if (x0 + periodPx > w) x0 = Math.max(0, x0 - periodPx);
  const x1 = Math.min(w, x0 + periodPx);
  const by = top - 8;

  c.strokeStyle = traceColor;
  c.globalAlpha = 0.45;
  c.setLineDash([3, 3]);
  c.beginPath();
  c.moveTo(x0, by);
  c.lineTo(x0, bottom);
  c.moveTo(x1, by);
  c.lineTo(x1, bottom);
  c.stroke();
  c.setLineDash([]);
  c.globalAlpha = 1;

  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x0, by + 5);
  c.lineTo(x0, by);
  c.lineTo(x1, by);
  c.lineTo(x1, by + 5);
  c.stroke();

  const text = `T = ${formatDuration(1 / freq)}`;
  c.font = `600 ${font}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const tw = c.measureText(text).width + 10;
  const cx = Math.min(w - tw / 2, Math.max(tw / 2, (x0 + x1) / 2));
  c.fillStyle = pal.bg;
  c.fillRect(cx - tw / 2, by - 8, tw, 16);
  c.fillStyle = traceColor;
  c.fillText(text, cx, by);
}
