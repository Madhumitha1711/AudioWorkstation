import SpeakerLab from "./interactive/SpeakerLab";
import Equalizer from "../chapters/Equalizer";
import FrequencyLab from "./interactive/FrequencyLab";
import AmplitudeLab from "./interactive/AmplitudeLab";
import WavelengthLab from "./interactive/WavelengthLab";
import PhaseLab from "./interactive/PhaseLab";
import HarmonicsLab from "./interactive/HarmonicsLab";
import TimbreLab from "./interactive/TimbreLab";

const LABS = {
  "speaker-lab": SpeakerLab,
  "equalizer-lab": Equalizer,
  // "What Is Sound?" (chapter 1) — one small Web-Audio-backed demo per
  // sound property, each its own Section/interactive-block in studio-cms
  // (see STRAPI_SCHEMA_NOTES.md's "Section blocks dynamic zone" and
  // design/what-is-sound-chapter.html, the mockup these were built from).
  "frequency-lab": FrequencyLab,
  "amplitude-lab": AmplitudeLab,
  "wavelength-lab": WavelengthLab,
  "phase-lab": PhaseLab,
  "harmonics-lab": HarmonicsLab,
  "timbre-lab": TimbreLab,
};

// `variant="embedded"` is used when this activity sits inside a lesson's
// own SectionBlocks list, right below that lesson's own heading (see
// CoursePage.jsx's "lesson-title" and SectionBlocks.jsx) — the default
// "standalone" variant is for a topic's own dedicated Lab step, where this
// is the only heading on the page. See the ".interactive-section.embedded"
// rule in SectionBlocks.css for what that changes.
function InteractiveSection({ interactive, onComplete, variant = "standalone" }) {
  const Lab = LABS[interactive.kind];

  return (
    <div className={`interactive-section${variant === "embedded" ? " embedded" : ""}`}>
      {/* title is optional in studio-cms (course.interactive-activity) —
          skip the heading entirely when it's blank, same as
          SectionBlocks.jsx already does for a video/image-text block's
          own optional title/heading, rather than rendering an empty
          <h2>. */}
      {interactive.title && <h2 className="interactive-title">{interactive.title}</h2>}
      {Lab ? <Lab onInteract={onComplete} /> : null}
    </div>
  );
}

export default InteractiveSection;
