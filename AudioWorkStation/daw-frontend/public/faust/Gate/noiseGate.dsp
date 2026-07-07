import("stdfaust.lib");
 
declare name "Noise Gate Studio";
declare description "Chapter 10 - hysteresis noise gate with attack, release, and hold";
 
//======================================================================
// UI - maps directly onto the Chapter 10 lab knobs
//======================================================================
ui_group(x) = vgroup("NOISE GATE STUDIO", x);
 
floorDb    = ui_group(hslider("[01] Floor[unit:dB]", -60, -96, 0, 1));
openDb     = ui_group(hslider("[02] Gate Open[unit:dB]", -32, -80, 0, 0.1));
closeDbRaw = ui_group(hslider("[03] Gate Close[unit:dB]", -38, -80, 0, 0.1));
attackMs   = ui_group(hslider("[04] Attack[unit:ms]", 2, 0.1, 100, 0.1));
releaseMs  = ui_group(hslider("[05] Release[unit:ms]", 30, 1, 1000, 1));
holdMs     = ui_group(hslider("[06] Hold[unit:ms]", 10, 0, 500, 1));
 
// keep the hysteresis sane: close threshold can never sit above open
closeDb     = min(closeDbRaw, openDb);
openThresh  = ba.db2linear(openDb);
closeThresh = ba.db2linear(closeDb);
floorGain   = ba.db2linear(floorDb);
holdSamples = holdMs * 0.001 * ma.SR;
 
//======================================================================
// gain envelope for one detection signal (0..1, floor-limited)
//======================================================================
gateGain(x) = gainSmoothed
with {
  // fast, fixed-ballistics peak detector feeding the threshold logic
  env = abs(x) : an.amp_follower_ud(0.0005, 0.05);
 
  rawOpen    = env >= openThresh;
  aboveClose = env >  closeThresh;
 
  // hold counter: reset to holdSamples whenever above CLOSE, else count down
  holdBody(prev) = select2(aboveClose, max(prev - 1, 0), holdSamples);
  holding = (holdBody ~ _) > 0;
 
  // hysteresis state: opens instantly at OPEN, stays open through
  // CLOSE or the hold window, otherwise falls shut
  stateBody(prev) = max(rawOpen, prev * max(aboveClose, holding));
  state = stateBody ~ _;
 
  // floor sets the attenuation used when the gate is shut (not full mute)
  targetGain = state * (1 - floorGain) + floorGain;
 
  // asymmetric attack/release smoothing of the gain to avoid clicks
  attCoeff = exp(-1 / (attackMs  * 0.001 * ma.SR));
  relCoeff = exp(-1 / (releaseMs * 0.001 * ma.SR));
  smoothBody(prev) = targetGain + (prev - targetGain) * select2(targetGain > prev, relCoeff, attCoeff);
  gainSmoothed = smoothBody ~ _;
};
 
//======================================================================
// stereo-linked gate: one gain envelope from the combined signal,
// applied equally to both channels so the stereo image never shifts
//======================================================================
process(inL, inR) = inL * g, inR * g
with {
  linkedDetect = max(abs(inL), abs(inR));
  g = gateGain(linkedDetect);
};
