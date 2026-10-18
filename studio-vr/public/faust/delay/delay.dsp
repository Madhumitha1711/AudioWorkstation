import("stdfaust.lib");

declare name "Stereo Delay";
declare version "2.0";
declare description "Stereo delay modelled on the Logic Pro Stereo Delay: per-side input select, delay time, low/high cut, feedback, crossfeed and phase, plus Straight/Crossed/Ping-Pong routing. Every control is de-zippered and delay-time changes crossfade instead of jumping, so nothing clicks while you tweak it.";

//======================================================================
// Why the old version clicked, and what this one does instead
//----------------------------------------------------------------------
// * Delay time: the old fdelay + si.smoo read head was dragged across
//   the buffer whenever the time changed - every knob step, sync button
//   or :2/x2 jump produced a pitch "zip" or an outright snap.
//   Here each side uses de.sdelay: two read heads, the idle one is moved
//   to the new time, then a ~40 ms linear crossfade swaps them. No read
//   head ever moves while audible, so there is no pitch glide and no
//   discontinuity, however fast the control moves.
// * Switches (input select, routing, phase): the old ping-pong checkbox
//   switched instantly. Every switch is now turned into gains that are
//   smoothed, so a switch becomes a short fade.
// * Filters: the old biquads had their coefficients recomputed from a
//   linear-smoothed Hz value. The cut filters are now TPT state-variable
//   filters (stable under fast modulation), smoothed in the log domain
//   so a sweep sounds even across the whole 20 Hz - 20 kHz range.
// * Runaway feedback: feedback + crossfeed can exceed 100 % loop gain.
//   A transparent soft knee in the loop (unity below -2 dBFS) keeps
//   self-oscillation bounded instead of blowing up to hard clipping.
//======================================================================

//----------------------------------------------------------------------
// constants
//----------------------------------------------------------------------
MAX_DELAY_MS = 4000;
MAXD   = 524288;                       // 2^19 samples: 4 s even at 96 kHz
XFADE  = max(256, int(0.04 * ma.SR));  // delay-time crossfade, ~40 ms
FILT_Q = 0.7071;                       // Butterworth 12 dB/oct cut filters

//----------------------------------------------------------------------
// helpers
//----------------------------------------------------------------------
// gain / amount smoothing (~5 ms time constant)
smooth = si.smooth(ba.tau2pole(0.005));
// frequency smoothing in the log domain
fsmooth(f) = f : max(1) : log : si.smooth(ba.tau2pole(0.02)) : exp;
// checkbox -> +1 / -1, faded through zero instead of flipping
phaseSign(ph) = (1 - 2 * ph) : si.smooth(ba.tau2pole(0.008));

// input selector: Off, Left, Right, L+R, L-R  -> (gain from inL, gain from inR)
inGainL(sel) = ba.selectn(5, int(sel), 0, 1, 0, 0.5,  0.5) : smooth;
inGainR(sel) = ba.selectn(5, int(sel), 0, 0, 1, 0.5, -0.5) : smooth;

// transparent below 0.8 (-2 dBFS), soft knee to a hard ceiling of 1.0
safe(x) = select2(a > t, x, ma.signum(x) * (t + (1 - t) * ma.tanh((a - t) / (1 - t))))
with { a = abs(x); t = 0.8; };

// one side's delay line: crossfading delay -> low cut -> high cut
// (the "- 1" accounts for the one-sample delay of the feedback loop)
line(ms, lo, hi) = de.sdelay(MAXD, XFADE, dsamp)
                 : fi.svf.hp(loHz, FILT_Q)
                 : fi.svf.lp(hiHz, FILT_Q)
with {
  dsamp = min(MAXD - 1, max(1, ms * 0.001 * ma.SR - 1));
  loHz  = min(lo, 0.45 * ma.SR) : max(10);
  hiHz  = min(hi, 0.45 * ma.SR) : max(20);
};

//======================================================================
// UI
//======================================================================
grp(x) = vgroup("Stereo Delay", x);

