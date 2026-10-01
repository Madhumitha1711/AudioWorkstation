import GroupedBriefing from "../../shared/GroupedBriefing";
import { ICONS, SECTIONS, cableImagePath } from "./cablesData";

// Ch.8 cable briefings — two separate labs, one per family in cablesData.js.
// Layout lives in ../../shared/GroupedBriefing.
//   "analog-cables-lab"  Mic & Instrument / Line Level / Speaker
//   "digital-cables-lab" Digital Audio / Control
const ANALOG = SECTIONS.filter((s) => s.family === "Analog");
const DIGITAL = SECTIONS.filter((s) => s.family === "Digital");

export function AnalogCablesLab({ onInteract }) {
  return (
    <GroupedBriefing
      sections={ANALOG}
      icons={ICONS}
      imagePath={cableImagePath}
      idPrefix="cable-analog"
      ariaLabel="Analog cable categories"
      caption="Analog"
      onInteract={onInteract}
    />
  );
}

export function DigitalCablesLab({ onInteract }) {
  return (
    <GroupedBriefing
      sections={DIGITAL}
      icons={ICONS}
      imagePath={cableImagePath}
      idPrefix="cable-digital"
      ariaLabel="Digital cable categories"
      caption="Digital"
      onInteract={onInteract}
    />
  );
}
