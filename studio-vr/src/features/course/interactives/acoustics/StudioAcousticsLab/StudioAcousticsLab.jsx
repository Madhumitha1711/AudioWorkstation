import "../../shared/labs.css";
import "../shared/acousticsLabs.css";
import { useClipAudio } from "../../shared/useClipAudio";
import { RoomTabs, SetupBar } from "../shared/AcousticsUI";
import { KEPT_SAME, ROOMS } from "./studioAcousticsData";


function StudioAcousticsLab({ onInteract }) {
  const audio = useClipAudio({ items: ROOMS, onFirstPlay: onInteract });
  const reference = ROOMS[0];
  const compareFor = (room) =>
    room.id === reference.id ? null : { id: reference.id, label: reference.title, short: reference.short };

  return (
    <div className="lab acl">
      <p className="acl-intro">
        We recorded the same sound in five different places. Listen to each one. The sound didn&rsquo;t change, only
        the room did.
      </p>

      <SetupBar keptSame={KEPT_SAME} />

      <RoomTabs items={ROOMS} audio={audio} compareFor={compareFor} ariaLabel="Rooms" idPrefix="acl-room" />
    </div>
  );
}

export default StudioAcousticsLab;
