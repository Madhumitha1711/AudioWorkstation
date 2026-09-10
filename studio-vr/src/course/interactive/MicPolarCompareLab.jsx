import { useEffect } from "react";
import "./labs.css";
import "./micLabs.css";
import { POLAR_PATTERNS, polarDbOf, polarGainOf } from "./micLabShared";
import MicPolarDiagram from "./MicPolarDiagram";

// Sits alongside mic-polar-pattern-lab as its own interactive section,
// the same pairing as mic-type-lab/mic-type-compare-lab — but unlike that
// pair, this one has no dropdowns: there are only three polar patterns
// total (see POLAR_PATTERNS in micLabShared.js), so "compare" always
// means all three, fixed, rather than picking which ones to compare out
// of a larger set. Each column is MicPolarDiagram (non-interactive — see
// its own comment) plus the pattern's blurb and its on-axis/side/rear gain,
// the polar-pattern equivalent of mic-type-compare-lab's spec chips.
// There's nothing to click here by design, so unlike every other lab in
// this chapter — which mark themselves "done" (InteractiveSection.jsx's
// onInteract, used for the sidebar's progress checkmark) from a picker or
// dropdown's onClick/onChange — this one fires it once on mount instead.

const REFERENCE_ANGLES = [
  { deg: 0, label: "Front" },
  { deg: 90, label: "Side" },
  { deg: 180, label: "Back" },
];

function formatDb(db) {
  return db <= -40 ? "Null" : `${db.toFixed(1)} dB`;
}

function MicPolarCompareLab({ onInteract }) {
  useEffect(() => {
    onInteract?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="lab">
      <p className="lab-intro">Compare all three polar patterns side by side.</p>

      <div className="mic-compare-grid">
        {Object.entries(POLAR_PATTERNS).map(([id, p]) => (
          <div className="mic-compare-col" key={id}>
            <div className="mic-compare-static-label">{p.label}</div>

            <div className="mic-polar-wrap">
              <MicPolarDiagram pattern={id} />
            </div>

            <p className="lab-intro mic-compare-copy">{p.blurb}</p>

            <div className="mic-spec-row">
              {REFERENCE_ANGLES.map(({ deg, label }) => (
                <div className="mic-spec-chip" key={label}>
                  {label}: <b>{formatDb(polarDbOf(polarGainOf(id, deg)))}</b>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MicPolarCompareLab;
