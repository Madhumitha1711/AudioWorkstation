import GroupedBriefing from "../../shared/GroupedBriefing";
import { ICONS, SECTIONS, connectorImagePath } from "./connectorsData";

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
