import BriefingTabs from "../shared/BriefingTabs";
import "./StudioTypesLab.css";
import { STUDIO_TYPES, studioTypeImagePath } from "./studioTypesData";

// Ported from design/studio-types-tabs.html — the "Types of Recording
// Studios" briefing (Foundations, chapter 3, courseData.js
// TOPICS[id="studio-types"]). Six switchable tabs, one per studio type;
// each panel is an image, a title + lead, and three labelled facts
// (Layout / Acoustics & Build / Key Use Case). Content only, no audio.
//
// Layout, tabs and motion are the shared foundations BriefingTabs (which
// uses the app-wide standard Tabs from src/components/Tabs) — this file
// only maps the data. Differences from the mockup, because it renders
// inside the course content column rather than as a standalone page:
//   - no page <h1> — the lesson / InteractiveSection heading covers it.
//   - the image slot loads public/studio-types/<id>.jpg and falls back to a
//     dashed placeholder until that photo exists.
//   - unopened tabs are bold, plus an N/6 explored count (standard Tabs), so
//     the student can see which types they haven't opened yet.
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
