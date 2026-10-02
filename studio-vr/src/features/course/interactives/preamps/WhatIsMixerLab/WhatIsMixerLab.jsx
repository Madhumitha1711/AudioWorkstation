import { AnalogyConceptLab } from "../../shared/AnalogyConceptLab/AnalogyConceptLab";
import { MIXER_CONCEPT, mixerImagePath } from "./whatIsMixerData";

export default function WhatIsMixerLab(props) {
  return (
    <AnalogyConceptLab
      {...props}
      lab={MIXER_CONCEPT}
      imagePath={mixerImagePath}
      heroTitle="Mixing console"
      kicker="Kitchen"
      ariaLabel="Kitchen to mixer flow"
    />
  );
}
