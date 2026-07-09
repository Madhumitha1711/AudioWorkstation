import("stdfaust.lib");
//======================================================
// 8-BAND DYNAMIC PARAMETRIC EQ (Stereo)
// Each band: bypass switch. Shelf/Peak bands: optional
// dynamic gain (threshold/range/attack/release/mode).
//======================================================

//------------------------------------------------------
// Shared dynamic-EQ engine
// mode 0 = Downward (cut when level > threshold)
// mode 1 = Upward   (boost when level < threshold)
//------------------------------------------------------
dyn_gain_db(dyn_on,thresh,range,att,rel,mode,fc,q,x) = gain
with {
    sc      = x : fi.resonbp(fc,q,1);
    env     = sc : an.amp_follower_ar(att,rel);
    env_db  = 20*log10(max(env,ma.EPSILON));
    diff    = env_db - thresh;
    downward = 0 - max(0, min(diff,range));
    upward   = max(0, min(0-diff,range));
    raw_gain = select2(mode,downward,upward);
    gain     = select2(dyn_on,0,raw_gain) : si.smoo;
};

//------------------------------------------------------
// Q-configurable shelving filters (RBJ Audio-EQ-Cookbook)
// Standard fi.lowshelf/highshelf have no Q control, so
// these implement the shelf directly as a biquad with Q.
//------------------------------------------------------
rbj_lowshelf(gain_db,fc,q,x) = x : fi.tf2(b0/a0,b1/a0,b2/a0,a1/a0,a2/a0)
with {
    a_amp  = pow(10,gain_db/40);
    w0     = 2*ma.PI*fc/ma.SR;
    cosw0  = cos(w0);
    sinw0  = sin(w0);
    alpha  = sinw0/(2*q);
    sqrtA  = sqrt(a_amp);
    b0 =    a_amp*((a_amp+1) - (a_amp-1)*cosw0 + 2*sqrtA*alpha);
    b1 =  2*a_amp*((a_amp-1) - (a_amp+1)*cosw0);
    b2 =    a_amp*((a_amp+1) - (a_amp-1)*cosw0 - 2*sqrtA*alpha);
    a0 =         (a_amp+1) + (a_amp-1)*cosw0 + 2*sqrtA*alpha;
    a1 =    -2*  ((a_amp-1) + (a_amp+1)*cosw0);
    a2 =         (a_amp+1) + (a_amp-1)*cosw0 - 2*sqrtA*alpha;
};

rbj_highshelf(gain_db,fc,q,x) = x : fi.tf2(b0/a0,b1/a0,b2/a0,a1/a0,a2/a0)
with {
    a_amp  = pow(10,gain_db/40);
    w0     = 2*ma.PI*fc/ma.SR;
    cosw0  = cos(w0);
    sinw0  = sin(w0);
    alpha  = sinw0/(2*q);
    sqrtA  = sqrt(a_amp);
    b0 =    a_amp*((a_amp+1) + (a_amp-1)*cosw0 + 2*sqrtA*alpha);
    b1 = -2*a_amp*((a_amp-1) + (a_amp+1)*cosw0);
    b2 =    a_amp*((a_amp+1) + (a_amp-1)*cosw0 - 2*sqrtA*alpha);
    a0 =         (a_amp+1) - (a_amp-1)*cosw0 + 2*sqrtA*alpha;
    a1 =     2*  ((a_amp-1) - (a_amp+1)*cosw0);
    a2 =         (a_amp+1) - (a_amp-1)*cosw0 - 2*sqrtA*alpha;
};

//------------------------------------------------------
// HPF
//------------------------------------------------------
hpf_bypass = checkbox("[0]HPF/Bypass");
hpf_freq   = hslider("[1]HPF/Freq[unit:Hz]",20,20,20000,1):si.smoo;

// Slope/order is user-configurable: 12/24/36/48 dB/oct (Butterworth order
// 2/4/6/8). Order 4 (24dB/oct) remains the default — it was previously
// hardcoded because order 2 (12dB/oct) is too gentle to read as "on" against
// the wide analyzer dB range (at 1 octave below the corner it only cuts
// ~22dB, which still shows up as a solid analyzer trace), while order 4
// cuts roughly twice as fast per octave. Faust's filter order must be a
// compile-time constant (it fixes how many biquad sections get built), so
// all four orders are built in parallel here and the nentry index just
// masks/sums between them at run time — only one term is ever non-zero.
// Index -> slope: 0=12dB/oct, 1=24dB/oct (default), 2=36dB/oct, 3=48dB/oct.
// Kept as a plain nentry (no embedded enum labels) so its OSC/param address
// stays the simple "HPF_Order" form, matching Freq/Bypass above, rather than
// the enum text getting baked into the address.
hpf_order_sel = nentry("[2]HPF/Order",1,0,3,1);

hpf_filtered(x) = (x : fi.highpass(2,hpf_freq)) * (hpf_order_sel==0)
                 + (x : fi.highpass(4,hpf_freq)) * (hpf_order_sel==1)
                 + (x : fi.highpass(6,hpf_freq)) * (hpf_order_sel==2)
                 + (x : fi.highpass(8,hpf_freq)) * (hpf_order_sel==3);

