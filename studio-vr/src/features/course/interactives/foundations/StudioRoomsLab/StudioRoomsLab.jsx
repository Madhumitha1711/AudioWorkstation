import BriefingTabs from "../../shared/BriefingTabs";
import { STUDIO_ROOMS, studioRoomImagePath } from "./studioRoomsData";

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
