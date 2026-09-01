// Shared helpers for the "What Is Sound?" chapter's per-concept interactive
// labs (FrequencyLab, AmplitudeLab, WavelengthLab, PhaseLab, HarmonicsLab,
// TimbreLab — ported pixel-for-pixel from design/what-is-sound-chapter.html).
// Factored out because all six labs draw the same kind of scrolling-sine
// "oscilloscope" canvas and share the same log-frequency slider mapping
// (20 Hz – 20,000 Hz across a 0–1000 slider, matching human hearing range)
// and note-name lookup.
//
// Canvas "screen" colors below are fixed hex values rather than the app's
// light/dark CSS variables — same convention as every other chapter's
// oscilloscope/meter (see the comment above EQ_GRAPH_PALETTE in
// chapters/Equalizer.jsx: "every other chapter's oscilloscope/meter" stays
// a fixed near-black screen in both themes, only EQ's graph got its own
// independent light-mode background). These read as lab-instrument
// readouts, not page chrome, so they stay constant in both themes. Values
// match design/what-is-sound-chapter.html's :root palette (--amber/--green/
// --blue/--red) so the shipped components are visually faithful to the
// mockup they were built from.

export const SCOPE_BG = "#0e0e11";
export const SCOPE_GRID = "#232328";
export const COLORS = {
  amber: "#e8934a",
  green: "#5fd9a0",
  blue: "#5fa3d9",
  red: "#e8615f",
  textFaint: "#54525a",
  // Small in-canvas labels (Harmonics' spectrum-bar "f"/"2f"/... captions,
  // Phase's "WAVE A"/"WAVE B"/"SUM" row captions) need to actually read
  // against the near-black SCOPE_BG screen, not just sit there quietly —
  // textFaint (~2.8:1 contrast on SCOPE_BG) and SCOPE_GRID (barely above
  // the background at all) both look faint-to-invisible at the small
  // font sizes these labels use. `label` targets a solid ~9:1 contrast
  // ratio against SCOPE_BG instead.
  label: "#b8b6bf",
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** Nearest equal-tempered note name for a frequency (A4 = 440 Hz reference). */
export function midiToNote(freq) {
  const n = Math.round(12 * Math.log2(freq / 440)) + 57;
  const name = NOTE_NAMES[((n % 12) + 12) % 12];
  const octave = Math.floor(n / 12) - 1;
  return `${name}${octave}`;
}

/** Log-scale slider (0..1000) -> frequency (20..20,000 Hz), matching human hearing range. */
export function sliderToFreq(v) {
  const min = Math.log(20);
  const max = Math.log(20000);
  return Math.round(Math.exp(min + (v / 1000) * (max - min)));
}

/** Inverse of sliderToFreq — frequency -> slider position (used by the Frequency lab's sweep). */
export function freqToSlider(f) {
  const min = Math.log(20);
  const max = Math.log(20000);
  return Math.round(((Math.log(f) - min) / (max - min)) * 1000);
}

/**
 * How many sine periods to actually draw across the canvas for a given
 * frequency — a visual scale, not literal cycles-per-second (real
 * audio-rate oscillation is far faster than a screen can usefully draw
 * above a few hundred Hz), but still monotonic with frequency so higher
 * pitches visibly look "tighter" than lower ones.
 */
export function visualCyclesFor(freq, base = 3, scale = 0.45) {
  return base + Math.log2(Math.max(freq, 20) / 20) * scale;
}

/**
 * Resizes `canvas`'s backing pixel store to match its *displayed* CSS size
 * at the current devicePixelRatio, and scales the 2D context so every draw
 * call after this can just work in CSS-pixel coordinates — same technique
 * as chapters/Equalizer.jsx's own `hiDpi()` helper. Without this, a canvas
 * whose bitmap (its `width`/`height` attributes) is smaller than its
 * rendered CSS box — which is exactly what `.sound-lab-canvas{width:100%}`
 * produces at most course-content widths — gets stretched by the browser
 * and every trace and text label on it comes out soft/blurry.
 *
 * Relies on the canvas's CSS height being driven by `aspect-ratio` (set
 * inline per component, matching its `width`/`height` JSX attrs) rather
 * than by those attrs directly — otherwise resizing the bitmap here would
 * change the CSS height too, in a feedback loop.
 *
 * Returns `{ ctx, w, h }` where `w`/`h` are the *logical* (CSS-pixel) size
 * to draw against — pass these to clearRect/measurements, not
 * canvas.width/height (which are now physical pixels, dpr times larger).
 */
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

/**
 * Draws a scrolling sine "oscilloscope" trace on `canvas` — the generic
 * scope shared by Frequency/Amplitude/Wavelength/Timbre. `cycles` is how
 * many periods are visible across the canvas width, `amp` is 0..1 of the
 * canvas half-height, `phaseDeg` offsets the trace, and `scroll` (radians)
 * animates it frame to frame. Caller owns the requestAnimationFrame loop.
 */
export function drawScope(canvas, opts = {}) {
  const hd = hiDpiCanvas(canvas);
  if (!hd) return;
  const { ctx: c, w, h } = hd;
  const { cycles = 6, amp = 0.7, phaseDeg = 0, color = COLORS.amber, scroll = 0 } = opts;
  c.clearRect(0, 0, w, h);
  c.strokeStyle = SCOPE_GRID;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, h / 2);
  c.lineTo(w, h / 2);
  c.stroke();
  c.beginPath();
  c.strokeStyle = color;
  c.lineWidth = 2;
  for (let x = 0; x <= w; x++) {
    const t = (x / w) * cycles * Math.PI * 2 + (phaseDeg * Math.PI) / 180 + scroll;
    const y = h / 2 - Math.sin(t) * ((h / 2) * amp);
    if (x === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();
}
