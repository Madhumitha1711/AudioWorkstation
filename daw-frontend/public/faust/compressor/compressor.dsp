import("stdfaust.lib");

declare name "compressor";
declare author "Claude";
declare version "3.1";
declare description "Single/4-band multiband compressor with internal/external sidechain detection";

//======================================================================
// v3.1 - single-band by default, multiband is now an explicit opt-in.
//
// New: "Multiband/Enable" checkbox, default OFF. When off, the input is
// NOT split by the crossover at all - the full-bandwidth signal (and,
// for detection, the full-bandwidth sidechain/detector signal) runs
// through exactly one compressor: the "Low Band" controls, which double
// as the single-band compressor's controls when Multiband is off. The
// Low-Mid/High-Mid/High bands contribute silence to the sum in that
// mode, so they have no effect on the output. Turning Multiband on
// restores the full 4-band split from v3.0 with no other change.
//
// v3.0 - 4-band rewrite (v2.0 was 3-band: Low/Mid/High).
//
// BREAKING CHANGES vs v2:
//   - one more crossover point ("Crossover/LowMid-HighMid") and one
//     more band: Low / Low-Mid / High-Mid / High (was Low/Mid/High).
//   - band addresses are now under "Low Band"/"Low-Mid Band"/
//     "High-Mid Band"/"High Band" (was "Low Band"/"Mid Band"/
//     "High Band").
//   - "Crossover/Low-Mid" and "Crossover/Mid-High" are renamed to
//     "Crossover/Low-LowMid" and "Crossover/HighMid-High" to make
//     room for the new middle crossover point between them.
//
// Everything else (2 inputs: mainIn, scIn; 1 output; sidechain
// internal/external + HPF + listen; flat "Group/Control" label
// convention with no explicit vgroup(), see the v2.0 note this
// replaces below) carries over unchanged.
//
// UI note: this file deliberately uses NO explicit vgroup()/hgroup()
// calls (same convention as ParamEQDynamic.dsp) - group nesting comes
// purely from "GroupName/ControlName" label prefixes on otherwise-flat
// widgets. Controls here are legitimately shared across several
// differently-named sections (e.g. the crossover frequencies and the
// sidechain HPF feed all four bands' detectors), and wrapping shared
// controls in explicit vgroup() while they fan out into multiple
// per-band branches was found (during the original 3-band build) to
// make Faust's automatic UI-tree placement duplicate/misnest the
// widget, and roughly double the compiled wasm size (real duplicated
// computation, not just a cosmetic UI artifact). The flat "/"-label
// idiom avoids that entirely since there's no box-diagram group()
// wrapping to get confused by.
//
// Architecture: the input is split into 4 bands (Low / Low-Mid /
// High-Mid / High) with a 4th-order Linkwitz-Riley crossover cascade
// (two cascaded 2nd-order Butterworth stages per side, applied at
// each of the 3 crossover points), which sums back to ~flat when all
// bands are recombined unprocessed. Each band gets its own
// feed-forward peak compressor (compressors.lib's
// co.peak_compression_gain_mono_db). Detection can come from each
// band's own audio (classic internal multiband) or from an external
// sidechain input, high-pass filtered and split through the same
// crossover so each band still only reacts to its own frequency range
// of the sidechain signal.
//======================================================================

//----------------------------------------------------------------------
// Mode
//----------------------------------------------------------------------
// Off (default) = single-band: the Low Band controls act on the whole,
// unsplit signal. On = the v3.0 4-band split.
multibandOn = checkbox("[0]Multiband/Enable");

//----------------------------------------------------------------------
// Crossover (3 points -> 4 bands)
//----------------------------------------------------------------------
freqARaw = hslider("[0]Crossover/Low-LowMid[unit:Hz]", 150, 20, 1000, 1);
freqBRaw = hslider("[1]Crossover/LowMid-HighMid[unit:Hz]", 1000, 200, 5000, 1);
freqCRaw = hslider("[2]Crossover/HighMid-High[unit:Hz]", 5000, 500, 20000, 1);

// keep the crossover sane at any sample rate: each corner is clamped
// to stay above the previous one and below Nyquist (mirrors the
// nyquistGuard pattern used in deesser.dsp).
nyquistGuard = ma.SR * 0.49;
freqA = min(freqARaw, nyquistGuard);
freqB = min(max(freqBRaw, freqA * 1.05), nyquistGuard);
freqC = min(max(freqCRaw, freqB * 1.05), nyquistGuard);

//----------------------------------------------------------------------
// Sidechain
//----------------------------------------------------------------------
scExternal = checkbox("[0]Sidechain/External Sidechain");
scListen   = checkbox("[1]Sidechain/SC Listen");
scHpfFreq  = hslider("[2]Sidechain/SC HPF[unit:Hz]", 20, 20, 2000, 1);

