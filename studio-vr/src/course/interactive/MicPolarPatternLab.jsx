import { useEffect, useRef, useState } from "react";
import "./labs.css";
import "./micLabs.css";
import {
  CYAN,
  POLAR_PATTERNS,
  POLAR_POSITIONS,
  SOURCES,
  polarAudioPath,
  polarDbOf,
  polarGainOf,
  polarLobePoints,
  polarTierOf,
} from "./micLabShared";

// Ported from design/mic-types-chapter.html's "Polar Patterns" lesson. The
// mic stays fixed at the diagram's center; the source can only be moved to
// one of 8 predefined compass positions (matching the rest of the app's
// hotspot/spot conventions, no free placement). Gain per position comes
// straight from each pattern's textbook polar equation in micLabShared.js.

const CX = 160;
const CY = 160;
const SPOT_R = 130;
const LOBE_MAX_R = 120;

function spotXY(deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + SPOT_R * Math.sin(rad), y: CY - SPOT_R * Math.cos(rad) };
}

function spotColor(gain) {
  const t = Math.max(0, Math.min(1, gain));
  const r = Math.round(58 + t * (84 - 58));
  const g = Math.round(58 + t * (214 - 58));
  const b = Math.round(66 + t * (224 - 66));
  return `rgb(${r},${g},${b})`;
}

function MicPolarPatternLab({ onInteract }) {
  const [pattern, setPattern] = useState("cardioid");
  const [angle, setAngle] = useState(0);
  const [sourceId, setSourceId] = useState(SOURCES[0].id);
  const [playing, setPlaying] = useState(false);
  const [clipMissing, setClipMissing] = useState(false);
  const audioRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const wasPlaying = playing;
    setClipMissing(false);
    audio.src = polarAudioPath(pattern, angle, sourceId);
    audio.load();
    if (wasPlaying) audio.play().catch(() => setClipMissing(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern, angle, sourceId]);

  function togglePlay() {
    markInteracted();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setClipMissing(true));
  }

  const lobePoints = polarLobePoints(pattern, CX, CY, LOBE_MAX_R);
  const lobeD = lobePoints.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ") + " Z";
  const connector = spotXY(angle);
  const position = POLAR_POSITIONS.find((p) => p.angle === angle);
  const db = polarDbOf(polarGainOf(pattern, angle));
  const tier = polarTierOf(db);

  return (
    <div className="lab">
      <p className="lab-intro">
        A polar pattern is a map of how sensitive a mic is to sound arriving from different
        directions — it determines what a mic captures and, just as importantly, what it rejects.
      </p>
      <p className="lab-intro">
        The mic stays fixed at the center below. Pick a pattern, then click one of the 8 positions
        to move the source — the lobe shows roughly how much of it gets picked up from there.
      </p>

      <div className="lab-toggle-row mic-type-tabs">
        {Object.entries(POLAR_PATTERNS).map(([id, p]) => (
          <button
            type="button"
            key={id}
            className={`lab-toggle${id === pattern ? " selected" : ""}`}
            onClick={() => {
              markInteracted();
              setPattern(id);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mic-polar-grid">
        <div>
          <div className="mic-polar-wrap">
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
              <path d={lobeD} className="mic-polar-lobe" style={{ fill: `${CYAN}29`, stroke: CYAN }} />
              <line
                x1={CX}
                y1={CY}
                x2={connector.x}
                y2={connector.y}
                className="mic-polar-connector"
              />
              <path
                d="M148,144 a12,13 0 1 1 24,0 v3 a12,13 0 1 1 -24,0 z"
                className="mic-polar-mic-body"
              />
              <rect x="153" y="167" width="14" height="30" rx="6" className="mic-polar-mic-body" />
              {POLAR_POSITIONS.map((pos) => {
                const { x, y } = spotXY(pos.angle);
                return (
                  <circle
                    key={pos.angle}
                    cx={x}
                    cy={y}
                    r="9"
                    className={`mic-polar-spot${pos.angle === angle ? " active" : ""}`}
                    style={{ fill: spotColor(polarGainOf(pattern, pos.angle)) }}
                    onClick={() => {
                      markInteracted();
                      setAngle(pos.angle);
                    }}
                  />
                );
              })}
            </svg>
          </div>
          <p className="lab-hint">
            Each dot is one of the 8 fixed positions the source can be placed at; its brightness
            shows roughly how much of it the selected pattern picks up from there.
          </p>
        </div>

        <div className="mic-panel">
          <div className="sound-lab-panel-head">
            <span className={`sound-lab-live-dot${playing ? " on" : ""}`} /> Source Position
          </div>
          <div className="mic-position-readout">
            <div className="mic-pr-name">
              {position?.name} · {angle}°
            </div>
            <span className={`mic-pr-tag tier-${tier.tier}`}>{tier.label.toUpperCase()}</span>
            <span className="mic-pr-db">
              {db <= -40 ? "Near-silent (null)" : `${db.toFixed(1)} dB relative to on-axis`}
            </span>
          </div>
          <div className="lab-control-label">Source</div>
          <div className="lab-toggle-row">
            {SOURCES.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`lab-toggle${s.id === sourceId ? " selected" : ""}`}
                onClick={() => {
                  markInteracted();
                  setSourceId(s.id);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="lab-actions">
            <button
              type="button"
              className={`lab-play-btn${playing ? " playing" : ""}`}
              onClick={togglePlay}
            >
              {playing ? "⏹ Stop" : "▶ Play"}
            </button>
            <span className="mic-now-playing">
              {POLAR_PATTERNS[pattern].label} · {position?.name} ·{" "}
              {SOURCES.find((s) => s.id === sourceId)?.label}
            </span>
          </div>
          {clipMissing && (
            <p className="lab-hint">
              Clip pending — real recordings for this pattern/position/source combo haven't been
              captured yet.
            </p>
          )}
          <p className="lab-hint mic-pattern-blurb">{POLAR_PATTERNS[pattern].blurb}</p>
          <audio
            ref={audioRef}
            preload="none"
            onEnded={() => setPlaying(false)}
            onError={() => {
              setClipMissing(true);
              setPlaying(false);
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default MicPolarPatternLab;
