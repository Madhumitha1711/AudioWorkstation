import { ExampleLab } from "../../shared/ExampleLab/ExampleLab";
import { AMP_PASSIVE, ampPassiveImagePath } from "./ampPassiveSpeakerData";

export default function AmpPassiveSpeakerLab(props) {
  return <ExampleLab {...props} lab={AMP_PASSIVE} imagePath={ampPassiveImagePath} />;
}
