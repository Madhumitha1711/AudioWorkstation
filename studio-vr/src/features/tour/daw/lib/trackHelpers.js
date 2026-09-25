// ═══════════════════════════════════════════════════════════════════════════
// DAW Workstation — track/region scope helpers
// ═══════════════════════════════════════════════════════════════════════════
import { OUTER_CHAIN_SUFFIX } from "./constants";

// A track is actually heard when it isn't muted AND (nothing in the mix is
// soloed, or it's one of the soloed ones) — same solo-exclusivity rule Logic
// (and every other DAW) uses. `allTracks` should be the full track list (not
// just the ones with audio loaded) so soloing an empty track still silences
// everything else, same as it would once that track gets audio.
export function trackIsAudible(track, allTracks) {
  if (track.muted) return false;
  const anySolo = allTracks.some((t) => t.solo);
  return !anySolo || !!track.solo;
}

// A post-fader Send now diverts its own level's worth of signal away from
// the track's direct (dry) path to master, rather than just layering an
// unchanged copy on top of an unchanged direct signal — raising a send to
// 100% routes that track's signal to the Aux bus ONLY, instead of leaving
// the original still audible at the main output alongside it. Multiple
// post-fader sends on one track stack (their levels sum), so splitting a
// track across two Aux buses at 50% each still fully empties the dry path.
// Pre-fader sends are deliberately exempt — they tap before this same point
// and are meant to stay an independent copy no matter what the fader (or,
// by the same reasoning, any post-fader send) is doing — see the
// send-window's own PRE tooltip. Muted sends don't count as diverting
// anything, same as they don't actually reach the bus.
export function computeDryScale(track) {
  const diverted = (track.sends || []).reduce((sum, s) => {
    if (s.prePost === "pre" || s.muted) return sum;
    return sum + (s.level ?? 1);
  }, 0);
  return Math.min(1, Math.max(0, 1 - diverted));
}

// A portion's OWN "outer" pre-chain is addressed via a suffixed regionId
// (`${region.id}::outer`) so it slots into the exact same
// `(trackId, regionId)` addressing as the whole-track and portion-own
// scopes — see getChainArray/withChainArray in chainGraph.js.
export function outerScopeId(regionId) {
  return `${regionId}${OUTER_CHAIN_SUFFIX}`;
}
export function isOuterScope(regionId) {
  return typeof regionId === "string" && regionId.endsWith(OUTER_CHAIN_SUFFIX);
}
export function baseRegionId(regionId) {
  return isOuterScope(regionId) ? regionId.slice(0, -OUTER_CHAIN_SUFFIX.length) : regionId;
}
