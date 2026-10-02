import { useEffect, useRef } from "react";

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 4.5v15l13-7.5z" />
  </svg>
);
const StopIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);

function fmt(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function ClipPlayer({ id, label, audio, compare }) {
  const status = audio.status[id];
  const ready = status === "ready";
  const p = audio.playing;
  const comparing = !!p && !!compare && p.id === compare.id && p.fromCompare === id;
  const isPlaying = !!p && ((p.id === id && !p.fromCompare) || comparing);
  const progressId = comparing ? compare.id : id;
  const fillRef = useRef(null);
  const timeRef = useRef(null);

  useEffect(() => {
    if (!ready) return undefined;
    const dur = audio.getDuration(progressId);
    if (!isPlaying) {
      if (fillRef.current) fillRef.current.style.width = "0%";
      if (timeRef.current) timeRef.current.textContent = fmt(audio.getDuration(id));
      return undefined;
    }
    let raf;
    const tick = () => {
      const prog = audio.getProgress(progressId);
      if (prog != null) {
        if (fillRef.current) fillRef.current.style.width = `${prog * 100}%`;
        if (timeRef.current) timeRef.current.textContent = `${fmt(prog * dur)} / ${fmt(dur)}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, isPlaying, id, progressId, audio]);

  if (!ready) {
    return (
      <div className="clip-player is-placeholder">
        <button type="button" className="clip-play" aria-label={`Play ${label}`} disabled>
          <PlayIcon />
        </button>
        <div className="clip-track" />
        <span className="clip-time">{status === "loading" ? "Loading…" : "Audio coming soon"}</span>
      </div>
    );
  }

  const toggle = () => (isPlaying ? audio.stop() : audio.play(id));

  return (
    <div className={`clip-player${isPlaying ? " is-playing" : ""}`}>
      <button type="button" className="clip-play" aria-label={`${isPlaying ? "Stop" : "Play"} ${label}`} aria-pressed={isPlaying} onClick={toggle}>
        {isPlaying ? <StopIcon /> : <PlayIcon />}
      </button>
      <div
        className="clip-track"
        role="button"
        tabIndex={0}
        aria-label={`Seek ${label}`}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          audio.play(id, { at: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <span className="clip-track-fill" ref={fillRef} />
      </div>
      <span className="clip-time" ref={timeRef} />
      {compare && audio.status[compare.id] === "ready" && (
        <button
          type="button"
          className={`clip-ab${comparing ? " is-on" : ""}`}
          aria-pressed={comparing}
          title={`Flip to ${compare.label} at the same spot`}
          onClick={() => {
            if (comparing) audio.play(id, { keepPosition: true });
            else audio.play(compare.id, { keepPosition: p?.id === id, fromCompare: id });
          }}
        >
          A/B <span>vs {compare.short}</span>
        </button>
      )}
    </div>
  );
}

export default ClipPlayer;
