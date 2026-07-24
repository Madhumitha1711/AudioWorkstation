// Shared, non-component Compressor logic: band ids/labels, the segmented
// Attack/Release knob mapping, Faust param defaults/addresses, the
// pushFaustParams helper that writes typed params onto a live Faust
// multiband-compressor node, the main+sidechain channel-merge helper, the
// transfer-function math, and small level/meter-smoothing helpers.
//
// Split out from Compressor.jsx (which exports the CompressorEditorPanel/
// Compressor *components*) so that file only exports components — keeps
// Vite Fast Refresh working there — and gives any other host (e.g. the DAW
// workstation's insert-chain popup, ../panorama/DawWorkstationScreen) a plain
// module to import this from without pulling in component-only concerns.
// Same split as ./gateEngine for the Noise Gate.

// The Faust patch is a 4-band multiband compressor with internal/external
// sidechain detection (public/faust/compressor/compressor.dsp). Each band
// gets its own full compressor; three crossover points split the signal into
// Low / Low-Mid / High-Mid / High.
export const BAND_IDS = ['low', 'lowMid', 'highMid', 'high'];
export const BAND_LABELS = {
  low: 'LOW', lowMid: 'LOW-MID', highMid: 'HIGH-MID', high: 'HIGH',
};

// Attack/Release: a "segmented" knob — the bottom 60% of the knob's travel
// covers 1–200 ms (where most musical settings live), the remaining 40%
// covers 200–2000 ms (long releases / slow attacks), instead of one linear
// sweep that would make the common 1–200 ms zone impossible to dial in
// precisely.
export const TIME_KNOB_MIN_MS = 1;
export const TIME_KNOB_BREAK_MS = 200;
export const TIME_KNOB_MAX_MS = 2000;
export const TIME_KNOB_BREAK_FRAC = 0.6;
export function timeKnobToFrac(ms) {
  const v = Math.min(TIME_KNOB_MAX_MS, Math.max(TIME_KNOB_MIN_MS, ms));
  if (v <= TIME_KNOB_BREAK_MS) {
    return ((v - TIME_KNOB_MIN_MS) / (TIME_KNOB_BREAK_MS - TIME_KNOB_MIN_MS)) * TIME_KNOB_BREAK_FRAC;
  }
  return TIME_KNOB_BREAK_FRAC + ((v - TIME_KNOB_BREAK_MS) / (TIME_KNOB_MAX_MS - TIME_KNOB_BREAK_MS)) * (1 - TIME_KNOB_BREAK_FRAC);
}
export function timeKnobFromFrac(frac) {
  const f = Math.min(1, Math.max(0, frac));
  if (f <= TIME_KNOB_BREAK_FRAC) {
    return TIME_KNOB_MIN_MS + (f / TIME_KNOB_BREAK_FRAC) * (TIME_KNOB_BREAK_MS - TIME_KNOB_MIN_MS);
  }
  return TIME_KNOB_BREAK_MS + ((f - TIME_KNOB_BREAK_FRAC) / (1 - TIME_KNOB_BREAK_FRAC)) * (TIME_KNOB_MAX_MS - TIME_KNOB_BREAK_MS);
}
// Whole-number formatting — Ratio, Attack and Release are all integer-only
// knobs (step: 1), so no decimals are ever shown or enterable.
export function fmtMs(v) {
  return `${Math.round(v)} ms`;
}

// Per-band knob ranges mirror the live bounds in
// public/faust/compressor/dsp-meta.json (the Faust patch clamps its own
// params internally — Attack 0.1–100 ms, Release 10–1000 ms, Makeup_Gain
// 0–24 dB — so dialing a knob past those on Attack/Release/Makeup won't
// change the audio any further even though the knob keeps turning). This
// same knob set drives whichever band is selected.
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

// Defaults mirror the Faust patch's own declared `init` values, so the knobs
// read exactly what the DSP is already doing the instant it loads.
export const DEFAULT_BAND = {
  bypass: false, threshold: -20, ratio: 4, attack: 10, release: 100, knee: 3, makeup: 0,
};
export function makeDefaultBands() {
  return { low: { ...DEFAULT_BAND }, lowMid: { ...DEFAULT_BAND }, highMid: { ...DEFAULT_BAND }, high: { ...DEFAULT_BAND } };
}
export const DEFAULT_CROSSOVER = { loLowMid: 150, lowMidHiMid: 1000, hiMidHigh: 5000 };
export const DEFAULT_SIDECHAIN = { external: false, listen: false, hpf: 20 };
export const DEFAULT_OUTPUT_GAIN = 0;
// Matches the Faust patch's own "Multiband/Enable" checkbox default (off) —
// see public/faust/compressor/compressor.dsp v3.1. Off = single-band: the
// Low Band controls act on the whole, unsplit signal and the other 3 bands
// are silent. On = the full 4-band crossover split.
export const DEFAULT_MULTIBAND = false;

