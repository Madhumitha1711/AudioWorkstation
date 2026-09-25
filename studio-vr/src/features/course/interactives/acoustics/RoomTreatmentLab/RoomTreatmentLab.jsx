import "../../shared/labs.css";
import "../shared/acousticsLabs.css";
import "./RoomTreatmentLab.css";
import { useRoomAudio } from "../shared/useRoomAudio";
import { RoomPlayer, SetupBar, WhyItMatters } from "../shared/AcousticsUI";
import RoomPlan, { RoomPlanLegend } from "./RoomPlan";
import { ALL_STEPS, KEPT_SAME, OVERFOAM, STEPS, TAKEAWAY, WHY } from "./roomTreatmentData";

// Ported from design/room-treatment.html — "Same room, step by step"
// (chapter 5, courseData.js TOPICS[id="diffuser-panel"]), the companion to
// StudioAcousticsLab. One source, one room, one mic position; treatment is
// added one type at a time, each step a player + short explanation.
//
// Differences from the mockup (it renders inside the course content column):
//   - no page <h1>/theme button — the lesson heading and ThemeContext cover
//     those; colors come from the course tokens (acousticsLabs.css).
//   - each step has a top-down RoomPlan showing the treatment added so far
//     and what it does to reflections, flutter echo and corner bass.
//   - every step's A/B button flips to the bare room at the same position.
//   - an extra "cover every wall in foam" experiment for the mockup's "More
//     foam isn't always better" point, A/B'd against the fully treated room.
//
// Audio: plain playback of each step's recording (roomTreatmentData.js
// `src`); a step without its file yet shows "Audio coming soon".
// onInteract fires on the first play.
function RoomTreatmentLab({ onInteract }) {
  const audio = useRoomAudio({ items: ALL_STEPS, onFirstPlay: onInteract });
  const bare = STEPS[0];
  const full = STEPS[STEPS.length - 1];

  const isLive = (id) => {
    const p = audio.playing;
    return !!p && !p.mystery && ((p.id === id && !p.fromCompare) || p.fromCompare === id);
  };
  // While a step's A/B is sounding the reference, its plan shows the
  // reference room — you're hearing that room, so you see it too.
  const planFor = (step) => {
    const p = audio.playing;
    if (p && p.fromCompare === step.id) return ALL_STEPS.find((s) => s.id === p.id).plan;
    return step.plan;
  };

  function renderStep(step, compareTo, extraClass = "") {
    const live = isLive(step.id);
    const showingRef = audio.playing?.fromCompare === step.id;
    return (
      <article key={step.id} className={`acl-room rtl-step${live ? " is-live" : ""}${extraClass}`}>
        <div className="rtl-plan">
          <RoomPlan plan={planFor(step)} live={live} />
          {showingRef && <span className="rtl-plan-flag">Showing: {compareTo.title}</span>}
        </div>
        <div className="rtl-body">
          <div className="acl-room-tag">{step.tag}</div>
          <h3>{step.title}</h3>
          <RoomPlayer
            id={step.id}
            label={step.title}
            audio={audio}
            compare={compareTo ? { id: compareTo.id, label: compareTo.title, short: compareTo.short } : null}
          />
          <p>{step.body}</p>
        </div>
      </article>
    );
  }

  return (
    <div className="lab acl rtl">
      <p className="acl-intro">
        We recorded the same sound in the same room five times, adding one type of acoustic treatment each time.
        Listen to how each step changes the sound.
      </p>

      <SetupBar keptSame={KEPT_SAME} />
      <RoomPlanLegend />

      <div className="acl-rooms">{STEPS.map((step) => renderStep(step, step.id === bare.id ? null : bare))}</div>

      <div className="rtl-experiment-label">Try it</div>
      <div className="acl-rooms">{renderStep(OVERFOAM, full, " rtl-step--experiment")}</div>

      <WhyItMatters points={WHY} takeaway={TAKEAWAY} />
    </div>
  );
}

export default RoomTreatmentLab;
