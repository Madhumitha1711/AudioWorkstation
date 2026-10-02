import { useEffect, useRef, useState } from "react";
import { Tabs, useTabTransition, tabDomIds } from "../../../../components/Tabs";
import { quickHelpHoverProps } from "../../help/helpHover";
import "./speakerListeningLab.css";

export function LabShell({ open, onClose, onBackToOverview, onStartCourse, onQuickHelp, icon, title, tabs, modules }) {
  const [activeTab, setActiveTab] = useState(0);
  const bodyRef = useRef(null);
  useTabTransition(bodyRef, activeTab, activeTab);

  useEffect(() => {
    if (open) setActiveTab(0);
  }, [open]);

  if (!open) return null;

  const tab = tabs[activeTab];
  const Module = modules[activeTab];
  const ids = tabDomIds("llab", tab.id);
  const help = (text) => quickHelpHoverProps(onQuickHelp, text);

  return (
    <div className="svr-tour-gear-panel llab-panel-shell">
      <div className="svr-tour-gear-panel__head">
        <span className="svr-tour-gear-badge llab-badge" aria-hidden="true">{icon}</span>
        <div className="svr-tour-gear-panel__titles">
          <div className="svr-tour-gear-panel__title">{title}</div>
          <div className="svr-tour-gear-panel__kicker">
            {tab.label} · {activeTab + 1} of {tabs.length}
          </div>
        </div>
        <button
          onClick={onClose}
          className="svr-tour-gear-panel__close"
          aria-label={`Close ${title}`}
          type="button"
          {...help("Close this lab and go back to the panel.")}
        >
          ×
        </button>
      </div>

      <Tabs
        className="llab-tabs"
        tabClassName="llab-tab"
        variant="segmented"
        size="sm"
        fill
        items={tabs.map((t) => ({ id: t.id, title: t.label, n: t.n, short: t.short }))}
        value={tab.id}
        onChange={(_, i) => setActiveTab(i)}
        ariaLabel={`${title} experiments`}
        idPrefix="llab"
        renderTab={(t) => (
          <>
            <span className="llab-tab__n mono">{t.n}</span>
            <span className="llab-tab__label">{t.short}</span>
          </>
        )}
      />

      <div
        ref={bodyRef}
        className="svr-tour-gear-panel__body"
        role="tabpanel"
        id={ids.panel}
        aria-labelledby={ids.tab}
        key={tab.id}
      >
        <Module />
      </div>

      <div className="svr-tour-gear-panel__footer">
        <div className="svr-tour-gear-panel__footer-row">
          <button
            type="button"
            className="svr-tour-btn svr-tour-btn-secondary"
            onClick={onBackToOverview}
            {...help("Go back to the choose-how-to-start overview.")}
          >
            ← Back
          </button>
          {onStartCourse && (
            <button
              type="button"
              className="svr-tour-btn svr-tour-btn-primary"
              onClick={onStartCourse}
              {...help("Jump straight into the full lesson for this topic.")}
            >
              Start course →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
