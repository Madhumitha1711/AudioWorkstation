import { useCallback, useEffect, useRef, useState } from "react";
import "./FlipCard.css";

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
  const [turns, setTurns] = useState(0);
  const [turning, setTurning] = useState(false);
  const [tiltOff, setTiltOff] = useState(false);
  const fallbackRef = useRef(0);
  useEffect(() => () => clearTimeout(fallbackRef.current), []);
  const controlled = flippedProp !== undefined;
  const flipped = controlled ? flippedProp : flippedState;

  const toggle = useCallback(() => {
    const next = !flipped;
    if (!controlled) setFlippedState(next);
    setTurns((n) => n + 1);
    setTurning(true);
    setTiltOff(true);
    clearTimeout(fallbackRef.current);
    fallbackRef.current = setTimeout(() => setTurning(false), 1200);
    onFlip?.(next);
  }, [flipped, controlled, onFlip]);

  const onClick = (e) => {
    if (e.detail > 1) return;
    toggle();
  };

  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      if (e.repeat) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      toggle();
    }
  };

  return (
    <div
      {...rest}
      className={`ui-flip${flipped ? " is-flipped" : ""}${turning ? " is-turning" : ""}${
        tiltOff ? " no-tilt" : ""
      } ${className}`.trim()}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      data-turn={turns ? (turns % 2 ? "a" : "b") : undefined}
      aria-label={label ? `${label}: ${flipped ? "showing details" : "show details"}` : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onPointerLeave={() => setTiltOff(false)}
    >
      <div
        className="ui-flip__inner"
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === "transform") setTurning(false);
        }}
      >
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
