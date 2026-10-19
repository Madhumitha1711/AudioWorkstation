import { RULER_GRIDS, RULER_MIN_LABEL_PX, VOLUME_FADER_SPEC } from "./constants";

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
}

export function pickRulerGrid(pxPerSec) {
  for (const [major, minor] of RULER_GRIDS) {
    if (major * pxPerSec >= RULER_MIN_LABEL_PX) return { major, minor };
  }
  const [major, minor] = RULER_GRIDS[RULER_GRIDS.length - 1];
  return { major, minor };
}

// m:ss, with decimals when the ruler step is below a second
export function fmtRulerMark(s, step = 1) {
  s = Math.round(s * 1000) / 1000;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  if (step < 1) {
    const d = step < 0.5 ? 2 : 1;
    return `${m}:${sec.toFixed(d).padStart(3 + d, "0")}`;
  }
  return `${m}:${String(Math.round(sec)).padStart(2, "0")}`;
}

export function dbTickPct(db) {
  const gain = Math.pow(10, db / 20);
  const pct = (gain - VOLUME_FADER_SPEC.min) / (VOLUME_FADER_SPEC.max - VOLUME_FADER_SPEC.min);
  return clamp(1 - pct, 0, 1) * 100;
}
