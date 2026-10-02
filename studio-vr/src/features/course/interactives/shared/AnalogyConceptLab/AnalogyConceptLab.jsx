import { useRef } from "react";
import { KeyPoints } from "../../../../../components/KeyPoints";
import { FlipCard } from "../../../../../components/FlipCard";
import "../labs.css";
import "./AnalogyConceptLab.css";
import { LabImage, Facts } from "../LabParts";
import { useInteractOnView } from "../useInteractOnce";

function ConceptImage({ id, title, imagePath, hero }) {
  return <LabImage prefix="acl" src={imagePath(id)} alt={title} hero={hero} lazy />;
}

function SketchArrow({ flip = false }) {
  return (
    <div className={`acl-sketch${flip ? " acl-sketch--flip" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 80 56" width="80" height="56">
        <path className="acl-sketch-line" d="M33 3 C 50 6, 66 16, 63 29 C 61 40, 50 47, 40 51" />
        <path className="acl-sketch-head" d="M48.9 52.3 L40 51 L45.6 43.9" />
      </svg>
    </div>
  );
}

export function AnalogyConceptLab({ lab: LAB, imagePath, heroTitle, kicker, ariaLabel, onInteract }) {
  const analogyRef = useRef(null);

  useInteractOnView(analogyRef, onInteract, 0.2);

  return (
    <div className="lab acl">
      <ConceptImage id={LAB.image} title={heroTitle} imagePath={imagePath} hero />
      <p className="acl-lead">{LAB.lead}</p>
      <Facts prefix="acl" items={LAB.facts} />

      <h4 className="acl-subhead">{LAB.analogySubhead}</h4>
      <p className="acl-hint">{LAB.analogyHint}</p>
      <ol ref={analogyRef} className="acl-analogy" aria-label={ariaLabel}>
        {LAB.analogy.map((a, i) => (
          <li key={a.id} className="acl-analogy-step">
            <div className="acl-analogy-row">
              <FlipCard
                label={`${a.from}: flip to see the studio equivalent, ${a.to}`}
                className="acl-kcard"
                front={
                  <>
                    <ConceptImage id={a.id} title={a.from} imagePath={imagePath} />
                    <div className="acl-kcard-cap">
                      <span className="acl-kcard-kicker">{kicker}</span>
                      <span className="acl-kcard-name">{a.from}</span>
                    </div>
                  </>
                }
                back={
                  <>
                    <ConceptImage id={a.studioImage} title={a.to} imagePath={imagePath} />
                    <div className="acl-kcard-cap acl-kcard-cap--studio">
                      <span className="acl-kcard-kicker">Studio</span>
                      <span className="acl-kcard-name">{a.to}</span>
                    </div>
                  </>
                }
              />
              <div className="acl-analogy-text">
                <p className="acl-pair">
                  <span>{a.from}</span>
                  <span className="acl-pair-arrow" aria-label="is like">→</span>
                  <span className="acl-pair-mixer">{a.to}</span>
                </p>
                <p className="acl-analogy-body">{a.text}</p>
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
