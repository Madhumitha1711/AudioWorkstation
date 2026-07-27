// ═══════════════════════════════════════════════════════════════════════════
// DAW Workstation — shared constants
// ═══════════════════════════════════════════════════════════════════════════
// Plain data used across the DAW screen and its subcomponents: the plugin
// catalog, track color/ruler/fader specs, and the built-in demo clips. No
// React, no audio-graph code — see chainGraph.js/offlineRender.js for that.

export const PLUGIN_DEFS = [
  { key: "gate", name: "Noise Gate", tag: "Dynamics", color: "green", basePath: "/faust/Gate", wiring: "selfSidechain3" },
  { key: "deess", name: "De-Esser", tag: "Dynamics", color: "purple", basePath: "/faust/deesser", wiring: "direct" },
  { key: "eq", name: "Equalizer", tag: "Tone", color: "teal", basePath: "/faust/ParamEQ", wiring: "direct" },
  { key: "comp", name: "Compressor", tag: "Dynamics", color: "amber", basePath: "/faust/compressor", wiring: "selfSidechain2" },
  { key: "limiter", name: "Limiter", tag: "Dynamics", color: "red", basePath: "/faust/limiter", wiring: "direct" },
  { key: "delay", name: "Delay", tag: "Send", color: "blue", basePath: "/faust/delay", wiring: "direct" },
  { key: "reverb", name: "Reverb", tag: "Send", color: "cyan", basePath: "/faust/reverb", wiring: "direct" },
];

// PLUGIN_DEFS grouped by category (tag) in a fixed display order — the
// insert picker's own categorized menu (see InsertRack), same grouping
// Logic's own plugin menu uses (Dynamics / EQ / Delay & Reverb).
export const PLUGIN_TAG_ORDER = ["Dynamics", "Tone", "Send"];
export const PLUGIN_DEFS_GROUPED = (() => {
  const groups = new Map();
  PLUGIN_DEFS.forEach((def) => {
    if (!groups.has(def.tag)) groups.set(def.tag, []);
    groups.get(def.tag).push(def);
  });
  return PLUGIN_TAG_ORDER.filter((t) => groups.has(t)).map((t) => [t, groups.get(t)]);
})();

// ── Arrangement ruler tick spacing — the ruler used to always draw one
// labeled mark per second, which packs in far more labels than the ruler is
// wide enough to show without them overlapping for anything more than a few
// seconds long. Instead, pickRulerStep (see format.js) picks the coarsest
// "nice" step from this list that still keeps the total mark count under
// RULER_TARGET_MARKS — the same approach real DAW/editor rulers use.
export const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
export const RULER_TARGET_MARKS = 24;

// ── Track colors — cycled across channel strips as they're added, same
// palette students pick from in the Logic-style "New Track" dialog.
export const TRACK_COLORS = ["teal", "amber", "blue", "purple", "green", "red", "cyan", "pink", "lime"];

// ── Shared Fader/Knob specs for the Mixer view's channel strips (see
// components/Fader.jsx + components/Knob.jsx — the same drag-to-adjust
// controls every standalone plugin lab in this app already uses).
export const VOLUME_FADER_SPEC = {
  min: 0,
  max: 1.5,
  step: 0.01,
  label: "VOL",
  fmt: (v) => (v <= 0.001 ? "-∞" : `${(20 * Math.log10(v)).toFixed(1)} dB`),
};
export const PAN_KNOB_SPEC = {
  min: -1,
  max: 1,
  step: 0.02,
  label: "PAN",
  fmt: (v) => (Math.abs(v) < 0.02 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`),
};

// dB tick marks for the send-window's fader scale (Pro Tools' own send
// fader draws a proper "0 to ∞" ruler alongside the handle) — VOLUME_FADER_
// SPEC's own range is linear gain (0..1.5), so each label's vertical
// position is computed from its actual gain equivalent (see dbTickPct in
// format.js) rather than spaced evenly.
export const SEND_FADER_DB_TICKS = [0, -6, -12, -24, -48];
export const SEND_FADER_HEIGHT = 150;

// A portion needs at least this many seconds of length to be kept — filters
// out a stray click (zero-length drag) on the waveform from creating a
// degenerate region.
export const MIN_REGION_LEN = 0.05;

// Sentinel `regionId` meaning "the track's own whole-track chain" rather
// than one of its portions — lets every chain-management function
// (addOrSelectPlugin, removePlugin, wireLiveChain's runtime addressing,
// etc.) address either scope through the exact same `(trackId, regionId)`
// pair (see getChainArray/withChainArray in chainGraph.js), instead of
// duplicating each of those functions once per scope.
export const TRACK_CHAIN_SCOPE = "__track__";

// A portion's OWN "outer" pre-chain — a second, portion-private chain that
// runs before that portion's own chain but, unlike the track's whole-track
// chain, never plays during gaps or other portions. Addressed via a
// suffixed regionId (`${region.id}::outer`) so it slots into the exact same
// `(trackId, regionId)` addressing as the whole-track and portion-own
// scopes — see outerScopeId/isOuterScope/baseRegionId in trackHelpers.js.
export const OUTER_CHAIN_SUFFIX = "::outer";

// Fallback room-tone profile used to restore the ambient bed when this
// screen closes — this screen doesn't know which room's own custom ambience
// (see roomsData.js) was playing before it opened, so it restores the same
// generic default PanoramaTour.jsx itself falls back to, rather than
// silence forever. Mirrors spatialAudioEngine's own (unexported)
// DEFAULT_AMBIENCE.
export const DEFAULT_AMBIENCE = { filterFreq: 500, gain: 0.03, gustDepth: 0.015 };

// Same fallback reasoning as DEFAULT_AMBIENCE above, for the recording-room
// bleed (see startRoomBleed()/stopRoomBleed() in spatialAudioEngine.js and
// the `roomBleed` field in roomsData.js) — this screen doesn't know which
// room's bleed was playing, but the DAW hotspot only ever exists in the
// Studio room (see `interactiveMarkers` in roomsData.js), so this just
// mirrors that room's own roomBleed profile.
export const ROOM_BLEED = {
  audio: "/audio/AndresGuazzelli_FloresDeAbril_Full/02_Piano.wav",
  yaw: 127.7,
  pitch: 0.4,
};

// ── Demo audio: real multitrack stems from a recording of Dvořák's
// "Hungarian Dance No. 5" (arr. Bolz & Knecht) — see
// public/audio/BolzAndKnecht_HungarianDanceNo5_Full/Readme.txt (educational
// use only, per that recording's own license). The mix seeds with all three
// as its default tracks the first time the DAW opens; each track's own "D"
// demo button lets you pick any one of the three to (re)load onto it
// instead, via the dropdown next to it.
export const DEMO_CLIPS = [
  { id: "acousticGtr", name: "Hungarian Dance No. 5 — Acoustic Gtr", url: "/audio/BolzAndKnecht_HungarianDanceNo5_Full/01_AcousticGtr.wav" },
  { id: "acousticGtrDI", name: "Hungarian Dance No. 5 — Acoustic Gtr DI", url: "/audio/BolzAndKnecht_HungarianDanceNo5_Full/02_AcousticGtrDI.wav" },
  { id: "saxophone", name: "Hungarian Dance No. 5 — Saxophone", url: "/audio/BolzAndKnecht_HungarianDanceNo5_Full/03_Saxophone.wav" },
];
