import("stdfaust.lib");
 
declare name "Brickwall Limiter";
declare description "Chapter 11 - lookahead brickwall limiter: threshold, ceiling, auto release, linked stereo GR";
 
//======================================================================
// UI - maps directly onto the Chapter 11 lab controls
//======================================================================
ui_group(x) = vgroup("BRICKWALL LIMITER", x);
 
threshDb    = ui_group(hslider("[01] Threshold[unit:dB]", -6.6, -30, 0, 0.1));
ceilingDb   = ui_group(hslider("[02] Out Ceiling[unit:dB]", -0.3, -30, 0, 0.1));
releaseKnob = ui_group(hslider("[03] Release", 1.00, 0, 2, 0.01));
linkLR      = ui_group(checkbox("[04] Link L/R"));
autoRelease = ui_group(checkbox("[05] Auto Release"));
grMeter     = ui_group(hbargraph("[06] Gain Reduction[unit:dB]", -24, 0));
 
threshLin  = ba.db2linear(threshDb);
ceilingLin = ba.db2linear(ceilingDb);
 
lookaheadMs      = 1.5;
lookaheadSamples = lookaheadMs * 0.001 * ma.SR;
baseReleaseMs    = 20 + releaseKnob * 180;   // knob 0..2 -> ~20..380ms
 
//======================================================================
// feed-forward peak envelope with optional program-dependent auto release
//======================================================================
peakEnv(x) = abs(x) : an.amp_follower_ud(0, releaseTime)
with {
  // auto release: lengthens release under sustained loud material,
  // shortens it back down for transient-heavy material
  longTermEnv   = abs(x) : an.amp_follower_ud(0.3, 0.3);
  autoReleaseMs = baseReleaseMs * (1 + longTermEnv * 2);
  releaseTime   = select2(autoRelease, baseReleaseMs, autoReleaseMs) * 0.001;
};
 
gainFor(peak) = min(1, threshLin / max(peak, 0.000001));
 
//======================================================================
// lookahead-compensated brickwall stage
//======================================================================
process(inL, inR) = outL, outR
with {
  gL = gainFor(peakEnv(inL));
  gR = gainFor(peakEnv(inR));
  gLinked = min(gL, gR);   // linked mode: both channels duck by the larger reduction
 
  gainL = select2(linkLR, gL, gLinked);
  gainR = select2(linkLR, gR, gLinked);
 
  // delay the audio to match the detector's reaction time so the
  // limiter can catch fast transients before they overshoot the ceiling
  delayedL = inL : de.fdelay(4096, lookaheadSamples);
  delayedR = inR : de.fdelay(4096, lookaheadSamples);
 
  rawL = delayedL * gainL * ceilingLin;
  rawR = delayedR * gainR * ceilingLin;
 
  // hard safety clamp: guarantees output never exceeds the ceiling
  clampedL = max(-ceilingLin, min(ceilingLin, rawL));
  clampedR = max(-ceilingLin, min(ceilingLin, rawR));
 
  grDb = ba.linear2db(min(gainL, gainR));
 
  outL = attach(clampedL, grDb : grMeter);
  outR = clampedR;
};
