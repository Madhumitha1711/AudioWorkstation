import { useEffect, useRef } from "react";
import { createAudioContext } from "../../../../audio/createAudioContext";

export function useLabAudio() {
  const ctxRef = useRef(null);
  const nodesRef = useRef([]);

  function getCtx() {
    if (!ctxRef.current) {
      ctxRef.current = createAudioContext();
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
      }
      try {
        n.disconnect?.();
      } catch {
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
