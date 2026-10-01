import { useEffect, useRef, useState } from "react";
import { KeyPoints } from "../../../../../components/KeyPoints";
import { FlipCard } from "../../../../../components/FlipCard";
import "../../shared/labs.css";
import "./WhatIsMixerLab.css";
import { MIXER_CONCEPT as LAB, mixerImagePath } from "./whatIsMixerData";

// "What Is a Mixer?" — opens the Mixer part of Ch.10 and keeps the
// chapter's look (hero image + lead + labelled facts, WhyAmplificationLab
// picture-beside-paragraph rows, same orange accent) so the preamps/mixer
// labs read as one series. One screen, no tabs (like ActiveSpeakerLab):
// hero image, what a mixer does, kitchen analogy rows joined by
// hand-drawn curvy arrows, key points. Each row's picture is a FlipCard:
// the kitchen photo on the front, its studio equivalent on the back.
//
// onInteract fires once the kitchen rows scroll into view (there is
// nothing to click), or immediately if IntersectionObserver is missing.

// `hero` = full-width image at the top of the lab; otherwise a 16:9 picture
// beside an analogy paragraph.
function MixerImage({ id, title, hero = false }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = mixerImagePath(id);
  return (
    <div className={`wml-media${hero ? " wml-media--hero" : ""}`}>
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
        <div className="wml-ph">
          <svg className="wml-ph-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" />
          </svg>
          <span className="wml-ph-label">Image coming soon</span>
          <span className="wml-ph-path">{`public${src}`}</span>
        </div>
      )}
    </div>
  );
}

function Facts({ items }) {
  return (
    <dl className="wml-facts">
      {items.map((f) => (
        <div key={f.label} className="wml-fact">
          <dt>{f.label}</dt>
          <dd>{f.text}</dd>
        </div>
      ))}
    </dl>
  );
}

// Hand-drawn connector between two kitchen rows: a loose curved stroke
// with a sketched arrowhead, drawn in under the picture column. `flip`
// mirrors it so consecutive arrows swing left, right, left… like a pen
// sketch rather than a uniform chart.
// The viewBox matches the box's real 80×56 size (no stretching) and the
// draw-on uses a plain dasharray longer than the path — no pathLength or
// non-scaling-stroke, which WebKit renders as a dotted / broken line.
function SketchArrow({ flip = false }) {
  return (
    <div className={`wml-sketch${flip ? " wml-sketch--flip" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 80 56" width="80" height="56">
        <path className="wml-sketch-line" d="M33 3 C 50 6, 66 16, 63 29 C 61 40, 50 47, 40 51" />
        <path className="wml-sketch-head" d="M48.9 52.3 L40 51 L45.6 43.9" />
      </svg>
    </div>
  );
}

function WhatIsMixerLab({ onInteract }) {
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
    <div className="lab wml">
      <MixerImage id={LAB.image} title="Mixing console" hero />
      <p className="wml-lead">{LAB.lead}</p>
      <Facts items={LAB.facts} />

      <h4 className="wml-subhead">{LAB.analogySubhead}</h4>
      <p className="wml-hint">{LAB.analogyHint}</p>
      {/* Kitchen analogy: one row per step (flip card beside paragraph), with
          sketched arrows between rows so the steps read as a flow:
          ingredients → prep → quantities → pot → serving. */}
      <ol ref={analogyRef} className="wml-analogy" aria-label="Kitchen to mixer flow">
        {LAB.analogy.map((a, i) => (
          <li key={a.id} className="wml-analogy-step">
            <div className="wml-analogy-row">
              <FlipCard
                label={`${a.kitchen}: flip to see the studio equivalent, ${a.mixer}`}
                className="wml-kcard"
                front={
                  <>
                    <MixerImage id={a.id} title={a.kitchen} />
                    <div className="wml-kcard-cap">
                      <span className="wml-kcard-kicker">Kitchen</span>
                      <span className="wml-kcard-name">{a.kitchen}</span>
                    </div>
                  </>
                }
                back={
                  <>
                    <MixerImage id={a.studioImage} title={a.mixer} />
                    <div className="wml-kcard-cap wml-kcard-cap--studio">
                      <span className="wml-kcard-kicker">Studio</span>
                      <span className="wml-kcard-name">{a.mixer}</span>
                    </div>
                  </>
                }
              />
              <div className="wml-analogy-text">
                <p className="wml-pair">
                  <span>{a.kitchen}</span>
                  <span className="wml-pair-arrow" aria-label="is like">→</span>
                  <span className="wml-pair-mixer">{a.mixer}</span>
                </p>
                <p className="wml-analogy-body">{a.text}</p>
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

export default WhatIsMixerLab;
