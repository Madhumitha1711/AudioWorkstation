import("stdfaust.lib");

//====================================================================
// STUDIO REVERB  —  Zita-Rev1 FDN core (smooth, non-metallic tail)
//
// Replaces the old stereo_freeverb core. Faust's freeverb has no input
// attenuation (the original Freeverb scales by 0.015), so 8 summed combs
// + high allpass feedback overloaded and rang -> the "shrill" sound.
//
// UI labels / ranges are unchanged, so reverbEngine.js addresses still work:
//   /Reverb_Parameters/SIZE, DECAY, PRE-DELAY, DAMPING, DIFFUSION, WET-DRY,
//   HI-CUT_Freq, LO-CUT_Freq, HI-SHELF_Gain, LO-SHELF_Gain
//====================================================================

size      = hslider("v:Reverb Parameters/SIZE [style:knob]", 0.68, 0, 1, 0.01);
decay     = hslider("v:Reverb Parameters/DECAY [style:knob]", 0.70, 0, 1, 0.01);
predelay  = hslider("v:Reverb Parameters/PRE-DELAY [unit:ms] [style:knob]", 24, 0, 100, 1);
damping   = hslider("v:Reverb Parameters/DAMPING [style:knob]", 0.45, 0, 1, 0.01);
diffusion = hslider("v:Reverb Parameters/DIFFUSION [style:knob]", 0.80, 0, 1, 0.01);
wet_dry   = hslider("v:Reverb Parameters/WET-DRY [style:knob]", 0.35, 0, 1, 0.01);

hicut_freq = hslider("v:Reverb Parameters/HI-CUT Freq [unit:Hz] [style:knob] [scale:log]", 8000, 20, 20000, 10);
locut_freq = hslider("v:Reverb Parameters/LO-CUT Freq [unit:Hz] [style:knob] [scale:log]", 120, 20, 2000, 1);

vinc       = 0.1;
hicut_gain = hslider("v:Reverb Parameters/HI-SHELF Gain [unit:dB]", -6, -24, 6, vinc);
locut_gain = hslider("v:Reverb Parameters/LO-SHELF Gain [unit:dB]", -6, -24, 6, vinc);

//====================================================================
// PARAMETER MAPPING (all smoothed -> no zipper noise / clicks)
//====================================================================
sm = si.smoo;

// Mid-band RT60 in seconds. Same formula as calcEffectiveRt60() in
// reverbEngine.js, so the RT60 shown in the UI is what you actually hear.
// Smooth the raw controls first, then map + clamp (smoothers start at 0,
// so clamping afterwards keeps every coefficient valid from sample one).
size_s  = size  : sm;
decay_s = decay : sm;
t60_mid = max(0.2, size_s * (0.05 + decay_s * 0.95) * 5.0);

// Lows ring a little longer than mids (natural rooms), highs are damped below.
t60_low = t60_mid * 1.25;
xover   = 200;                                   // low/mid crossover (Hz)

// DAMPING: frequency where the HF decay time is halved.
// 0 -> 12 kHz (bright), 0.45 -> ~4.7 kHz, 1 -> 1.5 kHz (dark).
hf_damp = max(1500.0, 1500.0 * pow(8.0, 1.0 - (damping : sm)));

// PRE-DELAY scaled by SIZE (0.5x .. 2x), as before.
predelay_ms = max(0.0, (predelay : sm) * (0.5 + size_s * 1.5));

// DIFFUSION: input allpass gain, capped at 0.6 (higher rings metallically).
diff_g = 0.1 + 0.5 * (diffusion : sm);

// Equal-power wet/dry so the dry signal doesn't thin out at mid settings.
mix  = wet_dry : sm;
dryG = cos(mix * ma.PI / 2.0);
wetG = sin(mix * ma.PI / 2.0);

// Wet make-up gain (Zita's input stage attenuates by 0.3).
wet_trim = ba.db2linear(3.0);

//====================================================================
// PROCESSING BLOCKS
//====================================================================
ms2samp(ms) = ma.SR * ms / 1000.0;

// Fractional, smoothed pre-delay (no clicks when the knob moves). 200 ms max @ 96k.
pre_delay = de.fdelay(32768, ms2samp(predelay_ms));

// Keep rumble and fizz out of the tank — main cause of harshness/mud.
input_tone = fi.highpass(2, 90) : fi.lowpass(2, 11000);

// Short input diffuser (prime-ish delays, slightly different per side
// for stereo decorrelation).
dlL(0) = 4.77;  dlL(1) = 3.59;  dlL(2) = 12.73; dlL(3) = 9.31;
dlR(0) = 5.03;  dlR(1) = 3.83;  dlR(2) = 13.21; dlR(3) = 8.87;
diffuserL = seq(i, 4, fi.allpass_comb(2048, int(ms2samp(dlL(i))), diff_g));
diffuserR = seq(i, 4, fi.allpass_comb(2048, int(ms2samp(dlR(i))), diff_g));

// Core: 8-line FDN with frequency-dependent decay (Zita-Rev1).
reverb_core = re.zita_rev1_stereo(0, xover, hf_damp, t60_low, t60_mid, 96000);

// Output tone shaping on the wet signal (user HI/LO shelves).
wet_tone = fi.low_shelf(locut_gain, locut_freq) : fi.high_shelf(hicut_gain, hicut_freq);

wet_path = par(i, 2, pre_delay : input_tone)
         : (diffuserL, diffuserR)
         : reverb_core
         : par(i, 2, wet_tone : *(wet_trim * wetG));

//====================================================================
// MAIN PROCESS
//====================================================================
process = _, _ <: (par(i, 2, *(dryG)), wet_path) :> _, _;
