import GroupedBriefing from "../../shared/GroupedBriefing";
import { ICONS, SECTIONS, cableImagePath } from "./cablesData";

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
