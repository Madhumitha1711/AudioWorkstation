// Shared, non-component Equalizer (ParamEQ) logic: Faust param
// addresses/defaults, the applyBandsToNode helper that writes typed band
// state onto a live Faust node, the per-band accessor/setter helpers that
// drive the curve UI generically, the analytic magnitude-response math used
// to draw the frequency-response curve, the log-freq/dB <-> fractional-
// position helpers, presets, and small output-gain helpers.
//
// Split out from Equalizer.jsx (which exports the EqualizerEditorPanel/
// BandEditPanel/ParamEQCurve/Equalizer *components*) so that file only
// exports components — keeps Vite Fast Refresh working there — and gives any
// other host (e.g. the DAW workstation's insert-chain popup,
// ../panorama/DawWorkstationScreen) a plain module to import this from
// without pulling in component-only concerns. Same split as ./gateEngine for
// the Noise Gate.

// Uses the real 8-band "ParamEQ" Faust patch in public/faust/ParamEQ/
// (HPF -> Low Shelf -> 4x Peak -> High Shelf -> LPF), driven by a single
// Faust AudioWorkletNode whose params are the addresses below.

// ── Param addresses (from public/faust/ParamEQ/dsp-meta.json) ───────────────
export const ADDR = {
  hpfFreq: '/ParamEQ/HPF_Freq',
  hpfBypass: '/ParamEQ/HPF_Bypass',
  hpfOrder: '/ParamEQ/HPF_Order',
  lowShelfFreq: '/ParamEQ/Low_Shelf_Freq',
  lowShelfGain: '/ParamEQ/Low_Shelf_Gain',
  lowShelfQ: '/ParamEQ/Low_Shelf_Q',
  lowShelfBypass: '/ParamEQ/Low_Shelf_Bypass',
  lowShelfDynamicOn: '/ParamEQ/Low_Shelf_Dynamic_On',
  lowShelfThreshold: '/ParamEQ/Low_Shelf_Threshold',
  lowShelfRange: '/ParamEQ/Low_Shelf_Range',
  lowShelfAttack: '/ParamEQ/Low_Shelf_Attack',
  lowShelfRelease: '/ParamEQ/Low_Shelf_Release',
  lowShelfLiveGain: '/ParamEQ/Low_Shelf_Live_Gain', // read-only hbargraph output
  peak1Freq: '/ParamEQ/Peak1_Freq',
  peak1Gain: '/ParamEQ/Peak1_Gain',
  peak1Q: '/ParamEQ/Peak1_Q',
  peak1Bypass: '/ParamEQ/Peak1_Bypass',
  peak1DynamicOn: '/ParamEQ/Peak1_Dynamic_On',
  peak1Threshold: '/ParamEQ/Peak1_Threshold',
  peak1Range: '/ParamEQ/Peak1_Range',
  peak1Attack: '/ParamEQ/Peak1_Attack',
  peak1Release: '/ParamEQ/Peak1_Release',
  peak1LiveGain: '/ParamEQ/Peak1_Live_Gain', // read-only hbargraph output
  peak2Freq: '/ParamEQ/Peak2_Freq',
  peak2Gain: '/ParamEQ/Peak2_Gain',
  peak2Q: '/ParamEQ/Peak2_Q',
  peak2Bypass: '/ParamEQ/Peak2_Bypass',
  peak2DynamicOn: '/ParamEQ/Peak2_Dynamic_On',
  peak2Threshold: '/ParamEQ/Peak2_Threshold',
  peak2Range: '/ParamEQ/Peak2_Range',
  peak2Attack: '/ParamEQ/Peak2_Attack',
  peak2Release: '/ParamEQ/Peak2_Release',
  peak2LiveGain: '/ParamEQ/Peak2_Live_Gain', // read-only hbargraph output
  peak3Freq: '/ParamEQ/Peak3_Freq',
  peak3Gain: '/ParamEQ/Peak3_Gain',
  peak3Q: '/ParamEQ/Peak3_Q',
  peak3Bypass: '/ParamEQ/Peak3_Bypass',
  peak3DynamicOn: '/ParamEQ/Peak3_Dynamic_On',
  peak3Threshold: '/ParamEQ/Peak3_Threshold',
  peak3Range: '/ParamEQ/Peak3_Range',
  peak3Attack: '/ParamEQ/Peak3_Attack',
  peak3Release: '/ParamEQ/Peak3_Release',
  peak3LiveGain: '/ParamEQ/Peak3_Live_Gain', // read-only hbargraph output
  peak4Freq: '/ParamEQ/Peak4_Freq',
  peak4Gain: '/ParamEQ/Peak4_Gain',
  peak4Q: '/ParamEQ/Peak4_Q',
  peak4Bypass: '/ParamEQ/Peak4_Bypass',
  peak4DynamicOn: '/ParamEQ/Peak4_Dynamic_On',
  peak4Threshold: '/ParamEQ/Peak4_Threshold',
  peak4Range: '/ParamEQ/Peak4_Range',
  peak4Attack: '/ParamEQ/Peak4_Attack',
  peak4Release: '/ParamEQ/Peak4_Release',
  peak4LiveGain: '/ParamEQ/Peak4_Live_Gain', // read-only hbargraph output
  highShelfFreq: '/ParamEQ/High_Shelf_Freq',
  highShelfGain: '/ParamEQ/High_Shelf_Gain',
  highShelfQ: '/ParamEQ/High_Shelf_Q',
  highShelfBypass: '/ParamEQ/High_Shelf_Bypass',
  highShelfDynamicOn: '/ParamEQ/High_Shelf_Dynamic_On',
  highShelfThreshold: '/ParamEQ/High_Shelf_Threshold',
  highShelfRange: '/ParamEQ/High_Shelf_Range',
  highShelfAttack: '/ParamEQ/High_Shelf_Attack',
  highShelfRelease: '/ParamEQ/High_Shelf_Release',
  highShelfLiveGain: '/ParamEQ/High_Shelf_Live_Gain', // read-only hbargraph output
  lpfFreq: '/ParamEQ/LPF_Freq',
  lpfBypass: '/ParamEQ/LPF_Bypass',
  lpfOrder: '/ParamEQ/LPF_Order',
};
// Read-only Live_Gain hbargraph address -> band id, for subscribing to the
// dynamic engine's actually-applied gain via setOutputParamHandler and
// routing each update into the right band's slot in a liveDynGainRef.
export const LIVE_GAIN_ADDR_TO_BAND = {
  [ADDR.lowShelfLiveGain]: 'lowShelf',
  [ADDR.peak1LiveGain]: 'peak1',
  [ADDR.peak2LiveGain]: 'peak2',
  [ADDR.peak3LiveGain]: 'peak3',
  [ADDR.peak4LiveGain]: 'peak4',
  [ADDR.highShelfLiveGain]: 'highShelf',
};
// HPF/LPF slope, as a Butterworth order (2/4/6/8 = 12/24/36/48 dB/oct). This
// is the value stored in BandDef; the underlying Faust nentry only accepts
// an index 0-3 (see ParamEQDynamic.dsp's hpf_order_sel / lpf_order_sel), so
// ORDER_VALUES/orderToIndex below convert between them.
export const ORDER_VALUES = [2, 4, 6, 8];
export function orderToIndex(order) {
  const i = ORDER_VALUES.indexOf(order);
  return i === -1 ? 1 : i; // default to index 1 (order 4 / 24dB/oct)
}
// A flat, all-pass-through response and dynamic mode off everywhere. Unlike
// dsp-meta.json's own `init` values (which leave every band un-bypassed),
// every band here starts *bypassed* — an empty canvas where nothing shapes
// the sound until you explicitly turn a band ON, rather than 8 already-active
// (if currently flat) bands. Range defaults negative (a cut/ducking move once
// armed) since that's the far more common dynamic-EQ use case (de-essing,
// taming resonances); flip it positive in the UI to make a band boost instead.
export const DEFAULT_DYNAMIC = { dynamicOn: false, threshold: -24, range: -6, attack: 0.005, release: 0.15 };
export const DEFAULT_BANDS = {
  hpfFreq: 20, hpfBypass: true, hpfOrder: 4,
  lowShelfFreq: 75, lowShelfGain: 0, lowShelfQ: 0.7, lowShelfBypass: true,
  lowShelfDynamicOn: DEFAULT_DYNAMIC.dynamicOn, lowShelfThreshold: DEFAULT_DYNAMIC.threshold, lowShelfRange: DEFAULT_DYNAMIC.range, lowShelfAttack: DEFAULT_DYNAMIC.attack, lowShelfRelease: DEFAULT_DYNAMIC.release,
  peak1Freq: 100, peak1Gain: 0, peak1Q: 0.7, peak1Bypass: true,
  peak1DynamicOn: DEFAULT_DYNAMIC.dynamicOn, peak1Threshold: DEFAULT_DYNAMIC.threshold, peak1Range: DEFAULT_DYNAMIC.range, peak1Attack: DEFAULT_DYNAMIC.attack, peak1Release: DEFAULT_DYNAMIC.release,
  peak2Freq: 250, peak2Gain: 0, peak2Q: 1, peak2Bypass: true,
  peak2DynamicOn: DEFAULT_DYNAMIC.dynamicOn, peak2Threshold: DEFAULT_DYNAMIC.threshold, peak2Range: DEFAULT_DYNAMIC.range, peak2Attack: DEFAULT_DYNAMIC.attack, peak2Release: DEFAULT_DYNAMIC.release,
  peak3Freq: 1000, peak3Gain: 0, peak3Q: 1, peak3Bypass: true,
  peak3DynamicOn: DEFAULT_DYNAMIC.dynamicOn, peak3Threshold: DEFAULT_DYNAMIC.threshold, peak3Range: DEFAULT_DYNAMIC.range, peak3Attack: DEFAULT_DYNAMIC.attack, peak3Release: DEFAULT_DYNAMIC.release,
  peak4Freq: 2500, peak4Gain: 0, peak4Q: 1, peak4Bypass: true,
  peak4DynamicOn: DEFAULT_DYNAMIC.dynamicOn, peak4Threshold: DEFAULT_DYNAMIC.threshold, peak4Range: DEFAULT_DYNAMIC.range, peak4Attack: DEFAULT_DYNAMIC.attack, peak4Release: DEFAULT_DYNAMIC.release,
  highShelfFreq: 7500, highShelfGain: 0, highShelfQ: 0.7, highShelfBypass: true,
  highShelfDynamicOn: DEFAULT_DYNAMIC.dynamicOn, highShelfThreshold: DEFAULT_DYNAMIC.threshold, highShelfRange: DEFAULT_DYNAMIC.range, highShelfAttack: DEFAULT_DYNAMIC.attack, highShelfRelease: DEFAULT_DYNAMIC.release,
  lpfFreq: 20000, lpfBypass: true, lpfOrder: 4,
};
export function setBool(node, addr, v) {
  node.setParamValue(addr, v ? 1 : 0);
}
export function applyBandsToNode(node, b) {
  node.setParamValue(ADDR.hpfFreq, b.hpfFreq);
  setBool(node, ADDR.hpfBypass, b.hpfBypass);
  node.setParamValue(ADDR.hpfOrder, orderToIndex(b.hpfOrder));
  node.setParamValue(ADDR.lowShelfFreq, b.lowShelfFreq);
  node.setParamValue(ADDR.lowShelfGain, b.lowShelfGain);
  node.setParamValue(ADDR.lowShelfQ, b.lowShelfQ);
  setBool(node, ADDR.lowShelfBypass, b.lowShelfBypass);
  setBool(node, ADDR.lowShelfDynamicOn, b.lowShelfDynamicOn);
  node.setParamValue(ADDR.lowShelfThreshold, b.lowShelfThreshold);
  node.setParamValue(ADDR.lowShelfRange, b.lowShelfRange);
  node.setParamValue(ADDR.lowShelfAttack, b.lowShelfAttack);
  node.setParamValue(ADDR.lowShelfRelease, b.lowShelfRelease);
  node.setParamValue(ADDR.peak1Freq, b.peak1Freq);
  node.setParamValue(ADDR.peak1Gain, b.peak1Gain);
  node.setParamValue(ADDR.peak1Q, b.peak1Q);
  setBool(node, ADDR.peak1Bypass, b.peak1Bypass);
  setBool(node, ADDR.peak1DynamicOn, b.peak1DynamicOn);
  node.setParamValue(ADDR.peak1Threshold, b.peak1Threshold);
  node.setParamValue(ADDR.peak1Range, b.peak1Range);
  node.setParamValue(ADDR.peak1Attack, b.peak1Attack);
  node.setParamValue(ADDR.peak1Release, b.peak1Release);
  node.setParamValue(ADDR.peak2Freq, b.peak2Freq);
  node.setParamValue(ADDR.peak2Gain, b.peak2Gain);
  node.setParamValue(ADDR.peak2Q, b.peak2Q);
  setBool(node, ADDR.peak2Bypass, b.peak2Bypass);
  setBool(node, ADDR.peak2DynamicOn, b.peak2DynamicOn);
  node.setParamValue(ADDR.peak2Threshold, b.peak2Threshold);
  node.setParamValue(ADDR.peak2Range, b.peak2Range);
  node.setParamValue(ADDR.peak2Attack, b.peak2Attack);
  node.setParamValue(ADDR.peak2Release, b.peak2Release);
  node.setParamValue(ADDR.peak3Freq, b.peak3Freq);
  node.setParamValue(ADDR.peak3Gain, b.peak3Gain);
  node.setParamValue(ADDR.peak3Q, b.peak3Q);
  setBool(node, ADDR.peak3Bypass, b.peak3Bypass);
  setBool(node, ADDR.peak3DynamicOn, b.peak3DynamicOn);
  node.setParamValue(ADDR.peak3Threshold, b.peak3Threshold);
  node.setParamValue(ADDR.peak3Range, b.peak3Range);
  node.setParamValue(ADDR.peak3Attack, b.peak3Attack);
  node.setParamValue(ADDR.peak3Release, b.peak3Release);
  node.setParamValue(ADDR.peak4Freq, b.peak4Freq);
  node.setParamValue(ADDR.peak4Gain, b.peak4Gain);
  node.setParamValue(ADDR.peak4Q, b.peak4Q);
  setBool(node, ADDR.peak4Bypass, b.peak4Bypass);
  setBool(node, ADDR.peak4DynamicOn, b.peak4DynamicOn);
  node.setParamValue(ADDR.peak4Threshold, b.peak4Threshold);
  node.setParamValue(ADDR.peak4Range, b.peak4Range);
  node.setParamValue(ADDR.peak4Attack, b.peak4Attack);
  node.setParamValue(ADDR.peak4Release, b.peak4Release);
  node.setParamValue(ADDR.highShelfFreq, b.highShelfFreq);
  node.setParamValue(ADDR.highShelfGain, b.highShelfGain);
  node.setParamValue(ADDR.highShelfQ, b.highShelfQ);
  setBool(node, ADDR.highShelfBypass, b.highShelfBypass);
  setBool(node, ADDR.highShelfDynamicOn, b.highShelfDynamicOn);
  node.setParamValue(ADDR.highShelfThreshold, b.highShelfThreshold);
  node.setParamValue(ADDR.highShelfRange, b.highShelfRange);
  node.setParamValue(ADDR.highShelfAttack, b.highShelfAttack);
  node.setParamValue(ADDR.highShelfRelease, b.highShelfRelease);
  node.setParamValue(ADDR.lpfFreq, b.lpfFreq);
  setBool(node, ADDR.lpfBypass, b.lpfBypass);
  node.setParamValue(ADDR.lpfOrder, orderToIndex(b.lpfOrder));
}
// ── Band descriptors (drives the curve UI generically) ──────────────────────
// orderKey is present only on HPF/LPF — their slope (Butterworth order
// 2/4/6/8, i.e. 12/24/36/48 dB/oct) instead of the gain/Q the other bands
// have. dynamicOnKey/thresholdKey/rangeKey/attackKey/releaseKey are present
// only on the 6 bands Faust's ParamEQ gives dynamic (level-dependent)
// processing to — HPF/LPF have no gain stage, so no dynamics.
// Each band carries two colors: `color` is the bright/pastel tone tuned to
// glow against the graph's permanently-dark canvas; `lightColor` is a deeper
// equivalent for panel chrome once that goes light. See uiColor() in
// Equalizer.jsx.
export const BAND_DEFS = [
  { id: 'hpf', short: 'HPF', label: 'High-Pass', color: '#9AA5B1', lightColor: '#5b6472', kind: 'hpf', freqKey: 'hpfFreq', bypassKey: 'hpfBypass', orderKey: 'hpfOrder' },
  {
    id: 'lowShelf', short: 'LOW SHELF', label: 'Low Shelf', color: '#F5A623', lightColor: '#ad6a12', kind: 'lowshelf',
    freqKey: 'lowShelfFreq', gainKey: 'lowShelfGain', qKey: 'lowShelfQ', bypassKey: 'lowShelfBypass',
    dynamicOnKey: 'lowShelfDynamicOn', thresholdKey: 'lowShelfThreshold', rangeKey: 'lowShelfRange',
    attackKey: 'lowShelfAttack', releaseKey: 'lowShelfRelease',
  },
  {
    id: 'peak1', short: 'PEAK 1', label: 'Peak 1', color: '#D9E86B', lightColor: '#7a8a1a', kind: 'peak',
    freqKey: 'peak1Freq', gainKey: 'peak1Gain', qKey: 'peak1Q', bypassKey: 'peak1Bypass',
    dynamicOnKey: 'peak1DynamicOn', thresholdKey: 'peak1Threshold', rangeKey: 'peak1Range',
    attackKey: 'peak1Attack', releaseKey: 'peak1Release',
  },
  {
    id: 'peak2', short: 'PEAK 2', label: 'Peak 2', color: '#6BE86B', lightColor: '#1f9d43', kind: 'peak',
    freqKey: 'peak2Freq', gainKey: 'peak2Gain', qKey: 'peak2Q', bypassKey: 'peak2Bypass',
    dynamicOnKey: 'peak2DynamicOn', thresholdKey: 'peak2Threshold', rangeKey: 'peak2Range',
    attackKey: 'peak2Attack', releaseKey: 'peak2Release',
  },
  {
    id: 'peak3', short: 'PEAK 3', label: 'Peak 3', color: '#2DD4BF', lightColor: '#0f9488', kind: 'peak',
    freqKey: 'peak3Freq', gainKey: 'peak3Gain', qKey: 'peak3Q', bypassKey: 'peak3Bypass',
    dynamicOnKey: 'peak3DynamicOn', thresholdKey: 'peak3Threshold', rangeKey: 'peak3Range',
    attackKey: 'peak3Attack', releaseKey: 'peak3Release',
  },
  {
    id: 'peak4', short: 'PEAK 4', label: 'Peak 4', color: '#4D9EFF', lightColor: '#2563eb', kind: 'peak',
    freqKey: 'peak4Freq', gainKey: 'peak4Gain', qKey: 'peak4Q', bypassKey: 'peak4Bypass',
    dynamicOnKey: 'peak4DynamicOn', thresholdKey: 'peak4Threshold', rangeKey: 'peak4Range',
    attackKey: 'peak4Attack', releaseKey: 'peak4Release',
  },
  {
    id: 'highShelf', short: 'HIGH SHELF', label: 'High Shelf', color: '#A78BFA', lightColor: '#7c3aed', kind: 'highshelf',
    freqKey: 'highShelfFreq', gainKey: 'highShelfGain', qKey: 'highShelfQ', bypassKey: 'highShelfBypass',
    dynamicOnKey: 'highShelfDynamicOn', thresholdKey: 'highShelfThreshold', rangeKey: 'highShelfRange',
    attackKey: 'highShelfAttack', releaseKey: 'highShelfRelease',
  },
  { id: 'lpf', short: 'LPF', label: 'Low-Pass', color: '#CBD5E1', lightColor: '#64748b', kind: 'lpf', freqKey: 'lpfFreq', bypassKey: 'lpfBypass', orderKey: 'lpfOrder' },
];
export function getFreq(b, def) { return b[def.freqKey]; }
export function getGain(b, def) { return def.gainKey ? b[def.gainKey] : 0; }
export function getQ(b, def) { return def.qKey ? b[def.qKey] : undefined; }
export function getBypass(b, def) { return b[def.bypassKey]; }
export function getDynamicOn(b, def) { return def.dynamicOnKey ? b[def.dynamicOnKey] : false; }
export function getThreshold(b, def) { return def.thresholdKey ? b[def.thresholdKey] : -24; }
export function getRange(b, def) { return def.rangeKey ? b[def.rangeKey] : -6; }
export function getAttack(b, def) { return def.attackKey ? b[def.attackKey] : 0.005; }
export function getRelease(b, def) { return def.releaseKey ? b[def.releaseKey] : 0.15; }
export function getOrder(b, def) { return def.orderKey ? b[def.orderKey] : 4; }
export function withFreq(b, def, v) {
  return { ...b, [def.freqKey]: v };
}
export function withGain(b, def, v) {
  if (!def.gainKey) return b;
  return { ...b, [def.gainKey]: v };
}
export function withQ(b, def, v) {
  if (!def.qKey) return b;
  return { ...b, [def.qKey]: v };
}
export function withBypass(b, def, v) {
  return { ...b, [def.bypassKey]: v };
}
export function withDynamicOn(b, def, v) {
  if (!def.dynamicOnKey) return b;
  return { ...b, [def.dynamicOnKey]: v };
}
export function withThreshold(b, def, v) {
  if (!def.thresholdKey) return b;
  return { ...b, [def.thresholdKey]: v };
}
export function withRange(b, def, v) {
  if (!def.rangeKey) return b;
  return { ...b, [def.rangeKey]: v };
}
export function withAttack(b, def, v) {
  if (!def.attackKey) return b;
  return { ...b, [def.attackKey]: v };
}
export function withRelease(b, def, v) {
  if (!def.releaseKey) return b;
  return { ...b, [def.releaseKey]: v };
}
export function withOrder(b, def, v) {
  if (!def.orderKey) return b;
  return { ...b, [def.orderKey]: v };
}
// ── Curve math (analytic magnitude-response approximations, in dB) ──────────
export const FMIN = 20, FMAX = 20000;
export const GMIN = -24, GMAX = 24;
// AnalyserNode's dB floor/ceiling — set on the node itself by the host *and*
// used by the curve drawer to decode its byte data, so the two stay in sync.
export const ANALYSER_MIN_DB = -100;
export const ANALYSER_MAX_DB = -10;
export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
export function butterHighpassDB(f, fc, order) {
  const ratio = Math.pow(f / fc, 2 * order);
  return 10 * Math.log10(Math.max(ratio / (1 + ratio), 1e-12));
}
export function butterLowpassDB(f, fc, order) {
  const ratio = Math.pow(f / fc, 2 * order);
  return 10 * Math.log10(Math.max(1 / (1 + ratio), 1e-12));
}
// Shelf knee: full gain right at (and past) the corner frequency, tapering
// to 0 dB over a Q-dependent number of octaves. SHELF_KNEE_OCTAVES is the
// knee width at SHELF_REF_Q (the default 0.7 shelf Q); Q scales that width
// inversely.
export const SHELF_KNEE_OCTAVES = 2;
export const SHELF_REF_Q = 0.7;
export function shelfKneeShape(t, q) {
  const octaves = SHELF_KNEE_OCTAVES * (SHELF_REF_Q / clamp(q, 0.05, 20));
  if (t <= 0) return 1;
  if (t >= octaves) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * t) / octaves));
}
export function lowShelfDB(f, fc, gainDb, q) {
  return gainDb * shelfKneeShape(Math.log2(f / fc), q);
}
export function highShelfDB(f, fc, gainDb, q) {
  return gainDb * shelfKneeShape(Math.log2(fc / f), q);
}
export function peakDB(f, fc, gainDb, q) {
  const x = f / fc;
  const bw = q * (x - 1 / x);
  return gainDb / (1 + bw * bw);
}
// The gain a dynamic-enabled band settles on at its most extreme — fully
// engaged (signal continuously past Threshold). Range is signed and simply
// adds to the static Gain: negative Range ducks the band down by up to
// |Range| dB, positive Range lifts it up by up to Range dB — matching the
// Faust DSP (dyn_gain_db in ParamEQDynamic.dsp). Non-dynamic bands (or
// dynamic-off bands) just return their static gain unchanged.
export function dynamicExtremeGain(b, def) {
  const gain = getGain(b, def);
  if (!getDynamicOn(b, def)) return gain;
  return gain + getRange(b, def);
}
// `liveDynGainDb` is this one band's *actually-applied* dynamic gain right
// now — read straight off the Faust patch's own Live_Gain hbargraph meters
// (see LIVE_GAIN_ADDR_TO_BAND above), not estimated. It's 0 whenever the
// band's dynamic engine is off or idle, so adding it unconditionally is
// always safe; only during active playback, once the envelope crosses
// Threshold, does it move the curve.
export function bandResponseDB(def, b, f, useDynamicExtreme = false, liveDynGainDb = 0) {
  if (getBypass(b, def)) return 0;
  const freq = getFreq(b, def);
  const gain = useDynamicExtreme ? dynamicExtremeGain(b, def) : getGain(b, def) + liveDynGainDb;
  switch (def.kind) {
    case 'hpf': return butterHighpassDB(f, freq, getOrder(b, def));
    case 'lpf': return butterLowpassDB(f, freq, getOrder(b, def));
    case 'lowshelf': return lowShelfDB(f, freq, gain, getQ(b, def) ?? SHELF_REF_Q);
    case 'highshelf': return highShelfDB(f, freq, gain, getQ(b, def) ?? SHELF_REF_Q);
    case 'peak': return peakDB(f, freq, gain, getQ(b, def) ?? 1);
    default: return 0;
  }
}
export function totalResponseDB(b, f, useDynamicExtreme = false, liveDynGain) {
  let sum = 0;
  for (const def of BAND_DEFS) sum += bandResponseDB(def, b, f, useDynamicExtreme, liveDynGain?.[def.id] ?? 0);
  return sum;
}
// Same sum, but skipping HPF/LPF — they always carry some roll-off shape
// near their own corner even when every actual *gain* control is at 0 dB, so
// including them would make the "shaded gain region" show a sliver of fill
// at the edges even on a fully flat setting. This is used for the fill only.
export function gainOnlyResponseDB(b, f, liveDynGain) {
  let sum = 0;
  for (const def of BAND_DEFS) {
    if (!def.gainKey) continue;
    sum += bandResponseDB(def, b, f, false, liveDynGain?.[def.id] ?? 0);
  }
  return sum;
}
// Curve-similarity score: average |dB error| across the audible spectrum,
// not per-parameter distance — two different freq/Q combos that produce the
// same overall shape should score the same, which is what the ear judges.
export function curveRMSErrorDB(a, b) {
  const N = 48;
  let sumSq = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const f = FMIN * Math.pow(FMAX / FMIN, t);
    const d = totalResponseDB(a, f) - totalResponseDB(b, f);
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / (N + 1));
}
export function scoreFromRMS(rms) {
  return Math.round(clamp(1 - rms / 12, 0, 1) * 100);
}
// ── Log-freq / dB <-> fractional-position helpers (0..1, used for % layout) ──
export function fToFrac(f) { return Math.log10(f / FMIN) / Math.log10(FMAX / FMIN); }
export function fracToF(t) { return FMIN * Math.pow(FMAX / FMIN, t); }
export function gainToFrac(g) { return (GMAX - g) / (GMAX - GMIN); }
export function fracToGain(t) { return GMAX - t * (GMAX - GMIN); }
// ── EQ presets — used as Test Bench quick-apply buttons and as the hidden
// target pool for Ear Training (both lab-only concerns) ────────────────────
export const EQ_PRESETS = [
  { name: 'WARM & ROUND', bands: { hpfFreq: 30, lowShelfGain: 4, peak2Freq: 300, peak2Gain: 2, peak4Freq: 3000, peak4Gain: -3, highShelfGain: -4 } },
  { name: 'BRIGHT & AIRY', bands: { lowShelfGain: -2, peak3Freq: 2000, peak3Gain: 3, highShelfFreq: 9000, highShelfGain: 6 } },
  { name: 'TELEPHONE', bands: { hpfFreq: 400, lpfFreq: 3400, peak2Freq: 1200, peak2Gain: 6, peak2Q: 1.2, lowShelfGain: -12, highShelfGain: -12 } },
  { name: 'BOOMY CUT', bands: { lowShelfGain: -6, peak1Freq: 150, peak1Gain: -4, peak1Q: 1.5 } },
  { name: 'VOCAL PRESENCE', bands: { hpfFreq: 90, lowShelfGain: -2, peak3Freq: 3000, peak3Gain: 5, peak3Q: 0.8, peak4Freq: 6000, peak4Gain: 2 } },
  { name: 'PODCAST CLARITY', bands: { hpfFreq: 80, peak2Freq: 400, peak2Gain: -3, peak2Q: 1.2, peak3Freq: 4000, peak3Gain: 4, highShelfGain: 2 } },
];
export function mergeBands(base, partial) {
  return { ...base, ...partial };
}
// Applies a preset on top of `base` and un-bypasses every band the preset
// actually dials in (freq/gain/Q/order). Needed because DEFAULT_BANDS starts
// every band bypassed — without this, picking a preset (or loading Ear
// Training's hidden target, which is a preset too) would silently land on
// bands that are still switched OFF.
export function applyPreset(base, preset) {
  let next = mergeBands(base, preset.bands);
  for (const def of BAND_DEFS) {
    const touchesBand = [def.freqKey, def.gainKey, def.qKey, def.orderKey]
      .some(key => key !== undefined && Object.prototype.hasOwnProperty.call(preset.bands, key));
    if (touchesBand) next = withBypass(next, def, false);
  }
  return next;
}
export function pickRandomPreset() {
  return EQ_PRESETS[Math.floor(Math.random() * EQ_PRESETS.length)];
}
// ── Output (makeup) gain ─────────────────────────────────────────────────────
export function dbToLinear(db) { return Math.pow(10, db / 20); }
// Schedules the GainNode's value properly (cancel + setValueAtTime + a short
// ramp) instead of a bare `.gain.value = x` assignment — the correct way to
// change an AudioParam live per the Web Audio spec, and it avoids any click
// or "value doesn't stick" edge case a plain assignment can hit while audio
// is actively rendering.
export function applyOutputGain(node, db, ctx) {
  const target = dbToLinear(db);
  if (!ctx) {
    node.gain.value = target;
    return;
  }
  const now = ctx.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, now);
  node.gain.linearRampToValueAtTime(target, now + 0.03);
}
