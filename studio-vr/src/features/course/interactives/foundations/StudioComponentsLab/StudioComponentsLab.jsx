import GroupedBriefing from "../../shared/GroupedBriefing";
import { ICONS, SECTIONS, componentImagePath } from "./studioComponentsData";

const CONTROL = SECTIONS.filter((s) => s.room === "Control Room");
const RECORDING = SECTIONS.filter((s) => s.room === "Recording Room");

export function ControlRoomComponentsLab({ onInteract }) {
  return (
    <GroupedBriefing
      sections={CONTROL}
      icons={ICONS}
      imagePath={componentImagePath}
      idPrefix="scl-control"
      ariaLabel="Control Room component types"
      caption="Control Room"
      onInteract={onInteract}
    />
  );
}

export function RecordingRoomComponentsLab({ onInteract }) {
  return (
    <GroupedBriefing
      sections={RECORDING}
      icons={ICONS}
      imagePath={componentImagePath}
      idPrefix="scl-recording"
      ariaLabel="Recording Room component types"
      caption="Recording Room"
      onInteract={onInteract}
    />
  );
}
