import { useRef, useState } from "react";
import "./labs.css";
import "./micLabs.css";
import { MIC_SCENARIOS } from "./micLabShared";

// Ported from design/mic-types-chapter.html's "Choosing a Mic" lesson —
// tap a recording scenario to see what most engineers reach for first,
// and why. Only one card stays open at a time, same as the mockup.

function MicSelectionLab({ onInteract }) {
  const [openId, setOpenId] = useState(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;

  function toggle(id) {
    if (!firedRef.current) {
      firedRef.current = true;
      onInteractRef.current?.();
    }
    setOpenId((cur) => (cur === id ? null : id));
  }

  return (
    <div className="lab">
      <p className="lab-intro">
        There's no universally "best" microphone — only the best microphone for a specific source,
        in a specific room, for a specific purpose. Tap a scenario to see what most engineers reach
        for first, and why.
      </p>

      <div className="mic-scenario-grid">
        {MIC_SCENARIOS.map((s) => {
          const open = openId === s.id;
          return (
            <div
              key={s.id}
              className={`mic-scenario-card${open ? " open" : ""}`}
              onClick={() => toggle(s.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(s.id);
                }
              }}
            >
              <div className="mic-sc-top">
                <span className="mic-sc-title">{s.title}</span>
                <span className="mic-sc-icon">{s.icon}</span>
              </div>
              <div className="mic-sc-recs">
                {s.recs.map((r) => (
                  <span key={r}>{r}</span>
                ))}
              </div>
              {open && <div className="mic-sc-why">{s.why}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MicSelectionLab;
