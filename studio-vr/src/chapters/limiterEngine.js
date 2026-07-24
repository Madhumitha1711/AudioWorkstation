// Shared, non-component Limiter logic: Faust param defaults/addresses, the
// pushFaustParams helper that writes typed params onto a live Faust limiter
// node, the static transfer-function math, and small level/meter-smoothing
// helpers.
//
// Split out from Limiter.jsx (which exports the LimiterEditorPanel/Limiter
// *components*) so that file only exports components — keeps Vite Fast
// Refresh working there — and gives any other host (e.g. the DAW
// workstation's insert-chain popup, ../panorama/DawWorkstationScreen) a plain
// module to import this from without pulling in component-only concerns.
// Same split as ./gateEngine for the Noise Gate.

// Ranges mirror the live bounds in public/faust/limiter/dsp-meta.json (the
// Faust limiter patch clamps its own params internally, so dialing a knob
// past these won't change the audio any further even though the knob keeps
// turning). Release has no "unit" meta on the patch — it's a 0-2 character
// knob (lower = tighter/faster recovery, higher = looser/slower), not ms.
export const KNOBS = [
  { key: 'threshold', label: 'THRESHOLD', min: -30, max: 0, step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
  { key: 'ceiling', label: 'CEILING', min: -30, max: 0, step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
  // release: 0-2, release character; ignored while Auto Release is on.
  { key: 'release', label: 'RELEASE', min: 0, max: 2, step: 0.01, fmt: v => v.toFixed(2) },
];
// Defaults — mirror the `init` values in public/faust/limiter/dsp-meta.json
// (checkboxes have no init in the patch, so they start off).
export const DEFAULTS = {
  threshold: -6.6,
  ceiling: -0.3,
  release: 1,
  linkLR: false,
  autoRelease: false,
};
// Faust addresses, from public/faust/limiter/dsp-meta.json's `ui` tree.
export const ADDR = {
  threshold: '/BRICKWALL_LIMITER/Threshold',
  ceiling: '/BRICKWALL_LIMITER/Out_Ceiling',
  release: '/BRICKWALL_LIMITER/Release',
  linkLR: '/BRICKWALL_LIMITER/Link_L_R',
  autoRelease: '/BRICKWALL_LIMITER/Auto_Release',
  gainReduction: '/BRICKWALL_LIMITER/Gain_Reduction', // read-only hbargraph output
};
// The limiter patch has no internal Wet_Dry (unlike the compressor's), so
// bypass and wet/dry mixing are done at the WebAudio graph level instead — a
// dry/wet crossfade around the Faust node — same pattern the gate uses.
export function pushFaustParams(node, params) {
  node.setParamValue(ADDR.threshold, params.threshold);
  node.setParamValue(ADDR.ceiling, params.ceiling);
  node.setParamValue(ADDR.release, params.release);
  node.setParamValue(ADDR.linkLR, params.linkLR ? 1 : 0);
  node.setParamValue(ADDR.autoRelease, params.autoRelease ? 1 : 0);
}
// ── Transfer function math (static curve — a visual approximation of the
// brickwall behaviour; the real gain reduction meter reads the live Faust
// bargraph instead) ─────────────────────────────────────────────────────────
export function applyLimiter(inputDb, p) {
  const { threshold, ceiling } = p;
  if (inputDb <= threshold) return Math.min(inputDb, ceiling);
  const headroom = ceiling - threshold;
  if (headroom <= 0.05) return ceiling; // no room between threshold & ceiling — instant clamp
  const over = inputDb - threshold;
  const knee = Math.max(0.4, headroom * 0.5);
  return ceiling - headroom * Math.exp(-over / knee); // asymptotically approaches, never exceeds, the ceiling
}
// ── Level ballistics + live Gain Reduction readout ──────────────────────────
export const METER_FLOOR_DB = -60;
export const LEVEL_ATTACK_S = 0.015;
export const LEVEL_RELEASE_S = 0.35;
export function levelBallistic(prev, target, dt) {
  if (dt <= 0) return prev;
  const tau = target > prev ? LEVEL_ATTACK_S : LEVEL_RELEASE_S;
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}
// gainReduction is real DSP telemetry (the Faust patch's own live
// Gain_Reduction bargraph), not an estimate — this just takes the edge off
// frame-to-frame flicker so the readout doesn't blur, without altering the
// real ballistics the DSP itself already applies (attack/release/lookahead
// all happen inside the patch).
export const GR_READOUT_TAU_S = 0.03;
export function grReadoutSmooth(prev, target, dt) {
  if (dt <= 0) return prev;
  return prev + (target - prev) * (1 - Math.exp(-dt / GR_READOUT_TAU_S));
}
// Reads one analyser's current block-peak level, as dB — shared by the
// standalone lab's own level reading and any host (e.g. the DAW workstation)
// driving LimiterEditorPanel from its own analysers.
export function analyserPeakDb(analyser) {
  if (!analyser) return null;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  return peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
}
