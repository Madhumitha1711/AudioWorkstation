import { useEffect, useRef, useState } from "react";

export function useLoopPlayer(sources, initial, onSelect) {
  const [mode, setMode] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.src = sources[initial];
    audioRef.current = audio;
    return () => audio.pause();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectMode = (m) => {
    setMode(m);
    setRevealed(true);
    setPlaying(true);
    onSelect?.(m);
    const audio = audioRef.current;
    if (audio) {
      audio.src = sources[m];
      audio.play().catch(() => {});
    }
  };

  const togglePlay = () => {
    setRevealed(true);
    const audio = audioRef.current;
    setPlaying((prev) => {
      if (audio) {
        if (!prev) audio.play().catch(() => {});
        else audio.pause();
      }
      return !prev;
    });
  };

  return { mode, setMode, playing, setPlaying, revealed, setRevealed, audioRef, selectMode, togglePlay };
}

export function useRepeatPlayer(initialSrc) {
  const [autoRepeat, setAutoRepeat] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = initialSrc;
    audioRef.current = audio;
    return () => {
      audio.pause();
      clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const play = () => {
    setRevealed(true);
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  const stopAuto = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
    setAutoRepeat(false);
    audioRef.current?.pause();
  };

  const toggleAuto = () => {
    if (autoRepeat) return stopAuto();
    setAutoRepeat(true);
    play();
    timerRef.current = setInterval(play, 2000);
  };

  return { autoRepeat, revealed, setRevealed, audioRef, play, stopAuto, toggleAuto };
}
