import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clamp, dbTickPct } from "./format";
import { SEND_FADER_DB_TICKS, SEND_FADER_HEIGHT, VOLUME_FADER_SPEC, PAN_KNOB_SPEC } from "./constants";
import { TrackIcon } from "./icons";
import { Fader } from "../../components/Fader";
import { Knob } from "../../components/Knob";

// ── Sends rack — one row per Aux this track is currently routed to, plus a
// trailing "+ Send" that opens a picker of the mix's own Aux tracks (see
// addEmptyTrack's `kind: "aux"`) to route a new send at. Clicking an
// existing send's row opens a small floating fader window — level, pan, a
// PRE/POST tap toggle and Mute — the same "click a chip, get a focused
// popup" pattern InsertRack's own "+ Insert" picker uses, and for the same
// reason: portaled to <body> so it isn't clipped by the dock's/Mixer
// strip's own short, scrolling panels. Unlike InsertRack's chain, sends
// have no meaningful order (each is an independent path to a different
// bus), so there's no drag-to-reorder here. Purely presentational, same as
// InsertRack: every callback is one of DawWorkstationScreen's own
// send-management functions (addSend/removeSend/updateSend/
// setSendPrePost), pre-bound by the caller to whichever trackId it's
// rendering for.
export function SendRack({
  sends,
  auxOptions,
  onAddSend,
  onRemoveSend,
  onUpdateSend,
  onSetPrePost,
  // Creates a brand-new Aux Bus track (same as the New Track dialog's own
  // "Aux Bus" option, given an optional name) and returns its id, so the
  // bus picker below can offer "+ New Aux Bus" right alongside the existing
  // ones instead of making you back out, add the track separately, then
  // reopen this same picker.
  onCreateAux,
  compact = false,
  // Same "always N lettered rows" layout InsertRack's own `fixedSlots` gives
  // the Arrange tracklist row — see that prop's own comment. Every empty row
  // opens the exact same bus picker; which one you click only changes where
  // it renders from.
  fixedSlots,
  dense = false,
  // The rest are all about the send-window popup's own "TRACK"/meter
  // section — the owning track's own identity/pan/solo, not anything about
  // an individual send, so they're plain values/callbacks from whichever
  // track row is rendering this rack, same as onAddSend et al.
  trackId,
  trackName,
  trackPan = 0,
  trackSolo = false,
  onToggleTrackSolo,
  getSendMeter,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState(null);
  const addBtnRef = useRef(null); // the single trigger — non-fixedSlots layout
  const addBtnRefs = useRef(new Map()); // empty-row index -> button — fixedSlots layout
  const pickerRef = useRef(null);

  // "+ New Aux Bus" swaps for a small inline name field instead of creating
  // the bus the instant you click it, so it doesn't just land as "Aux 7" —
  // see the picker's own render below. Reset alongside the picker itself
  // (closePicker) so it never reopens mid-way through a half-typed name.
  const [creatingAux, setCreatingAux] = useState(false);
  const [newAuxName, setNewAuxName] = useState("");

  const [openSendId, setOpenSendId] = useState(null);
  const [openPos, setOpenPos] = useState(null);
  const slotRefs = useRef(new Map());
  const windowRef = useRef(null);

  // Send-window level meter — polled only while a window is actually open
  // (see getSendMeter/getSendMeterLevel), same coarse-interval treatment
  // the Mixer view's own per-track meters use rather than a tighter rAF
  // loop, since a send fader's meter doesn't need to be that precise.
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
  // If the send this popup was pointed at disappears (its Aux got removed,
  // or the send itself was taken off this track), close instead of pointing
  // at nothing.
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

  // Close on outside click/tap, Escape, or scroll/resize — same reasoning
  // (and same shape) as InsertRack's own picker-dismissal effect.
  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (e) => {
      if (pickerRef.current?.contains(e.target)) return;
      if (addBtnRef.current?.contains(e.target)) return;
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

  useEffect(() => {
    if (!openSendId) return;
    const onPointerDown = (e) => {
      if (windowRef.current?.contains(e.target) || slotRefs.current.get(openSendId)?.contains(e.target)) return;
      closeSendWindow();
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeSendWindow();
    };
    const onScrollOrResize = () => closeSendWindow();
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
  }, [openSendId, closeSendWindow]);

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
                        // Cancel just the name step, back to the "+ New Aux
                        // Bus" button — stopPropagation so the picker's own
                        // document-level Escape listener (which closes the
                        // whole picker) doesn't also fire off this same key.
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

            {/* PRE / FMP — Pro Tools' own send-window toggle row (SAFE was
                dropped from here: this build has no automation-write pass
                for it to actually guard, so it would only ever be a
                cosmetic flag). Both remaining toggles are fully wired —
                tap point, and pan source, respectively — see
                playFrom/setTrackPan/updateSend. */}
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

            {/* TRACK — the owning channel's own identity + Solo, so you can
                audition just this send's source while the window's open,
                same as Pro Tools' own send window shows. Wired to the exact
                same toggleTrackSolo every channel strip/tracklist row
                already uses. */}
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

            {/* AUTO was dropped from here — this build has no automation
                record/playback engine to switch modes on, so it would only
                ever be a cosmetic dropdown. */}

            {/* The dense (Arrange tracklist) layout hides each slot's own
                inline "×" to save width — this is the only remove affordance
                in that case, so it's always here rather than only in dense
                mode, for one consistent place to look for it. */}
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
