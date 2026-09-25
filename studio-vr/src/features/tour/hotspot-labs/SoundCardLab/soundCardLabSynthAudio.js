// Sound Card Lab — system-generated (synthesized) audio engine.
//
// Everything in this file makes sound purely out of Web Audio oscillators
// and effects nodes — there's no microphone and nothing recorded involved.
// It's what SoundCardLab.jsx uses for Module 1's looping tune (see
// ScannerModule / createScannerNodes below) — the bit-depth reduction is
// something Web Audio can genuinely synthesize live, so it's worth doing
// for real instead of faking it.
//
// Module 2 (the Echo-Free Mirror) does NOT live here — it uses the same
// UI-only placeholder <audio> pattern as the rest of the "Listening Lab"
// family instead of a synthesized/recorded signal, so it has no engine of
// its own; see SoundCardLab.jsx's EchoMirrorModule directly.

// Safari still only exposes this un-prefixed as `webkitAudioContext`.
export function newAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  return new Ctor();
}

// Smoothly ramps a GainNode to `target` over ~50ms instead of snapping it —
// used for both modules' play/pause so muting mid-waveform never clicks.
export function rampGain(gainNode, ctx, target, timeConstant = 0.05) {
  const now = ctx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(target, now + timeConstant);
}

// ============================================================
// MODULE 1 — The HD Document Scanner (resolution & conversion)
// ============================================================
// Real-time bit-depth reduction, not a canned recording: a short looping
// tune (see MELODY_1/scheduleScannerNotes below — a lookahead scheduler in
// the classic Web Audio style, since a single OscillatorNode can only be
// started once and its .frequency is just re-scheduled note to note) runs
// continuously into a WaveShaperNode whose curve is a staircase — mapping
// the smooth -1..1 input onto a fixed number of output steps — followed by
// a lowpass whose cutoff also drops with the bit depth, mimicking a cheap
// converter's reduced sample rate. Fewer steps audibly is the grit/crunch
// SoundCardLab.jsx's caption describes; the studio profile uses a 2-point
// (fully linear = no quantization) curve and a wide open lowpass, i.e. no
// processing at all — the same tune plays through every mode, only the
// converter around it changes.
export const SCANNER_PROFILES = {
  phone: { bits: 3, lowpass: 1100, drive: 2.2, makeup: 0.55 },
  laptop: { bits: 5, lowpass: 3600, drive: 1.3, makeup: 0.85 },
  studio: { bits: 16, lowpass: 19000, drive: 1, makeup: 0.9 },
};
// Cached per bit-depth so switching converters doesn't rebuild the same
// staircase array twice.
const quantizeCurveCache = new Map();
export function quantizeCurve(bits) {
  if (quantizeCurveCache.has(bits)) return quantizeCurveCache.get(bits);
  let curve;
  if (bits >= 16) {
    // Effectively "no converter" — a straight line through the WaveShaper.
    curve = new Float32Array([-1, 0, 1]);
  } else {
    const steps = 2 ** bits - 1;
    const n = 1024;
    curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.round(x * steps) / steps;
    }
  }
  quantizeCurveCache.set(bits, curve);
  return curve;
}
export function applyScannerProfile(nodes, ctx, mode) {
  const p = SCANNER_PROFILES[mode];
  const now = ctx.currentTime;
  nodes.preGain.gain.setTargetAtTime(p.drive, now, 0.02);
  nodes.shaper.curve = quantizeCurve(p.bits);
  nodes.filter.frequency.setTargetAtTime(p.lowpass, now, 0.03);
  nodes.postGain.gain.setTargetAtTime(p.makeup, now, 0.02);
}

// A short, pleasant major-pentatonic run (C D E G A, up and back down to a
// different note than it started on so the loop point isn't a dead repeat)
// — chosen over a single held note so there's always some real melodic
// motion to hear the converter chew on, not just a static pitch.
export const MELODY_1 = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66];
export const MELODY_NOTE_S = 0.26;
export const SCHEDULE_AHEAD_S = 0.15;
export const SCHEDULE_INTERVAL_MS = 40;

