import { useCallback, useState } from "react";
import "./FlipCard.css";

// FlipCard — a card with a front and a back face that turns over in 3D when
// clicked (or Enter / Space when focused). Generic: it owns only the flip
// (perspective, rotation, lift, focus ring, reduced-motion fallback) and the
// surface (border / radius / panel background); the caller supplies both
// faces as children via `front` and `back`.
//
//   <FlipCard
//     front={<><img … /><h4>Genelec 8340A</h4></>}
//     back={<dl>…</dl>}
//     label="Genelec 8340A"          // accessible name for the toggle
//   />
//
// Sizing: both faces share one grid cell, so the card is always as tall as
// its taller face — no fixed height, nothing clipped, and cards in a CSS
// grid row stay level. Faces are flex columns; let a front image grow
// (`flex: 1`) to fill any spare height.
//
// State: uncontrolled by default (`defaultFlipped`); pass `flipped` +
// `onFlip(next)` to control it (e.g. "only one card open at a time").
//
// Accessibility: the card is a toggle button (role="button", aria-pressed).
// The hidden face is `inert` + aria-hidden so screen readers and Tab only
// reach what's visible. Don't put links/buttons inside a face — a click
// anywhere on the card flips it.
//
// Re-skin via tokens on `className` (don't restyle .ui-flip__* rules):
//   --flip-radius, --flip-bg, --flip-border, --flip-accent, --flip-duration

const FlipIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
    <path d="M3 21v-5h5" />
  </svg>
);

export function FlipCard({
  front,
  back,
  label,
  flipped: flippedProp,
  defaultFlipped = false,
  onFlip,
  hint = true,
  className = "",
  ...rest
}) {
  const [flippedState, setFlippedState] = useState(defaultFlipped);
  // Count of user flips — drives data-turn so the lift animation replays
  // on every turn but not on mount (or when a controlled parent flips it).
  const [turns, setTurns] = useState(0);
  const controlled = flippedProp !== undefined;
  const flipped = controlled ? flippedProp : flippedState;

  const toggle = useCallback(() => {
    const next = !flipped;
    if (!controlled) setFlippedState(next);
    setTurns((n) => n + 1);
    onFlip?.(next);
  }, [flipped, controlled, onFlip]);

  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div
      {...rest}
      className={`ui-flip${flipped ? " is-flipped" : ""} ${className}`.trim()}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      data-turn={turns ? (turns % 2 ? "a" : "b") : undefined}
      aria-label={label ? `${label}: ${flipped ? "showing details" : "show details"}` : undefined}
      onClick={toggle}
      onKeyDown={onKeyDown}
    >
      <div className="ui-flip__inner">
        <div className="ui-flip__face ui-flip__face--front" aria-hidden={flipped} inert={flipped}>
          {front}
          {hint && (
            <span className="ui-flip__hint">
              <FlipIcon />
            </span>
          )}
        </div>
        <div className="ui-flip__face ui-flip__face--back" aria-hidden={!flipped} inert={!flipped}>
          {back}
          {hint && (
            <span className="ui-flip__hint">
              <FlipIcon />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlipCard;
