import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clamp, dbTickPct } from "../lib/format";
import { SEND_FADER_DB_TICKS, SEND_FADER_HEIGHT, VOLUME_FADER_SPEC, PAN_KNOB_SPEC } from "../lib/constants";
import { TrackIcon } from "./icons";
import { Fader } from "../../../../components/controls/Fader";
import { Knob } from "../../../../components/controls/Knob";
import { useDismiss } from "../lib/useDismiss";

export function SendRack({
  sends,
  auxOptions,
  onAddSend,
  onRemoveSend,
  onUpdateSend,
  onSetPrePost,
  onCreateAux,
  compact = false,
  fixedSlots,
  dense = false,
  trackId,
  trackName,
  trackPan = 0,
  trackSolo = false,
  onToggleTrackSolo,
  getSendMeter,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState(null);
  const addBtnRef = useRef(null);
  const addBtnRefs = useRef(new Map());
  const pickerRef = useRef(null);

  const [creatingAux, setCreatingAux] = useState(false);
  const [newAuxName, setNewAuxName] = useState("");

  const [openSendId, setOpenSendId] = useState(null);
  const [openPos, setOpenPos] = useState(null);
  const slotRefs = useRef(new Map());
  const windowRef = useRef(null);

  const [sendMeterLevel, setSendMeterLevel] = useState(0);
  useEffect(() => {
    if (!openSendId || !getSendMeter) {
      setSendMeterLevel(0);
      return undefined;
    }
    const id = setInterval(() => setSendMeterLevel(getSendMeter(openSendId)), 60);
    return () => clearInterval(id);
  }, [openSendId, getSendMeter]);

  const openSend = sends.find((s) => s.id === openSendId) || null;
  useEffect(() => {
    if (openSendId && !openSend) {
      setOpenSendId(null);
      setOpenPos(null);
    }
  }, [openSendId, openSend]);

  const openPickerFrom = useCallback((btn) => {
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(200, window.innerWidth - 16);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openDown = spaceBelow >= 140 || spaceBelow >= spaceAbove;
    const left = clamp(rect.left, 8, window.innerWidth - width - 8);
    setPickerPos({
      left,
      width,
      top: openDown ? rect.bottom + 4 : undefined,
      bottom: openDown ? undefined : window.innerHeight - rect.top + 4,
      maxHeight: Math.max(100, (openDown ? spaceBelow : spaceAbove) - 12),
    });
    setPickerOpen(true);
  }, []);
  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerPos(null);
    setCreatingAux(false);
    setNewAuxName("");
  }, []);

  const openSendWindow = useCallback((sendId) => {
    const btn = slotRefs.current.get(sendId);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const height = 300;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openDown = spaceBelow >= height || spaceBelow >= rect.top;
    const left = clamp(rect.left, 8, window.innerWidth - 8 - 116);
    setOpenPos({
      left,
      top: openDown ? rect.bottom + 4 : undefined,
      bottom: openDown ? undefined : window.innerHeight - rect.top + 4,
    });
    setOpenSendId(sendId);
  }, []);
  const closeSendWindow = useCallback(() => {
    setOpenSendId(null);
    setOpenPos(null);
  }, []);

  useDismiss(pickerOpen, (t) => [pickerRef.current, addBtnRef.current, ...addBtnRefs.current.values()].some((el) => el?.contains(t)), closePicker);

  useDismiss(openSendId, (t) => [windowRef.current, slotRefs.current.get(openSendId)].some((el) => el?.contains(t)), closeSendWindow);

  const routedBusIds = useMemo(() => new Set(sends.map((s) => s.busId)), [sends]);
  const availableAux = auxOptions.filter((a) => !routedBusIds.has(a.id));
  const openSendBus = openSend ? auxOptions.find((a) => a.id === openSend.busId) : null;
  const emptyCount = fixedSlots ? Math.max(0, fixedSlots - sends.length) : 1;

  return (
    <div className={"send-rack" + (compact ? " is-compact" : "") + (dense ? " is-dense" : "")}>
      {sends.map((send, i) => {
        const bus = auxOptions.find((a) => a.id === send.busId) || { name: "Missing bus", color: "teal" };
        return (
          <div
            key={send.id}
            ref={(el) => {
              if (el) slotRefs.current.set(send.id, el);
              else slotRefs.current.delete(send.id);
            }}
            className={"send-slot" + (send.muted ? " is-muted" : "") + (openSendId === send.id ? " is-open" : "")}
            style={{ "--pc": `var(--${bus.color})` }}
            onClick={() => (openSendId === send.id ? closeSendWindow() : openSendWindow(send.id))}
            title={`Send ${String.fromCharCode(97 + i).toUpperCase()}: ${bus.name}${send.prePost === "pre" ? " (pre-fader)" : ""} — click to adjust level/pan`}
          >
            <span className="send-slot__num mono">{String.fromCharCode(97 + i)}</span>
            <span className="send-slot__name">{bus.name}</span>
            <span className="send-slot__level mono">{send.muted ? "—" : Math.round((send.level ?? 1) * 100)}</span>
            {!dense && (
              <button
                className="send-slot__remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveSend(send.id);
                }}
                title="Remove this send"
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      {Array.from({ length: emptyCount }, (_, j) => {
        const i = sends.length + j;
        return (
          <div className="send-slot send-slot--empty" key={`empty-${i}`}>
            <button
              type="button"
              ref={(el) => {
                if (!fixedSlots) {
                  addBtnRef.current = el;
                } else if (el) {
                  addBtnRefs.current.set(i, el);
                } else {
                  addBtnRefs.current.delete(i);
                }
              }}
              className="send-add-btn"
              aria-expanded={pickerOpen}
              title={`Send ${String.fromCharCode(97 + i).toUpperCase()} — route to an Aux bus, or create a new one`}
              onClick={(e) => (pickerOpen ? closePicker() : openPickerFrom(e.currentTarget))}
            >
              <span className="send-slot__num mono">{String.fromCharCode(97 + i)}</span>
              <span>{dense ? "+" : "+ Send"}</span>
            </button>
          </div>
        );
      })}

      {pickerOpen &&
        pickerPos &&
        createPortal(
          <div
            ref={pickerRef}
            className={"chapter-lab daw-root send-picker" + (compact ? " is-compact" : "")}
            style={{ left: pickerPos.left, width: pickerPos.width, top: pickerPos.top, bottom: pickerPos.bottom, maxHeight: pickerPos.maxHeight }}
          >
            {onCreateAux &&
              (creatingAux ? (
                <div className="send-picker__create-form">
                  <input
                    type="text"
                    className="send-picker__create-input"
                    placeholder="Aux name…"
                    value={newAuxName}
                    autoFocus
                    onChange={(e) => setNewAuxName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const newBusId = onCreateAux(newAuxName.trim());
                        if (newBusId) onAddSend(newBusId);
                        closePicker();
                      } else if (e.key === "Escape") {
                        e.stopPropagation();
                        setCreatingAux(false);
                        setNewAuxName("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="send-picker__create-confirm"
                    title="Create this Aux bus"
                    onClick={() => {
                      const newBusId = onCreateAux(newAuxName.trim());
                      if (newBusId) onAddSend(newBusId);
                      closePicker();
                    }}
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="send-picker__item send-picker__create"
                  title="Add a new Aux Bus track and route this send to it"
                  onClick={() => setCreatingAux(true)}
                >
                  <span className="send-picker__create-plus">+</span>
                  <span>New Aux Bus</span>
                </button>
              ))}
            {availableAux.length === 0 ? (
              <div className="send-picker__empty">
                {auxOptions.length === 0 ? "No other Aux Bus tracks yet." : "Already sending to every Aux bus."}
              </div>
            ) : (
              availableAux.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`send-picker__item c-${a.color}`}
                  onClick={() => {
                    onAddSend(a.id);
                    closePicker();
                  }}
                >
                  <TrackIcon ikey="aux" />
                  <span>{a.name}</span>
                </button>
              ))
            )}
          </div>,
          document.body,
        )}

      {openSend &&
        openPos &&
        createPortal(
          <div
            ref={windowRef}
            className="chapter-lab daw-root send-window"
            style={{
              "--pc": `var(--${openSendBus?.color || "teal"})`,
              left: openPos.left,
              top: openPos.top,
              bottom: openPos.bottom,
            }}
          >
            <div className="send-window__head">
              <span className="send-window__name" title={openSendBus?.name}>
                {openSendBus?.name || "Send"}
              </span>
              <button className="send-window__close" onClick={closeSendWindow} aria-label="Close">
                ×
              </button>
            </div>

            <div className="send-window__toggles">
              <button
                type="button"
                className={"send-window__toggle" + (openSend.prePost === "pre" ? " is-on" : "")}
                onClick={() => onSetPrePost(openSend.id, openSend.prePost === "pre" ? "post" : "pre")}
                title={
                  openSend.prePost === "pre"
                    ? "Pre-fader — taps before this channel's own volume fader, so this send stays constant no matter where the fader sits"
                    : "Post-fader (default) — taps after this channel's own volume fader, so pulling the fader down pulls this send down too"
                }
              >
                PRE
              </button>
              <button
                type="button"
                className={"send-window__toggle" + (openSend.fmp ? " is-on" : "")}
                onClick={() => onUpdateSend(openSend.id, { fmp: !openSend.fmp })}
                title={
                  openSend.fmp
                    ? "Follow Main Pan (on) — this send's pan tracks the track's own Pan knob live; its own Pan control below is parked"
                    : "Follow Main Pan — link this send's pan to the track's own Pan knob instead of an independent value"
                }
              >
                FMP
              </button>
            </div>

            <div className="send-window__pan">
              <Knob
                spec={PAN_KNOB_SPEC}
                value={openSend.fmp ? trackPan ?? 0 : openSend.pan ?? 0}
                onChange={(v) => onUpdateSend(openSend.id, { pan: v })}
                disabled={!!openSend.fmp}
                size={34}
              />
            </div>

            <div className="send-window__fader-row">
              <div className="send-window__scale mono" style={{ height: SEND_FADER_HEIGHT }}>
                {SEND_FADER_DB_TICKS.map((db) => (
                  <span key={db} style={{ top: `${dbTickPct(db)}%` }}>
                    {db === 0 ? "0" : db}
                  </span>
                ))}
                <span style={{ top: "100%" }}>-∞</span>
              </div>
              <div className="send-window__fader">
                <Fader
                  spec={VOLUME_FADER_SPEC}
                  value={openSend.level ?? 1}
                  onChange={(v) => onUpdateSend(openSend.id, { level: v })}
                  height={SEND_FADER_HEIGHT}
                />
              </div>
              <div className="send-window__meter" title="Send level (post-fader, into the bus)" style={{ height: SEND_FADER_HEIGHT }}>
                <i style={{ height: `${clamp(sendMeterLevel * 260, 2, 100)}%` }} />
              </div>
            </div>

            <button
              type="button"
              className={"send-window__mute" + (openSend.muted ? " is-on" : "")}
              title={openSend.muted ? "Unmute this send" : "Mute this send"}
              onClick={() => onUpdateSend(openSend.id, { muted: !openSend.muted })}
            >
              M
            </button>

            <div className="send-window__section mono">TRACK</div>
            <div className="send-window__track">
              <span className="send-window__track-name" title={trackName}>
                {trackName || "Track"}
              </span>
              <button
                type="button"
                className={"tbtn s" + (trackSolo ? " is-on" : "")}
                title={trackSolo ? "Unsolo track" : "Solo track"}
                onClick={() => onToggleTrackSolo && onToggleTrackSolo(trackId)}
              >
                S
              </button>
            </div>

            <button
              type="button"
              className="send-window__remove"
              title="Remove this send"
              onClick={() => {
                onRemoveSend(openSend.id);
                closeSendWindow();
              }}
            >
              Remove Send
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