//----------------------------------------------------------------------
// Output
//----------------------------------------------------------------------
wetDry  = hslider("[0]Output/Wet-Dry[style:knob]", 100, 0, 100, 1) : /(100);
outGain = hslider("[1]Output/Gain[unit:dB]", 0, -24, 24, 0.1) : ba.db2linear;

//----------------------------------------------------------------------
// 4th-order Linkwitz-Riley crossover (two cascaded Butterworth-2 stages)
//----------------------------------------------------------------------
lr_lowpass(freq,x)  = x : fi.lowpass(2,freq)  : fi.lowpass(2,freq);
lr_highpass(freq,x) = x : fi.highpass(2,freq) : fi.highpass(2,freq);

// low + lowMid + highMid + high sums back to (approximately) the
// original signal. Faust has no tuple-destructuring assignment, so
// each band is its own named single-output function instead of one
// function returning 4 outputs.
aboveA(x) = lr_highpass(freqA, x);
aboveB(x) = lr_highpass(freqB, aboveA(x));

bandLow(x)     = lr_lowpass(freqA, x);
bandLowMid(x)  = lr_lowpass(freqB, aboveA(x));
bandHighMid(x) = lr_lowpass(freqC, aboveB(x));
bandHigh(x)    = lr_highpass(freqC, aboveB(x));

//----------------------------------------------------------------------
// Low Band
//----------------------------------------------------------------------
lowBypass  = checkbox("[0]Low Band/Bypass");
lowThresh  = hslider("[1]Low Band/Threshold[unit:dB]", -20, -60, 0, 0.1);
lowRatio   = hslider("[2]Low Band/Ratio", 4, 1, 20, 0.1);
lowKnee    = hslider("[3]Low Band/Knee[unit:dB]", 3, 0, 20, 0.1);
lowAttack  = hslider("[4]Low Band/Attack[unit:ms]", 10, 0.1, 100, 0.1) : /(1000);
lowRelease = hslider("[5]Low Band/Release[unit:ms]", 100, 10, 1000, 1) : /(1000);
lowMakeup  = hslider("[6]Low Band/Makeup Gain[unit:dB]", 0, 0, 24, 0.1) : ba.db2linear;
lowMeter   = hbargraph("[7]Low Band/Gain Reduction[unit:dB]", -24, 0);

//----------------------------------------------------------------------
// Low-Mid Band
//----------------------------------------------------------------------
lowMidBypass  = checkbox("[0]Low-Mid Band/Bypass");
lowMidThresh  = hslider("[1]Low-Mid Band/Threshold[unit:dB]", -20, -60, 0, 0.1);
lowMidRatio   = hslider("[2]Low-Mid Band/Ratio", 4, 1, 20, 0.1);
lowMidKnee    = hslider("[3]Low-Mid Band/Knee[unit:dB]", 3, 0, 20, 0.1);
lowMidAttack  = hslider("[4]Low-Mid Band/Attack[unit:ms]", 10, 0.1, 100, 0.1) : /(1000);
lowMidRelease = hslider("[5]Low-Mid Band/Release[unit:ms]", 100, 10, 1000, 1) : /(1000);
lowMidMakeup  = hslider("[6]Low-Mid Band/Makeup Gain[unit:dB]", 0, 0, 24, 0.1) : ba.db2linear;
lowMidMeter   = hbargraph("[7]Low-Mid Band/Gain Reduction[unit:dB]", -24, 0);

//----------------------------------------------------------------------
// High-Mid Band
//----------------------------------------------------------------------
highMidBypass  = checkbox("[0]High-Mid Band/Bypass");
highMidThresh  = hslider("[1]High-Mid Band/Threshold[unit:dB]", -20, -60, 0, 0.1);
highMidRatio   = hslider("[2]High-Mid Band/Ratio", 4, 1, 20, 0.1);
highMidKnee    = hslider("[3]High-Mid Band/Knee[unit:dB]", 3, 0, 20, 0.1);
highMidAttack  = hslider("[4]High-Mid Band/Attack[unit:ms]", 10, 0.1, 100, 0.1) : /(1000);
highMidRelease = hslider("[5]High-Mid Band/Release[unit:ms]", 100, 10, 1000, 1) : /(1000);
highMidMakeup  = hslider("[6]High-Mid Band/Makeup Gain[unit:dB]", 0, 0, 24, 0.1) : ba.db2linear;
highMidMeter   = hbargraph("[7]High-Mid Band/Gain Reduction[unit:dB]", -24, 0);