// Classic Web Audio "lookahead" scheduler (same technique as Chris Wilson's
// "A Tale of Two Clocks"): rather than trusting setInterval's timing for the
// actual notes, it only uses the interval to top up a small buffer of
// precisely-timed automation events on the AudioParam timeline
// (osc.frequency / noteGain.gain), scheduled via the AudioContext's own
// clock. osc/subOsc are never stopped between notes — only their frequency
// changes — since an OscillatorNode can't be restarted once stopped.
export function scheduleScannerNotes(ctx, nodes) {
  while (nodes.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
    const t = nodes.nextNoteTime;
    const freq = MELODY_1[nodes.noteIndex % MELODY_1.length];
    nodes.osc.frequency.setValueAtTime(freq, t);
    nodes.subOsc.frequency.setValueAtTime(freq / 2, t);
    // Small dip-and-swell per note (rather than a flat sustain) so
    // consecutive notes are heard as separate, articulated notes instead of
    // one continuous pitch-glide.
    nodes.noteGain.gain.cancelScheduledValues(t);
    nodes.noteGain.gain.setValueAtTime(0.04, t);
    nodes.noteGain.gain.linearRampToValueAtTime(1, t + 0.02);
    nodes.noteGain.gain.setValueAtTime(1, t + MELODY_NOTE_S - 0.05);
    nodes.noteGain.gain.linearRampToValueAtTime(0.04, t + MELODY_NOTE_S - 0.01);
    nodes.noteIndex += 1;
    nodes.nextNoteTime = t + MELODY_NOTE_S;
  }
}
// Idempotent — selecting a converter while the tune is already looping just
// leaves the scheduler running (see SoundCardLab.jsx's selectMode), it
// doesn't restart it.
export function startScannerTune(ctx, nodes) {
  if (nodes.schedulerId != null) return;
  nodes.noteIndex = 0;
  nodes.nextNoteTime = ctx.currentTime + 0.05;
  scheduleScannerNotes(ctx, nodes);
  nodes.schedulerId = setInterval(() => scheduleScannerNotes(ctx, nodes), SCHEDULE_INTERVAL_MS);
}
export function stopScannerTune(nodes) {
  if (nodes.schedulerId != null) {
    clearInterval(nodes.schedulerId);
    nodes.schedulerId = null;
  }
}

// Builds the tune -> quantizer -> lowpass -> master graph once, starts the
// oscillators for the module's whole lifetime, and applies the "phone"
// profile as the initial converter — mirrors what ScannerModule's mount
// effect used to build inline. The oscillators are never stopped/restarted
// per play-press (an OscillatorNode can only ever be started once); ongoing
// play/pause instead ramps nodes.masterGain and starts/stops the note
// scheduler (see startScannerTune/stopScannerTune above).
export function createScannerNodes(ctx) {
  // Melody oscillator (triangle — warmer than a raw sawtooth, but still
  // harmonically rich enough for the bit-crusher to visibly/audibly chew
  // on) plus a quiet sub-oscillator an octave below for a fuller, more
  // instrument-like tone. Both are re-pitched per note by the scheduler
  // rather than restarted.
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  const subOsc = ctx.createOscillator();
  subOsc.type = "sine";
  const subGain = ctx.createGain();
  subGain.gain.value = 0.35;

  // Per-note envelope (articulation), separate from masterGain's overall
  // play/pause fade below.
  const noteGain = ctx.createGain();
  noteGain.gain.value = 0;

  const preGain = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.7;
  const postGain = ctx.createGain();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0; // silent until togglePlay/selectMode ramps it up

  osc.connect(noteGain);
  subOsc.connect(subGain);
  subGain.connect(noteGain);
  noteGain.connect(preGain);
  preGain.connect(shaper);
  shaper.connect(filter);
  filter.connect(postGain);
  postGain.connect(masterGain);
  masterGain.connect(ctx.destination);

  osc.start();
  subOsc.start();

  const nodes = {
    osc, subOsc, noteGain, preGain, shaper, filter, postGain, masterGain,
    nextNoteTime: 0, noteIndex: 0, schedulerId: null,
  };
  applyScannerProfile(nodes, ctx, "phone");
  return nodes;
}

// Counterpart to createScannerNodes — stops the note scheduler and the two
// oscillators (each can only be stop()-ed once, which is why this is only
// ever called from the module's unmount cleanup).
export function teardownScannerNodes(nodes) {
  stopScannerTune(nodes);
  nodes.osc.stop();
  nodes.subOsc.stop();
}
