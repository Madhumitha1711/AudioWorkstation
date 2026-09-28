import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion, tabDomIds, useTabHeightTransition, useTabTransition } from "./tabMotion";
import "./Tabs.css";

// App-wide standard tabs — every tab set in the app renders through this
// (see CLAUDE.md, "Tabs standard"). Two pieces:
//
//   <Tabs>      the tab bar. A single indicator element (underline, or pill
//               for variant="segmented") is measured against the active
//               button and glides to it with a transform transition, so
//               switching reads as one continuous motion instead of one
//               underline disappearing and another appearing.
//               Tabs already opened get a small primary-colour "explored"
//               dot (markVisited) and the bar ends with an "N/M explored"
//               count (showCount) — both on by default.
//   <TabPanel>  the panel. On every tab change it plays a short fade +
//               slide in the direction of travel (right tab → content comes
//               from the right) via the Web Animations API, so the panel is
//               NOT remounted by the animation — child state, audio refs,
//               canvases etc. survive — and eases its height between
//               panels of different sizes. Callers that want a remount (to reset
//               a module / stop its audio) still just put a `key` on the
//               content inside.
//   useTabTransition(ref, activeKey, index)
//               the same panel animation as a hook, for panels that are an
//               existing element with its own classes (e.g. the tour gear-
//               panel body, which is also the scroll container).
//
// Timing/easing/colors are CSS custom properties (index.css :root
// --motion-*, and --tabs-* on the component) so a feature re-skins tabs by
// setting tokens on a wrapper, never by re-implementing them.
//
// Accessibility: WAI-ARIA tabs pattern — role=tablist/tab/tabpanel, roving
// tabindex, Left/Right/Home/End move focus AND selection (automatic
// activation), disabled tabs are skipped. Motion is dropped entirely under
// prefers-reduced-motion.

/**
 * @param {object}   props
 * @param {{id:string,label?:any,title?:string,disabled?:boolean,ariaLabel?:string}[]} props.items
 * @param {string}   props.value            active item id
 * @param {(id:string, index:number)=>void} props.onChange  called only when the id changes
 * @param {"underline"|"segmented"} [props.variant="underline"]
 * @param {"md"|"sm"} [props.size="md"]
 * @param {boolean}  [props.fill]           stretch tabs to share the full width equally
 * @param {string}   props.ariaLabel
 * @param {string}   [props.idPrefix]       prefix for tab/panel ids (pair with <TabPanel idPrefix>)
 * @param {(item, state:{selected:boolean,index:number})=>any} [props.renderTab]  custom button content
 * @param {any}      [props.trailing]       extra content pinned to the right end of the bar (after the count)
 * @param {boolean}  [props.markVisited=true] show the "explored" dot on tabs already opened
 * @param {boolean}  [props.showCount=markVisited] show the "N/M explored" count at the end of the bar
 * @param {Iterable<string>} [props.visited] controlled set of explored ids (defaults to internal tracking)
 * @param {string}   [props.className]
 * @param {string}   [props.tabClassName]
 */
