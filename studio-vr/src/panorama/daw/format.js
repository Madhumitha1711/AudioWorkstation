// ═══════════════════════════════════════════════════════════════════════════
// DAW Workstation — small formatting/number helpers
// ═══════════════════════════════════════════════════════════════════════════
import { RULER_STEPS, RULER_TARGET_MARKS, VOLUME_FADER_SPEC } from "./constants";

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
}

// Picks the coarsest "nice" ruler step (1s, then 2/5/10/15/30s, then whole
// minutes) that still keeps the total mark count under RULER_TARGET_MARKS —
// see RULER_STEPS' own comment in constants.js.
export function pickRulerStep(durationSec) {
  for (const step of RULER_STEPS) {
    if (durationSec / step <= RULER_TARGET_MARKS) return step;
  }
  return RULER_STEPS[RULER_STEPS.length - 1];
}

// Ruler labels stay in short "12s" form under a minute (matching the old
// behavior) and switch to "m:ss" once the step reaches whole minutes, rather
// than fmtTime's fractional-second precision (meant for the
// millisecond-accurate portion labels elsewhere), which would be both wider
// than a 1-minute-spaced tick has room for and needless precision for a
// ruler that's now spaced tens of seconds apart anyway.
export function fmtRulerMark(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s - m * 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// dB tick marks for the send-window's fader scale — VOLUME_FADER_SPEC's own
// range is linear gain (0..1.5), so each label's vertical position is
// computed from its actual gain equivalent rather than spaced evenly, so a
// "-6" mark really does line up with where the fader sits at -6 dB.
export function dbTickPct(db) {
  const gain = Math.pow(10, db / 20);
  const pct = (gain - VOLUME_FADER_SPEC.min) / (VOLUME_FADER_SPEC.max - VOLUME_FADER_SPEC.min);
  return clamp(1 - pct, 0, 1) * 100;
}
