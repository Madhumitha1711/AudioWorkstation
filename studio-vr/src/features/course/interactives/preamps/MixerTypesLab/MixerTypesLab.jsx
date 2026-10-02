import GroupedBriefing from "../../shared/GroupedBriefing";
import { ICONS, SECTIONS, mixerTypesImagePath } from "./mixerTypesData";

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
