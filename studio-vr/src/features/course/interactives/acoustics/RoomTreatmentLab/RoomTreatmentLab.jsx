import "../../shared/labs.css";
import "../shared/acousticsLabs.css";
import { useClipAudio } from "../../shared/useClipAudio";
import { RoomTabs, SetupBar } from "../shared/AcousticsUI";
import { ALL_STEPS, KEPT_SAME, OVERFOAM, STEPS } from "./roomTreatmentData";

function RoomTreatmentLab({ onInteract }) {
  const audio = useClipAudio({ items: ALL_STEPS, onFirstPlay: onInteract });
  const bare = STEPS[0];
  const full = STEPS[STEPS.length - 1];
  const ref = (s) => ({ id: s.id, label: s.title, short: s.short });
  const compareFor = (step) => (step.id === bare.id ? null : step.id === OVERFOAM.id ? ref(full) : ref(bare));

  return (
    <div className="lab acl">
      <p className="acl-intro">
        We recorded the same sound in the same room five times, adding one type of acoustic treatment each time.
        Listen to how each step changes the sound.
      </p>

      <SetupBar keptSame={KEPT_SAME} />

      <RoomTabs items={ALL_STEPS} audio={audio} compareFor={compareFor} ariaLabel="Treatment steps" idPrefix="rtl-step" />
    </div>
  );
}

export default RoomTreatmentLab;
