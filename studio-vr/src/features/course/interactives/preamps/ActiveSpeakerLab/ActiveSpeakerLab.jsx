import { ExampleLab } from "../../shared/ExampleLab/ExampleLab";
import { ACTIVE_SPEAKER, activeSpeakerImagePath } from "./activeSpeakerData";

export default function ActiveSpeakerLab(props) {
  return <ExampleLab {...props} lab={ACTIVE_SPEAKER} imagePath={activeSpeakerImagePath} />;
}
