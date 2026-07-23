declare name "deesser";
declare author "Claude";
declare version "1.4";
declare description "Split-band de-esser modeled after Waves RDeEsser (Freq, Type, Thresh, Range only)";

import("stdfaust.lib");

//------------------------------------------------------------------------
// Split-band de-esser (Waves RDeEsser style):
//   Freq   - crossover / center frequency of the sibilance detector & band
//   Type   - High-Pass/Shelf: everything above Freq is treated as sibilance
//            Band-Pass:       only a ~1 octave band around Freq is treated
//                              as sibilance
//   Thresh - level above which gain reduction starts
//   Range  - maximum amount of gain reduction applied to the sibilant band
// (Mode is intentionally omitted - this always runs in "Split" behaviour,
//  i.e. only the sibilant band is attenuated, the rest of the signal is
//  passed through untouched.)
//
// v1.4 fixes two distinct bugs:
//
// 1) Observability ("Band-Pass attenuation never shows up"): the split/
//    compression math itself was already correct (verified by exposing
//    internal signals as extra outputs and measuring them directly) -
//    Band-Pass's gain really was computing and applying a real cut to the
//    sibilant band. The problem was that Band-Pass's "sibilance" band is,
//    by design, only a ~1 octave slice of the spectrum (vs. High-Pass/
//    Shelf's "everything above Freq"), so on most material it carries a
//    much smaller share of the total signal's energy. Any host UI that
//    infers gain reduction from broadband input/output level (as this one
//    previously did, since this patch exposed no meter) will see almost no
//    change for Band-Pass even while it is working correctly, because a
//    few dB of cut on a small slice of the spectrum barely moves a
//    broadband level reading. Fix: expose the real, instantaneous gain
//    reduction (in dB) on the sibilant band as a read-only UI output (the
//    same "Gain_Reduction" bargraph pattern used by compressor/limiter
//    patches), so a host can display the true amount of de-essing for
//    either Type instead of trying to infer it from broadband level.
//
// 2) Stability (Band-Pass silence/NaN at high Freq): bpHigh's upper corner
//    was `freq * 1.4142136` with no ceiling. At the default 44.1kHz sample
//    rate that crosses the Nyquist frequency (SR/2 = 22050 Hz) once Freq
//    exceeds ~15,592 Hz, which pushes the filter's bilinear-transform
//    prewarping to infinity - the coefficients blow up to NaN and that NaN
//    then sits permanently in the filter's delay-line state (silence until
//    the DSP instance is torn down and recreated). Fix: clamp both
//    bandpass corners to a safe margin below Nyquist, computed from the
//    live sample rate (ma.SR) so it's correct regardless of what rate the
//    host's AudioContext actually runs at (44.1kHz, 48kHz, 96kHz, ...).
//------------------------------------------------------------------------

process = vgroup("deesser", deess) with {
  freq   = hslider("[0]Freq[unit:Hz]", 3385, 1000, 20000, 1);
  dtype  = nentry("[1]Type[style:menu{'High-Pass/Shelf':0;'Band-Pass':1}]", 0, 0, 1, 1);
  thresh = hslider("[2]Thresh[unit:dB]", -29.6, -60, 0, 0.1);
  range  = hslider("[3]Range[unit:dB]", -12.6, -30, 0, 0.1);

  splitOrder = 4;    // 24 dB/oct Butterworth split for High-Pass/Shelf type
  bpOrder    = 2;    // band-pass steepness for Band-Pass type
  attackT    = 0.001; // 1 ms detector/gain attack
  releaseT   = 0.075; // 75 ms detector/gain release
  floorDb    = -120;

  // --- band splitting --------------------------------------------------
  hpHigh(x) = fi.highpass(splitOrder, freq, x);
  hpLow(x)  = fi.lowpass(splitOrder, freq, x);

  // Keep both bandpass corners safely below Nyquist (and above 0) no
  // matter what sample rate the host is actually running at, so the
  // bilinear-transform prewarping (tan(pi*fc/SR)) never approaches
  // infinity and the filter can never blow up to NaN.
  nyquistGuard = ma.SR * 0.49;
  bpLowFreq(f)  = max(f / 1.4142136, 20);
  bpHighFreq(f) = min(f * 1.4142136, nyquistGuard);

  bpHigh(x) = fi.bandpass(bpOrder, bpLowFreq(freq), bpHighFreq(freq), x);
  bpLow(x)  = x - bpHigh(x);

  sibilance(x) = select2(dtype, hpHigh(x), bpHigh(x));
  rest(x)      = select2(dtype, hpLow(x),  bpLow(x));

  // --- detector & gain computation --------------------------------------
  detectorDb(sig)  = ba.linear2db(max(ba.db2linear(floorDb), an.amp_follower_ar(attackT, releaseT, sig)));
  reductionDb(sig) = max(range, min(0, thresh - detectorDb(sig)));

  gain(x) = si.onePoleSwitching(attackT, releaseT, ba.db2linear(reductionDb(sibilance(x))));

  // Read-only live gain-reduction meter, in dB, on the sibilant band.
  // `attach` lets the meter's value be computed and pushed to the UI each
  // block without adding it as an actual audio output - the audio path
  // (deess) is bit-for-bit identical to before this was added.
  gainReductionMeter(x) = reductionDb(sibilance(x)) : hbargraph("[9]Gain_Reduction[unit:dB]", -30, 0);

  deess(x) = attach(rest(x) + sibilance(x) * gain(x), gainReductionMeter(x));
};
