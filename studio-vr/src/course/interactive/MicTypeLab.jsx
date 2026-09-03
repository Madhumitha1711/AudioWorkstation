import { useEffect, useRef, useState } from "react";
import "./labs.css";
import "./micLabs.css";
import { MIC_TYPES, SOURCES, micAudioPath } from "./micLabShared";

// Ported from design/mic-types-chapter.html's "02 Types of Microphone"
// lesson — pick a transducer family and the copy, spec chips, best-for
// tags, and listen panel all update together, same as the mockup's type
// tabs + "MIC TYPE" segmented control staying in sync with each other.

function MicPortrait({ shape, color }) {
  const common = { fill: "none", stroke: color, strokeWidth: 2 };
  switch (shape) {
    case "condenser":
      return (
        <svg viewBox="0 0 60 100" {...common}>
          <rect x="16" y="6" width="28" height="58" rx="6" fill="#1c1c21" />
          <circle cx="30" cy="20" r="9" stroke="#8b8890" />
          <line x1="30" y1="64" x2="30" y2="80" stroke="#54525a" />
          <path d="M14 80 Q30 92 46 80" stroke="#54525a" />
        </svg>
      );
    case "tube":
      return (
        <svg viewBox="0 0 60 100" {...common}>
          <rect x="14" y="4" width="32" height="64" rx="4" fill="#1c1c21" />
          <circle cx="30" cy="18" r="10" stroke="#8b8890" />
          <rect x="26" y="52" width="8" height="10" fill="none" stroke="#8b8890" />
          <line x1="30" y1="68" x2="30" y2="80" stroke="#54525a" />
          <path d="M12 80 Q30 94 48 80" stroke="#54525a" />
        </svg>
      );
    case "ribbon":
      return (
        <svg viewBox="0 0 60 100" {...common}>
          <rect x="10" y="10" width="40" height="42" rx="8" fill="#1c1c21" />
          <rect x="24" y="20" width="12" height="22" fill="none" stroke="#8b8890" />
          <line x1="30" y1="52" x2="30" y2="72" stroke="#54525a" />
          <path d="M14 72 Q30 84 46 72" stroke="#54525a" />
        </svg>
      );
    case "contact":
      return (
        <svg viewBox="0 0 60 100" {...common}>
          <circle cx="30" cy="30" r="16" fill="#1c1c21" />
          <circle cx="30" cy="30" r="6" stroke="#8b8890" />
          <line x1="30" y1="46" x2="30" y2="70" stroke="#54525a" strokeDasharray="3,3" />
          <path d="M10 82 h40" stroke="#54525a" />
        </svg>
      );
    default: // "dynamic"
      return (
        <svg viewBox="0 0 60 100" {...common}>
          <rect x="18" y="8" width="24" height="46" rx="12" fill="#1c1c21" />
          <circle cx="30" cy="18" r="6" stroke="#8b8890" />
          <line x1="30" y1="54" x2="30" y2="72" stroke="#54525a" />
          <path d="M16 72 Q30 84 44 72" stroke="#54525a" />
        </svg>
      );
  }
}

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
      <p className="lab-intro">
        Every mic converts air pressure into voltage a different way. Pick a type below — the
        description, spec sheet, and listening panel all update together.
      </p>

      <div className="lab-toggle-row mic-type-tabs">
        {MIC_TYPES.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`lab-toggle${t.id === typeId ? " selected" : ""}`}
            onClick={() => selectType(t.id)}
          >
            <span className="mic-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mic-lesson-grid">
        <div>
          {type.paragraphs.map((p, i) => (
            <p className="lab-intro" key={i}>
              {p}
            </p>
          ))}
          <div className="mic-spec-row">
            {type.specs.map(([l, v]) => (
              <div className="mic-spec-chip" key={l}>
                {l}: <b>{v}</b>
              </div>
            ))}
          </div>
          <div className="mic-best-for">
            <div className="mic-best-for-label">Best For</div>
            <div className="mic-bf-tags">
              {type.bestFor.map((tag) => (
                <span className="mic-bf-tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
          {type.extraHint && <p className="lab-hint">{type.extraHint}</p>}
        </div>

        <div className="mic-panel">
          <div className="sound-lab-panel-head">
            <span className={`sound-lab-live-dot${playing ? " on" : ""}`} /> Listen —{" "}
            {type.label.toUpperCase()}
          </div>
          <div className="mic-portrait" style={{ color: type.accent }}>
            <MicPortrait shape={type.shape} color={type.accent} />
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
              {type.label} · {SOURCES.find((s) => s.id === sourceId)?.label}
            </span>
          </div>
          {clipMissing && (
            <p className="lab-hint">
              Clip pending — real recordings for this type/source combo haven't been captured yet.
            </p>
          )}
          <div className="mic-char-bars">
            {type.charBars.map(([label, pct, val]) => (
              <div className="mic-char-row" key={label}>
                <span className="mic-char-label">{label}</span>
                <div className="mic-char-track">
                  <div className="mic-char-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="mic-char-val">{val}</span>
              </div>
            ))}
          </div>
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

export default MicTypeLab;
