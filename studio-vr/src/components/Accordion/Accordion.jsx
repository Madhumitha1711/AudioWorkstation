import { Children, cloneElement, isValidElement, useId, useState } from "react";
import "./Accordion.css";

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
  id: _id,
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
