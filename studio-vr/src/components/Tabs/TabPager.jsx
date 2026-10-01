import { useEffect } from "react";
import { useStepNav } from "./StepNavContext";
import "./TabPager.css";

/**
 * Prev / Next pager that pairs with <Tabs>: walks a flat list of tab ids in
 * order, so a student can move through every tab (across nested tab rows
 * too — pass the flattened list) without reaching back up to the tab bar.
 * It calls the same `onChange` as the Tabs, so whatever the lab does on a
 * tab switch (stop audio, mark visited, fire onInteract) happens here too.
 *
 * @param {{id:string,label:any}[]} props.items   flat, ordered
 * @param {string}   props.value                   active id
 * @param {(id:string, index:number)=>void} props.onChange
 * @param {boolean}  [props.showPosition=true]     "3 / 16" between the buttons
 * @param {string}   [props.className]
 *
 * Compact single-row bar (~30px tall): "← Prev  <label>   3/16   <label>  Next →".
 * Labels truncate with an ellipsis and drop entirely on narrow screens, so
 * the pager never costs more than one slim row. Use this for every
 * prev/next control inside an interactive — don't hand-roll another.
 *
 * Section hand-off: inside a StepNavContext provider (CoursePage), the ends
 * of the tab list continue into the previous / next course section, and the
 * page hides its own Previous/Next — one pair of buttons instead of two.
 * See StepNavContext.js.
 */
export function TabPager({ items, value, onChange, showPosition = true, className = "" }) {
  const stepNav = useStepNav();
  const register = stepNav?.register;
  // Tell the page a pager is on screen so it drops its duplicate buttons.
  useEffect(() => (register ? register() : undefined), [register]);

  const index = items.findIndex((it) => it.id === value);
  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const go = (it) => it && onChange(it.id, items.indexOf(it));

  // At either end of the tab list, fall through to the outer section.
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

export default TabPager;
