export const PLUGIN_DEFS = [
  { key: "gate", name: "Noise Gate", tag: "Dynamics", color: "green", basePath: "/faust/Gate", wiring: "selfSidechain3" },
  { key: "deess", name: "De-Esser", tag: "Dynamics", color: "purple", basePath: "/faust/deesser", wiring: "direct" },
  { key: "eq", name: "Equalizer", tag: "Tone", color: "teal", basePath: "/faust/ParamEQ", wiring: "direct" },
  { key: "comp", name: "Compressor", tag: "Dynamics", color: "amber", basePath: "/faust/compressor", wiring: "selfSidechain2" },
  { key: "limiter", name: "Limiter", tag: "Dynamics", color: "red", basePath: "/faust/limiter", wiring: "direct" },
  { key: "delay", name: "Delay", tag: "Send", color: "blue", basePath: "/faust/delay", wiring: "direct" },
  { key: "reverb", name: "Reverb", tag: "Send", color: "cyan", basePath: "/faust/reverb", wiring: "direct" },
];

const PLUGIN_TAG_ORDER = ["Dynamics", "Tone", "Send"];
export const PLUGIN_DEFS_GROUPED = (() => {
  const groups = new Map();
  PLUGIN_DEFS.forEach((def) => {
    if (!groups.has(def.tag)) groups.set(def.tag, []);
    groups.get(def.tag).push(def);
  });
  return PLUGIN_TAG_ORDER.filter((t) => groups.has(t)).map((t) => [t, groups.get(t)]);
})();

export const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
export const RULER_TARGET_MARKS = 24;

export const TRACK_COLORS = ["teal", "amber", "blue", "purple", "green", "red", "cyan", "pink", "lime"];

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

export const SEND_FADER_DB_TICKS = [0, -6, -12, -24, -48];
export const SEND_FADER_HEIGHT = 150;

export const MIN_REGION_LEN = 0.05;

export const TRACK_CHAIN_SCOPE = "__track__";

export const OUTER_CHAIN_SUFFIX = "::outer";

export const DEMO_CLIPS = [
  { id: "acousticGtr", name: "Hungarian Dance No. 5 — Acoustic Gtr", url: "/audio/BolzAndKnecht_HungarianDanceNo5_Full/01_AcousticGtr.wav", color: "teal" },
  { id: "acousticGtrDI", name: "Hungarian Dance No. 5 — Acoustic Gtr DI", url: "/audio/BolzAndKnecht_HungarianDanceNo5_Full/02_AcousticGtrDI.wav", color: "amber" },
  { id: "saxophone", name: "Hungarian Dance No. 5 — Saxophone", url: "/audio/BolzAndKnecht_HungarianDanceNo5_Full/03_Saxophone.wav", color: "blue" },
];

export const VIEW_TABS = [
  { id: "arrange", label: "Arrange", title: "Arrange view" },
  { id: "mixer", label: "Mixer", title: "Mixer view (X)" },
];
