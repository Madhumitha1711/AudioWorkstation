import GroupedBriefing from "../../shared/GroupedBriefing";
import { ICONS, SECTIONS, connectorImagePath } from "./connectorsData";

// Ch.8 connector briefings — two separate labs, one per family in
// connectorsData.js. Layout lives in ../../shared/GroupedBriefing.
//   "analog-connectors-lab"  Mic & Line / Patching & Multicore / Speaker
//   "digital-connectors-lab" Digital Audio / Control & Computer
const ANALOG = SECTIONS.filter((s) => s.family === "Analog");
const DIGITAL = SECTIONS.filter((s) => s.family === "Digital & Data");

export function AnalogConnectorsLab({ onInteract }) {
  return (
    <GroupedBriefing
      sections={ANALOG}
      icons={ICONS}
      imagePath={connectorImagePath}
      idPrefix="conn-analog"
      ariaLabel="Analog connector categories"
      caption="Analog"
      onInteract={onInteract}
    />
  );
}

export function DigitalConnectorsLab({ onInteract }) {
  return (
    <GroupedBriefing
      sections={DIGITAL}
      icons={ICONS}
      imagePath={connectorImagePath}
      idPrefix="conn-digital"
      ariaLabel="Digital and data connector categories"
      caption="Digital & Data"
      onInteract={onInteract}
    />
  );
}
