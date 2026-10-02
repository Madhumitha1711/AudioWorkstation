export function createListeningEngine() {
  const E = {
    ctx: null,
    srcA: null, srcB: null, gA: null, gB: null,
    side: "A", gen: 0, readyPromise: null,
    clips: new Map(),
  };

  async function ensure() {
    const gen = E.gen;
    if (!E.readyPromise) {
      E.readyPromise = (async () => {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        E.ctx = new Ctx();
      })();
    }
    await E.readyPromise;
    if (gen !== E.gen) return false;
    if (E.ctx.state === "suspended") await E.ctx.resume();
    return gen === E.gen;
  }

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
    gA.gain.setTargetAtTime(0, t, 0.01);
    gB.gain.setTargetAtTime(0, t, 0.01);
    setTimeout(() => {
      [srcA, srcB].forEach((s) => {
        try { s.stop(); } catch {  }
      });
      gA.disconnect();
      gB.disconnect();
    }, 80);
    E.srcA = E.srcB = null;
  }

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
      s.connect(g).connect(c.destination);
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
      try { s?.stop(); } catch {  }
    });
    E.ctx?.close().catch(() => { });
    Object.assign(E, {
      ctx: null, readyPromise: null,
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
  };
}
