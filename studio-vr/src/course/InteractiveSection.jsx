import SpeakerLab from "./interactive/SpeakerLab";
import Equalizer from "../chapters/Equalizer";
import FrequencyLab from "./interactive/FrequencyLab";
import AmplitudeLab from "./interactive/AmplitudeLab";
import WavelengthLab from "./interactive/WavelengthLab";
import PhaseLab from "./interactive/PhaseLab";
import HarmonicsLab from "./interactive/HarmonicsLab";
import TimbreLab from "./interactive/TimbreLab";
import MicTypeLab from "./interactive/MicTypeLab";
import MicPolarPatternLab from "./interactive/MicPolarPatternLab";
import MicSelectionLab from "./interactive/MicSelectionLab";
import MicPlacementLab from "./interactive/MicPlacementLab";
import MicTechniqueLab from "./interactive/MicTechniqueLab";

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
  // "Microphones: Types, Characteristics & Selection" (chapter 6,
  // courseData.js TOPICS[id="mic-stand"]) — one lab per subchapter, ported
  // from design/mic-types-chapter.html the same way the "What Is Sound?"
  // labs above were ported from design/what-is-sound-chapter.html. Not yet
  // referenced from courseData.js's mic-stand topic — like the sound labs,
  // this chapter's real lesson content/blocks are authored in studio-cms
  // once that chapter is built out there; these are ready to be wired in
  // by `kind` at that point. (There's no standalone "Characteristics" lab —
  // it read as unclear/redundant next to Type, so its spec-comparison view
  // was removed; per-type characteristics still show inside mic-type-lab.)
  "mic-type-lab": MicTypeLab,
  "mic-polar-pattern-lab": MicPolarPatternLab,
  "mic-selection-lab": MicSelectionLab,
  // "Placement" subchapter — a 3D room (src/course/MikingRoom) instead of
  // the 2D layouts the other mic-stand labs use above; MicPlacementLab is
  // just the fixed-height embed frame it needs (see that file).
  "mic-placement-lab": MicPlacementLab,
  // "Microphone Techniques and Stereo Recording" (chapter 7,
  // courseData.js TOPICS[id="stereo-overheads"]) — MikingRoom's sibling 3D
  // room (src/course/MicTechniqueRoom), covering Close/Spot/Distant-Room/
  // Stereo/Multi Miking; MicTechniqueLab is just the fixed-height embed
  // frame it needs (see that file). Not yet
  // referenced from courseData.js's stereo-overheads topic — same "ready
  // ahead of studio-cms content" status as mic-placement-lab above.
  "mic-technique-lab": MicTechniqueLab,
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