//----------------------------------------------------------------------
// High Band
//----------------------------------------------------------------------
highBypass  = checkbox("[0]High Band/Bypass");
highThresh  = hslider("[1]High Band/Threshold[unit:dB]", -20, -60, 0, 0.1);
highRatio   = hslider("[2]High Band/Ratio", 4, 1, 20, 0.1);
highKnee    = hslider("[3]High Band/Knee[unit:dB]", 3, 0, 20, 0.1);
highAttack  = hslider("[4]High Band/Attack[unit:ms]", 10, 0.1, 100, 0.1) : /(1000);
highRelease = hslider("[5]High Band/Release[unit:ms]", 100, 10, 1000, 1) : /(1000);
highMakeup  = hslider("[6]High Band/Makeup Gain[unit:dB]", 0, 0, 24, 0.1) : ba.db2linear;
highMeter   = hbargraph("[7]High Band/Gain Reduction[unit:dB]", -24, 0);

//----------------------------------------------------------------------
// Per-band feed-forward peak compressor (compressors.lib engine, same
// as earlier versions' co.peak_compression_gain_mono_db call).
//----------------------------------------------------------------------
process(mainIn, scIn) = out
with {
    scFiltered = scIn : fi.highpass(2, scHpfFreq);
    detSource  = select2(scExternal, mainIn, scFiltered);

    // Multiband off (default): the Low Band compressor gets the whole,
    // unsplit signal (mainIn / detSource straight through, no crossover
    // filtering); the other 3 bands are fed silence so they contribute
    // nothing to wetSum below, whatever their own controls are set to.
    // Multiband on: the v3.0 4-way Linkwitz-Riley split, unchanged.
    mainLow     = select2(multibandOn, mainIn, bandLow(mainIn));
    mainLowMid  = select2(multibandOn, 0.0,    bandLowMid(mainIn));
    mainHighMid = select2(multibandOn, 0.0,    bandHighMid(mainIn));
    mainHigh    = select2(multibandOn, 0.0,    bandHigh(mainIn));

    detLow     = select2(multibandOn, detSource, bandLow(detSource));
    detLowMid  = select2(multibandOn, 0.0,       bandLowMid(detSource));
    detHighMid = select2(multibandOn, 0.0,       bandHighMid(detSource));
    detHigh    = select2(multibandOn, 0.0,       bandHigh(detSource));

    lowGainDb      = detLow : co.peak_compression_gain_mono_db(co.ratio2strength(lowRatio), lowThresh, lowAttack, lowRelease, lowKnee, 0);
    lowGainLin     = ba.db2linear(lowGainDb);
    lowOut         = select2(lowBypass, attach(mainLow * lowGainLin * lowMakeup, lowGainDb : lowMeter), mainLow);

    lowMidGainDb   = detLowMid : co.peak_compression_gain_mono_db(co.ratio2strength(lowMidRatio), lowMidThresh, lowMidAttack, lowMidRelease, lowMidKnee, 0);
    lowMidGainLin  = ba.db2linear(lowMidGainDb);
    lowMidOut      = select2(lowMidBypass, attach(mainLowMid * lowMidGainLin * lowMidMakeup, lowMidGainDb : lowMidMeter), mainLowMid);

    highMidGainDb  = detHighMid : co.peak_compression_gain_mono_db(co.ratio2strength(highMidRatio), highMidThresh, highMidAttack, highMidRelease, highMidKnee, 0);
    highMidGainLin = ba.db2linear(highMidGainDb);
    highMidOut     = select2(highMidBypass, attach(mainHighMid * highMidGainLin * highMidMakeup, highMidGainDb : highMidMeter), mainHighMid);

    highGainDb     = detHigh : co.peak_compression_gain_mono_db(co.ratio2strength(highRatio), highThresh, highAttack, highRelease, highKnee, 0);
    highGainLin    = ba.db2linear(highGainDb);
    highOut        = select2(highBypass, attach(mainHigh * highGainLin * highMakeup, highGainDb : highMeter), mainHigh);

    //------------------------------------------------------------------
    // Sum bands, parallel wet/dry against the original (unsplit) input,
    // trim with output gain, and let "SC Listen" audition the raw
    // detector source (pre-split) in place of the processed signal.
    //
    // Output Gain is applied to the WET contribution only, before the
    // blend, not to the (dry+wet) sum as a whole — it used to be
    // `(mainIn*(1-wetDry) + wetSum*wetDry) * outGain`, which meant
    // raising Output Gain also scaled the dry path, so Bypass
    // (Wet-Dry = 0) was never a true unity-gain passthrough whenever
    // Output Gain was non-zero ("even unprocessed" audio came out
    // boosted/attenuated by whatever Output Gain was dialed in). Scaling
    // wetSum by outGain before the blend keeps the dry path exactly
    // equal to mainIn regardless of Output Gain.
    //------------------------------------------------------------------
    wetSum     = lowOut + lowMidOut + highMidOut + highOut;
    compressed = mainIn * (1.0 - wetDry) + (wetSum * outGain) * wetDry;
    out        = select2(scListen, compressed, detSource);
};
