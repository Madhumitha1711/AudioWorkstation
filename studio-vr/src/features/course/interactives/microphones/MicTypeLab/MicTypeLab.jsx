import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import "../shared/micLabs.css";
import { MIC_TYPES, SOURCES, micAudioPath } from "../shared/micLabShared";
import MicPortrait from "../shared/MicPortrait";

// Ported from design/mic-types-chapter.html's "02 Types of Microphone"
// lesson, trimmed down to just the interactive listen panel — no
// paragraph copy, spec chips, or characteristic bars here (all of that,
// bars included, is redundant with mic-type-compare-lab's own spec
// sheet); that descriptive content lives instead in the separate
// mic-type-compare-lab (MicTypeCompareLab.jsx), which sits alongside this
// one as its own interactive section rather than a second "mode" of this
// lab. Best-for tags are the one exception — kept here, right under the
// Source picker, since knowing what a type suits is useful in the same
// glance as picking a source to audition it with.
// Portrait sits next to the Source row instead of its own
// full-width block above them (.mic-portrait--feature) — sized to hold a
// real product photo per type once those are shot; the SVG diagram is
// just a placeholder in that box until then. Type picker uses the
// segmented .mic-room-toggle pill style (ported from the 3D tour's
// Recording Room/Control Room switcher — see micLabs.css) instead of the
// boxed .lab-toggle tabs the mockup used. Pick a type and the
// portrait/source picker/audio update together.
//
// Also registered under interactives/registry.js's "mic-selection-lab" kind
// — that used to be a separate component (MicSelectionLab.jsx) but
// converged on being visually identical to this one, so it was removed
// and that kind now just renders this component instead.

function MicTypeLab({ onInteract }) {
  const [typeId, setTypeId] = useState(MIC_TYPES[0].id);
  const [sourceId, setSourceId] = useState(SOURCES[0].id);
  const [playing, setPlaying] = useState(false);
  const [clipMissing, setClipMissing] = useState(false);
  const audioRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;

  const type = MIC_TYPES.find((t) => t.id === typeId) ?? MIC_TYPES[0];

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  // Reload the clip whenever type or source changes, keeping playback
  // going across the switch if it was already playing (same behavior as
  // the mockup's selectMic/source handlers).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const wasPlaying = playing;
    setClipMissing(false);
    audio.src = micAudioPath(typeId, sourceId);
    audio.load();
    if (wasPlaying) {
      audio.play().catch(() => setClipMissing(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId, sourceId]);

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

  function selectType(id) {
    markInteracted();
    setTypeId(id);
  }

  return (
    <div className="lab">
      <div className="mic-room-toggle" role="group" aria-label="Choose a mic type">
        {MIC_TYPES.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`mic-room-toggle__opt${t.id === typeId ? " current" : ""}`}
            onClick={() => selectType(t.id)}
            aria-pressed={t.id === typeId}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="mic-panel mic-panel--compact">
        <div className="sound-lab-panel-head">
          <span className={`sound-lab-live-dot${playing ? " on" : ""}`} /> Listen —{" "}
          {type.label.toUpperCase()}
        </div>
        <div className="mic-type-row">
          <div className="mic-portrait mic-portrait--feature" style={{ color: type.accent }}>
            <MicPortrait shape={type.shape} color={type.accent} />
          </div>
          <div className="mic-type-controls">
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
            <div className="mic-best-for">
              <div className="mic-best-for-label">Best For</div>
              <div className="mic-best-for-tags">
                {type.bestFor.map((tag) => (
                  <span className="mic-best-for-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
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
            {type.label} · {SOURCES.find((s) => s.id === sourceId)?.label}
          </span>
        </div>
        {clipMissing && (
          <p className="lab-hint">
            Clip pending — real recordings for this type/source combo haven't been captured yet.
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
  );
}

export default MicTypeLab;
