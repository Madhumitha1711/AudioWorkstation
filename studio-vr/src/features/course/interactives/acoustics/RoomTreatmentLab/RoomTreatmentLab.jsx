import "../../shared/labs.css";
import "../shared/acousticsLabs.css";
import { useClipAudio } from "../../shared/useClipAudio";
import { RoomTabs, SetupBar } from "../shared/AcousticsUI";
import { ALL_STEPS, KEPT_SAME, OVERFOAM, STEPS } from "./roomTreatmentData";

// "Same room, step by step" (chapter 5, courseData.js
// TOPICS[id="diffuser-panel"]), the companion to StudioAcousticsLab. One
// source, one room, one mic position; treatment is added one type at a
// time. One standard tab per step plus the "cover every wall in foam"
// experiment as the last tab (shared RoomTabs): image and player side by
// side, description underneath.
//
// A/B: every step flips to the bare room at the same position; the foam
// experiment flips to the fully treated room.
//
// Audio: plain playback of each step's recording (roomTreatmentData.js
// `src`); a step without its file yet shows "Audio coming soon", and
// without its image (`image`) a placeholder.
// onInteract fires on the first play.
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
