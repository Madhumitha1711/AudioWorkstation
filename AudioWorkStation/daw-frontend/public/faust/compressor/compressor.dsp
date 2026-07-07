import("stdfaust.lib");

// --- UI Controls ---
thresh     = hslider("Threshold [unit:dB]", -20, -60, 0, 0.1);
ratio      = hslider("Ratio", 4, 1, 20, 0.1);
knee       = hslider("Knee [unit:dB]", 3, 0, 20, 0.1);
attack     = hslider("Attack [unit:ms]", 10, 0.1, 100, 0.1) : /(1000); // sec
release    = hslider("Release [unit:ms]", 100, 10, 1000, 1) : /(1000); // sec
makeup     = hslider("Makeup Gain [unit:dB]", 0, 0, 24, 0.1) : ba.db2linear;
wetDry     = hslider("Wet/Dry [style:knob]", 100, 0, 100, 1) : /(100); 

// --- Compression Logic ---
strength   = co.ratio2strength(ratio);

compressor(sig) = gainLin * makeup * sig
with {
    // peak_compression_gain_mono_db signature:
    // _ : peak_compression_gain_mono_db(strength, thresh, att, rel, knee, prePost) : _
    // Note: The library signature orders knee after attack/release, and uses 0 for feedforward detection.
    gainDb  = sig : co.peak_compression_gain_mono_db(strength, thresh, attack, release, knee, 0);
    gainLin = ba.db2linear(gainDb);
};

// --- Parallel Wet/Dry Mix ---
process(sig) = (sig * (1.0 - wetDry)) + (compressor(sig) * wetDry);