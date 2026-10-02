import { OUTER_CHAIN_SUFFIX } from "./constants";

export function trackIsAudible(track, allTracks) {
  if (track.muted) return false;
  const anySolo = allTracks.some((t) => t.solo);
  return !anySolo || !!track.solo;
}

export function computeDryScale(track) {
  const diverted = (track.sends || []).reduce((sum, s) => {
    if (s.prePost === "pre" || s.muted) return sum;
    return sum + (s.level ?? 1);
  }, 0);
  return Math.min(1, Math.max(0, 1 - diverted));
}

export function outerScopeId(regionId) {
  return `${regionId}${OUTER_CHAIN_SUFFIX}`;
}
export function isOuterScope(regionId) {
  return typeof regionId === "string" && regionId.endsWith(OUTER_CHAIN_SUFFIX);
}
export function baseRegionId(regionId) {
  return isOuterScope(regionId) ? regionId.slice(0, -OUTER_CHAIN_SUFFIX.length) : regionId;
}
