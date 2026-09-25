import { useRef, useState } from "react";
import "../../shared/labs.css";
import "../shared/micLabs.css";
import { MIC_TYPES, micTypeById } from "../shared/micLabShared";
import MicPortrait from "../shared/MicPortrait";

// Sits alongside mic-type-lab as its own interactive section rather than
// a mode inside it — three columns, each with its own dropdown, side by
// side, same idea as an Apple-style spec-comparison page (pick a model
// per column, its sheet updates below). Text is each type's `summary`
// from micLabShared.js — a single clean sentence distilled from the full
// paragraphs mic-type-lab used to show inline, not new copy — plus the
// same portrait image, spec chips, and characteristic bars mic-type-lab
// uses, so the two labs stay visually related. (No best-for tags here —
// redundant with the spec chips/char bars already doing that job.
// MIC_TYPES[].bestFor now backs mic-type-lab's own Best For block
// instead, next to its Source picker.)

function MicTypeCompareLab({ onInteract }) {
  // Defaults to a spread across families (moving-coil, FET condenser,
  // ribbon) rather than the first three in list order, so the initial
  // view already shows real contrast — condenser-tube and contact are
  // still one dropdown pick away.
  const [compareIds, setCompareIds] = useState([
    MIC_TYPES[0].id,
    MIC_TYPES[1].id,
    MIC_TYPES[3].id,
  ]);
  const firedRef = useRef(false);

  function setCompareType(index, id) {
    if (!firedRef.current) {
      firedRef.current = true;
      onInteract?.();
    }
    setCompareIds((cur) => cur.map((c, i) => (i === index ? id : c)));
  }

  return (
    <div className="lab">
      <p className="lab-intro">Compare up to three mic types side by side.</p>

      <div className="mic-compare-grid">
        {compareIds.map((id, i) => {
          const t = micTypeById(id);
          return (
            <div className="mic-compare-col" key={i}>
              <div className="mic-compare-select-wrap">
                <select
                  className="mic-compare-select"
                  value={id}
                  onChange={(e) => setCompareType(i, e.target.value)}
                  aria-label={`Mic type, column ${i + 1}`}
                >
                  {MIC_TYPES.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.icon} {opt.label}
                    </option>
                  ))}
                </select>
                <span className="mic-compare-chevron" aria-hidden="true">
                  ⌄
                </span>
              </div>

              <div className="mic-portrait mic-portrait--compact" style={{ color: t.accent }}>
                <MicPortrait shape={t.shape} color={t.accent} />
              </div>

              <p className="lab-intro mic-compare-copy">{t.summary}</p>

              <div className="mic-spec-row">
                {t.specs.map(([l, v]) => (
                  <div className="mic-spec-chip" key={l}>
                    {l}: <b>{v}</b>
                  </div>
                ))}
              </div>

              <div className="mic-char-bars">
                {t.charBars.map(([label, pct, val]) => (
                  <div className="mic-char-row" key={label}>
                    <span className="mic-char-label">{label}</span>
                    <div className="mic-char-track">
                      <div className="mic-char-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="mic-char-val">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MicTypeCompareLab;
