import { Children, cloneElement, isValidElement, useId, useState } from "react";
import "./Accordion.css";

// Accordion — the reveal row first built privately for WhyAmplificationLab
// ("What do you think happened?"), promoted here so every lab opens and
// closes content the same way. One bordered, rounded row per item: a round
// marker (number, "?" …), the title, an optional right-aligned summary
// (e.g. the current answer) and a chevron; the body eases open below.
//
//   <AccordionItem marker="01" title="What are you recording?" summary="Lead vocal">
//     …
//   </AccordionItem>
//
//   <Accordion value={openId} onChange={setOpenId}>      // one open at a time
//     <AccordionItem id="source" … />
//   </Accordion>
//
// Motion: a <button aria-expanded> + region rather than <details>, so the
// open/close can animate. The body sits in a grid whose single row eases
// between 0fr and 1fr — that tweens to the content's natural height without
// measuring it — on the same --motion-panel-duration / ease-out-expo as the
// Tabs panel. The body stays mounted (just `inert` when closed) so the
// transition has something to animate, child state survives, and screen
// readers / Tab skip it. Reduced motion → instant.
//
// State: an item is uncontrolled (`defaultOpen`) unless `open` + `onToggle`
// are passed. Inside <Accordion>, the group controls its items by `id`
// (single-open; clicking the open one closes it). `onOpen` fires each time
// an item opens — labs use it for onInteract.
//
// Re-skin only via tokens on `className`: --acc-accent, --acc-well,
// --acc-border, --acc-radius. Don't restyle .ui-acc__* rules.

const Chevron = () => (
  <svg className="ui-acc__chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export function AccordionItem({
  title,
  marker,
  summary,
  children,
  open: openProp,
  defaultOpen = false,
  onToggle,
  onOpen,
  className = "",
  id: _id, // consumed by <Accordion>
  ...rest
}) {
  const [openState, setOpenState] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const uid = useId();

  function toggle() {
    const next = !open;
    if (!controlled) setOpenState(next);
    onToggle?.(next);
    if (next) onOpen?.();
  }

  return (
    <div {...rest} className={`ui-acc${open ? " is-open" : ""} ${className}`.trim()}>
      <button
        type="button"
        className="ui-acc__head"
        aria-expanded={open}
        aria-controls={`${uid}-body`}
        id={`${uid}-head`}
        onClick={toggle}
      >
        {marker != null && (
          <span className="ui-acc__marker" aria-hidden="true">
            {marker}
          </span>
        )}
        <span className="ui-acc__title">{title}</span>
        {summary != null && <span className="ui-acc__summary">{summary}</span>}
        <Chevron />
      </button>
      <div className="ui-acc__body" id={`${uid}-body`} role="region" aria-labelledby={`${uid}-head`} inert={!open}>
        <div className="ui-acc__clip">
          <div className="ui-acc__content">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Accordion({ value, onChange, children, className = "" }) {
  return (
    <div className={`ui-acc-group ${className}`.trim()}>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const id = child.props.id;
        return cloneElement(child, {
          open: value === id,
          onToggle: (next) => {
            onChange?.(next ? id : null);
            child.props.onToggle?.(next);
          },
        });
      })}
    </div>
  );
}

export default Accordion;
