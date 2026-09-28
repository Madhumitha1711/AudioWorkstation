import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Clip playback for the "listen tabs" labs (acoustics StudioAcousticsLab /
 * RoomTreatmentLab, microphones MicTypeLab). One <audio> element per clip,
 * pointed at that item's `src` (a recording under public/audio/…). No
 * processing — the recordings are played as-is.
 *
 * Each item's status is "loading" → "ready" (metadata loaded) or "missing"
 * (no src, or the file failed to load — Vite's SPA fallback serves
 * index.html for missing files, which also lands here). Missing items show
 * ClipPlayer's "Audio coming soon" placeholder.
 *
 * Only one clip plays at a time. play(id, { keepPosition: true }) starts
 * `id` at the current clip's position, so A/B switching is a direct
 * comparison rather than a restart. Progress is a getter (getProgress) so
 * players can animate with rAF without re-rendering the lab every frame.
 */
export function useClipAudio({ items, onFirstPlay }) {
  const [status, setStatus] = useState(() =>
    Object.fromEntries(items.map((it) => [it.id, it.src ? "loading" : "missing"])),
  );
  const [playing, setPlaying] = useState(null); // { id, fromCompare }
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

  /**
   * opts.at: 0..1 start position; opts.keepPosition: continue from the
   * current clip's position (A/B); opts.fromCompare: the card whose A/B button asked
   * for this clip, so that card keeps showing the playhead.
   */
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
