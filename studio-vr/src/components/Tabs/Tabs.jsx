import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion, tabDomIds, useTabHeightTransition, useTabTransition } from "./tabMotion";
import "./Tabs.css";


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
 * @param {boolean}  [props.markVisited=true] bold the labels of tabs not yet opened
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

  useLayoutEffect(measure, [measure, idsKey]);

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


  useEffect(() => {
    const r = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(r);
  }, []);


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
          const unvisited = markVisited && !selected && !visitedSet.has(item.id);
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
              className={`ui-tabs__tab${selected ? " is-active" : ""}${unvisited ? " is-unvisited" : ""}${tabClassName ? ` ${tabClassName}` : ""}`}
              onClick={() => select(item, i)}
            >
              {renderTab ? renderTab(item, { selected, index: i }) : item.label}
              {unvisited && <span className="ui-tabs__sr">(not yet explored)</span>}
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


export function TabPanel({ idPrefix, value, index, className = "", innerClassName = "", children, ...rest }) {
  const ref = useRef(null);
  const outerRef = useRef(null);
  useTabTransition(ref, value, index);
  useTabHeightTransition(outerRef, value);
  const ids = idPrefix ? tabDomIds(idPrefix, value) : null;
  return (
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
