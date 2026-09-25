// Audio engine for CriticalListeningLab (ported from
// design/critical-listening-lab-1.html). Plain module, no React — the lab
// component owns one instance and calls close() on unmount. Deliberately
// its own AudioContext rather than going through spatialAudioEngine.js,
// same reasoning as useLabAudio: this is a self-contained demo, not part of
// the panorama's spatial mix.
//
// One synthesized 2-bar loop (drums, bass, pad, lead) is rendered once,
// offline, the first time the student presses play. At play time that same
// looping buffer feeds two parallel paths:
//
//   src ─► gA ─────────────────────► analyser ─► destination   (A: clean)
//   src ─► problem chain ─► gB ─────►    │                      (B: problem)
//                                        └─► splitter ─► anL / anR (meters)
//
// The source is either the built-in loop or a reference file the student
// uploads (addReference — any number of them, kept in a small in-memory
// library and picked with selectSource). Either way it is prepared ONCE, before it ever
// reaches the A/B split (prepareSource):
//   - folded to stereo (mono is duplicated; >2 channels keep the first two),
//     since the stereo problems need two channels to act on;
//   - given fixed headroom: its peak is brought to HEADROOM_PEAK so the
//     problem chains (EQ boosts, echo, comb, reverb tails) can't clip the
//     output and add distortion that isn't the problem being taught. An
//     upload is only ever turned DOWN for this, never up, and the amount is
//     reported to the UI. Because it happens before the split, A and B get
//     the identical level — there is no gain difference between them other
//     than what a problem chain itself does (see the UNITY-GAIN RULE in
//     criticalListeningData.js).
//
// A/B switching only crossfades gA/gB, so both paths stay sample-aligned
// and the student hears the difference instantly with no restart — that
// instant flip is the whole point of the exercise, so don't change A/B to
// swap buffers or restart the source.

const BPM = 112;
const BEAT = 60 / BPM;
const LOOP = BEAT * 8;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Source peak level (linear, ≈ −11 dBFS). +10 dB of EQ boost on the
// loudest element still stays under 0 dBFS.
export const HEADROOM_PEAK = 0.28;
// Refuse very large uploads up front — decodeAudioData holds the whole file
// as 32-bit float PCM (a 10-minute stereo 48 kHz file is ~230 MB decoded).
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

function peakOf(buf) {
  let pk = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > pk) pk = v;
    }
  }
  return pk;
}

// See the header comment. `allowBoost` is true only for the built-in loop
// (whose absolute level is arbitrary); uploads are only ever attenuated.
function prepareSource(ctx, src, allowBoost) {
  const out = ctx.createBuffer(2, src.length, src.sampleRate);
  const pk = peakOf(src) || 1;
  const k = pk > HEADROOM_PEAK || allowBoost ? HEADROOM_PEAK / pk : 1;
  for (let ch = 0; ch < 2; ch++) {
    const from = src.getChannelData(Math.min(ch, src.numberOfChannels - 1));
    const to = out.getChannelData(ch);
    for (let i = 0; i < from.length; i++) to[i] = from[i] * k;
  }
  return { buffer: out, peak: pk * k, trimDb: 20 * Math.log10(k) };
}

