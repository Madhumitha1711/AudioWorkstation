// reverb-processor.js — AudioWorkletProcessor
//
// Processing priority:
//   1. Rust Freeverb compiled to WASM  (best performance, loaded async)
//   2. JavaScript Freeverb fallback     (always available, same algorithm)
//
// The JS fallback means all four knobs (SIZE, DECAY, DAMPING, DIFFUSION)
// affect audio immediately even before the .wasm file is built.
//
// Messages from main thread:
//   { type: 'set_size'|'set_decay'|'set_damping'|'set_diffusion'|'set_width', value: 0–1 }
// Messages to main thread:
//   { type: 'ready', backend: 'wasm'|'js' }
//   { type: 'error', msg }

const BLOCK = 128;

// ─────────────────────────────────────────────────────────────────────────────
// Pure-JS Freeverb  (mirrors the Rust lib.rs / the freeverb crate algorithm)
// ─────────────────────────────────────────────────────────────────────────────
const COMB_L  = [1116,1188,1277,1356,1422,1491,1557,1617];
const COMB_R  = [1139,1211,1300,1379,1445,1514,1580,1640];
const AP_L    = [556,441,341,225];
const AP_R    = [579,464,364,248];
const SCALE_ROOM = 0.28, OFFSET_ROOM = 0.70, SCALE_DAMP = 0.4, FIXED_GAIN = 0.015;

class CombFilter {
  constructor(size) {
    this.buf = new Float32Array(size);
    this.idx = 0; this.feedback = 0.5; this.store = 0; this.d1 = 0.2; this.d2 = 0.8;
  }
  process(input) {
    const out = this.buf[this.idx];
    this.store = out * this.d2 + this.store * this.d1;
    this.buf[this.idx] = input + this.store * this.feedback;
    this.idx = (this.idx + 1) % this.buf.length;
    return out;
  }
  setFeedback(f) { this.feedback = f; }
  setDamp(d)     { this.d1 = d; this.d2 = 1 - d; }
}

class AllpassFilter {
  constructor(size) {
    this.buf = new Float32Array(size);
    this.idx = 0; this.feedback = 0.5;
  }
  process(input) {
    const buffered = this.buf[this.idx];
    const out = -input + buffered;
    this.buf[this.idx] = input + buffered * this.feedback;
    this.idx = (this.idx + 1) % this.buf.length;
    return out;
  }
}

class JsFreeverb {
  constructor(sampleRate) {
    // Scale delay lengths for the given sample rate (tuned for 44100 Hz)
    const scale = sampleRate / 44100;
    const sc = n => Math.round(n * scale);
    this.combL = COMB_L.map(n => new CombFilter(sc(n)));
    this.combR = COMB_R.map(n => new CombFilter(sc(n)));
    this.apL   = AP_L.map(n => new AllpassFilter(sc(n)));
    this.apR   = AP_R.map(n => new AllpassFilter(sc(n)));
    this.size  = 0.5; this.decay = 1.0; this.damping = 0.5; this.width = 1.0;
    this._update();
  }

  _update() {
    // SIZE × (0.05 + DECAY × 0.95) → room_size → freeverb feedback
    const room     = this.size * (0.05 + this.decay * 0.95);
    const feedback = room * SCALE_ROOM + OFFSET_ROOM;
    const damp     = this.damping * SCALE_DAMP;
    this.combL.forEach(c => { c.setFeedback(feedback); c.setDamp(damp); });
    this.combR.forEach(c => { c.setFeedback(feedback); c.setDamp(damp); });
    this.wet1 = (1 + this.width) * 0.5;
    this.wet2 = (1 - this.width) * 0.5;
  }

  setSize(v)      { this.size     = Math.max(0, Math.min(1, v)); this._update(); }
  setDecay(v)     { this.decay    = Math.max(0, Math.min(1, v)); this._update(); }
  setDamping(v)   { this.damping  = Math.max(0, Math.min(1, v)); this._update(); }
  setDiffusion(v) { this.width    = Math.max(0, Math.min(1, v)); this._update(); }

