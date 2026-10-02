
export { levelBallistic, grReadoutSmooth } from './ballistics';export const BAND_IDS = ['low', 'lowMid', 'highMid', 'high'];
export const BAND_LABELS = {
  low: 'LOW', lowMid: 'LOW-MID', highMid: 'HIGH-MID', high: 'HIGH',
};

const TIME_KNOB_MIN_MS = 1;
const TIME_KNOB_BREAK_MS = 200;
const TIME_KNOB_MAX_MS = 2000;
const TIME_KNOB_BREAK_FRAC = 0.6;
function timeKnobToFrac(ms) {
  const v = Math.min(TIME_KNOB_MAX_MS, Math.max(TIME_KNOB_MIN_MS, ms));
  if (v <= TIME_KNOB_BREAK_MS) {
    return ((v - TIME_KNOB_MIN_MS) / (TIME_KNOB_BREAK_MS - TIME_KNOB_MIN_MS)) * TIME_KNOB_BREAK_FRAC;
  }
  return TIME_KNOB_BREAK_FRAC + ((v - TIME_KNOB_BREAK_MS) / (TIME_KNOB_MAX_MS - TIME_KNOB_BREAK_MS)) * (1 - TIME_KNOB_BREAK_FRAC);
}
function timeKnobFromFrac(frac) {
  const f = Math.min(1, Math.max(0, frac));
  if (f <= TIME_KNOB_BREAK_FRAC) {
    return TIME_KNOB_MIN_MS + (f / TIME_KNOB_BREAK_FRAC) * (TIME_KNOB_BREAK_MS - TIME_KNOB_MIN_MS);
  }
  return TIME_KNOB_BREAK_MS + ((f - TIME_KNOB_BREAK_FRAC) / (1 - TIME_KNOB_BREAK_FRAC)) * (TIME_KNOB_MAX_MS - TIME_KNOB_BREAK_MS);
}
function fmtMs(v) {
  return `${Math.round(v)} ms`;
}

export const KNOBS = [
  { key: 'threshold', label: 'THRESHOLD', min: -60, max: 0, step: 0.5, fmt: v => `${v.toFixed(0)} dB` },
  { key: 'ratio', label: 'RATIO', min: 1, max: 20, step: 1, fmt: v => `${v.toFixed(0)} : 1` },
  {
    key: 'attack', label: 'ATTACK', min: TIME_KNOB_MIN_MS, max: TIME_KNOB_MAX_MS, step: 1,
    fmt: fmtMs, toFrac: timeKnobToFrac, fromFrac: timeKnobFromFrac,
  },
  {
    key: 'release', label: 'RELEASE', min: TIME_KNOB_MIN_MS, max: TIME_KNOB_MAX_MS, step: 1,
    fmt: fmtMs, toFrac: timeKnobToFrac, fromFrac: timeKnobFromFrac,
  },
  { key: 'knee', label: 'KNEE', min: 0, max: 20, step: 0.1, fmt: v => v < 2 ? 'HARD' : v < 10 ? 'MEDIUM' : 'SOFT' },
  { key: 'makeup', label: 'MAKEUP GAIN', min: 0, max: 24, step: 0.1, fmt: v => `+${v.toFixed(1)} dB` },
];

const DEFAULT_BAND = {
  bypass: false, threshold: -20, ratio: 4, attack: 10, release: 100, knee: 3, makeup: 0,
};
export function makeDefaultBands() {
  return { low: { ...DEFAULT_BAND }, lowMid: { ...DEFAULT_BAND }, highMid: { ...DEFAULT_BAND }, high: { ...DEFAULT_BAND } };
}
export const DEFAULT_CROSSOVER = { loLowMid: 150, lowMidHiMid: 1000, hiMidHigh: 5000 };
export const DEFAULT_SIDECHAIN = { external: false, listen: false, hpf: 20 };
export const DEFAULT_OUTPUT_GAIN = 0;
export const DEFAULT_MULTIBAND = false;

const BAND_PREFIX = {
  low: 'Low_Band', lowMid: 'Low-Mid_Band', highMid: 'High-Mid_Band', high: 'High_Band',
};
function bandAddr(band, suffix) {
  return `/compressor/${BAND_PREFIX[band]}_${suffix}`;
}
export const ADDR = {
  multiband: {
    enable: '/compressor/Multiband_Enable',
  },
  band: (b) => ({
    bypass: bandAddr(b, 'Bypass'),
    threshold: bandAddr(b, 'Threshold'),
    ratio: bandAddr(b, 'Ratio'),
    knee: bandAddr(b, 'Knee'),
    attack: bandAddr(b, 'Attack'),
    release: bandAddr(b, 'Release'),
    makeup: bandAddr(b, 'Makeup_Gain'),
    gr: bandAddr(b, 'Gain_Reduction'),
  }),
  crossover: {
    loLowMid: '/compressor/Crossover_Low-LowMid',
    lowMidHiMid: '/compressor/Crossover_LowMid-HighMid',
    hiMidHigh: '/compressor/Crossover_HighMid-High',
  },
  sidechain: {
    external: '/compressor/Sidechain_External_Sidechain',
    listen: '/compressor/Sidechain_SC_Listen',
    hpf: '/compressor/Sidechain_SC_HPF',
  },
  output: {
    wetDry: '/compressor/Output_Wet-Dry',
    gain: '/compressor/Output_Gain',
  },
};

export function pushFaustParams(node, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled) {
  node.setParamValue(ADDR.multiband.enable, multibandEnabled ? 1 : 0);
  for (const b of BAND_IDS) {
    const a = ADDR.band(b);
    const p = bands[b];
    node.setParamValue(a.bypass, p.bypass ? 1 : 0);
    node.setParamValue(a.threshold, p.threshold);
    node.setParamValue(a.ratio, p.ratio);
    node.setParamValue(a.knee, p.knee);
    node.setParamValue(a.attack, p.attack);
    node.setParamValue(a.release, p.release);
    node.setParamValue(a.makeup, p.makeup);
  }
  node.setParamValue(ADDR.crossover.loLowMid, crossover.loLowMid);
  node.setParamValue(ADDR.crossover.lowMidHiMid, crossover.lowMidHiMid);
  node.setParamValue(ADDR.crossover.hiMidHigh, crossover.hiMidHigh);
  node.setParamValue(ADDR.sidechain.external, sidechain.external ? 1 : 0);
  node.setParamValue(ADDR.sidechain.listen, sidechain.listen ? 1 : 0);
  node.setParamValue(ADDR.sidechain.hpf, sidechain.hpf);
  node.setParamValue(ADDR.output.wetDry, bypass ? 0 : 100);
  node.setParamValue(ADDR.output.gain, outputGainDb);
}

export function applyCompression(inputDb, p) {
  const { threshold, ratio, knee } = p;
  const diff = inputDb - threshold;
  if (knee === 0) return inputDb <= threshold ? inputDb : threshold + diff / ratio;
  const halfKnee = knee / 2;
  if (2 * diff < -knee) return inputDb;
  if (2 * diff > knee) return threshold + diff / ratio;
  return inputDb + ((1 / ratio - 1) * (diff + halfKnee) ** 2) / (2 * knee);
}

export const METER_FLOOR_DB = -60;
export const GR_METER_MAX_DB = 24;