async function renderLoop() {
  const sr = 44100;
  const oc = new OfflineAudioContext(2, Math.round(sr * LOOP), sr);
  const glue = oc.createDynamicsCompressor();
  glue.threshold.value = -14;
  glue.ratio.value = 3;
  glue.attack.value = 0.01;
  glue.release.value = 0.2;
  const m = oc.createGain();
  m.gain.value = 0.5;
  m.connect(glue);
  glue.connect(oc.destination);

  const nb = oc.createBuffer(1, sr, sr);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const bus = (p) => {
    const s = oc.createStereoPanner();
    s.pan.value = p;
    s.connect(m);
    return s;
  };
  const env = (g, t, peak, a, d) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  };

  const kick = (t) => {
    const o = oc.createOscillator(), g = oc.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    env(g, t, 1, 0.004, 0.38);
    o.connect(g).connect(bus(0));
    o.start(t);
    o.stop(t + 0.4);
  };
  const snare = (t) => {
    const n = oc.createBufferSource();
    n.buffer = nb;
    const f = oc.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 2200;
    f.Q.value = 0.7;
    const g = oc.createGain();
    env(g, t, 0.6, 0.002, 0.2);
    n.connect(f).connect(g).connect(bus(0));
    n.start(t, Math.random() * 0.5, 0.25);
    const o = oc.createOscillator(), g2 = oc.createGain();
    o.type = "triangle";
    o.frequency.value = 185;
    env(g2, t, 0.35, 0.002, 0.1);
    o.connect(g2).connect(bus(0));
    o.start(t);
    o.stop(t + 0.12);
  };
  const hat = (t, open) => {
    const n = oc.createBufferSource();
    n.buffer = nb;
    const f = oc.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7500;
    const g = oc.createGain();
    env(g, t, open ? 0.22 : 0.16, 0.001, open ? 0.22 : 0.05);
    n.connect(f).connect(g).connect(bus(0.35));
    n.start(t, Math.random() * 0.5, 0.3);
  };
  const bass = (t, f, d) => {
    const o = oc.createOscillator(), lp = oc.createBiquadFilter(), g = oc.createGain();
    o.type = "sawtooth";
    o.frequency.value = f;
    lp.type = "lowpass";
    lp.frequency.value = 650;
    lp.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
    g.gain.setValueAtTime(0.32, t + d - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d - 0.01);
    o.connect(lp).connect(g).connect(bus(0));
    o.start(t);
    o.stop(t + d);
  };
  const pad = (t, notes, d) =>
    notes.forEach((n) =>
      [-6, 6].forEach((cents) => {
        const o = oc.createOscillator(), lp = oc.createBiquadFilter(), g = oc.createGain();
        o.type = "sawtooth";
        o.frequency.value = mtof(n) * Math.pow(2, cents / 1200);
        lp.type = "lowpass";
        lp.frequency.value = 2800;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.04, t + 0.06);
        g.gain.setValueAtTime(0.04, t + d - 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d - 0.01);
        o.connect(lp).connect(g).connect(bus(cents < 0 ? -0.55 : 0.55));
        o.start(t);
        o.stop(t + d);
      }),
    );
  const lead = (t, n, d) => {
    const o = oc.createOscillator(), g = oc.createGain();
    o.type = "triangle";
    o.frequency.value = mtof(n);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d * 0.95);
    o.connect(g).connect(bus(-0.2));
    o.start(t);
    o.stop(t + d);
  };

  [0, 1.5, 2, 4, 5.5, 6].forEach((b) => kick(b * BEAT));
  [1, 3, 5, 7].forEach((b) => snare(b * BEAT));
  for (let i = 0; i < 16; i++) hat((i * BEAT) / 2, i === 7 || i === 15);
  [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]].forEach((c, i) => pad(i * 2 * BEAT, c, 2 * BEAT));
  [33, 29, 36, 31].forEach((n, i) => {
    bass(i * 2 * BEAT, mtof(n), BEAT);
    bass((i * 2 + 1) * BEAT, mtof(n + 12 * (i % 2)), BEAT);
  });
  [[0, 76, 0.5], [0.5, 72, 0.5], [1, 69, 1], [2.5, 72, 0.5], [3, 77, 1], [4, 79, 0.75], [4.75, 76, 0.75], [5.5, 72, 0.5], [6, 74, 1.5]]
    .forEach(([b, n, d]) => lead(b * BEAT, n, d * BEAT));

  return oc.startRendering();
}

