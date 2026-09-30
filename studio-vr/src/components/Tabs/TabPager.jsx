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
 */
export function TabPager({ items, value, onChange, showPosition = true, className = "" }) {
  const index = items.findIndex((it) => it.id === value);
  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const go = (it) => it && onChange(it.id, items.indexOf(it));

  return (
    <nav className={`ui-pager ${className}`.trim()} aria-label="Previous and next">
      <button type="button" className="ui-pager__btn" disabled={!prev} onClick={() => go(prev)}>
        <small>← Previous</small>
        <span className="ui-pager__name">{prev ? prev.label : "—"}</span>
      </button>
      {showPosition && (
        <span className="ui-pager__pos" aria-live="polite">
          <b>{index + 1}</b>/{items.length}
        </span>
      )}
      <button type="button" className="ui-pager__btn ui-pager__btn--next" disabled={!next} onClick={() => go(next)}>
        <small>Next →</small>
        <span className="ui-pager__name">{next ? next.label : "—"}</span>
      </button>
    </nav>
  );
}

export default TabPager;
