export const DEFAULTS = {
  freq: 3385,
  type: 0,
  thresh: -29.6,
  range: -12.6,
};

export const ADDR = {
  freq: '/deesser/Freq',
  type: '/deesser/Type',
  thresh: '/deesser/Thresh',
  range: '/deesser/Range',
  gainReduction: '/deesser/Gain_Reduction',
};

export function pushFaustParams(node, params) {
  node.setParamValue(ADDR.freq, params.freq);
  node.setParamValue(ADDR.type, params.type);
  node.setParamValue(ADDR.thresh, params.thresh);
  node.setParamValue(ADDR.range, params.range);
}

export const METER_FLOOR_DB = -60;

export function analyserPeakDb(analyser) {
  if (!analyser) return null;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  return peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
}
