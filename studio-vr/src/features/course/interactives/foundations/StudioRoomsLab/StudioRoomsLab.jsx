import BriefingTabs from "../shared/BriefingTabs";
import { STUDIO_ROOMS, studioRoomImagePath } from "./studioRoomsData";

// "The Studio: Recording Room and Control Room" (Foundations, chapter 2,
// courseData.js TOPICS[id="the-studio"]). Two tabs — Recording Room /
// Control Room — each an image on top (placeholder until
// public/studio-rooms/<id>.jpg exists) and the room's description below.
// Same layout as StudioTypesLab via the shared BriefingTabs; tabs and
// panel motion are the app-wide standard (src/components/Tabs). Content
// only, no audio.
const ITEMS = STUDIO_ROOMS.map((r) => ({ ...r, image: studioRoomImagePath(r.id) }));

function StudioRoomsLab({ onInteract }) {
  return (
    <BriefingTabs
      className="srl"
      items={ITEMS}
      ariaLabel="Studio rooms"
      idPrefix="srl"
      onInteract={onInteract}
    />
  );
}

export default StudioRoomsLab;
