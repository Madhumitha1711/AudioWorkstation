import { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clamp } from "../lib/format";
import { PLUGIN_DEFS_GROUPED } from "../lib/constants";
import { PluginIcon } from "./icons";
import { useDismiss } from "../lib/useDismiss";

export function InsertRack({
  chain,
  onAddPlugin,
  onOpenSlot,
  onToggleBypass,
  onMove,
  onRemove,
  onReorder,
  draggingKey,
  setDraggingKey,
  compact = false,
  fixedSlots,
  dense = false,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState(null);
  const btnRef = useRef(null);
  const addBtnRefs = useRef(new Map());
  const pickerRef = useRef(null);
  const inChainKeys = useMemo(() => new Set(chain.map((s) => s.key)), [chain]);

  const openPickerFrom = useCallback((btn) => {
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(220, window.innerWidth - 16);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openDown = spaceBelow >= 180 || spaceBelow >= spaceAbove;
    const left = clamp(rect.left, 8, window.innerWidth - width - 8);
    setPickerPos({
      left,
      width,
      openDown,
      top: openDown ? rect.bottom + 4 : undefined,
      bottom: openDown ? undefined : window.innerHeight - rect.top + 4,
      maxHeight: Math.max(120, (openDown ? spaceBelow : spaceAbove) - 12),
    });
    setPickerOpen(true);
  }, []);
  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerPos(null);
  }, []);

  useDismiss(pickerOpen, (t) => [pickerRef.current, btnRef.current, ...addBtnRefs.current.values()].some((el) => el?.contains(t)), closePicker);

  const emptyCount = fixedSlots ? Math.max(0, fixedSlots - chain.length) : 1;
  const slotLabel = (i) => (fixedSlots ? String.fromCharCode(97 + i).toUpperCase() : `${i + 1}`);

  return (
    <div className={"insert-rack" + (compact ? " is-compact" : "") + (dense ? " is-dense" : "")}>
      {chain.map((slot, i) => (
        <div
          key={slot.key}
          className={
            "insert-slot" +
            (slot.bypassed ? " is-bypassed" : "") +
            (slot.status === "error" ? " is-error" : "") +
            (draggingKey === slot.key ? " is-dragging" : "")
          }
          style={{ "--pc": `var(--${slot.color})` }}
          draggable={!dense}
          onDragStart={() => setDraggingKey(slot.key)}
          onDragEnd={() => setDraggingKey(null)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (draggingKey) onReorder(draggingKey, slot.key);
            setDraggingKey(null);
          }}
          onClick={() => onOpenSlot(slot.key)}
          title={`Insert ${slotLabel(i)}: ${slot.name} — click to edit${dense ? "" : ", drag to reorder"}`}
        >
          <span className="insert-slot__num mono">{slotLabel(i)}</span>
          {!dense && <PluginIcon pkey={slot.key} />}
          <span className="insert-slot__name">{slot.name}</span>
          {slot.status === "loading" && <span className="insert-slot__status">…</span>}
          {!dense && (
            <span className="insert-slot__btns">
              <button
                className={"power" + (slot.bypassed ? "" : " is-on")}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBypass(slot.key);
                }}
                title={slot.bypassed ? "Bypassed — click to re-enable" : "Click to bypass"}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <path d="M8 2v5" strokeLinecap="round" />
                  <path d="M11.5 3.6a5 5 0 1 1-7 0" strokeLinecap="round" fill="none" />
                </svg>
              </button>
              {!compact && (
                <>
                  <button
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(slot.key, -1);
                    }}
                    title="Move earlier"
                  >
                    ‹
                  </button>
                  <button
                    disabled={i === chain.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMove(slot.key, 1);
                    }}
                    title="Move later"
                  >
                    ›
                  </button>
                </>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(slot.key);
                }}
                title="Remove"
              >
                ×
              </button>
            </span>
          )}
        </div>
      ))}

      {Array.from({ length: emptyCount }, (_, j) => {
        const i = chain.length + j;
        return (
          <div className="insert-slot insert-slot--empty" key={`empty-${i}`}>
            <button
              type="button"
              ref={(el) => {
                if (!fixedSlots) {
                  btnRef.current = el;
                } else if (el) {
                  addBtnRefs.current.set(i, el);
                } else {
                  addBtnRefs.current.delete(i);
                }
              }}
              className="insert-add-btn"
              aria-expanded={pickerOpen}
              title={fixedSlots ? `Insert ${slotLabel(i)} — click to add a plugin` : "Add a plugin"}
              onClick={(e) => (pickerOpen ? closePicker() : openPickerFrom(e.currentTarget))}
            >
              <span className="insert-slot__num mono">{slotLabel(i)}</span>
              <span>{dense ? "+" : "+ Insert"}</span>
            </button>
          </div>
        );
      })}

      {pickerOpen &&
        pickerPos &&
        createPortal(
          <div
            ref={pickerRef}
            className={"chapter-lab daw-root insert-picker" + (compact ? " is-compact" : "")}
            style={{
              left: pickerPos.left,
              width: pickerPos.width,
              top: pickerPos.top,
              bottom: pickerPos.bottom,
              maxHeight: pickerPos.maxHeight,
            }}
          >
            {PLUGIN_DEFS_GROUPED.map(([tag, defs]) => (
              <div key={tag} className="insert-picker__group">
                <div className="insert-picker__group-label mono">{tag.toUpperCase()}</div>
                {defs.map((def) => (
                  <button
                    key={def.key}
                    type="button"
                    className={`insert-picker__item c-${def.color}` + (inChainKeys.has(def.key) ? " is-active" : "")}
                    onClick={() => {
                      onAddPlugin(def);
                      closePicker();
                    }}
                  >
                    <PluginIcon pkey={def.key} />
                    <span>{def.name}</span>
                    {inChainKeys.has(def.key) && <span className="insert-picker__led" />}
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
