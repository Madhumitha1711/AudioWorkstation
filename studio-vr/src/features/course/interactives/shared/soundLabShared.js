// Shared helpers for the "What Is Sound?" chapter's per-concept interactive
// labs (FrequencyLab, AmplitudeLab, WavelengthLab, PhaseLab, HarmonicsLab,
// TimbreLab — ported pixel-for-pixel from design/what-is-sound-chapter.html).
// Factored out because all six labs draw the same kind of scrolling-sine
// "oscilloscope" canvas and share the same log-frequency slider mapping
// (20 Hz – 20,000 Hz across a 0–1000 slider, matching human hearing range)
// and note-name lookup.
//
// Canvas "screen" colors below used to be fixed hex values in both themes —
// same convention as every other chapter's oscilloscope/meter (see the
// comment above EQ_GRAPH_PALETTE in features/gear-studio/Equalizer.jsx). These six labs
// now get the same treatment EQ's graph already has: a dedicated light
// palette instead of staying a dark rectangle on an otherwise light page.
// Dark values below match design/what-is-sound-chapter.html's :root
// palette (--amber/--green/--blue/--red) so the shipped components are
// still visually faithful to the mockup they were built from; light values
// reuse the same deepened accent hues chapters.css already gives amber/
// green/blue/red in light mode, and the same "graph paper" screen tone
// (#e7eae1, == --console's light value) EQ_GRAPH_PALETTE.light.bg uses —
// so a trace or a "screen" reads as the same accent/surface everywhere in
// the app, not just here.

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

// Light-theme screen + trace colors — same roles as SCOPE_BG/SCOPE_GRID/
// COLORS above, just tuned for a light "screen" instead of a near-black
// one. `label` here is a dark ink instead of a light one, for the same
// ~9:1-against-its-own-background reason.
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

/** `{ bg, grid, colors }` for `theme` ("dark" | "light") — the screen
 * background, gridline/center-line color, and named trace colors a scope
 * or spectrum canvas should draw with. Falls back to dark for an unknown
 * theme value. */
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

/** Exact frequency (Hz) of a MIDI note number, 12-TET with A4 (MIDI 69) = 440 Hz. */
function freqForMidi(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

/**
 * Nearest equal-tempered note name for a frequency (A4 = 440 Hz reference,
 * MIDI note 69 — so exactly 440 Hz reads "A4", matching scientific pitch
 * notation, where middle C is C4).
 */
export function midiToNote(freq) {
  const n = Math.round(12 * Math.log2(freq / 440)) + 69;
  return noteNameForMidi(n);
}

/**
 * Note name for `freq`, but only when it's an *exact* match (to 2 decimal
 * places) for a 12-TET note — e.g. 440 Hz -> "A4", but 441 Hz -> null since
 * no note actually sits there. Used by the Frequency lab's readout, which
 * should only ever claim a note name it can vouch for exactly.
 */
export function exactNoteForFreq(freq) {
  if (!Number.isFinite(freq) || freq <= 0) return null;
  const rounded = Math.round(freq * 100) / 100;
  const nearestMidi = Math.round(12 * Math.log2(rounded / 440)) + 69;
  const exact = Math.round(freqForMidi(nearestMidi) * 100) / 100;
  return exact === rounded ? noteNameForMidi(nearestMidi) : null;
}

const NOTE_LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Parses a typed note name like "A4", "c#5", "Bb2" into its exact 12-TET
 * frequency (2 decimal places), or null if it isn't a recognizable note.
 * Accepts "#" for sharp and "b" for flat; octave follows scientific pitch
 * notation (A4 = 440 Hz).
 */
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
 * Same log-scale mapping as sliderToFreq, but kept to 2 decimal places
 * instead of rounded to the nearest whole Hz — used by the Frequency lab,
 * which needs sub-Hz precision so a manually-entered frequency can line up
 * exactly with a note's pitch.
 */
export function sliderToFreqPrecise(v) {
  const min = Math.log(20);
  const max = Math.log(20000);
  const f = Math.exp(min + (v / 1000) * (max - min));
  return Math.round(f * 100) / 100;
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
 * as features/gear-studio/Equalizer.jsx's own `hiDpi()` helper. Without this, a canvas
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
 * Analytic waveform value at phase `t` (radians), all four shapes phase-
 * aligned so they share sine's zero-crossing at t=0 — matters for Timbre,
 * where the whole point is that only harmonic content changes, not phase.
 * Triangle/square are exact (Math.asin(Math.sin(t)) / Math.sign(Math.sin(t)))
 * rather than band-limited, same simplification as the "sine/triangle/
 * sawtooth/square" OscillatorType names in TimbreLab — visually correct
 * shapes, not an anti-aliased additive synthesis.
 */
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

/**
 * Draws a scrolling "oscilloscope" trace on `canvas` — the generic scope
 * shared by Frequency/Amplitude/Wavelength/Phase/Harmonics/Timbre. `cycles`
 * is how many periods are visible across the canvas width, `amp` is 0..1 of
 * the canvas half-height, `phaseDeg` offsets the trace, `scroll` (radians)
 * animates it frame to frame, and `shape` (default "sine") picks the
 * waveform via `waveformValue` above — only TimbreLab passes non-sine
 * shapes today. Caller owns the requestAnimationFrame loop.
 *
 * `theme` ("dark" | "light", default "dark") picks the screen's grid/
 * label colors via `scopePalette` above — pass the app's current theme so
 * this canvas's "screen" matches every other themed surface around it.
 * `color`, if omitted, defaults to that theme's amber rather than always
 * dark-mode amber.
 *
 * `label`, if given, is drawn in-canvas (bottom-right corner) — e.g.
 * WavelengthLab's period readout ("T = 50.00 ms"), which belongs inside
 * the scope itself rather than as separate chrome outside it. Uses the
 * theme's label color, same as Harmonics'/Phase's in-canvas captions, for
 * legible contrast against the scope's own screen color.
 */
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
    c.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    c.textAlign = "right";
    c.textBaseline = "bottom";
    c.fillStyle = pal.colors.label;
    c.fillText(label, w - 10, h - 8);
  }
}
