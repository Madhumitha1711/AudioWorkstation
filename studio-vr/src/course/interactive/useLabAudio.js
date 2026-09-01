import { useEffect, useRef } from "react";

/**
 * Minimal per-component Web Audio lifecycle: a lazily-created AudioContext,
 * a running list of nodes to tear down together, and unmount cleanup that
 * closes the context — same shape as SweetSpotLab's ensureAudioGraph /
 * unmount-cleanup pair, pulled out here since every "What Is Sound?" lab
 * (Frequency/Amplitude/Wavelength/Phase/Harmonics/Timbre) needs the
 * identical create/track/stop/close dance around one or two plain
 * oscillators. Deliberately not routed through spatialAudioEngine.js — each
 * of these is its own tiny, self-contained demo tone, not part of the
 * panorama's spatial mix.
 */
export function useLabAudio() {
  const ctxRef = useRef(null);
  const nodesRef = useRef([]);

  function getCtx() {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }

  function track(node) {
    nodesRef.current.push(node);
    return node;
  }

  function stopAll() {
    nodesRef.current.forEach((n) => {
      try {
        n.stop?.();
      } catch {
        /* already stopped */
      }
      try {
        n.disconnect?.();
      } catch {
        /* already disconnected */
      }
    });
    nodesRef.current = [];
  }

  useEffect(
    () => () => {
      stopAll();
      ctxRef.current?.close().catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { getCtx, track, stopAll };
}
