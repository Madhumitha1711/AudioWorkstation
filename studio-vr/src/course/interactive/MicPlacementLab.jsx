import MikingRoom from "../MikingRoom";
import "./MicPlacementLab.css";

// Thin wrapper around <MikingRoom /> (src/course/MikingRoom) so it can drop
// into a lesson's interactive block the same way every other lab in
// InteractiveSection.jsx's LABS map does — see SpeakerLab.jsx's identical
// one-line wrap of SweetSpotLab. MikingRoom fills whatever height its
// parent gives it (see the prop/usage note at the top of MikingRoom.jsx),
// so this supplies the fixed-height frame a lesson's normal flowing layout
// otherwise wouldn't; `embedded` drops MikingRoom's own "Miking Techniques"
// header since InteractiveSection.jsx already renders this activity's
// title above it.
function MicPlacementLab({ onInteract }) {
  return (
    <div className="mic-placement-lab-frame">
      <MikingRoom embedded onInteract={onInteract} />
    </div>
  );
}

export default MicPlacementLab;
