export function newAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  return new Ctor();
}

export function rampGain(gainNode, ctx, target, timeConstant = 0.05) {
  const now = ctx.currentTime;
  gainNode.gain.cancelScheduledValues(now);
  gainNode.gain.setValueAtTime(gainNode.gain.value, now);
  gainNode.gain.linearRampToValueAtTime(target, now + timeConstant);
}

const SCANNER_PROFILES = {
  phone: { bits: 3, lowpass: 1100, drive: 2.2, makeup: 0.55 },
  laptop: { bits: 5, lowpass: 3600, drive: 1.3, makeup: 0.85 },
  studio: { bits: 16, lowpass: 19000, drive: 1, makeup: 0.9 },
};
const quantizeCurveCache = new Map();
function quantizeCurve(bits) {
  if (quantizeCurveCache.has(bits)) return quantizeCurveCache.get(bits);
  let curve;
  if (bits >= 16) {
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

const MELODY_1 = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66];
const MELODY_NOTE_S = 0.26;
const SCHEDULE_AHEAD_S = 0.15;
const SCHEDULE_INTERVAL_MS = 40;

function scheduleScannerNotes(ctx, nodes) {
  while (nodes.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
    const t = nodes.nextNoteTime;
    const freq = MELODY_1[nodes.noteIndex % MELODY_1.length];
    nodes.osc.frequency.setValueAtTime(freq, t);
    nodes.subOsc.frequency.setValueAtTime(freq / 2, t);
    nodes.noteGain.gain.cancelScheduledValues(t);
    nodes.noteGain.gain.setValueAtTime(0.04, t);
    nodes.noteGain.gain.linearRampToValueAtTime(1, t + 0.02);
    nodes.noteGain.gain.setValueAtTime(1, t + MELODY_NOTE_S - 0.05);
    nodes.noteGain.gain.linearRampToValueAtTime(0.04, t + MELODY_NOTE_S - 0.01);
    nodes.noteIndex += 1;
    nodes.nextNoteTime = t + MELODY_NOTE_S;
  }
}
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

export function createScannerNodes(ctx) {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  const subOsc = ctx.createOscillator();
  subOsc.type = "sine";
  const subGain = ctx.createGain();
  subGain.gain.value = 0.35;

  const noteGain = ctx.createGain();
  noteGain.gain.value = 0;

  const preGain = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.7;
  const postGain = ctx.createGain();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0;

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

export function teardownScannerNodes(nodes) {
  stopScannerTune(nodes);
  nodes.osc.stop();
  nodes.subOsc.stop();
}