export function createListeningEngine() {
  const E = {
    ctx: null, buf: null, noise: null, an: null, anL: null, anR: null,
    src: null, gA: null, gB: null, chain: null, side: "A", gen: 0, readyPromise: null,
    loop: null, // prepared built-in loop  { buffer, peak, trimDb }
    refs: new Map(), // uploaded references: id -> prepared { buffer, peak, trimDb }
    activeId: null, // id in `refs`, or null = built-in loop
    nextId: 1,
  };
  const current = () => (E.activeId != null && E.refs.get(E.activeId)) || E.loop;

  // Lazily builds the context, analysers, noise buffer and the rendered
  // loop. Memoised so two quick play clicks don't render the loop twice.
  // Resolves false if close() ran while it was waiting (unmount mid-render)
  // so the caller knows not to start(). close() resets everything, so the
  // same engine can be reopened afterwards — needed for React StrictMode's
  // dev-only unmount/remount of effects.
  async function ensure() {
    const gen = E.gen;
    if (!E.readyPromise) {
      E.readyPromise = (async () => {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const c = (E.ctx = new Ctx());
        E.an = c.createAnalyser();
        E.an.fftSize = 4096;
        E.an.smoothingTimeConstant = 0.82;
        const sp = c.createChannelSplitter(2);
        E.anL = c.createAnalyser();
        E.anR = c.createAnalyser();
        E.anL.fftSize = E.anR.fftSize = 1024;
        E.an.connect(c.destination);
        E.an.connect(sp);
        sp.connect(E.anL, 0);
        sp.connect(E.anR, 1);
        const nb = c.createBuffer(2, c.sampleRate * 2, c.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const d = nb.getChannelData(ch);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        E.noise = nb;
        E.loop = prepareSource(c, await renderLoop(), true);
      })();
    }
    await E.readyPromise;
    if (gen !== E.gen) return false;
    if (E.ctx.state === "suspended") await E.ctx.resume();
    return gen === E.gen;
  }

  function stop() {
    if (!E.src) return;
    const { src, gA, gB, chain } = E;
    const t = E.ctx.currentTime;
    // Short fade then hard stop, so stopping never clicks.
    gA.gain.setTargetAtTime(0, t, 0.01);
    gB.gain.setTargetAtTime(0, t, 0.01);
    setTimeout(() => {
      [src, ...chain.sources].forEach((s) => {
        try { s.stop(); } catch { /* already stopped */ }
      });
      gA.disconnect();
      gB.disconnect();
    }, 80);
    E.src = null;
  }

  // Must be called after ensure() has resolved.
  function start(problem, strength) {
    stop();
    const cur = current();
    if (!E.ctx || !cur) return;
    const c = E.ctx;
    const src = c.createBufferSource();
    src.buffer = cur.buffer;
    src.loop = true;
    const gA = c.createGain(), gB = c.createGain();
    gA.gain.value = E.side === "A" ? 1 : 0;
    gB.gain.value = E.side === "B" ? 1 : 0;
    src.connect(gA).connect(E.an);
    const chain = problem.build(c, strength, { noise: E.noise, peak: cur.peak });
    src.connect(chain.input);
    chain.output.connect(gB).connect(E.an);
    const t = c.currentTime + 0.02;
    src.start(t);
    chain.sources.forEach((s) => s.start(t));
    Object.assign(E, { src, gA, gB, chain });
  }

  function setSide(side) {
    E.side = side;
    if (E.src) {
      const t = E.ctx.currentTime;
      E.gA.gain.setTargetAtTime(side === "A" ? 1 : 0, t, 0.008);
      E.gB.gain.setTargetAtTime(side === "B" ? 1 : 0, t, 0.008);
    }
  }

  // Decode an uploaded reference file and add it to the reference library
  // (it does NOT become the active source — call selectSource for that).
  // Throws a student-readable Error on failure. Returns { id, duration,
  // trimDb } — trimDb is ≤ 0 (how far it was turned down for headroom;
  // 0 = untouched).
  async function addReference(file) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`${file.name} is ${Math.round(file.size / 1048576)} MB — use files under ${MAX_UPLOAD_BYTES / 1048576} MB (a 30–90 s excerpt is ideal).`);
    }
    if (!(await ensure())) return null;
    const bytes = await file.arrayBuffer();
    let decoded;
    try {
      decoded = await E.ctx.decodeAudioData(bytes);
    } catch {
      throw new Error(`Couldn't read ${file.name} as audio. Try WAV, MP3, M4A/AAC, OGG or FLAC.`);
    }
    if (decoded.duration < 1) throw new Error(`${file.name} is too short — use at least a few seconds of audio.`);
    const id = E.nextId++;
    const prepared = prepareSource(E.ctx, decoded, false);
    E.refs.set(id, prepared);
    return { id, duration: decoded.duration, trimDb: prepared.trimDb };
  }

  // null = built-in loop. Caller restarts playback if it was playing.
  function selectSource(id) {
    E.activeId = id != null && E.refs.has(id) ? id : null;
  }

  function removeReference(id) {
    E.refs.delete(id);
    if (E.activeId === id) E.activeId = null;
  }

  function close() {
    E.gen++;
    if (E.src) {
      [E.src, ...E.chain.sources].forEach((s) => {
        try { s.stop(); } catch { /* already stopped */ }
      });
      E.src = null;
    }
    E.ctx?.close().catch(() => {});
    // The prepared buffers are plain data and outlive the context, so an
    // upload survives StrictMode's dev remount.
    Object.assign(E, { ctx: null, an: null, anL: null, anR: null, readyPromise: null });
  }

  return {
    ensure,
    start,
    stop,
    setSide,
    close,
    addReference,
    selectSource,
    removeReference,
    isPlaying: () => !!E.src,
    // For the spectrum/meter canvas: null until audio has been started once.
    analysers: () => (E.ctx ? { an: E.an, anL: E.anL, anR: E.anR, sampleRate: E.ctx.sampleRate } : null),
  };
}
