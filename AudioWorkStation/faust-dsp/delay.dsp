import("stdfaust.lib");
 
declare name "Delay Design Studio";
declare description "Chapter 9 - modulated, filtered, ping-pong delay with analog-style saturation";
 
//======================================================================
// UI - maps directly onto the Chapter 9 lab knobs
//======================================================================
ui_group(x) = vgroup("DELAY DESIGN STUDIO", x);
 
delayTimeMs = ui_group(hslider("[01] Delay Time[unit:ms]", 250, 1, 2000, 0.1))  : si.smoo;
feedbackPct = ui_group(hslider("[02] Feedback[unit:%]", 42, 0, 95, 1))          : si.smoo;
analogAmt   = ui_group(hslider("[03] Analog Saturation", 2, 0, 10, 1))         : si.smoo;
pingPong    = ui_group(checkbox("[04] Ping Pong"));
modDepthPct = ui_group(hslider("[05] Mod Depth[unit:%]", 28, 0, 100, 1))        : si.smoo;
modRateHz   = ui_group(hslider("[06] Mod Rate[unit:Hz]", 0.6, 0.05, 8, 0.01));
hpFreq      = ui_group(hslider("[07] Hipass[unit:Hz]", 220, 20, 5000, 1))       : si.smoo;
lpFreq      = ui_group(hslider("[08] Lopass[unit:Hz]", 6500, 200, 18000, 1))    : si.smoo;
dryWetPct   = ui_group(hslider("[09] Dry/Wet[unit:%]", 28, 0, 100, 1))          : si.smoo;
outGainDb   = ui_group(hslider("[10] Output[unit:dB]", 1, -24, 12, 0.1))        : si.smoo;
 
feedback = feedbackPct * 0.01;
modDepth = modDepthPct * 0.01;
dryWet   = dryWetPct * 0.01;
outGain  = ba.db2linear(outGainDb);
 
//======================================================================
// modulated delay length - a slow LFO wobbles the tap time for
// tape-style pitch drift on the repeats
//======================================================================
maxDelaySamples = 2.2 * ma.SR;
 
lfo         = os.osc(modRateHz);
baseSamples = delayTimeMs * 0.001 * ma.SR;
modSamples  = lfo * modDepth * 0.005 * ma.SR;   // +/- 5ms swing at full depth
tapSamples  = max(1, baseSamples + modSamples);
 
//======================================================================
// analog-style soft saturation applied to the repeats
//======================================================================
saturate(amt) = *(drive) : ma.tanh : /(ma.tanh(drive))
with { drive = 1 + amt * 0.35; };
 
// one channel's repeat path: delay -> hipass/lopass filter -> saturate
channelProcess = de.fdelay(maxDelaySamples, tapSamples)
               : fi.highpass(2, hpFreq)
               : fi.lowpass(2, lpFreq)
               : saturate(analogAmt);
 
//======================================================================
// stereo cross-feedback network - straight (each channel feeds itself)
// or ping-pong (channels feed each other) selected by pingPong
//======================================================================
fbMix(l, r) = select2(pingPong, l, r) * feedback,
              select2(pingPong, r, l) * feedback;
 
// the recursive network arrives as (inL, inR, fbL, fbR); reorder to
// (inL, fbL, inR, fbR) so each "+" sums a channel's dry input with
// its own feedback tap before the delay/filter/saturate stage
stereoCore = route(4, 4, (1,1), (3,2), (2,3), (4,4))
           : (+, +)
           : par(i, 2, channelProcess);
 
//======================================================================
// dry/wet blend + output trim
//======================================================================
mix(dry, wet) = (dry * (1 - dryWet) + wet * dryWet) * outGain;
 
process(inL, inR) =
  (inL, inR) <: ( (_,_), (stereoCore ~ fbMix) ) : combine
with {
  combine(dL, dR, wL, wR) = mix(dL, wL), mix(dR, wR);
};