export function Tabs({
  items,
  value,
  onChange,
  variant = "underline",
  size = "md",
  fill = false,
  ariaLabel,
  idPrefix,
  renderTab,
  trailing,
  markVisited = true,
  showCount = markVisited,
  visited,
  className = "",
  tabClassName = "",
}) {
  const autoId = useId();
  const prefix = idPrefix || `tabs${autoId.replace(/:/g, "")}`;
  const listRef = useRef(null);
  const tabRefs = useRef(new Map());
  const [ind, setInd] = useState(null);
  const [ready, setReady] = useState(false);
  const idsKey = items.map((t) => t.id).join("|");

  // "Explored" dots: every tab the user has opened (except the current one)
  // gets a small primary-colour dot. Tracked here by default; pass
  // `visited` (Set or array of ids) to control it from outside, e.g. when
  // the parent also shows an "N/M explored" count.
  const [seen, setSeen] = useState(() => new Set([value]));
  if (!visited && !seen.has(value)) setSeen(new Set(seen).add(value));
  const visitedSet = visited ? new Set(visited) : seen;
  const exploredCount = items.filter((t) => visitedSet.has(t.id)).length;

  const measure = useCallback(() => {
    const btn = tabRefs.current.get(value);
    if (!btn || !listRef.current) return;
    const next = { x: btn.offsetLeft, y: btn.offsetTop, w: btn.offsetWidth, h: btn.offsetHeight };
    setInd((p) => (p && p.x === next.x && p.y === next.y && p.w === next.w && p.h === next.h ? p : next));
  }, [value]);

  // Measure before paint so the indicator never flashes in the wrong place.
  useLayoutEffect(measure, [measure, idsKey]);

  // Re-measure when anything that affects geometry changes: container or
  // tab resize (responsive layout, a panel that was display:none opening),
  // and web fonts finishing loading (label widths change).
  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => measure());
      ro.observe(list);
      tabRefs.current.forEach((b) => ro.observe(b));
    }
    let alive = true;
    document.fonts?.ready?.then(() => alive && measure());
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, [measure, idsKey]);

  // Transitions are switched on only after the first placement, so the
  // indicator doesn't slide in from x=0 on mount.
  useEffect(() => {
    const r = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(r);
  }, []);

  // Keep the active tab visible when the bar scrolls horizontally (narrow
  // screens) — scroll the bar itself, never the page.
  useEffect(() => {
    const list = listRef.current;
    const btn = tabRefs.current.get(value);
    if (!list || !btn || list.scrollWidth <= list.clientWidth) return;
    const l = btn.offsetLeft;
    const r = l + btn.offsetWidth;
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    if (l < list.scrollLeft) list.scrollTo({ left: l - 16, behavior });
    else if (r > list.scrollLeft + list.clientWidth) list.scrollTo({ left: r - list.clientWidth + 16, behavior });
  }, [value]);

  const select = (item, index) => {
    if (item.disabled || item.id === value) return;
    onChange?.(item.id, index);
  };

  const onKeyDown = (e) => {
    const enabled = items.map((t, i) => ({ t, i })).filter(({ t }) => !t.disabled);
    if (!enabled.length) return;
    const cur = Math.max(0, enabled.findIndex(({ t }) => t.id === value));
    const n = enabled.length;
    const target = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 0, End: n - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    const { t, i } = enabled[((target % n) + n) % n];
    tabRefs.current.get(t.id)?.focus();
    select(t, i);
  };

  const rootCls = [
    "ui-tabs",
    `ui-tabs--${variant}`,
    `ui-tabs--${size}`,
    fill ? "ui-tabs--fill" : "",
    ready ? "is-ready" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const indStyle = ind
    ? {
        width: ind.w,
        height: variant === "segmented" ? ind.h : undefined,
        transform: `translate3d(${ind.x}px, ${variant === "segmented" ? ind.y : 0}px, 0)`,
      }
    : { opacity: 0 };

  return (
    <div className={rootCls}>
      <div ref={listRef} className="ui-tabs__list" role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
        <span className="ui-tabs__indicator" style={indStyle} aria-hidden="true" />
        {items.map((item, i) => {
          const selected = item.id === value;
          const ids = tabDomIds(prefix, item.id);
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) tabRefs.current.set(item.id, el);
                else tabRefs.current.delete(item.id);
              }}
              type="button"
              role="tab"
              id={ids.tab}
              aria-controls={ids.panel}
              aria-selected={selected}
              aria-label={item.ariaLabel}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              title={item.title}
              className={`ui-tabs__tab${selected ? " is-active" : ""}${tabClassName ? ` ${tabClassName}` : ""}`}
              onClick={() => select(item, i)}
            >
              {renderTab ? renderTab(item, { selected, index: i }) : item.label}
              {markVisited && !selected && visitedSet.has(item.id) && (
                <>
                  <span className="ui-tabs__dot" aria-hidden="true" />
                  <span className="ui-tabs__sr">(explored)</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {(showCount || trailing != null) && (
        <div className="ui-tabs__trailing">
          {showCount && (
            <span className="ui-tabs__count" aria-live="polite" title={`${exploredCount} of ${items.length} tabs explored`}>
              <b>{exploredCount}</b>/{items.length}
              <span className="ui-tabs__count-word"> explored</span>
            </span>
          )}
          {trailing}
        </div>
      )}
    </div>
  );
}

/**
 * Standard tab panel. `value` = active tab id, `index` = its position.
 * Pass the same `idPrefix` as the <Tabs> it belongs to for aria wiring.
 */
export function TabPanel({ idPrefix, value, index, className = "", innerClassName = "", children, ...rest }) {
  const ref = useRef(null);
  const outerRef = useRef(null);
  useTabTransition(ref, value, index);
  useTabHeightTransition(outerRef, value);
  const ids = idPrefix ? tabDomIds(idPrefix, value) : null;
  return (
    // Outer element clips the horizontal slide so it can never flash a
    // horizontal scrollbar on a scrolling ancestor; `clip` (unlike
    // `hidden`) leaves vertical overflow visible.
    // It also carries the height transition, so content below glides.
    <div ref={outerRef} className={`ui-tabpanel-clip ${className}`.trim()}>
      <div
        ref={ref}
        role="tabpanel"
        id={ids?.panel}
        aria-labelledby={ids?.tab}
        tabIndex={0}
        className={`ui-tabpanel ${innerClassName}`.trim()}
        {...rest}
      >
        {children}
      </div>
    </div>
  );
}

export default Tabs;
