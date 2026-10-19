import { RULER_STEPS, RULER_TARGET_MARKS, VOLUME_FADER_SPEC } from "./constants";

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
}

export function pickRulerStep(durationSec) {
  for (const step of RULER_STEPS) {
    if (durationSec / step <= RULER_TARGET_MARKS) return step;
  }
  return RULER_STEPS[RULER_STEPS.length - 1];
}

export function fmtRulerMark(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s - m * 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function dbTickPct(db) {
  const gain = Math.pow(10, db / 20);
  const pct = (gain - VOLUME_FADER_SPEC.min) / (VOLUME_FADER_SPEC.max - VOLUME_FADER_SPEC.min);
  return clamp(1 - pct, 0, 1) * 100;
}
