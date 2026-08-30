import { useRef, useState } from "react";
import "./quickHelpPanel.css";

// Persistent "Quick Help" popup shown for as long as help mode is on (see
// the toolbar's help-mode toggle in PanoramaTour.jsx) — the on-demand
// replacement for the old first-time-visitor onboarding tour (see
// PanoramaTour.jsx's own comment on `helpModeOn`/`helpMessage`).
//
// Purely presentational otherwise, same spirit as the old OnboardingTour
// card: every panel on this screen (the toolbar, the hotspot markers
// themselves, the gear info panel, StudioHotspotsPanel, every hands-on
// lab, the quiz) gets handed an `onQuickHelp` callback (PanoramaTour's
// `setHelpMessage`) and calls it with a short description on hover/focus
// and `null` on leave/blur (see helpHover.js's `quickHelpHoverProps`).
// This component just displays whatever the latest one was.
//
// Unlike the old tour card, this never blocks or dims the scene, never
// forces a sequence, and stays mounted the whole time help mode is on
// rather than only appearing next to one specific step's target — a
// visitor can turn it on, explore in any order, and turn it off again
// whenever they like.
//
// Draggable by its header: it starts docked bottom-right (see
// quickHelpPanel.css), but it can end up sitting over whatever the
// visitor is actually trying to look at or hover next, so letting them
// drag it out of the way matters more here than it would for a fixed
// tooltip. Position is local state — every fresh mount (i.e. every time
// help mode is turned back on, since PanoramaTour only renders this while
// `helpModeOn` is true) starts back at the default docked spot rather than
// remembering the last drag.
function QuickHelpPanel({ message }) {
  const panelRef = useRef(null);
  // null = still at the CSS-anchored default position (bottom/right, see
  // quickHelpPanel.css); once set, these are explicit viewport pixel
  // coordinates that pointermove keeps up to date while dragging.
  const [pos, setPos] = useState(null);
  // Pointer position + the panel's own on-screen position at the moment
  // the drag started, so every pointermove only has to add the pointer's
  // net travel since then — not something that drifts or compounds like
  // repeatedly reading getBoundingClientRect() mid-drag would.
  const dragOriginRef = useRef(null);

  const handleDragStart = (e) => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOriginRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      panelTop: rect.top,
      panelLeft: rect.left,
    };
    // Pointer Capture redirects every subsequent pointer event to this
    // element until pointerup, regardless of where the cursor actually
    // is on screen — no need for a document-level mousemove/mouseup pair
    // (and the cleanup that would come with it) just to keep tracking the
    // drag once the cursor leaves the header.
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e) => {
    const origin = dragOriginRef.current;
    const panel = panelRef.current;
    if (!origin || !panel) return;
    const dx = e.clientX - origin.pointerX;
    const dy = e.clientY - origin.pointerY;
    const margin = 8;
    const maxTop = window.innerHeight - panel.offsetHeight - margin;
    const maxLeft = window.innerWidth - panel.offsetWidth - margin;
    setPos({
      top: Math.min(Math.max(origin.panelTop + dy, margin), Math.max(margin, maxTop)),
      left: Math.min(Math.max(origin.panelLeft + dx, margin), Math.max(margin, maxLeft)),
    });
  };

  const handleDragEnd = (e) => {
    dragOriginRef.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={panelRef}
      className="svr-quick-help"
      role="status"
      aria-live="polite"
      // Switches from the CSS-anchored bottom/right resting spot to exact
      // viewport coordinates the first time it's dragged; `right`/`bottom`
      // are cleared too so they can't fight the new `left`/`top` on a
      // browser that still honors both.
      style={pos ? { top: pos.top, left: pos.left, right: "auto", bottom: "auto" } : undefined}
    >
      <div
        className="svr-quick-help__head"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <span className="svr-quick-help__icon" aria-hidden="true">
          🛟
        </span>
        <span className="svr-quick-help__title">Quick Help</span>
        <span className="svr-quick-help__grip" aria-hidden="true" title="Drag to move">
          ⠿
        </span>
      </div>
      <p className="svr-quick-help__body">
        {message || "Hover (or tab to) any control or piece of gear on screen to see what it does."}
      </p>
    </div>
  );
}

export default QuickHelpPanel;
