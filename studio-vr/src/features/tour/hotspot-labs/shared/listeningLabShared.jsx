// Shared UI primitives for the docked "Listening Lab" family of hotspot
// panels (SpeakerListeningLab.jsx, MixingConsoleLab.jsx, SoundCardLab.jsx —
// more may follow for other gear hotspots later). Pulled out of
// SpeakerListeningLab.jsx, which built these first, so every lab gets the
// exact same transport button, level meter, and "take-away" reveal
// interaction instead of each copy slowly drifting from the others.
//
// Pairs with the shared `.llab-*` styles in speakerListeningLab.css (see
// that file's header comment — those classes were deliberately generic, not
// speaker-specific, so every lab below imports that one stylesheet for the
// panel shell/tabs/card/seg/playbar/take-away rules and only adds its own
// CSS for whatever visual is unique to it).
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

// The take-away shows as a small persistent chip once revealed (constant,
// tiny height — added once, never changes) rather than an inline paragraph
// block: tapping the chip opens the full text as an absolutely-positioned
// overlay on top of the card (see .llab-aha-pop in speakerListeningLab.css),
// so reading it never grows the panel or shifts the footer — closing it
// just removes the overlay, the chip stays put underneath.
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

export function AudioNote({ children }) {
  return <div className="llab-audio-note mono">Audio placeholder — {children}</div>;
}
