import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import "../shared/micLabs.css";
import ListenTabs, { ClipPlayer } from "../../shared/ListenTabs";
import { useClipAudio } from "../../shared/useClipAudio";
import { MIC_TYPES, SOURCES, micAccent, micAudioPath } from "../shared/micLabShared";
import MicPortrait from "../shared/MicPortrait";
import { useTheme } from "../../../../../theme/ThemeContext";

// "Microphone Types and Characteristics" (chapter 6, courseData.js
// TOPICS[id="mic-stand"]). Same horizontal layout as the chapter 5
// acoustics labs (shared ListenTabs): one standard tab per mic type;
// photo on the left, a Listen card on the right where the student picks a
// source (vocal, acoustic guitar, drum overhead, guitar amp) and plays that
// mic's recording of it; the type's description underneath.
//
// Playback: every type × source clip is its own useClipAudio item
// (`${type}-${source}`, micAudioPath → public/audio/mic-types/). Changing
// the source or the mic type while a clip plays carries on at the same
// position in the new clip, so the student hears the difference directly;
// if the new clip doesn't exist yet it just stops.
//
// Image: public/mic-types/<type>.jpg — until then the placeholder shows
// the type's MicPortrait silhouette.
//
// onInteract fires on the student's first play, tab or source pick.

const CLIPS = MIC_TYPES.flatMap((t) => SOURCES.map((s) => ({ id: `${t.id}-${s.id}`, src: micAudioPath(t.id, s.id) })));

const ITEMS = MIC_TYPES.map((t) => ({ ...t, tab: t.label, title: t.label, image: `/mic-types/${t.id}.jpg` }));

function MicTypeLab({ onInteract }) {
  const { theme } = useTheme();
  const [typeId, setTypeId] = useState(ITEMS[0].id);
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
  function switchTo(nextType, nextSource) {
    markInteracted();
    const id = `${nextType}-${nextSource}`;
    if (audio.playing) {
      if (audio.status[id] === "ready") audio.play(id, { keepPosition: true });
      else audio.stop();
    }
    setTypeId(nextType);
    setSourceId(nextSource);
  }

  return (
    <div className="lab mtl">
      <ListenTabs
        items={ITEMS}
        value={typeId}
        onChange={(id) => switchTo(id, sourceId)}
        ariaLabel="Microphone types"
        idPrefix="mtl-type"
        placeholderArt={(t) => <MicPortrait shape={t.shape} color={micAccent(t, theme)} />}
        renderListen={(t) => (
          <>
            <div className="ltb-listen-label">Listen</div>
            <p className="ltb-listen-hint">Pick a source, then press play. Switch mic types while it plays to hear the difference.</p>
            <div className="ltb-choices" role="radiogroup" aria-label="Source">
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={s.id === sourceId}
                  className={`ltb-choice${s.id === sourceId ? " is-on" : ""}`}
                  onClick={() => switchTo(t.id, s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <ClipPlayer
              id={`${t.id}-${sourceId}`}
              label={`${t.label}, ${SOURCES.find((s) => s.id === sourceId)?.label}`}
              audio={audio}
            />
            {t.extraHint && <p className="ltb-listen-note">{t.extraHint}</p>}
          </>
        )}
        renderBody={(t) => (
          <>
            {t.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <p>
              <b>Best for:</b> {t.bestFor.join(", ")}.
            </p>
          </>
        )}
      />
    </div>
  );
}

export default MicTypeLab;
