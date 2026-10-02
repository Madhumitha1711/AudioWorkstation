export const BPM = 120;
export const DEFAULT_SYNC = '1/8';

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

const ADDR = {
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

export function analyserPeakLinear(analyser) {
  if (!analyser) return null;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  return peak;
}
