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
import MicTechniqueGuideLab from "./mic-techniques/MicTechniqueGuideLab";
import MicPlacementGuideLab from "./mic-techniques/MicPlacementGuideLab";
import { ControlRoomComponentsLab, RecordingRoomComponentsLab } from "./foundations/StudioComponentsLab";
import StudioTypesLab from "./foundations/StudioTypesLab";
import StudioRoomsLab from "./foundations/StudioRoomsLab";
import CriticalListeningLab from "./listening/CriticalListeningLab";
import HearingAgeLab from "./listening/HearingAgeLab";
import StudioAcousticsLab from "./acoustics/StudioAcousticsLab";
import RoomTreatmentLab from "./acoustics/RoomTreatmentLab";
import { AnalogConnectorsLab, DigitalConnectorsLab } from "./wiring/ConnectorsLab";
import { AnalogCablesLab, DigitalCablesLab } from "./wiring/CablesLab";
import CableMatchLab from "./wiring/CableMatchLab";
import WhyAmplificationLab from "./preamps/WhyAmplificationLab";
import AmplificationLab from "./preamps/AmplificationLab";
import AmpPassiveSpeakerLab from "./preamps/AmpPassiveSpeakerLab";
import ActiveSpeakerLab from "./preamps/ActiveSpeakerLab";
import SubwooferLab from "./preamps/SubwooferLab";
import PreampChannelStripLab from "./preamps/PreampChannelStripLab";
import WhatIsMixerLab from "./preamps/WhatIsMixerLab";
import MixerTypesLab from "./preamps/MixerTypesLab";
import WhatIsInterfaceLab from "./interfaces/WhatIsInterfaceLab";
import LifeBeforeDawLab from "./computers/LifeBeforeDawLab";

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
  "mic-technique-guide-lab": MicTechniqueGuideLab,
  "mic-placement-guide-lab": MicPlacementGuideLab,
  "control-room-components-lab": ControlRoomComponentsLab,
  "recording-room-components-lab": RecordingRoomComponentsLab,
  "studio-rooms-lab": StudioRoomsLab,
  "studio-types-lab": StudioTypesLab,
  "critical-listening-lab": CriticalListeningLab,
  "hearing-age-lab": HearingAgeLab,
  "studio-acoustics-lab": StudioAcousticsLab,
  "room-treatment-lab": RoomTreatmentLab,
  "analog-connectors-lab": AnalogConnectorsLab,
  "digital-connectors-lab": DigitalConnectorsLab,
  "analog-cables-lab": AnalogCablesLab,
  "digital-cables-lab": DigitalCablesLab,
  "cable-match-lab": CableMatchLab,
  "why-amplification-lab": WhyAmplificationLab,
  "amplification-lab": AmplificationLab,
  "amp-passive-speaker-lab": AmpPassiveSpeakerLab,
  "active-speaker-lab": ActiveSpeakerLab,
  "subwoofer-lab": SubwooferLab,
  "preamp-channel-strip-lab": PreampChannelStripLab,
  "what-is-mixer-lab": WhatIsMixerLab,
  "mixer-types-lab": MixerTypesLab,
  "what-is-interface-lab": WhatIsInterfaceLab,
  "life-before-daw-lab": LifeBeforeDawLab,
};
