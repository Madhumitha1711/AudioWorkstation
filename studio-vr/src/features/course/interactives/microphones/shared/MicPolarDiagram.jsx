import { useEffect, useRef, useState } from "react";
import { POLAR_POSITIONS, polarGainOf } from "./micLabShared";

const CX = 160;
const CY = 160;
const SPOT_R = 136;
const LOBE_MAX_R = 116;
const STEPS = 96;
const STEP_DEG = 360 / STEPS;
const MORPH_MS = 440;
const DB_RINGS = [0, -3, -9];
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);

const xy = (deg, r) => {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
};
const sample = (pattern) => Array.from({ length: STEPS + 1 }, (_, i) => Math.max(0, polarGainOf(pattern, i * STEP_DEG)));
const gainAt = (gains, deg) => gains[Math.round((((deg % 360) + 360) % 360) / STEP_DEG)];
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function useMorphedGains(pattern) {
  const [gains, setGains] = useState(() => sample(pattern));
  const current = useRef(gains);
  const frame = useRef(0);

  useEffect(() => {
    const from = current.current;
    const to = sample(pattern);
    cancelAnimationFrame(frame.current);
    if (reducedMotion()) {
      current.current = to;
      setGains(to);
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = easeOutExpo(Math.min(1, (now - start) / MORPH_MS));
      const next = to.map((g, i) => from[i] + (g - from[i]) * t);
      current.current = next;
      setGains(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [pattern]);

  return gains;
}

function MicPolarDiagram({ pattern, angle = 0, onSelectAngle }) {
  const gains = useMorphedGains(pattern);
  const lobeD =
    gains
      .map((g, i) => {
        const { x, y } = xy(i * STEP_DEG, LOBE_MAX_R * g);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z";
  const source = xy(angle, SPOT_R);
  const pickup = xy(angle, LOBE_MAX_R * gainAt(gains, angle));
  const isFigure8 = pattern === "bidirectional";

  return (
    <svg viewBox="0 0 320 320" className="mic-polar">
      <defs>
        <radialGradient id="mic-polar-lobe-fill" cx={CX} cy={CY} r={LOBE_MAX_R} gradientUnits="userSpaceOnUse">
          <stop offset="0" className="mic-polar-lobe-stop-in" />
          <stop offset="1" className="mic-polar-lobe-stop-out" />
        </radialGradient>
      </defs>

      {DB_RINGS.map((db) => (
        <circle key={db} cx={CX} cy={CY} r={LOBE_MAX_R * Math.pow(10, db / 20)} className="mic-polar-ring" />
      ))}
      <line x1={CX} y1={CY - LOBE_MAX_R} x2={CX} y2={CY + LOBE_MAX_R} className="mic-polar-gridline" />
      <line x1={CX - LOBE_MAX_R} y1={CY} x2={CX + LOBE_MAX_R} y2={CY} className="mic-polar-gridline" />
      {TICKS.map((deg) => {
        const a = xy(deg, LOBE_MAX_R);
        const b = xy(deg, LOBE_MAX_R + (deg % 45 === 0 ? 6 : 3));
        return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="mic-polar-tick" />;
      })}

      <path d={lobeD} className="mic-polar-lobe" />

      <g className={`mic-polar-polarity${isFigure8 ? " is-on" : ""}`} aria-hidden="true">
        <text x={CX} y={CY - 62} textAnchor="middle" dominantBaseline="central">+</text>
        <text x={CX} y={CY + 62} textAnchor="middle" dominantBaseline="central">−</text>
      </g>

      <text x={CX} y="10" textAnchor="middle" className="mic-compass-label">FRONT</text>
      <text x={CX} y="318" textAnchor="middle" className="mic-compass-label">BACK</text>
      <text x="316" y={CY - 14} textAnchor="end" className="mic-compass-label">RIGHT</text>
      <text x="4" y={CY - 14} textAnchor="start" className="mic-compass-label">LEFT</text>

      <line x1={CX} y1={CY} x2={source.x} y2={source.y} className="mic-polar-connector" />

      <path d="M148,144 a12,13 0 1 1 24,0 v3 a12,13 0 1 1 -24,0 z" className="mic-polar-mic-body" />
      <rect x="153" y="167" width="14" height="30" rx="6" className="mic-polar-mic-body" />

      <circle cx={pickup.x} cy={pickup.y} r="4" className="mic-polar-pickup" />

      {POLAR_POSITIONS.map((pos, i) => {
        const { x, y } = xy(pos.angle, SPOT_R);
        const active = pos.angle === angle;
        const select = () => onSelectAngle?.(pos.angle);
        return (
          <g
            key={pos.angle}
            className={`mic-polar-spot${active ? " is-active" : ""}`}
            style={{ "--mic-spot-mix": `${Math.round(Math.min(1, gainAt(gains, pos.angle)) * 100)}%`, "--mic-spot-i": i }}
            role="button"
            tabIndex={0}
            aria-label={`Move the source to ${pos.name} (${pos.angle}°)`}
            aria-pressed={active}
            onClick={select}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select();
              }
            }}
          >
            <circle key={pattern} cx={x} cy={y} r="9" className="mic-polar-spot-pulse" />
            <circle cx={x} cy={y} r="15" className="mic-polar-spot-halo" />
            <circle cx={x} cy={y} r="13.5" className="mic-polar-spot-ring" />
            <circle cx={x} cy={y} r="9" className="mic-polar-spot-dot" />
          </g>
        );
      })}
    </svg>
  );
}

export default MicPolarDiagram;
