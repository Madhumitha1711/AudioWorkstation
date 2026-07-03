// reverb-processor.js — AudioWorkletProcessor
//
// Pure JavaScript implementation of the Freeverb algorithmic reverb.
// No external dependencies, no WASM build step required.
//
// Messages from main thread:
//   { type: 'set_size'|'set_decay'|'set_damping'|'set_diffusion', value: 0–1 }
// Messages to main thread:
//   { type: 'ready' }

const BLOCK = 128;

// ── Freeverb constants (Jezar at Dreampoint, public domain 2000) ──────────────
const COMB_L     = [1116,1188,1277,1356,1422,1491,1557,1617];
const COMB_R     = [1139,1211,1300,1379,1445,1514,1580,1640];
const AP_L       = [556,441,341,225];
const AP_R       = [579,464,364,248];
const SCALE_ROOM = 0.28;
const OFFSET_ROOM = 0.70;
const SCALE_DAMP  = 0.4;
const FIXED_GAIN  = 0.015;

// One-pole smoothing coefficient for de-zippering parameter changes below.
// ~0.001 gives a time constant of roughly 20ms at 44.1kHz (1 / (fs * coeff)) —
// short enough to feel responsive to a knob drag, long enough that the
// recirculating feedback/damp coefficients never jump discontinuously
// mid-stream (which is what caused the audible clicks when dragging
// SIZE/DECAY/DAMPING/DIFFUSION while the reverb was ringing).
const SMOOTH = 0.001;

// ── Comb filter ───────────────────────────────────────────────────────────────
class CombFilter {
  constructor(size) {
    this.buf = new Float32Array(size);
    this.idx = 0;
    this.feedback = 0.5; this.targetFeedback = 0.5;
    this.store = 0;
    this.d1 = 0.2; this.targetD1 = 0.2; this.d2 = 0.8;
  }
  process(input) {
    this.feedback += (this.targetFeedback - this.feedback) * SMOOTH;
    this.d1       += (this.targetD1 - this.d1) * SMOOTH;
    this.d2 = 1 - this.d1;
    const out = this.buf[this.idx];
    this.store = out * this.d2 + this.store * this.d1;
    this.buf[this.idx] = input + this.store * this.feedback;
    this.idx = (this.idx + 1) % this.buf.length;
    return out;
  }
  setFeedback(f) { this.targetFeedback = f; }
  setDamp(d)     { this.targetD1 = d; }
}

// ── Allpass filter ────────────────────────────────────────────────────────────
class AllpassFilter {
  constructor(size) {
    this.buf = new Float32Array(size);
    this.idx = 0; this.feedback = 0.5; this.targetFeedback = 0.5;
  }
  process(input) {
    this.feedback += (this.targetFeedback - this.feedback) * SMOOTH;
    const buffered = this.buf[this.idx];
    const out = -input + buffered;
    this.buf[this.idx] = input + buffered * this.feedback;
    this.idx = (this.idx + 1) % this.buf.length;
    return out;
  }
  setFeedback(f) { this.targetFeedback = f; }
}

// ── Freeverb ──────────────────────────────────────────────────────────────────
class Freeverb {
  constructor(sampleRate) {
    const sc = n => Math.round(n * sampleRate / 44100);
    this.combL = COMB_L.map(n => new CombFilter(sc(n)));
    this.combR = COMB_R.map(n => new CombFilter(sc(n)));
    this.apL   = AP_L.map(n => new AllpassFilter(sc(n)));
    this.apR   = AP_R.map(n => new AllpassFilter(sc(n)));
    this.size = 0.5; this.decay = 1.0; this.damping = 0.5; this.diffusion = 1.0;
    this._apply();
  }

  _apply() {
    const feedback = this.size * (0.05 + this.decay * 0.95) * SCALE_ROOM + OFFSET_ROOM;
    const damp     = this.damping * SCALE_DAMP;
    this.combL.forEach(c => { c.setFeedback(feedback); c.setDamp(damp); });
    this.combR.forEach(c => { c.setFeedback(feedback); c.setDamp(damp); });
    this.apL.forEach(f => f.setFeedback(this.diffusion));
    this.apR.forEach(f => f.setFeedback(this.diffusion));
    this.wet1 = (1 + this.diffusion) * 0.5;
    this.wet2 = (1 - this.diffusion) * 0.5;
  }

  setSize(v)      { this.size      = Math.max(0, Math.min(1, v)); this._apply(); }
  setDecay(v)     { this.decay     = Math.max(0, Math.min(1, v)); this._apply(); }
  setDamping(v)   { this.damping   = Math.max(0, Math.min(1, v)); this._apply(); }
  setDiffusion(v) { this.diffusion = Math.max(0, Math.min(1, v)); this._apply(); }

  tick(inL, inR) {
    const inp = (inL + inR) * FIXED_GAIN;
    let outL = 0, outR = 0;
    for (let i = 0; i < 8; i++) { outL += this.combL[i].process(inp); outR += this.combR[i].process(inp); }
    for (let i = 0; i < 4; i++) { outL = this.apL[i].process(outL); outR = this.apR[i].process(outR); }
    return [outL * this.wet1 + outR * this.wet2, outR * this.wet1 + outL * this.wet2];
  }
}

// ── Processor ─────────────────────────────────────────────────────────────────
class ReverbProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._reverb = new Freeverb(sampleRate);
    this.port.onmessage = ({ data }) => {
      switch (data.type) {
        case 'set_size':      this._reverb.setSize(data.value);      break;
        case 'set_decay':     this._reverb.setDecay(data.value);     break;
        case 'set_damping':   this._reverb.setDamping(data.value);   break;
        case 'set_diffusion': this._reverb.setDiffusion(data.value); break;
      }
    };
    this.port.postMessage({ type: 'ready' });
  }

  process(inputs, outputs) {
    const inCh  = inputs[0]  || [];
    const outCh = outputs[0] || [];
    const inL   = inCh[0] || _zero;
    const inR   = inCh[1] || inCh[0] || _zero;
    const outL  = outCh[0];
    const outR  = outCh[1];
    if (!outL) return true;
    for (let i = 0; i < BLOCK; i++) {
      const [l, r] = this._reverb.tick(inL[i], inR[i]);
      outL[i] = l;
      if (outR) outR[i] = r;
    }
    return true;
  }
}

const _zero = new Float32Array(BLOCK);
registerProcessor('reverb-processor', ReverbProcessor);
