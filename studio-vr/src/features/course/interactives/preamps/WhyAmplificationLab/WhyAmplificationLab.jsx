import { useEffect, useId, useRef, useState } from "react";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../../shared/labs.css";
import "./WhyAmplificationLab.css";
import { WHY_AMPLIFICATION as LAB } from "./whyAmplificationData";

// "Why Amplification?" — lead (the section header already shows the title), then one row per everyday example:
// its own video beside a "What do you think happened?" accordion that hides
// the explanation until the student opens it (guess first, then check), then
// key points. onInteract fires the first time the student plays any clip,
// taps any picture or opens any answer.

function ExampleMedia({ media, label, onEngage }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const isVideo = media.type === "video";
  const hidden = ready ? undefined : { visibility: "hidden" };

  return (
    <div className="wal-media">
      {!failed &&
        (isVideo ? (
          <video
            src={media.src}
            controls
            playsInline
            preload="metadata"
            aria-label={label}
            style={hidden}
            onLoadedMetadata={() => setReady(true)}
            onError={() => setFailed(true)}
            onPlay={onEngage}
          />
        ) : (
          <img
            src={media.src}
            alt={label}
            loading="lazy"
            style={hidden}
            onLoad={() => setReady(true)}
            onError={() => setFailed(true)}
            onClick={onEngage}
          />
        ))}
      {!ready && (
        <div className="wal-ph">
          <svg className="wal-ph-icon" viewBox="0 0 24 24" aria-hidden="true">
            {isVideo ? (
              <>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M10 9.5v5l4.5-2.5z" />
              </>
            ) : (
              <>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="9" cy="10" r="1.5" />
                <path d="M21 16l-5-5-8 8" />
              </>
            )}
          </svg>
          <span className="wal-ph-label">{label}</span>
          <span className="wal-ph-path">{`public${media.src}`}</span>
        </div>
      )}
    </div>
  );
}

// Reveal accordion. A <button aria-expanded> + region rather than <details>
// so the open/close can animate: the body sits in a grid whose single row
// eases between 0fr and 1fr, which tweens to the content's natural height
// without measuring it. The body stays mounted (just `inert` when closed) so
// the transition has something to animate and screen readers skip it.
function RevealAnswer({ question, children, onOpen }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  function toggle() {
    setOpen((o) => !o);
    if (!open) onOpen?.();
  }

  return (
    <div className={`wal-reveal${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="wal-reveal-q"
        aria-expanded={open}
        aria-controls={`${id}-a`}
        id={`${id}-q`}
        onClick={toggle}
      >
        <span className="wal-reveal-mark" aria-hidden="true">?</span>
        <span className="wal-reveal-label">{question}</span>
        <svg className="wal-reveal-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div
        className="wal-reveal-a"
        id={`${id}-a`}
        role="region"
        aria-labelledby={`${id}-q`}
        inert={!open}
      >
        <div className="wal-reveal-clip">
          <p className="wal-example-text">{children}</p>
        </div>
      </div>
    </div>
  );
}

function WhyAmplificationLab({ onInteract }) {
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  function onEngage() {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  }

  return (
    <div className="lab wal">
      <p className="wal-lead">{LAB.lead}</p>

      <div className="wal-examples">
        {LAB.examples.map((e) => (
          <div key={e.id} className="wal-example">
            <ExampleMedia media={e.media} label={e.label} onEngage={onEngage} />
            <RevealAnswer question={e.question ?? LAB.question} onOpen={onEngage}>
              {e.text}
            </RevealAnswer>
          </div>
        ))}
      </div>

      <KeyPoints points={LAB.points} />
    </div>
  );
}

export default WhyAmplificationLab;
