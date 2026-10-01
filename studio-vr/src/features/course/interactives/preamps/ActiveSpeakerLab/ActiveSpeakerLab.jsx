import { useEffect, useRef, useState } from "react";
import { FlipCard } from "../../../../../components/FlipCard";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../../shared/labs.css";
import "./ActiveSpeakerLab.css";
import { ACTIVE_SPEAKER as LAB, activeSpeakerImagePath } from "./activeSpeakerData";

// "Active Speaker" — follows "Amplifier + Passive Speaker" in the
// amplification run and deliberately mirrors AmpPassiveSpeakerLab so the
// two read as a pair. One screen, no tabs (nothing here needs switching
// between; the lesson already shows the heading): lead / how-it-works
// sections (incl. why soffit-mounted mains keep their amps in a rack),
// then the examples — Genelec, Neumann, Yamaha, Kali nearfields two per
// row, and the soffit-mounted Genelec 1234A as a full-width card (`wide`) —
// then key points. Each example is a shared FlipCard (components/FlipCard):
// the front shows the photo and a single line (the model name); clicking
// turns it over to the lead + spec facts on the back.
//
// onInteract fires once the example cards scroll into view (there is
// nothing to click), or immediately if IntersectionObserver is missing.

function ExampleImage({ id, title }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = activeSpeakerImagePath(id);
  return (
    <div className="actl-media">
      {!failed && (
        <img
          src={src}
          alt={title}
          style={loaded ? undefined : { visibility: "hidden" }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {!loaded && (
        <div className="actl-ph">
          <svg className="actl-ph-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" />
          </svg>
          <span className="actl-ph-label">Image coming soon</span>
          <span className="actl-ph-path">{`public${src}`}</span>
        </div>
      )}
    </div>
  );
}

function ActiveSpeakerLab({ onInteract }) {
  const examplesRef = useRef(null);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  useEffect(() => {
    const el = examplesRef.current;
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
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="lab actl">
      <p className="actl-lead">{LAB.lead}</p>

      <dl className="actl-facts">
        {LAB.basics.map((f) => (
          <div key={f.label} className="actl-fact">
            <dt>{f.label}</dt>
            <dd>{f.text}</dd>
          </div>
        ))}
      </dl>

      <h4 className="actl-subhead">Examples</h4>
      <div ref={examplesRef} className="actl-examples">
        {LAB.examples.map((ex) => (
          <FlipCard
            key={ex.id}
            label={ex.title}
            className={`actl-card${ex.wide ? " actl-card--wide" : ""}`}
            front={
              <>
                <ExampleImage id={ex.id} title={ex.title} />
                <div className="actl-card-front">
                  <h4 className="actl-card-title">{ex.title}</h4>
                </div>
              </>
            }
            back={
              <div className="actl-card-body">
                <h4 className="actl-card-kicker">{ex.title}</h4>
                <p className="actl-card-lead">{ex.lead}</p>
                <dl className="actl-facts actl-card-facts">
                  {ex.facts.map((f) => (
                    <div key={f.label} className="actl-fact">
                      <dt>{f.label}</dt>
                      <dd>{f.text}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            }
          />
        ))}
      </div>

      <KeyPoints points={LAB.points} />
    </div>
  );
}

export default ActiveSpeakerLab;
