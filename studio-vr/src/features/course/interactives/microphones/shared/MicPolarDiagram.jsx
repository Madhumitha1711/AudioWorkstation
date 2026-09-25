import { POLAR_POSITIONS, polarGainOf, polarLobePoints } from "./micLabShared";

// Pulled out of MicPolarPatternLab.jsx so the same compass/lobe diagram
// can also render, statically, inside MicPolarCompareLab's three
// columns — same reuse pattern as MicPortrait being shared between
// MicTypeLab and MicTypeCompareLab.

const CX = 160;
const CY = 160;
const SPOT_R = 130;
const LOBE_MAX_R = 120;

function spotXY(deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + SPOT_R * Math.sin(rad), y: CY - SPOT_R * Math.cos(rad) };
}

// Dot fill = the pattern's gain at that spot, blended from the "dead"
// spot tone (0 = null) to the lobe color (1 = on-axis). Done with CSS
// color-mix() against theme tokens (--mic-spot-off / --mic-lobe in
// micLabs.css) instead of interpolating fixed RGB values in JS, so the
// dots re-tint with the light/dark theme without a re-render. The dark
// tokens equal the old hardcoded endpoints, so dark mode is unchanged.
function spotMix(gain) {
  const t = Math.max(0, Math.min(1, gain));
  return `${Math.round(t * 100)}%`;
}

// `interactive` controls whether the 8 fixed source positions render as
// clickable dots with a connector line to the selected one (Browse mode)
// or the lobe shape renders alone (Compare mode — three patterns side by
// side is already a lot to take in without a highlighted position on
// top of each one).
function MicPolarDiagram({ pattern, angle = 0, interactive = false, onSelectAngle }) {
  const lobePoints = polarLobePoints(pattern, CX, CY, LOBE_MAX_R);
  const lobeD = lobePoints.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ") + " Z";
  const connector = spotXY(angle);

  return (
    <svg viewBox="0 0 320 320">
      <circle cx={CX} cy={CY} r="120" className="mic-polar-ring" />
      <circle cx={CX} cy={CY} r="80" className="mic-polar-ring" />
      <circle cx={CX} cy={CY} r="40" className="mic-polar-ring" />
      <line x1={CX} y1="20" x2={CX} y2="300" className="mic-polar-gridline" />
      <line x1="20" y1={CY} x2="300" y2={CY} className="mic-polar-gridline" />
      <text x={CX} y="13" textAnchor="middle" className="mic-compass-label">
        FRONT
      </text>
      <text x={CX} y="313" textAnchor="middle" className="mic-compass-label">
        BACK
      </text>
      <text x="290" y="142" textAnchor="middle" className="mic-compass-label">
        RIGHT
      </text>
      <text x="30" y="142" textAnchor="middle" className="mic-compass-label">
        LEFT
      </text>
      <path d={lobeD} className="mic-polar-lobe" />
      {interactive && (
        <line x1={CX} y1={CY} x2={connector.x} y2={connector.y} className="mic-polar-connector" />
      )}
      <path
        d="M148,144 a12,13 0 1 1 24,0 v3 a12,13 0 1 1 -24,0 z"
        className="mic-polar-mic-body"
      />
      <rect x="153" y="167" width="14" height="30" rx="6" className="mic-polar-mic-body" />
      {interactive &&
        POLAR_POSITIONS.map((pos) => {
          const { x, y } = spotXY(pos.angle);
          return (
            <circle
              key={pos.angle}
              cx={x}
              cy={y}
              r="9"
              className={`mic-polar-spot${pos.angle === angle ? " active" : ""}`}
              style={{ "--mic-spot-mix": spotMix(polarGainOf(pattern, pos.angle)) }}
              onClick={() => onSelectAngle?.(pos.angle)}
            />
          );
        })}
    </svg>
  );
}

export default MicPolarDiagram;
