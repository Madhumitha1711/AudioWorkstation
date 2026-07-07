import("stdfaust.lib");

//======================================================
// 8-BAND PARAMETRIC EQ (Stereo)
//======================================================

//---------------------- HPF ----------------------------
hpf_freq = hslider("[1]HPF/Freq[unit:Hz]",20,20,20000,1):si.smoo;

//------------------- Low Shelf -------------------------
ls_freq = hslider("[2]Low Shelf/Freq[unit:Hz]",75,20,20000,1):si.smoo;
ls_gain = hslider("[2]Low Shelf/Gain[dB]",0,-24,24,0.1):si.smoo;

//------------------- Peak 1 ----------------------------
p1_freq = hslider("[3]Peak1/Freq[Hz]",100,20,20000,1):si.smoo;
p1_gain = hslider("[3]Peak1/Gain[dB]",0,-24,24,0.1):si.smoo;
p1_q    = hslider("[3]Peak1/Q",0.7,0.1,10,0.01):si.smoo;

//------------------- Peak 2 ----------------------------
p2_freq = hslider("[4]Peak2/Freq[Hz]",250,20,20000,1):si.smoo;
p2_gain = hslider("[4]Peak2/Gain[dB]",0,-24,24,0.1):si.smoo;
p2_q    = hslider("[4]Peak2/Q",1.0,0.1,10,0.01):si.smoo;

//------------------- Peak 3 ----------------------------
p3_freq = hslider("[5]Peak3/Freq[Hz]",1000,20,20000,1):si.smoo;
p3_gain = hslider("[5]Peak3/Gain[dB]",0,-24,24,0.1):si.smoo;
p3_q    = hslider("[5]Peak3/Q",1.0,0.1,10,0.01):si.smoo;

//------------------- Peak 4 ----------------------------
p4_freq = hslider("[6]Peak4/Freq[Hz]",2500,20,20000,1):si.smoo;
p4_gain = hslider("[6]Peak4/Gain[dB]",0,-24,24,0.1):si.smoo;
p4_q    = hslider("[6]Peak4/Q",1.0,0.1,10,0.01):si.smoo;

//------------------ High Shelf -------------------------
hs_freq = hslider("[7]High Shelf/Freq[Hz]",7500,20,20000,1):si.smoo;
hs_gain = hslider("[7]High Shelf/Gain[dB]",0,-24,24,0.1):si.smoo;

//---------------------- LPF ----------------------------
lpf_freq = hslider("[8]LPF/Freq[Hz]",20000,20,20000,1):si.smoo;

//======================================================
// Channel EQ
//======================================================

channel_eq =
      fi.highpass(2,hpf_freq)
    : fi.lowshelf(3,ls_gain,ls_freq)
    : fi.peak_eq_cq(p1_gain,p1_freq,p1_q)
    : fi.peak_eq_cq(p2_gain,p2_freq,p2_q)
    : fi.peak_eq_cq(p3_gain,p3_freq,p3_q)
    : fi.peak_eq_cq(p4_gain,p4_freq,p4_q)
    : fi.highshelf(3,hs_gain,hs_freq)
    : fi.lowpass(4,lpf_freq);

//======================================================
// Stereo
//======================================================

process = _,_ : channel_eq,channel_eq;