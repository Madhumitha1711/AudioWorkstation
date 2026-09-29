import BriefingTabs from "../shared/BriefingTabs";
import "./StudioTypesLab.css";
import { STUDIO_TYPES, studioTypeImagePath } from "./studioTypesData";

const ITEMS = STUDIO_TYPES.map((t) => ({
  id: t.id,
  tab: t.tab,
  title: t.title,
  lead: t.lead,
  image: studioTypeImagePath(t.id),
  facts: [
    { label: "Layout", text: t.layout },
    { label: "Acoustics & Build", text: t.build },
    { label: "Key Use Case", text: t.use },
  ],
}));

function StudioTypesLab({ onInteract }) {
  return (
    <BriefingTabs
      className="stl"
      items={ITEMS}
      ariaLabel="Studio types"
      idPrefix="stl"
      onInteract={onInteract}
    />
  );
}

export default StudioTypesLab;
