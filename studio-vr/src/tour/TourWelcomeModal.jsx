import "./tourWelcome.css";

// First thing a first-time visitor sees on this screen — a centered,
// modal "Welcome" card that gates the guided onboarding tour behind an
// explicit choice, rendered above a fully blurred backdrop covering the
// whole scene (see .svr-tour-welcome-backdrop in tourWelcome.css). Purely
// presentational, same as OnboardingTour itself: PanoramaTour owns the
// `tourWelcomeOpen` flag that decides when this is on screen, and only
// starts building/glowing the first real tour step once it's dismissed
// (see PanoramaTour's `currentTourStep`, gated on `!tourWelcomeOpen`).
function TourWelcomeModal({ onStart, onSkip }) {
  return (
    <div className="svr-tour-welcome-backdrop">
      <div
        className="svr-tour-welcome"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome to Studio VR"
      >
        <div className="svr-tour-welcome__badge" aria-hidden="true">
          ✦
        </div>
        <h2 className="svr-tour-welcome__title">Welcome to Studio VR</h2>
        <p className="svr-tour-welcome__body">Here's how to get around:</p>
        <ol className="svr-tour-welcome__steps">
          <li>Turn on the studio to unlock the control room.</li>
          <li>
            Go through your course topics in order — the next topic unlocks
            once you finish the one before it.
          </li>
          <li>Have a question? Use the Discussion tab any time.</li>
        </ol>
        <div className="svr-tour-welcome__actions">
          <button
            type="button"
            className="svr-tour-welcome__start"
            onClick={onStart}
          >
            Start tour →
          </button>
          <button
            type="button"
            className="svr-tour-welcome__skip"
            onClick={onSkip}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

export default TourWelcomeModal;
