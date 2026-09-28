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
import MicPolarPatternLab from "./microphones/MicPolarPatternLab";
import MicSelectionLab from "./microphones/MicSelectionLab";
import MicPlacementLab from "./microphones/MicPlacementLab";
import MicTechniqueLab from "./mic-techniques/MicTechniqueLab";
import StudioComponentsLab from "./foundations/StudioComponentsLab";
import StudioTypesLab from "./foundations/StudioTypesLab";
import StudioRoomsLab from "./foundations/StudioRoomsLab";
import CriticalListeningLab from "./listening/CriticalListeningLab";
import HearingAgeLab from "./listening/HearingAgeLab";
import StudioAcousticsLab from "./acoustics/StudioAcousticsLab";
import RoomTreatmentLab from "./acoustics/RoomTreatmentLab";

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
  // mic-type-lab uses the shared ListenTabs layout (as the chapter 5
  // acoustics labs do): one tab per mic type, photo | Listen card with a
  // source picker, description below.
  //
  // mic-selection-lab ("Pick the mic for the job", ported from
  // design/mic-selection-lab.html) is its own component again: the student
  // answers source / loudness / room / desired sound, all five mic families
  // are re-scored live, and the lab explains the pick ("Why this mic",
  // ranked fit for all five, "Why not the others"). It used to just alias
  // MicTypeLab.
  //
  // mic-polar-pattern-lab uses the same ListenTabs layout: one tab per
  // polar pattern, the interactive polar diagram | Listen card (position
  // readout, source picker), description below.
  "mic-type-lab": MicTypeLab,
  "mic-polar-pattern-lab": MicPolarPatternLab,
  "mic-selection-lab": MicSelectionLab,
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
  // design/studio-components-tabs.html ("Key Elements of the Recording
  // Space"): area tabs → component tabs → detail panel, all on the standard
  // Tabs, for the 16 components across Control Room / Recording Room ×
  // Electronic / Non-electronic. Content only, no audio. Same "ready ahead of
  // studio-cms content" status as the mic labs above — reference this
  // kind from the-studio's interactive block in studio-cms.
  "studio-components-lab": StudioComponentsLab,
  // Same chapter 2 — "Recording Room / Control Room": two tabs, each an
  // image (placeholder until public/studio-rooms/<id>.jpg exists) over the
  // room's description. Shares its layout with studio-types-lab via
  // foundations/shared/BriefingTabs. Mapped from courseData.js's
  // the-studio topic; reference this kind from that chapter's interactive
  // block in studio-cms too.
  "studio-rooms-lab": StudioRoomsLab,
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
  // "Listening Skills, Hearing Health, and Critical Listening" (Foundations,
  // chapter 4, courseData.js TOPICS[id="listening-skills"]) — ported from
  // design/critical-listening-lab-1.html: "Spot the problem" ear training.
  // Beginner / Intermediate / Pro tabs: a recorded clip with one (Beginner)
  // or several (Intermediate, Pro) problems on top, the full list of 15
  // problems with descriptions below; find them all and the clean take
  // plays. All audio is real recordings played as-is — clean/problem pairs
  // from public/audio/critical-listening/, no processing — with its own
  // AudioContext, not spatialAudioEngine. Reference this kind
  // from the listening-skills chapter's interactive block in studio-cms.
  "critical-listening-lab": CriticalListeningLab,
  // Same chapter 4, "Hearing Health" subchapter — ported from
  // design/hearing-health-age.html: "How old are your ears?". A headphone
  // screen (high-frequency sweep + threshold staircase per ear) that turns
  // into a Hearing Age vs calendar age result using ISO 7029 medians
  // (hearingAgeModel.js), plus an audiogram, insights, studio ear-care tips
  // and a "The scale" tab explaining the maths. Live Web Audio tones via its
  // own AudioContext (useLabAudio), not spatialAudioEngine. Past results are
  // saved per browser (localStorage "svr-hearing-age-history") for the
  // trend. Reference this kind from the listening-skills chapter's
  // Hearing Health interactive block in studio-cms.
  "hearing-age-lab": HearingAgeLab,
  // "Studio Acoustics and Room Treatment" (Room & Acoustics, chapter 5,
  // courseData.js TOPICS[id="diffuser-panel"]) — two companion labs ported
  // from design/studio-acoustics-rooms.html ("Same source, different
  // rooms": booth / treated room / bedroom / bathroom / hall) and
  // design/room-treatment.html ("Same room, step
  // by step": bare → absorption → bass traps → diffusers → fully treated,
  // plus an over-foamed experiment). Both are horizontal standard tabs (one
  // per room / step) with an image and a player side by side and the
  // description below. Plain playback of public/audio/<lab>/<id>.wav, images
  // from public/<lab>/<id>.jpg — placeholders until each file exists.
  "studio-acoustics-lab": StudioAcousticsLab,
  "room-treatment-lab": RoomTreatmentLab,
};
