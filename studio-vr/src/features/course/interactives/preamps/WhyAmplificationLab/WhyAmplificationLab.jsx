import { useEffect, useRef, useState } from "react";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../../shared/labs.css";
import "./WhyAmplificationLab.css";
import { WHY_AMPLIFICATION as LAB } from "./whyAmplificationData";

// "Why Amplification?" — lead (the section header already shows the title), then one row per everyday example:
// its own video or image beside the paragraph it illustrates (no subheadings),
// then key points. onInteract fires the first time the student plays any
// clip or taps any picture.

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
            <p className="wal-example-text">{e.text}</p>
          </div>
        ))}
      </div>

      <KeyPoints points={LAB.points} />
    </div>
  );
}

export default WhyAmplificationLab;