// ---- left delay ----
lInSel = grp(nentry("[01] L Input[style:menu{'Off':0;'Left':1;'Right':2;'L+R':3;'L-R':4}]", 1, 0, 4, 1));
lTime  = grp(hslider("[02] L Delay Time[unit:ms]", 250, 1, MAX_DELAY_MS, 0.01));
lLow   = grp(hslider("[03] L Low Cut[unit:Hz][scale:log]", 20, 20, 20000, 1))     : fsmooth;
lHigh  = grp(hslider("[04] L High Cut[unit:Hz][scale:log]", 20000, 20, 20000, 1)) : fsmooth;
lFb    = grp(hslider("[05] L Feedback[unit:%]", 35, 0, 100, 0.1)) * 0.01           : smooth;
lXf    = grp(hslider("[06] L Crossfeed[unit:%]", 0, 0, 100, 0.1)) * 0.01           : smooth; // left -> right
lFbPh  = grp(checkbox("[07] L Feedback Phase"))  : phaseSign;
lXfPh  = grp(checkbox("[08] L Crossfeed Phase")) : phaseSign;

// ---- right delay ----
rInSel = grp(nentry("[09] R Input[style:menu{'Off':0;'Left':1;'Right':2;'L+R':3;'L-R':4}]", 2, 0, 4, 1));
rTime  = grp(hslider("[10] R Delay Time[unit:ms]", 250, 1, MAX_DELAY_MS, 0.01));
rLow   = grp(hslider("[11] R Low Cut[unit:Hz][scale:log]", 20, 20, 20000, 1))     : fsmooth;
rHigh  = grp(hslider("[12] R High Cut[unit:Hz][scale:log]", 20000, 20, 20000, 1)) : fsmooth;
rFb    = grp(hslider("[13] R Feedback[unit:%]", 35, 0, 100, 0.1)) * 0.01           : smooth;
rXf    = grp(hslider("[14] R Crossfeed[unit:%]", 0, 0, 100, 0.1)) * 0.01           : smooth; // right -> left
rFbPh  = grp(checkbox("[15] R Feedback Phase"))  : phaseSign;
rXfPh  = grp(checkbox("[16] R Crossfeed Phase")) : phaseSign;

// ---- global ----
routing = grp(nentry("[17] Routing[style:menu{'Straight':0;'Crossed':1;'Ping-Pong':2}]", 0, 0, 2, 1));
outL    = grp(hslider("[18] Output Left[unit:%]", 30, 0, 100, 0.1))  * 0.01 : smooth;
outR    = grp(hslider("[19] Output Right[unit:%]", 30, 0, 100, 0.1)) * 0.01 : smooth;
dry     = grp(hslider("[20] Dry[unit:%]", 100, 0, 100, 0.1))         * 0.01 : smooth;

// routing as smoothed amounts
crossAmt = (int(routing) == 1) : si.smooth(ba.tau2pole(0.01)); // swap wet outputs L<->R
pingAmt  = (int(routing) == 2) : si.smooth(ba.tau2pole(0.01)); // feedback goes to the other side

//======================================================================
// stereo feedback network
//----------------------------------------------------------------------
// core receives (yL[n-1], yR[n-1], srcL, srcR) and returns (yL, yR):
//   into L = srcL + own feedback (straight) or R's feedback (ping-pong)
//          + crossfeed from R
//   into R = mirror image
//======================================================================
core(yLp, yRp, sL, sR) = yL, yR
with {
  fbL = lFb * lFbPh;  fbR = rFb * rFbPh;
  xLR = lXf * lXfPh;  xRL = rXf * rXfPh;
  intoL = sL + (1 - pingAmt) * fbL * yLp + pingAmt * fbR * yRp + xRL * yRp;
  intoR = sR + (1 - pingAmt) * fbR * yRp + pingAmt * fbL * yLp + xLR * yLp;
  yL = intoL : safe : line(lTime, lLow, lHigh);
  yR = intoR : safe : line(rTime, rLow, rHigh);
};

//======================================================================
// output: dry + per-side wet level, then Straight/Crossed placement
//======================================================================
process(inL, inR) = (srcL, srcR : core ~ (_, _)), inL, inR : outMix
with {
  srcL = inL * inGainL(lInSel) + inR * inGainR(lInSel);
  srcR = inL * inGainL(rInSel) + inR * inGainR(rInSel);
  outMix(yL, yR, dL, dR) =
      dL * dry + ((1 - crossAmt) * wL + crossAmt * wR),
      dR * dry + ((1 - crossAmt) * wR + crossAmt * wL)
  with { wL = yL * outL; wR = yR * outR; };
};
