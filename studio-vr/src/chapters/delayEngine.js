// Shared, non-component Delay logic: tempo-sync helpers, Faust param
// defaults/addresses, the pushFaustParams helper that writes typed params
// onto a live Faust delay node, and a small analyser-peak reader.
//
// Split out from Delay.jsx (which exports the DelayEditorPanel/Delay
// *components*) so that file only exports components — keeps Vite Fast
// Refresh working there — and gives any other host (e.g. the DAW
// workstation's insert-chain popup, ../panorama/DawWorkstationScreen) a plain
// module to import this from without pulling in component-only concerns.
// Same split as ./gateEngine for the Noise Gate.

export const BPM = 120;
export const DEFAULT_SYNC = '1/8';

// Tempo-synced note value → ms, at BPM. FREE has no fixed value (the knob
// drives delayTimeMs directly instead).
export function syncDivisionMs(div, bpm) {
  const quarter = 60000 / bpm;
  switch (div) {
    case '1/4': return quarter;
    case '1/8': return quarter / 2;
    case '1/8.': return (quarter / 2) * 1.5;
    case '1/16T': return (quarter / 4) * (2 / 3);
    case 'FREE': return null;
  }
}

// Defaults — mirror the `init` values in public/faust/delay/dsp-meta.json
// (Delay Time 250ms == the 1/8 note at 120 BPM, Feedback 42%, Analog 2,
// Mod Depth 28%, Mod Rate 0.6Hz, Hipass 220Hz, Lopass 6.5kHz, Dry/Wet 28%,
// Output +1dB). Ping Pong has no `init` in the patch (Faust checkboxes
// default to 0) but the lab defaults it on to showcase the stereo bounce.
export const DEFAULTS = {
  delayTimeMs: syncDivisionMs(DEFAULT_SYNC, BPM),
  feedback: 42,
  analog: 2,
  pingPong: true,
  modDepth: 28,
  modRate: 0.6,
  hipass: 220,
  lopass: 6500,
  dryWet: 28,
  output: 1,
};

// Faust addresses, from public/faust/delay/dsp-meta.json's `ui` tree.
export const ADDR = {
  delayTime: '/DELAY_DESIGN_STUDIO/Delay_Time',
  feedback: '/DELAY_DESIGN_STUDIO/Feedback',
  analog: '/DELAY_DESIGN_STUDIO/Analog_Saturation',
  pingPong: '/DELAY_DESIGN_STUDIO/Ping_Pong',
  modDepth: '/DELAY_DESIGN_STUDIO/Mod_Depth',
  modRate: '/DELAY_DESIGN_STUDIO/Mod_Rate',
  hipass: '/DELAY_DESIGN_STUDIO/Hipass',
  lopass: '/DELAY_DESIGN_STUDIO/Lopass',
  dryWet: '/DELAY_DESIGN_STUDIO/Dry_Wet',
  output: '/DELAY_DESIGN_STUDIO/Output',
};

// Every unit here already matches the Faust patch's own range (ms, %, Hz,
// dB, 0-10) — no external rescaling needed, only the checkbox → 0/1. The
// delay patch mixes its own dry/wet internally (Dry_Wet param), so there's
// no separate host-level bypass crossfade the way the gate/de-esser need.
export function pushFaustParams(node, p) {
  node.setParamValue(ADDR.delayTime, p.delayTimeMs);
  node.setParamValue(ADDR.feedback, p.feedback);
  node.setParamValue(ADDR.analog, p.analog);
  node.setParamValue(ADDR.pingPong, p.pingPong ? 1 : 0);
  node.setParamValue(ADDR.modDepth, p.modDepth);
  node.setParamValue(ADDR.modRate, p.modRate);
  node.setParamValue(ADDR.hipass, p.hipass);
  node.setParamValue(ADDR.lopass, p.lopass);
  node.setParamValue(ADDR.dryWet, p.dryWet);
  node.setParamValue(ADDR.output, p.output);
}

export const METER_FLOOR_DB = -70;

// Reads one analyser's current block-peak level, as a LINEAR amplitude (0..1)
// rather than dB — shared by the standalone lab's own VU meter / level
// reading and any host (e.g. the DAW workstation) driving DelayEditorPanel
// from its own analysers. Callers that want dB convert with
// `peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB`.
export function analyserPeakLinear(analyser) {
  if (!analyser) return null;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  return peak;
}
