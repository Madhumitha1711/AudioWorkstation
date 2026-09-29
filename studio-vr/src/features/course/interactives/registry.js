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
  "frequency-lab": FrequencyLab,
  "amplitude-lab": AmplitudeLab,
  "wavelength-lab": WavelengthLab,
  "phase-lab": PhaseLab,
  "harmonics-lab": HarmonicsLab,
  "timbre-lab": TimbreLab,
  "mic-type-lab": MicTypeLab,
  "mic-polar-pattern-lab": MicPolarPatternLab,
  "mic-selection-lab": MicSelectionLab,
  "mic-placement-lab": MicPlacementLab,
  "mic-technique-lab": MicTechniqueLab,
  "studio-components-lab": StudioComponentsLab,
  "studio-rooms-lab": StudioRoomsLab,
  "studio-types-lab": StudioTypesLab,
  "critical-listening-lab": CriticalListeningLab,
  "hearing-age-lab": HearingAgeLab,
  "studio-acoustics-lab": StudioAcousticsLab,
  "room-treatment-lab": RoomTreatmentLab,
};
