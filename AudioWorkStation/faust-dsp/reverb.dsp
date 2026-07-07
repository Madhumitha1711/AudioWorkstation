import("stdfaust.lib");

//====================================================================
// REVERB PARAMETERS & USER INTERFACE (from image_b49c5d.jpg)
//====================================================================
size      = hslider("v:Reverb Parameters/SIZE [style:knob]", 0.68, 0, 1, 0.01);
decay     = hslider("v:Reverb Parameters/DECAY [style:knob]", 0.70, 0, 1, 0.01);
predelay  = hslider("v:Reverb Parameters/PRE-DELAY [unit:ms] [style:knob]", 24, 0, 100, 1);
damping   = hslider("v:Reverb Parameters/DAMPING [style:knob]", 0.45, 0, 1, 0.01);
diffusion = hslider("v:Reverb Parameters/DIFFUSION [style:knob]", 0.80, 0, 1, 0.01);
wet_dry   = hslider("v:Reverb Parameters/WET-DRY [style:knob]", 0.35, 0, 1, 0.01);

// Corner frequencies from the UI
hicut_freq = hslider("v:Reverb Parameters/HI-CUT Freq [unit:Hz] [style:knob] [scale:log]", 8000, 20, 20000, 10);
locut_freq = hslider("v:Reverb Parameters/LO-CUT Freq [unit:Hz] [style:knob] [scale:log]", 120, 20, 2000, 1);

// Shelving Gain controls (Adjustable boost/cut in decibels)
vinc       = 0.1; 
hicut_gain = hslider("v:Reverb Parameters/HI-SHELF Gain [unit:dB]", -6, -24, 6, vinc);
locut_gain = hslider("v:Reverb Parameters/LO-SHELF Gain [unit:dB]", -6, -24, 6, vinc);

//====================================================================
// PROCESSING BLOCKS
//====================================================================

// ms to samples conversion using ma.SR
ms2samp(ms) = ma.SR * (ms / 1000.0);

// Pre-delay implementation: 'size' acts as a multiplier here (0.5x to 2.0x scale) 
// ensuring the variable is compiled and the UI knob renders correctly.
scaled_predelay = predelay * (0.5 + (size * 1.5));
pre_delay_block(x) = x @ ms2samp(scaled_predelay);

// Shelving Filter Block
filter_block(x)   = x : fi.low_shelf(locut_gain, locut_freq) : fi.high_shelf(hicut_gain, hicut_freq);

// Core Freeverb processor
reverb_core       = re.stereo_freeverb(decay, diffusion, damping, 23);

// Wet/Dry Mixing routing matrix
wet_dry_mix(dryL, dryR, wetL, wetR) = 
    (dryL * (1.0 - wet_dry) + wetL * wet_dry),
    (dryR * (1.0 - wet_dry) + wetR * wet_dry);

//====================================================================
// MAIN PROCESS
//====================================================================
process = _, _ <: (dry_route, wet_route) : wet_dry_mix
with {
    dry_route = _, _ ;
    wet_route = par(i, 2, pre_delay_block : filter_block) : reverb_core;
};