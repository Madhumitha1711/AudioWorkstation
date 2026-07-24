// Shared, non-component De-Esser logic: Faust param defaults/addresses, the
// pushFaustParams helper that writes typed params onto a live Faust de-esser
// node, and a small analyser-peak-in-dB reader.
//
// Split out from DeEsser.jsx (which exports the DeEsserEditorPanel/DeEsser
// *components*) so that file only exports components — keeps Vite Fast
// Refresh working there — and gives any other host (e.g. the DAW
// workstation's insert-chain popup, ../panorama/DawWorkstationScreen) a plain
// module to import this from without pulling in component-only concerns.
// Same split as ./gateEngine for the Noise Gate.

// Defaults — mirror the `init` values in public/faust/deesser/dsp-meta.json.
export const DEFAULTS = {
  freq: 3385,
  type: 0,
  thresh: -29.6,
  range: -12.6,
};

// Faust addresses, from public/faust/deesser/dsp-meta.json's `ui` tree.
export const ADDR = {
  freq: '/deesser/Freq',
  type: '/deesser/Type',
  thresh: '/deesser/Thresh',
  range: '/deesser/Range',
  gainReduction: '/deesser/Gain_Reduction', // read-only hbargraph output
};

// The de-esser patch has no internal Wet_Dry, so bypass and wet/dry mixing
// are done at the WebAudio graph level instead by whatever host owns the
// audio graph — a dry/wet crossfade around the Faust node — same pattern as
// the gate's bypass handling.
export function pushFaustParams(node, params) {
  node.setParamValue(ADDR.freq, params.freq);
  node.setParamValue(ADDR.type, params.type);
  node.setParamValue(ADDR.thresh, params.thresh);
  node.setParamValue(ADDR.range, params.range);
}

export const METER_FLOOR_DB = -60;

// Reads one analyser's current block-peak level in dB (or METER_FLOOR_DB for
// silence) — shared by the standalone lab's own level-reading and any host
// (e.g. the DAW workstation) driving DeEsserEditorPanel from its own
// analysers.
export function analyserPeakDb(analyser) {
  if (!analyser) return null;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  return peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
}