hpf_stage(x) = select2(hpf_bypass, hpf_filtered(x), x);

//------------------------------------------------------
// Low Shelf
//------------------------------------------------------
ls_bypass  = checkbox("[0]Low Shelf/Bypass");
ls_freq    = hslider("[1]Low Shelf/Freq[unit:Hz]",75,20,20000,1):si.smoo;
ls_gain    = hslider("[2]Low Shelf/Gain[dB]",0,-24,24,0.1):si.smoo;
ls_q       = hslider("[3]Low Shelf/Q",0.7,0.1,5,0.01):si.smoo;
ls_dyn_on  = checkbox("[4]Low Shelf/Dynamic On");
ls_thresh  = hslider("[5]Low Shelf/Threshold[dB]",-24,-60,0,0.1):si.smoo;
ls_range   = hslider("[6]Low Shelf/Range[dB]",6,0,24,0.1):si.smoo;
ls_att     = hslider("[7]Low Shelf/Attack[s]",0.005,0.001,0.5,0.001):si.smoo;
ls_rel     = hslider("[8]Low Shelf/Release[s]",0.15,0.01,2,0.01):si.smoo;
ls_mode    = nentry("[9]Low Shelf/Mode{'Downward':0;'Upward':1}",0,0,1,1);

ls_stage(x) = select2(ls_bypass,
    rbj_lowshelf(ls_gain + dyn_gain_db(ls_dyn_on,ls_thresh,ls_range,ls_att,ls_rel,ls_mode,ls_freq,ls_q,x), ls_freq, ls_q, x),
    x);

//------------------------------------------------------
// Peak band generator (used for Peak1-4)
//------------------------------------------------------
peak_stage(bypass,dyn_on,thresh,range,att,rel,mode,freq,gain,q,x) =
    select2(bypass,
        x : fi.peak_eq_cq(gain + dyn_gain_db(dyn_on,thresh,range,att,rel,mode,freq,q,x), freq, q),
        x);

//---- Peak 1 ----
p1_bypass = checkbox("[0]Peak1/Bypass");
p1_freq   = hslider("[1]Peak1/Freq[Hz]",100,20,20000,1):si.smoo;
p1_gain   = hslider("[2]Peak1/Gain[dB]",0,-24,24,0.1):si.smoo;
p1_q      = hslider("[3]Peak1/Q",0.7,0.1,10,0.01):si.smoo;
p1_dyn_on = checkbox("[4]Peak1/Dynamic On");
p1_thresh = hslider("[5]Peak1/Threshold[dB]",-24,-60,0,0.1):si.smoo;
p1_range  = hslider("[6]Peak1/Range[dB]",6,0,24,0.1):si.smoo;
p1_att    = hslider("[7]Peak1/Attack[s]",0.005,0.001,0.5,0.001):si.smoo;
p1_rel    = hslider("[8]Peak1/Release[s]",0.15,0.01,2,0.01):si.smoo;
p1_mode   = nentry("[9]Peak1/Mode{'Downward':0;'Upward':1}",0,0,1,1);

p1_stage(x) = peak_stage(p1_bypass,p1_dyn_on,p1_thresh,p1_range,p1_att,p1_rel,p1_mode,p1_freq,p1_gain,p1_q,x);

//---- Peak 2 ----
p2_bypass = checkbox("[0]Peak2/Bypass");
p2_freq   = hslider("[1]Peak2/Freq[Hz]",250,20,20000,1):si.smoo;
p2_gain   = hslider("[2]Peak2/Gain[dB]",0,-24,24,0.1):si.smoo;
p2_q      = hslider("[3]Peak2/Q",1.0,0.1,10,0.01):si.smoo;
p2_dyn_on = checkbox("[4]Peak2/Dynamic On");
p2_thresh = hslider("[5]Peak2/Threshold[dB]",-24,-60,0,0.1):si.smoo;
p2_range  = hslider("[6]Peak2/Range[dB]",6,0,24,0.1):si.smoo;
p2_att    = hslider("[7]Peak2/Attack[s]",0.005,0.001,0.5,0.001):si.smoo;
p2_rel    = hslider("[8]Peak2/Release[s]",0.15,0.01,2,0.01):si.smoo;
p2_mode   = nentry("[9]Peak2/Mode{'Downward':0;'Upward':1}",0,0,1,1);

p2_stage(x) = peak_stage(p2_bypass,p2_dyn_on,p2_thresh,p2_range,p2_att,p2_rel,p2_mode,p2_freq,p2_gain,p2_q,x);

