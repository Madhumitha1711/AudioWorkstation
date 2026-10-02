import { useEffect } from "react";
import { useStepNav } from "./StepNavContext";
import "./TabPager.css";

export function TabPager({ items, value, onChange, showPosition = true, className = "" }) {
  const stepNav = useStepNav();
  const register = stepNav?.register;
  useEffect(() => (register ? register() : undefined), [register]);

  const index = items.findIndex((it) => it.id === value);
  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const go = (it) => it && onChange(it.id, items.indexOf(it));

  const prevSection = !prev && stepNav?.prev ? stepNav.prev : null;
  const nextSection = !next && stepNav?.next ? stepNav.next : null;

  const prevLabel = prev?.label ?? prevSection?.label;
  const nextLabel = next?.label ?? nextSection?.label;
  const titleFor = (dir, label, isSection) =>
    typeof label === "string" ? `${dir}${isSection ? " section" : ""}: ${label}` : undefined;

  return (
    <nav className={`ui-pager ${className}`.trim()} aria-label="Previous and next">
      <button
        type="button"
        className={`ui-pager__btn${prevSection ? " ui-pager__btn--section" : ""}`}
        disabled={!prev && !prevSection}
        onClick={() => (prev ? go(prev) : stepNav?.goPrev())}
        title={titleFor("Previous", prevLabel, !!prevSection)}
      >
        <span className="ui-pager__dir">{prevSection ? "← Prev section" : "← Prev"}</span>
        {prevLabel != null && <span className="ui-pager__name">{prevLabel}</span>}
      </button>
      {showPosition && (
        <span className="ui-pager__pos" aria-live="polite">
          <b>{index + 1}</b>/{items.length}
        </span>
      )}
      <button
        type="button"
        className={`ui-pager__btn ui-pager__btn--next${nextSection ? " ui-pager__btn--section" : ""}`}
        disabled={!next && !nextSection}
        onClick={() => (next ? go(next) : stepNav?.goNext())}
        title={titleFor("Next", nextLabel, !!nextSection)}
      >
        {nextLabel != null && <span className="ui-pager__name">{nextLabel}</span>}
        <span className="ui-pager__dir">{nextSection ? "Next section →" : "Next →"}</span>
      </button>
    </nav>
  );
}
