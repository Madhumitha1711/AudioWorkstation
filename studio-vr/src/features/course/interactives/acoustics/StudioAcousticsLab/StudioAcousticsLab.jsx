import "../../shared/labs.css";
import "../shared/acousticsLabs.css";
import { useClipAudio } from "../../shared/useClipAudio";
import { RoomTabs, SetupBar } from "../shared/AcousticsUI";
import { KEPT_SAME, ROOMS } from "./studioAcousticsData";

// "Same source, different rooms" (chapter 5, courseData.js
// TOPICS[id="diffuser-panel"]). One source heard in five rooms, one
// standard tab per room (shared RoomTabs): image and player side by side,
// description underneath. Every room's A/B flips to the vocal booth
// reference at the same position.
//
// Audio: plain playback of each room's recording (studioAcousticsData.js
// `src`); a room without its file yet shows "Audio coming soon", and
// without its image (`image`) a placeholder.
// onInteract fires on the first play.
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
