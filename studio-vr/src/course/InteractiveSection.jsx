import SpeakerLab from "./interactive/SpeakerLab";
import Equalizer from "../chapters/Equalizer";

const LABS = {
  "speaker-lab": SpeakerLab,
  "equalizer-lab": Equalizer,
};

function InteractiveSection({ interactive, onComplete }) {
  const Lab = LABS[interactive.kind];

  return (
    <div className="interactive-section">
      <div className="interactive-kicker">Try It Yourself</div>
      <h2 className="interactive-title">{interactive.title}</h2>
      {Lab ? <Lab onInteract={onComplete} /> : null}
    </div>
  );
}

export default InteractiveSection;
