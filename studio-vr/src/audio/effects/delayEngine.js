// Stereo Delay engine glue: parameter model and the Faust parameter push
// for public/faust/delay/delay.dsp (v2).

// kept only because chainGraph stores it on new delay slots; unused here
export const DEFAULT_SYNC = 'FREE';
export const MAX_DELAY_MS = 4000;
export const MIN_DELAY_MS = 1;
export const CUT_MIN_HZ = 20;
export const CUT_MAX_HZ = 20000;

export const ROUTING_OPTIONS = ['Straight', 'Crossed', 'Ping-Pong'];

export const clampMs = (ms) => Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, ms));

// The browser DAW has no tempo, so times are always free-running ms.
// Inputs are fixed (left line <- left channel, right line <- right channel);
// mono clips arrive on both channels, so both lines still get signal.
const INPUT_LEFT = 1;
const INPUT_RIGHT = 2;

export const DEFAULTS = {
  routing: 0,
  outLeft: 30,
  outRight: 30,
  dry: 100,

  lTime: 250,
  lLowCut: 20,
  lHighCut: 20000,
  lFeedback: 35,
  lCrossfeed: 0,
  lFeedbackPhase: false,
  lCrossfeedPhase: false,

  rTime: 250,
  rLowCut: 20,
  rHighCut: 20000,
  rFeedback: 35,
  rCrossfeed: 0,
  rFeedbackPhase: false,
  rCrossfeedPhase: false,
};

// slots created before the v2 DSP carry the old flat params; anything
// unknown is ignored and anything missing falls back to the defaults
export const withDefaults = (p) => ({ ...DEFAULTS, ...p });

const G = '/Stereo_Delay';
const ADDR = {
  routing: `${G}/Routing`,
  outLeft: `${G}/Output_Left`,
  outRight: `${G}/Output_Right`,
  dry: `${G}/Dry`,
  side: (s) => {
    const k = s === 'l' ? 'L' : 'R';
    return {
      input: `${G}/${k}_Input`,
      time: `${G}/${k}_Delay_Time`,
      lowCut: `${G}/${k}_Low_Cut`,
      highCut: `${G}/${k}_High_Cut`,
      feedback: `${G}/${k}_Feedback`,
      crossfeed: `${G}/${k}_Crossfeed`,
      feedbackPhase: `${G}/${k}_Feedback_Phase`,
      crossfeedPhase: `${G}/${k}_Crossfeed_Phase`,
    };
  },
};

export function pushFaustParams(node, params) {
  const p = withDefaults(params);
  for (const s of ['l', 'r']) {
    const a = ADDR.side(s);
    node.setParamValue(a.input, s === 'l' ? INPUT_LEFT : INPUT_RIGHT);
    node.setParamValue(a.time, clampMs(p[`${s}Time`]));
    node.setParamValue(a.lowCut, p[`${s}LowCut`]);
    node.setParamValue(a.highCut, p[`${s}HighCut`]);
    node.setParamValue(a.feedback, p[`${s}Feedback`]);
    node.setParamValue(a.crossfeed, p[`${s}Crossfeed`]);
    node.setParamValue(a.feedbackPhase, p[`${s}FeedbackPhase`] ? 1 : 0);
    node.setParamValue(a.crossfeedPhase, p[`${s}CrossfeedPhase`] ? 1 : 0);
  }
  node.setParamValue(ADDR.routing, p.routing);
  node.setParamValue(ADDR.outLeft, p.outLeft);
  node.setParamValue(ADDR.outRight, p.outRight);
  node.setParamValue(ADDR.dry, p.dry);
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
