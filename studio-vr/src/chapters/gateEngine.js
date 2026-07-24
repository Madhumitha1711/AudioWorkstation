// Shared, non-component Gate logic: Faust param defaults/addresses, the
// pushFaustParams helper that writes typed params onto a live Faust gate
// node, and a small analyser-peak-in-dB reader.
//
// Split out from NoiseGate.jsx (which exports the GateEditorPanel/NoiseGate
// *components*) so that file only exports components — keeps Vite Fast
// Refresh working there — and gives any other host (e.g. the DAW
// workstation's insert-chain popup, ../panorama/DawWorkstationScreen) a plain
// module to import this from without pulling in component-only concerns.

// Defaults — mirror the `init` values in public/faust/Gate/dsp-meta.json.
export const DEFAULTS = {
  floor: -60,
  gateOpen: -32,
  gateClose: -38,
  attack: 2,
  release: 30,
  hold: 10,
};
export const DEFAULT_SIDECHAIN = { external: false, listen: false, hpf: 20 };

// Faust addresses, from public/faust/Gate/dsp-meta.json's `ui` tree — the
// sidechain controls (External_Sidechain / SC_Listen / SC_HPF) were added
// alongside the gate's 3rd audio input (scIn) in noiseGate.dsp.
export const ADDR = {
  floor: '/NOISE_GATE_STUDIO/Floor',
  gateOpen: '/NOISE_GATE_STUDIO/Gate_Open',
  gateClose: '/NOISE_GATE_STUDIO/Gate_Close',
  attack: '/NOISE_GATE_STUDIO/Attack',
  release: '/NOISE_GATE_STUDIO/Release',
  hold: '/NOISE_GATE_STUDIO/Hold',
  sidechain: {
    external: '/NOISE_GATE_STUDIO/External_Sidechain',
    listen: '/NOISE_GATE_STUDIO/SC_Listen',
    hpf: '/NOISE_GATE_STUDIO/SC_HPF',
  },
};

// The gate patch has no internal Wet_Dry (unlike the compressor's), so bypass
// and wet/dry mixing are done at the WebAudio graph level instead by whatever
// host owns the audio graph — a dry/wet crossfade around the Faust node —
// same pattern as Chapter7's saturation dry/wet bypass path.
export function pushFaustParams(node, params, sidechain) {
  node.setParamValue(ADDR.floor, params.floor);
  node.setParamValue(ADDR.gateOpen, params.gateOpen);
  node.setParamValue(ADDR.gateClose, Math.min(params.gateClose, params.gateOpen));
  node.setParamValue(ADDR.attack, params.attack);
  node.setParamValue(ADDR.release, params.release);
  node.setParamValue(ADDR.hold, params.hold);
  node.setParamValue(ADDR.sidechain.external, sidechain.external ? 1 : 0);
  node.setParamValue(ADDR.sidechain.listen, sidechain.listen ? 1 : 0);
  node.setParamValue(ADDR.sidechain.hpf, sidechain.hpf);
}

export const METER_FLOOR_DB = -60;

// Reads one analyser's current block-peak level in dB (or METER_FLOOR_DB for
// silence) — shared by the standalone lab's own level-reading and any host
// (e.g. the DAW workstation) driving GateEditorPanel from its own analysers.
export function analyserPeakDb(analyser) {
  if (!analyser) return null;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  return peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
}
