import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clamp } from "./format";
import { PLUGIN_DEFS_GROUPED } from "./constants";
import { PluginIcon } from "./icons";

// ── Channel-strip insert list — numbered insert slots (Logic's own "Audio
// FX" rack), each occupied slot showing a bypass toggle + reorder + remove,
// plus a trailing empty slot whose "+ Insert" button opens a
// category-grouped plugin picker instead of always showing every plugin as
// a big always-visible tile grid. Purely presentational: every callback
// prop is one of this screen's own chain-management functions
// (addOrSelectPlugin, removePlugin, movePlugin, reorderPlugin,
// toggleBypass), pre-bound by the caller to whichever (trackId, regionId)
// it's rendering for — this component owns no chain state itself besides
// the picker's own open/closed flag, so the exact same instance works both
// in the bottom dock (whole arrangement) and in each Mixer-view channel
// strip (see `compact`) without risking any of the actual audio-graph
// bookkeeping those functions do.
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
  // `fixedSlots` switches this rack into the Pro Tools-style "always N
  // lettered rows" layout used inline in each Arrange tracklist row (see
  // .track-row__racks below) instead of the normal "however many plugins,
  // plus one trailing + Insert row" layout the dock/Mixer strip use.
  // Occupied slots are still just the chain in order — this app's chain has
  // no concept of an empty gap between two plugins — so every empty ROW
  // (there can be several at once, one per unused letter) does the exact
  // same thing: opens the picker to append the next plugin. `dense` pairs
  // with it for the tighter row height that context needs.
  fixedSlots,
  dense = false,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Where the picker renders — computed from whichever "+ Insert" trigger
  // was actually clicked (see openPicker below, and addBtnRefs for the
  // fixedSlots case, where there can be more than one such trigger). The
  // picker itself is portaled to <body> (see the createPortal call below)
  // and positioned with `position: fixed` off that button's own coordinates,
  // rather than rendered inline where the dock's own `overflow-y: auto` (a
  // short, bottom-docked panel — see .dock in dawWorkstationScreen.css) was
  // silently clipping it, hiding whichever categories didn't fit in the
  // sliver of space left over. Escaping to the body also means it isn't
  // clipped by the Mixer view's per-strip layout, or the tracklist's, either.
  const [pickerPos, setPickerPos] = useState(null);
  const btnRef = useRef(null); // the single trigger — non-fixedSlots layout
  const addBtnRefs = useRef(new Map()); // empty-row index -> button — fixedSlots layout (several triggers, one shared picker)
  const pickerRef = useRef(null);
  const inChainKeys = useMemo(() => new Set(chain.map((s) => s.key)), [chain]);

  const openPickerFrom = useCallback((btn) => {
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(220, window.innerWidth - 16);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    // Prefer opening downward (reads more naturally under the button) —
    // only flip upward when there's genuinely more room that way, so a
    // short list near the top of a tall dock still opens down instead of
    // needlessly flipping.
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

  // Close on outside click/tap, Escape, or the page scrolling/resizing out
  // from under it (the portal itself can't move with a scroll the way an
  // inline-positioned element would).
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e) => {
      if (pickerRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      for (const btn of addBtnRefs.current.values()) {
        if (btn?.contains(e.target)) return;
      }
      closePicker();
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") closePicker();
    };
    const onScrollOrResize = () => closePicker();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [pickerOpen, closePicker]);

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
