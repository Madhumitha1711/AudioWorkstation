import { useState } from "react";
import "./labs.css";

const CABINETS = [
  { id: "sealed", label: "Sealed" },
  { id: "ported", label: "Ported" },
];

const PLACEMENTS = [
  { id: "wall", label: "Flush against back wall" },
  { id: "pulled", label: "Pulled into the room" },
];

const RESULTS = {
  "sealed-wall": {
    tag: "good",
    text: "Tight, controlled low end. Sealed cabinets are naturally forgiving near a back wall since there's no port output to interact with the boundary.",
  },
  "sealed-pulled": {
    tag: "good",
    text: "Still tight and controlled, now with a touch more headroom since boundary reinforcement from the wall is out of the picture.",
  },
  "ported-wall": {
    tag: "caution",
    text: "Caution — the wall's boundary reinforcement stacks with the port's tuned output. Expect boomy, uneven bass around the low-mids.",
  },
  "ported-pulled": {
    tag: "good",
    text: "Deep, extended bass from the port without the added reinforcement of a nearby wall — a solid default placement for ported monitors.",
  },
};

function SpeakerLab({ onInteract }) {
  const [cabinet, setCabinet] = useState(null);
  const [placement, setPlacement] = useState(null);
  const [explored, setExplored] = useState(() => new Set());

  const comboKey = cabinet && placement ? `${cabinet}-${placement}` : null;
  const result = comboKey ? RESULTS[comboKey] : null;

  const registerCombo = (nextCabinet, nextPlacement) => {
    if (!nextCabinet || !nextPlacement) return;
    const key = `${nextCabinet}-${nextPlacement}`;
    setExplored((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      if (next.size === 1) onInteract?.();
      return next;
    });
  };

  const pickCabinet = (value) => {
    setCabinet(value);
    registerCombo(value, placement);
  };

  const pickPlacement = (value) => {
    setPlacement(value);
    registerCombo(cabinet, value);
  };

  return (
    <div className="lab">
      <div className="lab-controls">
        <div className="lab-control-group">
          <div className="lab-control-label">Cabinet design</div>
          <div className="lab-toggle-row">
            {CABINETS.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`lab-toggle${cabinet === c.id ? " selected" : ""}`}
                onClick={() => pickCabinet(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lab-control-group">
          <div className="lab-control-label">Placement</div>
          <div className="lab-toggle-row">
            {PLACEMENTS.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`lab-toggle${placement === p.id ? " selected" : ""}`}
                onClick={() => pickPlacement(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`lab-result${result ? ` ${result.tag}` : ""}`}>
        {result ? (
          result.text
        ) : (
          <span className="lab-result-empty">
            Choose a cabinet design and a placement above to see how they interact.
          </span>
        )}
      </div>

      {explored.size > 0 && (
        <div className="lab-hint">
          {explored.size < 4
            ? `${explored.size} / 4 combinations explored — try the others to see the full picture.`
            : "All 4 combinations explored — nice work."}
        </div>
      )}
    </div>
  );
}

export default SpeakerLab;
