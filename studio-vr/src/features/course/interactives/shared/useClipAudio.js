import { useCallback, useEffect, useRef, useState } from "react";

export function useClipAudio({ items, onFirstPlay }) {
  const [status, setStatus] = useState(() =>
    Object.fromEntries(items.map((it) => [it.id, it.src ? "loading" : "missing"])),
  );
  const [playing, setPlaying] = useState(null);
  const audiosRef = useRef({});
  const currentRef = useRef(null);
  const itemsRef = useRef(items);
  const firstPlayRef = useRef(onFirstPlay);
  const firedRef = useRef(false);

  useEffect(() => {
    firstPlayRef.current = onFirstPlay;
  }, [onFirstPlay]);

  useEffect(() => {
    const audios = {};
    const mark = (id, s) => setStatus((prev) => (prev[id] === s ? prev : { ...prev, [id]: s }));
    itemsRef.current.forEach((it) => {
      if (!it.src) return;
      const a = new Audio();
      a.preload = "metadata";
      a.addEventListener("loadedmetadata", () => mark(it.id, "ready"));
      a.addEventListener("error", () => mark(it.id, "missing"));
      a.addEventListener("ended", () => {
        if (currentRef.current === it.id) {
          currentRef.current = null;
          setPlaying(null);
        }
      });
      a.src = it.src;
      audios[it.id] = a;
    });
    audiosRef.current = audios;
    return () => {
      Object.values(audios).forEach((a) => {
        a.pause();
        a.removeAttribute("src");
        a.load();
      });
    };
  }, []);

  const stop = useCallback(() => {
    const cur = audiosRef.current[currentRef.current];
    if (cur) cur.pause();
    currentRef.current = null;
    setPlaying(null);
  }, []);

  const play = useCallback((id, opts = {}) => {
    const a = audiosRef.current[id];
    if (!a || !Number.isFinite(a.duration)) return;
    const cur = audiosRef.current[currentRef.current];
    let t = 0;
    if (opts.keepPosition && cur) t = cur.currentTime;
    else if (typeof opts.at === "number") t = opts.at * a.duration;
    if (t >= a.duration - 0.05) t = 0;
    if (cur && cur !== a) cur.pause();
    a.currentTime = t;
    a.play().catch(() => {});
    currentRef.current = id;
    setPlaying({ id, fromCompare: opts.fromCompare || null });
    if (!firedRef.current) {
      firedRef.current = true;
      firstPlayRef.current?.();
    }
  }, []);

  const getProgress = useCallback((id) => {
    if (currentRef.current !== id) return null;
    const a = audiosRef.current[id];
    return a && a.duration ? a.currentTime / a.duration : 0;
  }, []);

  const getDuration = useCallback((id) => audiosRef.current[id]?.duration || 0, []);

  return {
    status,
    playing,
    play,
    stop,
    getProgress,
    getDuration,
  };
}
