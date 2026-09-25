// Registry of every interactive lab a course step or Section block can
// embed, keyed by the free-text `kind` string authored in studio-cms
// (course.interactive-activity) / courseData.js `interactive.kind`.
//
// Labs are grouped by chapter under src/features/course/interactives/<chapter>/,
// one folder per lab (see README.md in this folder). To add a lab: build it
// in its chapter folder, import it here, and add a `kind` entry below —
// the generic InteractiveSection renderer (components/InteractiveSection)
// picks it up automatically.

import SpeakerLab from "./speakers/SpeakerLab";
import Equalizer from "../../gear-studio/Equalizer";
import FrequencyLab from "./sound/FrequencyLab";
import AmplitudeLab from "./sound/AmplitudeLab";
import WavelengthLab from "./sound/WavelengthLab";
import PhaseLab from "./sound/PhaseLab";
import HarmonicsLab from "./sound/HarmonicsLab";
import TimbreLab from "./sound/TimbreLab";
import MicTypeLab from "./microphones/MicTypeLab";
import MicTypeCompareLab from "./microphones/MicTypeCompareLab";
import MicPolarPatternLab from "./microphones/MicPolarPatternLab";
import MicPolarCompareLab from "./microphones/MicPolarCompareLab";
import MicPlacementLab from "./microphones/MicPlacementLab";
import MicTechniqueLab from "./mic-techniques/MicTechniqueLab";
import StudioComponentsLab from "./foundations/StudioComponentsLab";
import StudioTypesLab from "./foundations/StudioTypesLab";

export const LABS = {
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
  // by `kind` at that point.
  //
  // mic-type-lab is image + interaction only (type picker, portrait,
  // listen panel, no prose); mic-type-compare-lab is the three-column
  // spec-comparison view, image plus a short clean summary sentence per
  // type (MIC_TYPES[].summary in micLabShared.js) instead of the full
  // paragraphs. There used to be a third, separate mic-selection-lab
  // (MicSelectionLab.jsx), but it converged on being visually identical
  // to mic-type-lab — same room-toggle type picker, same listen panel —
  // so it was removed; the kind below just aliases MicTypeLab directly
  // now rather than keeping a duplicate component around.
  //
  // mic-polar-pattern-lab/mic-polar-compare-lab are the same browse/
  // compare pairing applied to polar patterns instead of mic types, and
  // share mic-type-lab's/mic-type-compare-lab's visual design (room-toggle
  // picker, comparison grid). The one deliberate difference: mic-polar-
  // compare-lab has no dropdown in its columns — POLAR_PATTERNS in
  // micLabShared.js only ever has three entries, so "compare" always means
  // all three at once, fixed, rather than picking which ones out of a
  // larger set the way mic-type-compare-lab's five types do.
  "mic-type-lab": MicTypeLab,
  "mic-type-compare-lab": MicTypeCompareLab,
  "mic-polar-pattern-lab": MicPolarPatternLab,
  "mic-polar-compare-lab": MicPolarCompareLab,
  "mic-selection-lab": MicTypeLab,
  // "Placement" subchapter — a 3D room (src/features/course/interactives/microphones/MicPlacementLab/MikingRoom) instead of
  // the 2D layouts the other mic-stand labs use above; MicPlacementLab is
  // just the fixed-height embed frame it needs (see that file).
  "mic-placement-lab": MicPlacementLab,
  // "Microphone Techniques and Stereo Recording" (chapter 7,
  // courseData.js TOPICS[id="stereo-overheads"]) — MikingRoom's sibling 3D
  // room (src/features/course/interactives/mic-techniques/MicTechniqueLab/MicTechniqueRoom), covering Close/Spot/Distant-Room/
  // Stereo/Multi Miking; MicTechniqueLab is just the fixed-height embed
  // frame it needs (see that file). Not yet
  // referenced from courseData.js's stereo-overheads topic — same "ready
  // ahead of studio-cms content" status as mic-placement-lab above.
  "mic-technique-lab": MicTechniqueLab,
  // "Studio Components" briefing (Foundations, alongside chapter 2
  // courseData.js TOPICS[id="the-studio"]) — ported from
  // design/studio-components-chapter.html: a master/detail browser of the
  // 16 components across Control Room / Recording Room × Electronic /
  // Non-electronic. Content only, no audio. Same "ready ahead of
  // studio-cms content" status as the mic labs above — reference this
  // kind from the-studio's interactive block in studio-cms.
  "studio-components-lab": StudioComponentsLab,
  // "Types of Studios and Audio Workspaces" (Foundations, chapter 3,
  // courseData.js TOPICS[id="studio-types"]) — ported from
  // design/studio-types-tabs.html: six switchable tabs (Commercial, Home &
  // Project, Mixing & Mastering, Voiceover & Podcast, Post & Foley,
  // Broadcast & Streaming), each an image + Layout / Acoustics & Build /
  // Key Use Case. Content only, no audio. Photos load from
  // public/studio-types/<id>.jpg once added (placeholder until then).
  // Reference this kind from the studio-types chapter's interactive block
  // in studio-cms.
  "studio-types-lab": StudioTypesLab,
};
