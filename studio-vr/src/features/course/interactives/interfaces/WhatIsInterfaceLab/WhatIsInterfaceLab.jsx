import { AnalogyConceptLab } from "../../shared/AnalogyConceptLab/AnalogyConceptLab";
import { INTERFACE_CONCEPT, interfaceImagePath } from "./whatIsInterfaceData";

export default function WhatIsInterfaceLab(props) {
  return (
    <AnalogyConceptLab
      {...props}
      lab={INTERFACE_CONCEPT}
      imagePath={interfaceImagePath}
      heroTitle="Audio interface"
      kicker="Translator"
      ariaLabel="Translator to audio interface flow"
    />
  );
}
