import { useState } from "react";

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" />
      <rect x="14" y="5" width="4" height="14" />
    </svg>
  );
}

export function LevelMeter({ playing }) {
  return (
    <div className={"llab-levels" + (playing ? " playing" : "")}>
      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}

export function AhaBox({ show, children }) {
  const [open, setOpen] = useState(false);
  if (!show) return null;
  return (
    <>
      <button
        type="button"
        className="llab-aha-chip"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        💡 The take-away
      </button>
      {open && (
        <div className="llab-aha-pop" role="note">
          <button
            type="button"
            className="llab-aha-pop__close"
            onClick={() => setOpen(false)}
            aria-label="Close take-away"
          >
            ×
          </button>
          <div className="llab-aha-pop__label">The take-away</div>
          <p>{children}</p>
        </div>
      )}
    </>
  );
}

export function SegControl({ options, value, onSelect, label }) {
  return (
    <div className="llab-seg" role="group" aria-label={label}>
      {options.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          className={"llab-seg__btn" + (value === key ? " active" : "")}
          onClick={() => onSelect(key)}
        >
          <Icon />
          {label}
        </button>
      ))}
    </div>
  );
}

export function PlayBar({ playing, onToggle }) {
  return (
    <div className="llab-playbar">
      <button className="llab-play" onClick={onToggle} type="button" aria-label={playing ? "Pause" : "Play"}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <LevelMeter playing={playing} />
    </div>
  );
}

export function LineIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {children}
    </svg>
  );
}
