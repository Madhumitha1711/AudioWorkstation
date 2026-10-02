import { LABS } from "../../interactives/registry";

function InteractiveSection({ interactive, onComplete, variant = "standalone" }) {
  const Lab = LABS[interactive.kind];

  return (
    <div className={`interactive-section${variant === "embedded" ? " embedded" : ""}`}>
      {interactive.title && <h2 className="interactive-title">{interactive.title}</h2>}
      {Lab ? <Lab onInteract={onComplete} /> : null}
    </div>
  );
}

export default InteractiveSection;
