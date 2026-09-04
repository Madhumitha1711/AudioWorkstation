import { useEffect } from "react";
import InteractiveSection from "./InteractiveSection";
import "./labButtonDialog.css";

// A chapter-level lab, opened from the "top button" CoursePage.jsx renders
// for any topic listed in courseData.js's LAB_BUTTONS (or, eventually, a
// backend-supplied `topic.labButton` — see the comment there). The 3D mic
// rooms (MikingRoom/MicTechniqueRoom, via MicPlacementLab/MicTechniqueLab
// in src/course/interactive) are why this exists: they want more room than
// a lesson's normal flowing layout — or even a full standalone Lab step —
// gives them, so this opens over the *entire* course panel (topbar +
// sidebar + content, not just the .course-main column — see
// labButtonDialog.css and CoursePage.css's ".svr-course { position:
// relative }") instead of swapping into the content pane the way every
// other step does.
//
// Structurally this mirrors panorama/WelcomeVideoDialog.jsx (same
// backdrop-click / Escape / stopPropagation pattern) — the closest existing
// "modal over everything" precedent in the app — rather than any other
// piece of course-page chrome.
function LabButtonDialog({ open, title, kind, onClose, onComplete = () => {} }) {
  // Escape closes the dialog, same as clicking the backdrop or the close
  // button.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="lab-dialog-overlay"
      // Clicking the dimmed backdrop dismisses the dialog, same as the
      // close button — but not clicks inside the card itself
      // (stopPropagation below), so using the lab's own controls never
      // accidentally closes it.
      onClick={onClose}
      role="presentation"
    >
      <div
        className="lab-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lab-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lab-dialog__head">
          <h2 id="lab-dialog-title" className="lab-dialog__title">
            {title}
          </h2>
          <button
            type="button"
            className="lab-dialog__close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>
        <div className="lab-dialog__body">
          {/* title is null here — the header above already shows it (as a
              real dialog heading, not the smaller in-content one
              InteractiveSection renders for its own title), so passing it
              through too would just repeat it. */}
          <InteractiveSection
            interactive={{ title: null, kind }}
            onComplete={onComplete}
            variant="embedded"
          />
        </div>
      </div>
    </div>
  );
}

export default LabButtonDialog;
