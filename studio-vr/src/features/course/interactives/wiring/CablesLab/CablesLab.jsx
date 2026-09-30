import WiringBriefing from "../shared/WiringBriefing";
import { ICONS, SECTIONS, cableImagePath } from "./cablesData";

// "Cables" briefing for Ch.8 — Analog (Mic & Instrument / Line Level /
// Speaker) and Digital (Digital Audio / Control), 10 cables in all. Layout
// lives in ../shared/WiringBriefing.
function CablesLab({ onInteract }) {
  return (
    <WiringBriefing
      sections={SECTIONS}
      icons={ICONS}
      imagePath={cableImagePath}
      idPrefix="cable"
      ariaLabel="Cable categories"
      onInteract={onInteract}
    />
  );
}

export default CablesLab;
