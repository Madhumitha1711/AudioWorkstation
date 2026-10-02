import { useState } from "react";
import { sectionExtrasFor } from "../../data/sectionExtras";
import SectionExtraScreen from "./SectionExtraScreen";
import "./SectionExtras.css";

function SectionExtras({ step, children }) {
  const extras = sectionExtrasFor(step);
  const [openId, setOpenId] = useState(null);
  const openExtra = extras.find((extra) => extra.id === openId);

  if (extras.length === 0) return children;

  return (
    <>
      <div className="section-extras" role="group" aria-label="Section extras">
        {extras.map((extra) => (
          <button
            key={extra.id}
            type="button"
            className={`section-extras__option${extra.id === openId ? " active" : ""}`}
            aria-pressed={extra.id === openId}
            onClick={() => setOpenId((id) => (id === extra.id ? null : extra.id))}
          >
            {extra.label}
          </button>
        ))}
      </div>
      {openExtra ? (
        <SectionExtraScreen
          extra={openExtra}
          sectionTitle={step.data?.title || "This section"}
          onBack={() => setOpenId(null)}
        />
      ) : (
        children
      )}
    </>
  );
}

export default SectionExtras;
