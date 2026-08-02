import { useEffect, useRef, useState } from "react";
import "./onboardingTour.css";

const GAP = 14; // px between the highlighted element and the guide card
const MARGIN = 12; // minimum distance kept from the viewport edge
const CORNER_MARGIN = 16; // matches the old fixed bottom-right resting spot

// Floating step card for the first-time-visitor onboarding tour. Purely
// presentational — all of the "has this step's action actually happened
// yet" logic lives in PanoramaTour (the only place that already knows
// poweredOn / activeGear / activeModule etc.), handed down here as the
// single `canContinue` boolean for the current step.
//
// Rather than sitting in one fixed corner, this card follows whatever real
// element the current step is pointing at: PanoramaTour (and the panels it
// renders) put a single `.svr-tour-glow` class on that element per step —
// the hotspots panel, its mode switch, its device list, the viewer, or a
// gear-panel choice button. Polling for that element (instead of threading
// a ref down through three separate components) also means this keeps
// tracking it through the hotspots panel's own open/close slide animation,
// window resizes, etc. without any of those components needing to know the
// tour exists beyond applying that one class.
function OnboardingTour({ steps, stepIndex, canContinue, onAdvance, onSkip, onFinish }) {
  const step = steps[stepIndex];
  const cardRef = useRef(null);
  const [pos, setPos] = useState(null); // { top, left, placement } | null

  useEffect(() => {
    // Don't keep showing the previous step's position/arrow for a frame
    // while this step's target (possibly not even mounted yet — e.g. a
    // gear panel that isn't open) gets located.
    setPos(null);

    const measure = () => {
      const card = cardRef.current;
      if (!card) return;
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const target = document.querySelector(".svr-tour-glow");

      // No matching element right now — most likely this step points at
      // something inside a gear panel the visitor has closed. Rest in the
      // same bottom-right corner the whole card used to live in, rather
      // than disappearing or freezing at a stale position.
      if (!target) {
        const top = vh - ch - CORNER_MARGIN;
        const left = vw - cw - CORNER_MARGIN;
        setPos((prev) =>
          prev && prev.placement === "corner" && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.left - left) < 0.5
            ? prev
            : { top, left, placement: "corner" },
        );
        return;
      }

      const t = target.getBoundingClientRect();
      let placement;
      let top;
      let left;
      if (t.right + GAP + cw <= vw - MARGIN) {
        placement = "right";
        left = t.right + GAP;
        top = t.top + t.height / 2 - ch / 2;
      } else if (t.left - GAP - cw >= MARGIN) {
        placement = "left";
        left = t.left - GAP - cw;
        top = t.top + t.height / 2 - ch / 2;
      } else if (t.bottom + GAP + ch <= vh - MARGIN) {
        placement = "bottom";
        top = t.bottom + GAP;
        left = t.left + t.width / 2 - cw / 2;
      } else if (t.top - GAP - ch >= MARGIN) {
        placement = "top";
        top = t.top - GAP - ch;
        left = t.left + t.width / 2 - cw / 2;
      } else {
        // The highlighted element fills too much of the screen for the
        // card to fit alongside it on any side (e.g. the full viewer during
        // "look around the studio") — fall back to the same corner rather
        // than overlapping the target.
        placement = "corner";
        top = vh - ch - CORNER_MARGIN;
        left = vw - cw - CORNER_MARGIN;
      }

      top = Math.max(MARGIN, Math.min(top, vh - ch - MARGIN));
      left = Math.max(MARGIN, Math.min(left, vw - cw - MARGIN));

      setPos((prev) =>
        prev &&
          prev.placement === placement &&
          Math.abs(prev.top - top) < 0.5 &&
          Math.abs(prev.left - left) < 0.5
          ? prev
          : { top, left, placement },
      );
    };

    measure();
    // Short-interval poll rather than a one-off measurement: the hotspots
    // panel slides open/closed over ~250ms (see studioHotspotsPanel.css),
    // and a step can also start pointing at an element that isn't in the
    // DOM yet the instant the step becomes active (e.g. right after the
    // panel force-opens). Cheap enough for a short-lived overlay like this.
    const id = setInterval(measure, 80);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [stepIndex]);

  if (!step) return null;

  const isLast = stepIndex === steps.length - 1;
  const isMandatoryPending = step.mandatory && !canContinue;

  return (
    <div
      ref={cardRef}
      className={
        "svr-onb-tour" +
        (pos ? ` svr-onb-tour--${pos.placement} is-positioned` : "")
      }
      style={pos ? { top: `${pos.top}px`, left: `${pos.left}px` } : undefined}
      role="dialog"
      aria-label="Studio tour guide"
    >
      {pos && pos.placement !== "corner" && (
        <span className="svr-onb-tour__arrow" aria-hidden="true" />
      )}

      <div className="svr-onb-tour__head">
        <span className="svr-onb-tour__step-count">
          Step {stepIndex + 1} of {steps.length}
        </span>
      </div>

      <div className="svr-onb-tour__dots" aria-hidden="true">
        {steps.map((s, i) => (
          <span
            key={s.id}
            className={
              "svr-onb-tour__dot" +
              (i === stepIndex ? " current" : i < stepIndex ? " done" : "")
            }
          />
        ))}
      </div>

      <h3 className="svr-onb-tour__title">{step.title}</h3>
      <p className="svr-onb-tour__body">{step.body}</p>

      {/* Per-step callout for concrete, ready-reference info — currently
          only "Bring the rig back online"'s correct power-on order (see
          PanoramaTour's gameModeSequenceDevices). `hint` alone renders as a
          small label; `hintSteps` (if present) renders underneath it as a
          real numbered list — one device per line rather than one dense
          arrow-joined sentence — since that's what's actually easy to
          follow while glancing back and forth between the card and the
          panel while clicking each one in order. */}
      {(step.hint || step.hintSteps) && (
        <div className="svr-onb-tour__hint">
          {step.hint && <p className="svr-onb-tour__hint-label">{step.hint}</p>}
          {step.hintSteps && step.hintSteps.length > 0 && (
            <ol className="svr-onb-tour__hint-list">
              {step.hintSteps.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {isMandatoryPending && (
        <p className="svr-onb-tour__pending">{step.pendingHint || "Complete this step to continue."}</p>
      )}
      {step.mandatory && canContinue && step.doneHint && (
        <p className="svr-onb-tour__done">{step.doneHint}</p>
      )}

      {/* The last step has no "Continue" — starting the course (on whichever
          gear panel/quiz-results screen the student has open) ends the tour
          on its own via finishTourIfActive in PanoramaTour, so this note
          just explains that shortcut exists alongside the explicit "Finish
          tour" button below, for anyone who'd rather wrap up here first and
          go find a course to start on their own terms. */}

      <div className="svr-onb-tour__footer">
        {!isLast && <button type="button" className="svr-onb-tour__skip" onClick={onSkip}>
          Skip tour
        </button>}

        {!isLast ? (
          <button
            type="button"
            className={"svr-onb-tour__next" + (isMandatoryPending ? " is-disabled" : "")}
            onClick={onAdvance}
            disabled={isMandatoryPending}
          >
            {step.mandatory ? "Continue →" : "Next →"}
          </button>
        ) : (
          <button type="button" className="svr-onb-tour__next" onClick={onFinish}>
            Finish tour
          </button>
        )}
      </div>
    </div>
  );
}

export default OnboardingTour;
