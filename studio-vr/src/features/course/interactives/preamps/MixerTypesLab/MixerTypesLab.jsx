import GroupedBriefing from "../../shared/GroupedBriefing";
import { ICONS, SECTIONS, mixerTypesImagePath } from "./mixerTypesData";

// "How Do You Categorise Mixers?" for Ch.10 — three category tabs
// (Architecture / Application / Circuit design), each with its own row of
// mixer-type tabs: Analog / Digital / Hybrid; Live / Studio / Broadcast /
// Project studio; Split / Inline. Same nested-tab layout as Ch.8's
// ConnectorsLab and CablesLab (../../shared/GroupedBriefing): image on top,
// description + key points below, prev / next walks every type in order.
function MixerTypesLab({ onInteract }) {
  return (
    <GroupedBriefing
      sections={SECTIONS}
      icons={ICONS}
      imagePath={mixerTypesImagePath}
      idPrefix="mixtype"
      ariaLabel="Ways to categorise mixers"
      onInteract={onInteract}
    />
  );
}

export default MixerTypesLab;
