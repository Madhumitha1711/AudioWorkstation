export const MIN_SAMPLE_RATE = 48000;

const STANDARD_RATES = [768000, 384000, 352800, 192000, 176400, 96000, 88200, 48000];

// Browsers cap the rate differently (Firefox 192 kHz, Chrome 768 kHz), so step
// down through the standard rates to 48 kHz; the device default is the last resort.
export function createAudioContext(sampleRate = MIN_SAMPLE_RATE) {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  const wanted = Math.max(MIN_SAMPLE_RATE, Math.round(sampleRate) || 0);
  const candidates = [wanted, ...STANDARD_RATES.filter((r) => r < wanted)];
  for (const rate of candidates) {
    try {
      return new Ctor({ sampleRate: rate });
    } catch {
    }
  }
  return new Ctor();
}
