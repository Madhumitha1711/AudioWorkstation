import { useRef, useState } from "react";
import "./QuickHelpPanel.css";

function QuickHelpPanel({ message }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);
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
