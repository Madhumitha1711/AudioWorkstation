import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import "../shared/micLabs.css";
import ListenTabs, { ClipPlayer } from "../../shared/ListenTabs";
import { useClipAudio } from "../../shared/useClipAudio";
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

// "Polar Patterns" (chapter 6, courseData.js TOPICS[id="mic-stand"]). Same
// horizontal layout as MicTypeLab (shared ListenTabs): one standard tab per
// pattern (omni / cardioid / figure-8). The image slot on the left is the
// interactive polar diagram — the mic stays fixed in the centre and the
// student moves the source to one of 8 compass positions by clicking (or
// tabbing to) a dot. The Listen card on the right shows that position's
// pickup (level from the pattern's textbook polar equation in
// micLabShared.js), a source picker and the player; the pattern's
// description sits underneath.
//
// Playback: every pattern × position × source clip is its own
// useClipAudio item (polarAudioPath → public/audio/mic-types/). Changing
// pattern, position or source while a clip plays carries on at the same
// point in the new clip; if that clip doesn't exist yet it just stops.
//
// onInteract fires on the student's first play, tab, position or source.

const PATTERN_IDS = Object.keys(POLAR_PATTERNS);
const clipId = (pattern, angle, source) => `${pattern}-${angle}-${source}`;
const CLIPS = PATTERN_IDS.flatMap((p) =>
  POLAR_POSITIONS.flatMap((pos) =>
    SOURCES.map((s) => ({ id: clipId(p, pos.angle, s.id), src: polarAudioPath(p, pos.angle, s.id) })),
  ),
);
const ITEMS = PATTERN_IDS.map((id) => ({
  id,
  tab: POLAR_PATTERNS[id].label,
  title: POLAR_PATTERNS[id].label,
  points: POLAR_PATTERNS[id].points,
}));

function MicPolarPatternLab({ onInteract }) {
  const [pattern, setPattern] = useState(PATTERN_IDS[0]);
  const [angle, setAngle] = useState(0);
  const [sourceId, setSourceId] = useState(SOURCES[0].id);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  const audio = useClipAudio({ items: CLIPS, onFirstPlay: markInteracted });

  // Switch clip, keeping playback going at the same spot when possible.
  function switchTo(next) {
    markInteracted();
    const p = next.pattern ?? pattern;
    const a = next.angle ?? angle;
    const s = next.source ?? sourceId;
    const id = clipId(p, a, s);
    if (audio.playing) {
      if (audio.status[id] === "ready") audio.play(id, { keepPosition: true });
      else audio.stop();
    }
    setPattern(p);
    setAngle(a);
    setSourceId(s);
  }

  return (
    <div className="lab mpl">
      <ListenTabs
        items={ITEMS}
        value={pattern}
        onChange={(id) => switchTo({ pattern: id })}
        ariaLabel="Polar patterns"
        idPrefix="mpl-pattern"
        renderMedia={(item) => (
          <div className="mic-polar-wrap">
            <MicPolarDiagram pattern={item.id} angle={angle} onSelectAngle={(a) => switchTo({ angle: a })} />
          </div>
        )}
        renderListen={(item) => {
          const position = POLAR_POSITIONS.find((p) => p.angle === angle);
          const db = polarDbOf(polarGainOf(item.id, angle));
          const tier = polarTierOf(db);
          return (
            <>
              <div className="ltb-listen-label">Listen</div>
              <p className="ltb-listen-hint">Click a dot on the diagram to move the source around the mic.</p>
              <div className="mic-position-readout">
                <div className="mic-pr-name">
                  {position?.name} · {angle}°
                </div>
                <span className={`mic-pr-tag tier-${tier.tier}`}>{tier.label}</span>
                <span className="mic-pr-db">
                  {db <= -40 ? "Near-silent (null)" : `${db.toFixed(1)} dB relative to on-axis`}
                </span>
              </div>
              <p className="ltb-choices-label">Source</p>
              <div className="ltb-choices" role="radiogroup" aria-label="Source">
                {SOURCES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={s.id === sourceId}
                    className={`ltb-choice${s.id === sourceId ? " is-on" : ""}`}
                    onClick={() => switchTo({ source: s.id })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <ClipPlayer
                id={clipId(item.id, angle, sourceId)}
                label={`${item.title}, ${position?.name}, ${SOURCES.find((s) => s.id === sourceId)?.label}`}
                audio={audio}
              />
            </>
          );
        }}
        renderBody={(item) => <p>{POLAR_PATTERNS[item.id].blurb}</p>}
      />
    </div>
  );
}

export default MicPolarPatternLab;
