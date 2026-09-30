import WiringBriefing from "../shared/WiringBriefing";
import { ICONS, SECTIONS, connectorImagePath } from "./connectorsData";

// "Connectors" briefing for Ch.8 — Analog (Mic & Line / Patching & Multicore /
// Speaker) and Digital & Data (Digital Audio / Control & Computer), 14
// connectors in all. Layout lives in ../shared/WiringBriefing.
function ConnectorsLab({ onInteract }) {
  return (
    <WiringBriefing
      sections={SECTIONS}
      icons={ICONS}
      imagePath={connectorImagePath}
      idPrefix="conn"
      ariaLabel="Connector categories"
      onInteract={onInteract}
    />
  );
}

export default ConnectorsLab;
