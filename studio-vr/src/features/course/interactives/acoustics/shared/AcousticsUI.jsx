import { useEffect, useRef } from "react";

// Shared presentational pieces for the chapter 5 acoustics labs
// (StudioAcousticsLab, RoomTreatmentLab). Playback state lives in
// useRoomAudio.

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

/**
 * The mockup's `.player` row: play/stop, a progress track (click to seek),
 * time, and an optional A/B button that swaps to a reference room at the
 * same position. Until the recording exists it renders the mockup's dashed
 * "Audio coming soon" placeholder.
 */
export function RoomPlayer({ id, label, audio, compare }) {
  const status = audio.status[id];
  const ready = status === "ready";
  const p = audio.playing;
  const own = !!p && !p.mystery;
  const comparing = own && !!compare && p.id === compare.id && p.fromCompare === id;
  const isPlaying = own && ((p.id === id && !p.fromCompare) || comparing);
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
      <div className="acl-player is-placeholder">
        <button type="button" className="acl-play" aria-label={`Play ${label}`} disabled>
          <PlayIcon />
        </button>
        <div className="acl-track" />
        <span className="acl-time">{status === "loading" ? "Loading…" : "Audio coming soon"}</span>
      </div>
    );
  }

  const toggle = () => (isPlaying ? audio.stop() : audio.play(id));

  return (
    <div className={`acl-player${isPlaying ? " is-playing" : ""}`}>
      <button type="button" className="acl-play" aria-label={`${isPlaying ? "Stop" : "Play"} ${label}`} aria-pressed={isPlaying} onClick={toggle}>
        {isPlaying ? <StopIcon /> : <PlayIcon />}
      </button>
      <div
        className="acl-track"
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
        <span className="acl-track-fill" ref={fillRef} />
      </div>
      <span className="acl-time" ref={timeRef} />
      {compare && audio.status[compare.id] === "ready" && (
        <button
          type="button"
          className={`acl-ab${comparing ? " is-on" : ""}`}
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

/** "Kept the same every time" strip from the mockups. */
export function SetupBar({ keptSame }) {
  return (
    <div className="acl-setup">
      <b>Kept the same every time:</b> {keptSame}
    </div>
  );
}

/** "Why this matters" list + takeaway, straight from the mockups. */
export function WhyItMatters({ points, takeaway }) {
  return (
    <section className="acl-why">
      <h3>Why this matters</h3>
      <ul>
        {points.map(([b, rest]) => (
          <li key={b}>
            <b>{b}</b> {rest}
          </li>
        ))}
      </ul>
      <div className="acl-takeaway">
        <b>Takeaway:</b> {takeaway}
      </div>
    </section>
  );
}
