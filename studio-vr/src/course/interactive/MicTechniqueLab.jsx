import MicTechniqueRoom from "../MicTechniqueRoom";
import "./MicTechniqueLab.css";

// Thin wrapper around <MicTechniqueRoom /> (src/course/MicTechniqueRoom) so
// it can drop into a lesson's interactive block the same way every other
// lab in InteractiveSection.jsx's LABS map does — identical pattern to
// MicPlacementLab.jsx's one-line wrap of MikingRoom, its chapter-6
// counterpart (MikingRoom / MicPlacementLab -> MicTechniqueRoom /
// MicTechniqueLab). MicTechniqueRoom fills whatever height its parent
// gives it (see the prop/usage note at the top of MicTechniqueRoom.jsx),
// so this supplies the fixed-height frame a lesson's normal flowing layout
// otherwise wouldn't; `embedded` drops its own internal header since
// InteractiveSection.jsx already renders this activity's title above it.
function MicTechniqueLab({ onInteract }) {
  return (
    <div className="mic-technique-lab-frame">
      <MicTechniqueRoom embedded onInteract={onInteract} />
    </div>
  );
}

export default MicTechniqueLab;