// Faust addresses, from public/faust/compressor/dsp-meta.json's `ui` tree —
// band group labels became "Low_Band" / "Low-Mid_Band" / "High-Mid_Band" /
// "High_Band" prefixes (Faust turns label spaces into underscores).
export const BAND_PREFIX = {
  low: 'Low_Band', lowMid: 'Low-Mid_Band', highMid: 'High-Mid_Band', high: 'High_Band',
};
export function bandAddr(band, suffix) {
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
    gr: bandAddr(b, 'Gain_Reduction'), // read-only hbargraph output
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

// Pushes every UI param onto a live Faust node. Bypass drives the patch's own
// Output/Wet-Dry to 0 (fully dry passthrough) — a true bypass, done the way
// the DSP itself exposes it. Outside of bypass this always pushes 100% wet;
// Output Gain is the one global trim exposed.
export function pushFaustParams(node, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled) {
  node.setParamValue(ADDR.multiband.enable, multibandEnabled ? 1 : 0);
  for (const b of BAND_IDS) {
    const a = ADDR.band(b);
    const p = bands[b];
    node.setParamValue(a.bypass, p.bypass ? 1 : 0);
    node.setParamValue(a.threshold, p.threshold);
    node.setParamValue(a.ratio, p.ratio);
    node.setParamValue(a.knee, p.knee);
    node.setParamValue(a.attack, p.attack); // ms — matches the patch's own unit
    node.setParamValue(a.release, p.release); // ms
    node.setParamValue(a.makeup, p.makeup);
  }
  node.setParamValue(ADDR.crossover.loLowMid, crossover.loLowMid);
  node.setParamValue(ADDR.crossover.lowMidHiMid, crossover.lowMidHiMid);
  node.setParamValue(ADDR.crossover.hiMidHigh, crossover.hiMidHigh);
  node.setParamValue(ADDR.sidechain.external, sidechain.external ? 1 : 0);
  node.setParamValue(ADDR.sidechain.listen, sidechain.listen ? 1 : 0);
  node.setParamValue(ADDR.sidechain.hpf, sidechain.hpf);
  node.setParamValue(ADDR.output.wetDry, bypass ? 0 : 100); // patch takes 0..100
  node.setParamValue(ADDR.output.gain, outputGainDb);
}

// Builds a 2-channel (main, sidechain) stream out of two *independent*
// sources — the Faust node declares 2 audio inputs (see compressor.dsp's
// process(mainIn, scIn)), which @grame/faustwasm exposes as ONE AudioNode
// input with channelCount 2 rather than two separate AudioNode inputs, so
// feeding it two distinct signals means merging them onto one 2-channel
// stream with a ChannelMergerNode first. Pass the same node twice to mirror
// one signal onto both channels (self-sidechain).
export function connectMainAndSidechain(ctx, mainSource, sidechainSource, destination) {
  const merger = ctx.createChannelMerger(2);
  mainSource.connect(merger, 0, 0);
  sidechainSource.connect(merger, 0, 1);
  merger.connect(destination);
  return merger;
}

// ── Transfer function math ──────────────────────────────────────────────
export function applyCompression(inputDb, p) {
  const { threshold, ratio, knee } = p;
  const diff = inputDb - threshold;
  // Hard knee (knee=0): no transition region, avoid division by zero
  if (knee === 0) return inputDb <= threshold ? inputDb : threshold + diff / ratio;
  const halfKnee = knee / 2;
  if (2 * diff < -knee) return inputDb;
  if (2 * diff > knee) return threshold + diff / ratio;
  return inputDb + ((1 / ratio - 1) * (diff + halfKnee) ** 2) / (2 * knee);
}

// ── Level ballistics / meter smoothing ──────────────────────────────────
export const METER_FLOOR_DB = -60;
export const LEVEL_ATTACK_S = 0.015;
export const LEVEL_RELEASE_S = 0.35;
export function levelBallistic(prev, target, dt) {
  if (dt <= 0) return prev;
  const tau = target > prev ? LEVEL_ATTACK_S : LEVEL_RELEASE_S;
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}
// Light smoothing (30ms) applied to the real Gain_Reduction values read off
// the Faust patch, purely so the on-screen number/bar doesn't jitter frame
// to frame — the compression ballistics themselves are already the patch's
// own Attack/Release, this is a display-only pass.
export const GR_READOUT_TAU_S = 0.03;
export function grReadoutSmooth(prev, target, dt) {
  if (dt <= 0) return prev;
  return prev + (target - prev) * (1 - Math.exp(-dt / GR_READOUT_TAU_S));
}
export const GR_METER_MAX_DB = 24; // matches the Faust patch's Gain_Reduction hbargraph range (-24..0)

// Reads one analyser's current block-peak level, as dB — shared by the
// standalone lab's own level reading and any host (e.g. the DAW workstation)
// driving CompressorEditorPanel from its own analysers.
export function analyserPeakDb(analyser) {
  if (!analyser) return null;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  return peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
}
