import { useEffect, useRef, useState } from "react";
import { FlipCard } from "../../../../../components/FlipCard";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../../shared/labs.css";
import "./AmpPassiveSpeakerLab.css";
import { AMP_PASSIVE as LAB, ampPassiveImagePath } from "./ampPassiveSpeakerData";

// "Amplifier + Passive Speaker" — third lab in the amplification run
// (Why Amplification? → Amplification & the Amplifier → this). One screen,
// no tabs (the lesson already shows the
// "Amplifier + Passive Speaker" heading, so the lab has none): lead / how-it-works sections, then the two classic
// pairings (NS10 + power amp, CLA-10 + CLA-200) side by side (stacked on
// narrow screens), then key points. Each pairing is a shared FlipCard
// (components/FlipCard), same as ActiveSpeakerLab: photo + a single line
// (the title) on the front; click to turn it over to the lead + facts.
// Same visual family as WhyAmplificationLab / BriefingTabs.
//
// onInteract fires once the example cards scroll into view (there is
// nothing to click), or immediately if IntersectionObserver is missing.

function ExampleImage({ id, title }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = ampPassiveImagePath(id);
  return (
    <div className="apsl-media">
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
        <div className="apsl-ph">
          <svg className="apsl-ph-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" />
          </svg>
          <span className="apsl-ph-label">Image coming soon</span>
          <span className="apsl-ph-path">{`public${src}`}</span>
        </div>
      )}
    </div>
  );
}

function AmpPassiveSpeakerLab({ onInteract }) {
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
    <div className="lab apsl">
      <p className="apsl-lead">{LAB.lead}</p>

      <dl className="apsl-facts">
        {LAB.basics.map((f) => (
          <div key={f.label} className="apsl-fact">
            <dt>{f.label}</dt>
            <dd>{f.text}</dd>
          </div>
        ))}
      </dl>

      <h4 className="apsl-subhead">Examples</h4>
      <div ref={examplesRef} className="apsl-examples">
        {LAB.examples.map((ex) => (
          <FlipCard
            key={ex.id}
            label={ex.title}
            className="apsl-card"
            front={
              <>
                <ExampleImage id={ex.id} title={ex.title} />
                <div className="apsl-card-front">
                  <h4 className="apsl-card-title">{ex.title}</h4>
                </div>
              </>
            }
            back={
              <div className="apsl-card-body">
                <h4 className="apsl-card-kicker">{ex.title}</h4>
                <p className="apsl-card-lead">{ex.lead}</p>
                <dl className="apsl-facts apsl-card-facts">
                  {ex.facts.map((f) => (
                    <div key={f.label} className="apsl-fact">
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

export default AmpPassiveSpeakerLab;