//---- Peak 3 ----
p3_bypass = checkbox("[0]Peak3/Bypass");
p3_freq   = hslider("[1]Peak3/Freq[Hz]",1000,20,20000,1):si.smoo;
p3_gain   = hslider("[2]Peak3/Gain[dB]",0,-24,24,0.1):si.smoo;
p3_q      = hslider("[3]Peak3/Q",1.0,0.1,10,0.01):si.smoo;
p3_dyn_on = checkbox("[4]Peak3/Dynamic On");
p3_thresh = hslider("[5]Peak3/Threshold[dB]",-24,-60,0,0.1):si.smoo;
p3_range  = hslider("[6]Peak3/Range[dB]",6,0,24,0.1):si.smoo;
p3_att    = hslider("[7]Peak3/Attack[s]",0.005,0.001,0.5,0.001):si.smoo;
p3_rel    = hslider("[8]Peak3/Release[s]",0.15,0.01,2,0.01):si.smoo;
p3_mode   = nentry("[9]Peak3/Mode{'Downward':0;'Upward':1}",0,0,1,1);

p3_stage(x) = peak_stage(p3_bypass,p3_dyn_on,p3_thresh,p3_range,p3_att,p3_rel,p3_mode,p3_freq,p3_gain,p3_q,x);

//---- Peak 4 ----
p4_bypass = checkbox("[0]Peak4/Bypass");
p4_freq   = hslider("[1]Peak4/Freq[Hz]",2500,20,20000,1):si.smoo;
p4_gain   = hslider("[2]Peak4/Gain[dB]",0,-24,24,0.1):si.smoo;
p4_q      = hslider("[3]Peak4/Q",1.0,0.1,10,0.01):si.smoo;
p4_dyn_on = checkbox("[4]Peak4/Dynamic On");
p4_thresh = hslider("[5]Peak4/Threshold[dB]",-24,-60,0,0.1):si.smoo;
p4_range  = hslider("[6]Peak4/Range[dB]",6,0,24,0.1):si.smoo;
p4_att    = hslider("[7]Peak4/Attack[s]",0.005,0.001,0.5,0.001):si.smoo;
p4_rel    = hslider("[8]Peak4/Release[s]",0.15,0.01,2,0.01):si.smoo;
p4_mode   = nentry("[9]Peak4/Mode{'Downward':0;'Upward':1}",0,0,1,1);

p4_stage(x) = peak_stage(p4_bypass,p4_dyn_on,p4_thresh,p4_range,p4_att,p4_rel,p4_mode,p4_freq,p4_gain,p4_q,x);

//------------------------------------------------------
// High Shelf
//------------------------------------------------------
hs_bypass  = checkbox("[0]High Shelf/Bypass");
hs_freq    = hslider("[1]High Shelf/Freq[Hz]",7500,20,20000,1):si.smoo;
hs_gain    = hslider("[2]High Shelf/Gain[dB]",0,-24,24,0.1):si.smoo;
hs_q       = hslider("[3]High Shelf/Q",0.7,0.1,5,0.01):si.smoo;
hs_dyn_on  = checkbox("[4]High Shelf/Dynamic On");
hs_thresh  = hslider("[5]High Shelf/Threshold[dB]",-24,-60,0,0.1):si.smoo;
hs_range   = hslider("[6]High Shelf/Range[dB]",6,0,24,0.1):si.smoo;
hs_att     = hslider("[7]High Shelf/Attack[s]",0.005,0.001,0.5,0.001):si.smoo;
hs_rel     = hslider("[8]High Shelf/Release[s]",0.15,0.01,2,0.01):si.smoo;
hs_mode    = nentry("[9]High Shelf/Mode{'Downward':0;'Upward':1}",0,0,1,1);

hs_stage(x) = select2(hs_bypass,
    rbj_highshelf(hs_gain + dyn_gain_db(hs_dyn_on,hs_thresh,hs_range,hs_att,hs_rel,hs_mode,hs_freq,hs_q,x), hs_freq, hs_q, x),
    x);

//------------------------------------------------------
// LPF
//------------------------------------------------------
lpf_bypass = checkbox("[0]LPF/Bypass");
lpf_freq   = hslider("[1]LPF/Freq[Hz]",20000,20,20000,1):si.smoo;

// Same configurable-order scheme as the HPF above; order 4 (24dB/oct) is
// the default, matching the previous fixed slope. Same index -> slope
// mapping: 0=12dB/oct, 1=24dB/oct (default), 2=36dB/oct, 3=48dB/oct.
lpf_order_sel = nentry("[2]LPF/Order",1,0,3,1);

lpf_filtered(x) = (x : fi.lowpass(2,lpf_freq)) * (lpf_order_sel==0)
                 + (x : fi.lowpass(4,lpf_freq)) * (lpf_order_sel==1)
                 + (x : fi.lowpass(6,lpf_freq)) * (lpf_order_sel==2)
                 + (x : fi.lowpass(8,lpf_freq)) * (lpf_order_sel==3);

lpf_stage(x) = select2(lpf_bypass, lpf_filtered(x), x);

//======================================================
// Channel EQ
//======================================================
channel_eq =
      hpf_stage
    : ls_stage
    : p1_stage
    : p2_stage
    : p3_stage
    : p4_stage
    : hs_stage
    : lpf_stage;

//======================================================
// Stereo
//======================================================
process = _,_ : channel_eq,channel_eq;
