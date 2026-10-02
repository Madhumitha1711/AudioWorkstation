
export { levelBallistic, grReadoutSmooth } from './ballistics';export const KNOBS = [
  { key: 'threshold', label: 'THRESHOLD', min: -30, max: 0, step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
  { key: 'ceiling', label: 'CEILING', min: -30, max: 0, step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
  { key: 'release', label: 'RELEASE', min: 0, max: 2, step: 0.01, fmt: v => v.toFixed(2) },
];
export const DEFAULTS = {
  threshold: -6.6,
  ceiling: -0.3,
  release: 1,
  linkLR: false,
  autoRelease: false,
};
export const ADDR = {
  threshold: '/BRICKWALL_LIMITER/Threshold',
  ceiling: '/BRICKWALL_LIMITER/Out_Ceiling',
  release: '/BRICKWALL_LIMITER/Release',
  linkLR: '/BRICKWALL_LIMITER/Link_L_R',
  autoRelease: '/BRICKWALL_LIMITER/Auto_Release',
  gainReduction: '/BRICKWALL_LIMITER/Gain_Reduction',
};
export function pushFaustParams(node, params) {
  node.setParamValue(ADDR.threshold, params.threshold);
  node.setParamValue(ADDR.ceiling, params.ceiling);
  node.setParamValue(ADDR.release, params.release);
  node.setParamValue(ADDR.linkLR, params.linkLR ? 1 : 0);
  node.setParamValue(ADDR.autoRelease, params.autoRelease ? 1 : 0);
}
export function applyLimiter(inputDb, p) {
  const { threshold, ceiling } = p;
  if (inputDb <= threshold) return Math.min(inputDb, ceiling);
  const headroom = ceiling - threshold;
  if (headroom <= 0.05) return ceiling;
  const over = inputDb - threshold;
  const knee = Math.max(0.4, headroom * 0.5);
  return ceiling - headroom * Math.exp(-over / knee);
}
export const METER_FLOOR_DB = -60;
