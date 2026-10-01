import { useEffect, useRef, useState } from "react";
import { KeyPoints } from "../../../../../components/KeyPoints";
import { FlipCard } from "../../../../../components/FlipCard";
import "../../shared/labs.css";
import "./WhatIsInterfaceLab.css";
import { INTERFACE_CONCEPT as LAB, interfaceImagePath } from "./whatIsInterfaceData";

// "What Is an Interface?" — opens Ch.11 (Audio Interfaces, Converters,
// I/O and MIDI) and deliberately mirrors WhatIsMixerLab, the "what is a
// …?" opener of Ch.10: hero image + lead + labelled facts, then an
// everyday analogy as picture-beside-paragraph rows joined by hand-drawn
// curvy arrows, key points. One screen, no tabs. Here the analogy is a
// translator: each row's picture is a FlipCard with the translator scene
// on the front and its studio equivalent on the back.
//
// onInteract fires once the analogy rows scroll into view (there is
// nothing to click), or immediately if IntersectionObserver is missing.

// `hero` = full-width image at the top of the lab; otherwise a 16:9 picture
// on the front/back of an analogy card.
function InterfaceImage({ id, title, hero = false }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = interfaceImagePath(id);
  return (
    <div className={`wil-media${hero ? " wil-media--hero" : ""}`}>
      {!failed && (
        <img
          src={src}
          alt={title}
          loading="lazy"
          style={loaded ? undefined : { visibility: "hidden" }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {!loaded && (
        <div className="wil-ph">
          <svg className="wil-ph-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" />
          </svg>
          <span className="wil-ph-label">Image coming soon</span>
          <span className="wil-ph-path">{`public${src}`}</span>
        </div>
      )}
    </div>
  );
}

function Facts({ items }) {
  return (
    <dl className="wil-facts">
      {items.map((f) => (
        <div key={f.label} className="wil-fact">
          <dt>{f.label}</dt>
          <dd>{f.text}</dd>
        </div>
      ))}
    </dl>
  );
}

// Hand-drawn connector between two analogy rows — same path and draw-on
// as WhatIsMixerLab's SketchArrow (see the WebKit note there: real 80×56
// viewBox, plain dasharray, no pathLength / non-scaling-stroke).
function SketchArrow({ flip = false }) {
  return (
    <div className={`wil-sketch${flip ? " wil-sketch--flip" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 80 56" width="80" height="56">
        <path className="wil-sketch-line" d="M33 3 C 50 6, 66 16, 63 29 C 61 40, 50 47, 40 51" />
        <path className="wil-sketch-head" d="M48.9 52.3 L40 51 L45.6 43.9" />
      </svg>
    </div>
  );
}

function WhatIsInterfaceLab({ onInteract }) {
  const analogyRef = useRef(null);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  useEffect(() => {
    const el = analogyRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      onInteractRef.current?.();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          onInteractRef.current?.();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="lab wil">
      <InterfaceImage id={LAB.image} title="Audio interface" hero />
      <p className="wil-lead">{LAB.lead}</p>
      <Facts items={LAB.facts} />

      <h4 className="wil-subhead">{LAB.analogySubhead}</h4>
      <p className="wil-hint">{LAB.analogyHint}</p>
      {/* Translator analogy: one row per step (flip card beside paragraph),
          sketched arrows between rows so the steps read as a flow:
          two languages → speak up → translate in → translate back → gestures. */}
      <ol ref={analogyRef} className="wil-analogy" aria-label="Translator to audio interface flow">
        {LAB.analogy.map((a, i) => (
          <li key={a.id} className="wil-analogy-step">
            <div className="wil-analogy-row">
              <FlipCard
                label={`${a.translator}: flip to see the studio equivalent, ${a.studio}`}
                className="wil-kcard"
                front={
                  <>
                    <InterfaceImage id={a.id} title={a.translator} />
                    <div className="wil-kcard-cap">
                      <span className="wil-kcard-kicker">Translator</span>
                      <span className="wil-kcard-name">{a.translator}</span>
                    </div>
                  </>
                }
                back={
                  <>
                    <InterfaceImage id={a.studioImage} title={a.studio} />
                    <div className="wil-kcard-cap wil-kcard-cap--studio">
                      <span className="wil-kcard-kicker">Studio</span>
                      <span className="wil-kcard-name">{a.studio}</span>
                    </div>
                  </>
                }
              />
              <div className="wil-analogy-text">
                <p className="wil-pair">
                  <span>{a.translator}</span>
                  <span className="wil-pair-arrow" aria-label="is like">→</span>
                  <span className="wil-pair-mixer">{a.studio}</span>
                </p>
                <p className="wil-analogy-body">{a.text}</p>
              </div>
            </div>
            {i < LAB.analogy.length - 1 && <SketchArrow flip={i % 2 === 1} />}
          </li>
        ))}
      </ol>

      <KeyPoints points={LAB.points} />
    </div>
  );
}

export default WhatIsInterfaceLab;
