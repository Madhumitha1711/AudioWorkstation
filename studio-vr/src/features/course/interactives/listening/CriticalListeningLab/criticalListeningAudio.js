// Audio engine for CriticalListeningLab. Plain module, no React — the lab
// component owns one instance and calls close() on unmount. Deliberately
// its own AudioContext rather than going through spatialAudioEngine.js,
// same reasoning as useLabAudio: this is a self-contained demo, not part of
// the panorama's spatial mix.
//
// NO PROCESSING. Every problem has two real recordings (see
// clipPaths() in criticalListeningData.js):
//   A = the clean take, B = the same material with the problem in it.
// Both are played exactly as recorded. The engine only decodes them, starts
// them together and crossfades between them:
//
//   srcA ─► gA ─┐
//               ├─► analyser ─► destination
//   srcB ─► gB ─┘      └─► splitter ─► anL / anR (meters)
//
// The analysers only *measure* the output for the spectrum / L/R meters;
// nothing in the graph changes the sound.
//
// A/B switching only crossfades gA/gB, so both recordings stay
// sample-aligned and the student hears the difference instantly with no
// restart — that instant flip is the whole point of the exercise, so don't
// change A/B to swap buffers or restart the sources. For this to work the
// clean and problem files of a pair should be the same length and start on
// the same sample; if their lengths differ, both loop at the shorter one.

export function createListeningEngine() {
  const E = {
    ctx: null, an: null, anL: null, anR: null,
    srcA: null, srcB: null, gA: null, gB: null,
    side: "A", gen: 0, readyPromise: null,
    // Decoded recordings, keyed by URL. Promise<AudioBuffer|null> so two
    // quick requests for the same file share one fetch. null = missing.
    clips: new Map(),
  };

  // Lazily builds the context and analysers. Resolves false if close() ran
  // while it was waiting (unmount) so the caller knows not to start().
  // close() resets everything, so the same engine can be reopened
  // afterwards — needed for React StrictMode's dev-only remount.
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
      })();
    }
    await E.readyPromise;
    if (gen !== E.gen) return false;
    if (E.ctx.state === "suspended") await E.ctx.resume();
    return gen === E.gen;
  }

  // Fetch + decode one recording. Resolves null when the file isn't there
  // yet (404, or Vite's SPA fallback serving index.html, which fails to
  // decode) so the lab can show "recording coming soon" instead of erroring.
  function loadClip(url) {
    if (!E.clips.has(url)) {
      E.clips.set(
        url,
        (async () => {
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const bytes = await res.arrayBuffer();
            return await E.ctx.decodeAudioData(bytes);
          } catch {
            return null;
          }
        })(),
      );
    }
    return E.clips.get(url);
  }

  // Decode a problem's A/B pair. Must be called after ensure() resolved.
  // Returns { a, b } AudioBuffers, or null if either recording is missing
  // (a failed load is forgotten so a later retry fetches it again).
  async function loadPair(clips) {
    const [a, b] = await Promise.all([loadClip(clips.clean), loadClip(clips.problem)]);
    if (!a) E.clips.delete(clips.clean);
    if (!b) E.clips.delete(clips.problem);
    return a && b ? { a, b } : null;
  }

  function stop() {
    if (!E.srcA) return;
    const { srcA, srcB, gA, gB } = E;
    const t = E.ctx.currentTime;
    // Short fade then hard stop, so stopping never clicks.
    gA.gain.setTargetAtTime(0, t, 0.01);
    gB.gain.setTargetAtTime(0, t, 0.01);
    setTimeout(() => {
      [srcA, srcB].forEach((s) => {
        try { s.stop(); } catch { /* already stopped */ }
      });
      gA.disconnect();
      gB.disconnect();
    }, 80);
    E.srcA = E.srcB = null;
  }

  // Start a decoded pair (from loadPair) looping, sample-aligned.
  function start(pair) {
    stop();
    if (!E.ctx || !pair) return;
    const c = E.ctx;
    const loopEnd = Math.min(pair.a.duration, pair.b.duration);
    const mk = (buf, gainVal) => {
      const s = c.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.loopStart = 0;
      s.loopEnd = loopEnd;
      const g = c.createGain();
      g.gain.value = gainVal;
      s.connect(g).connect(E.an);
      return [s, g];
    };
    const [srcA, gA] = mk(pair.a, E.side === "A" ? 1 : 0);
    const [srcB, gB] = mk(pair.b, E.side === "B" ? 1 : 0);
    const t = c.currentTime + 0.02;
    srcA.start(t);
    srcB.start(t);
    Object.assign(E, { srcA, srcB, gA, gB });
  }

  function setSide(side) {
    E.side = side;
    if (E.srcA) {
      const t = E.ctx.currentTime;
      E.gA.gain.setTargetAtTime(side === "A" ? 1 : 0, t, 0.008);
      E.gB.gain.setTargetAtTime(side === "B" ? 1 : 0, t, 0.008);
    }
  }

  function close() {
    E.gen++;
    [E.srcA, E.srcB].forEach((s) => {
      try { s?.stop(); } catch { /* already stopped */ }
    });
    E.ctx?.close().catch(() => {});
    // Decoded buffers belong to the closed context's decode but are plain
    // data; drop them anyway so a remount starts clean.
    Object.assign(E, {
      ctx: null, an: null, anL: null, anR: null, readyPromise: null,
      srcA: null, srcB: null, clips: new Map(),
    });
  }

  return {
    ensure,
    loadPair,
    start,
    stop,
    setSide,
    close,
    isPlaying: () => !!E.srcA,
    // For the spectrum/meter canvas: null until audio has been started once.
    analysers: () => (E.ctx ? { an: E.an, anL: E.anL, anR: E.anR, sampleRate: E.ctx.sampleRate } : null),
  };
}
