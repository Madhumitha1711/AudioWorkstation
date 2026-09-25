import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import "../shared/micLabs.css";
import {
  POLAR_PATTERNS,
  POLAR_POSITIONS,
  SOURCES,
  polarAudioPath,
  polarDbOf,
  polarGainOf,
  polarTierOf,
} from "../shared/micLabShared";
import MicPolarDiagram from "../shared/MicPolarDiagram";

// Ported from design/mic-types-chapter.html's "Polar Patterns" lesson,
// then trimmed to image + interaction only (no lead-in prose, no per-dot
// hint, no per-pattern blurb under the Source panel) to match mic-type-
// lab's browse-lab convention — that explanatory text lives in the lesson
// content around this activity instead, and (for the pattern blurb) in
// mic-polar-compare-lab's own copy. The mic stays fixed at the diagram's
// center; the source can only be moved to one of 8 predefined compass
// positions (matching the rest of the app's hotspot/spot conventions, no
// free placement). Gain per position comes straight from each pattern's
// textbook polar equation in micLabShared.js. Pattern picker uses the
// same segmented .mic-room-toggle pill style as MicTypeLab instead of its
// own boxed .lab-toggle tabs, and the compass/lobe diagram is
// MicPolarDiagram (factored out so MicPolarCompareLab, the sibling
// comparison lab, can render the same shape statically).

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

  const position = POLAR_POSITIONS.find((p) => p.angle === angle);
  const db = polarDbOf(polarGainOf(pattern, angle));
  const tier = polarTierOf(db);

  return (
    <div className="lab">
      <div className="mic-room-toggle" role="group" aria-label="Choose a polar pattern">
        {Object.entries(POLAR_PATTERNS).map(([id, p]) => (
          <button
            type="button"
            key={id}
            className={`mic-room-toggle__opt${id === pattern ? " current" : ""}`}
            onClick={() => {
              markInteracted();
              setPattern(id);
            }}
            aria-pressed={id === pattern}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mic-polar-grid">
        <div>
          <div className="mic-polar-wrap">
            <MicPolarDiagram
              pattern={pattern}
              angle={angle}
              interactive
              onSelectAngle={(a) => {
                markInteracted();
                setAngle(a);
              }}
            />
          </div>
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
