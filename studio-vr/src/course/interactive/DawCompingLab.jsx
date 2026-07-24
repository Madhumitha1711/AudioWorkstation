import { useState } from "react";
import "./labs.css";

const PHRASES = ["Verse", "Pre-chorus", "Chorus"];
const TAKES = [
  { id: 0, label: "Take 1" },
  { id: 1, label: "Take 2" },
  { id: 2, label: "Take 3" },
];

function DawCompingLab({ onInteract }) {
  const [picks, setPicks] = useState({ 0: null, 1: null, 2: null });
  const [completedFired, setCompletedFired] = useState(false);

  const pick = (phraseIdx, takeId) => {
    const next = { ...picks, [phraseIdx]: takeId };
    setPicks(next);
    const isFull = Object.values(next).every((v) => v !== null);
    if (isFull && !completedFired) {
      setCompletedFired(true);
      onInteract?.();
    }
  };

  const reset = () => {
    setPicks({ 0: null, 1: null, 2: null });
    setCompletedFired(false);
  };

  const isFull = Object.values(picks).every((v) => v !== null);

  return (
    <div className="lab">
      <p className="lab-intro">
        Click one block per column to comp together a vocal take — pick whichever take you'd choose for
        each section.
      </p>

      <div className="comp-grid">
        <div className="comp-grid-row comp-grid-header">
          <div className="comp-row-label" />
          {PHRASES.map((label, idx) => (
            <div className="comp-col-label" key={idx}>
              {label}
            </div>
          ))}
        </div>
        {TAKES.map((take) => (
          <div className="comp-grid-row" key={take.id}>
            <div className="comp-row-label">{take.label}</div>
            {PHRASES.map((_, phraseIdx) => {
              const selected = picks[phraseIdx] === take.id;
              return (
                <button
                  type="button"
                  key={phraseIdx}
                  className={`comp-cell${selected ? " selected" : ""}`}
                  onClick={() => pick(phraseIdx, take.id)}
                >
                  {selected ? "✓" : ""}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="comp-result">
        <span className="comp-result-label">Your comp:</span>
        {PHRASES.map((label, idx) => (
          <span className="comp-result-chip" key={idx}>
            {picks[idx] !== null ? `${label} · Take ${picks[idx] + 1}` : `${label} · —`}
          </span>
        ))}
      </div>

      <div className="lab-actions">
        <button type="button" className="btn-secondary" onClick={reset}>
          Reset comp
        </button>
        {isFull && <span className="lab-hint">Comp complete — that's a non-destructive edit, just like in a real DAW.</span>}
      </div>
    </div>
  );
}

export default DawCompingLab;