  tick(inL, inR) {
    const inp = (inL + inR) * FIXED_GAIN;
    let outL = 0, outR = 0;
    for (let i = 0; i < 8; i++) { outL += this.combL[i].process(inp); outR += this.combR[i].process(inp); }
    for (let i = 0; i < 4; i++) { outL = this.apL[i].process(outL); outR = this.apR[i].process(outR); }
    return [outL * this.wet1 + outR * this.wet2, outR * this.wet1 + outL * this.wet2];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AudioWorkletProcessor
// ─────────────────────────────────────────────────────────────────────────────
class ReverbProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._wasmReady = false;
    this._wasm      = null;
    this._memory    = null;
    this._ptr       = 0;
    this._inLPtr = this._inRPtr = this._outLPtr = this._outRPtr = 0;

    // JS fallback is always ready immediately
    this._js = new JsFreeverb(sampleRate);

    // Pending params from before WASM is ready (already applied to JS engine)
    this._pending = {};

    this.port.onmessage = e => this._onMessage(e.data);

    // Attempt async WASM upgrade — failure is silent, JS fallback stays active
    this._loadWasm().catch(() => {});

    // Signal ready immediately on JS backend
    this.port.postMessage({ type: 'ready', backend: 'js' });
  }

  async _loadWasm() {
    const res = await fetch('/wasm/daw_engine.wasm');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { instance } = await WebAssembly.instantiate(await res.arrayBuffer());

    this._wasm   = instance.exports;
    this._memory = instance.exports.memory;
    this._ptr    = this._wasm.freeverb_create(sampleRate | 0);
    this._inLPtr  = this._wasm.alloc_f32(BLOCK);
    this._inRPtr  = this._wasm.alloc_f32(BLOCK);
    this._outLPtr = this._wasm.alloc_f32(BLOCK);
    this._outRPtr = this._wasm.alloc_f32(BLOCK);

    // Replay any params that were set before WASM was ready
    for (const [type, value] of Object.entries(this._pending)) this._applyWasm(type, value);

    this._wasmReady = true;
    this.port.postMessage({ type: 'ready', backend: 'wasm' });
  }

  _onMessage(data) {
    // Always apply to JS engine immediately
    this._applyJs(data.type, data.value);
    // Queue for WASM too; apply right away if already ready
    if (this._wasmReady) this._applyWasm(data.type, data.value);
    else this._pending[data.type] = data.value;
  }

  _applyJs(type, value) {
    switch (type) {
      case 'set_size':      this._js.setSize(value);      break;
      case 'set_decay':     this._js.setDecay(value);     break;
      case 'set_damping':   this._js.setDamping(value);   break;
      case 'set_diffusion': this._js.setDiffusion(value); break;
    }
  }

  _applyWasm(type, value) {
    if (!this._wasm || !this._ptr) return;
    switch (type) {
      case 'set_size':      this._wasm.freeverb_set_size(this._ptr, value);      break;
      case 'set_decay':     this._wasm.freeverb_set_decay(this._ptr, value);     break;
      case 'set_damping':   this._wasm.freeverb_set_damping(this._ptr, value);   break;
      case 'set_diffusion': this._wasm.freeverb_set_diffusion(this._ptr, value); break;
    }
  }

  process(inputs, outputs) {
    const inCh  = inputs[0]  || [];
    const outCh = outputs[0] || [];
    const inL   = inCh[0] || _zero;
    const inR   = inCh[1] || inCh[0] || _zero;

    if (this._wasmReady) {
      // ── WASM path ──
      const mem    = new Float32Array(this._memory.buffer);
      const iLIdx  = this._inLPtr  >>> 2;
      const iRIdx  = this._inRPtr  >>> 2;
      const oLIdx  = this._outLPtr >>> 2;
      const oRIdx  = this._outRPtr >>> 2;
      mem.set(inL, iLIdx);
      mem.set(inR, iRIdx);
      this._wasm.freeverb_process(
        this._ptr, this._inLPtr, this._inRPtr, this._outLPtr, this._outRPtr, BLOCK
      );
      if (outCh[0]) outCh[0].set(mem.subarray(oLIdx, oLIdx + BLOCK));
      if (outCh[1]) outCh[1].set(mem.subarray(oRIdx, oRIdx + BLOCK));
    } else {
      // ── JS fallback path ──
      const outL = outCh[0] || new Float32Array(BLOCK);
      const outR = outCh[1] || new Float32Array(BLOCK);
      for (let i = 0; i < BLOCK; i++) {
        const [l, r] = this._js.tick(inL[i], inR[i]);
        outL[i] = l;
        outR[i] = r;
      }
    }
    return true;
  }
}

const _zero = new Float32Array(BLOCK);
registerProcessor('reverb-processor', ReverbProcessor);
