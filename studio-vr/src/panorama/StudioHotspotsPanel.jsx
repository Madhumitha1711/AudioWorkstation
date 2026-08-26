import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./studioHotspotsPanel.css";
import { ICONS, buildDeviceList } from "./hotspotDevices";
import { powerUp, powerDown } from "../store/controlRoomSlice";

// The left-docked "Studio Hotspots" panel — the Control Room's power-up
// flow from design/studio-hotspots-panel.html, ported in full: mute
// button, the "Power up in order" sequence, and the always-on device rail
// all live permanently in the docked rail instead of behind a separate
// button. Deliberately dropped from that original design: the confetti/
// stars completion overlay — finishing the sequence unlocks the rest of
// the scene (see PanoramaTour's onPoweredChange), and that un-graying is
// the reward, so a separate celebration screen on top of it would be
// redundant.
//
// One deliberate departure from the design: clicking a row (anywhere) still
// drives real navigation — it walks the camera up to that hotspot in the
// scene and opens its info panel, exactly like clicking the hotspot's
// marker directly. That's app navigation, so it isn't gated by power state.
//
// SIGNAL_ORDER/ICONS/buildDeviceList live in hotspotDevices.js, shared with
// nothing else right now but kept separate so this file stays focused on
// the panel itself.

function buildClue(devices, canonicalIndex) {
  if (canonicalIndex === 0) return "Clue: no dependency — this powers first.";
  const prevTitle = devices[canonicalIndex - 1]?.title;
  if (canonicalIndex === devices.length - 1) {
    return `Clue: requires ${prevTitle} — this powers last.`;
  }
  return `Clue: requires ${prevTitle}.`;
}

function freshRoundState(devices) {
  const status = {};
  devices.forEach((d) => {
    status[d.id] = "off";
  });
  return { status };
}

// Same shape as freshRoundState, but every device starts "on" instead of
// "off" — used to restore a room to "powered" (see controlRoomPowered in
// StudioHotspotsPanel) instead of wiping it back to fresh/off.
function allOnRoundState(devices) {
  const status = {};
  devices.forEach((d) => {
    status[d.id] = "on";
  });
  return { status };
}

function StudioHotspotsPanel({
  room,
  activeGear,
  activeModule,
  onSelectDevice,
  // Called with `true` once every device in this room's chain is "on" —
  // classicPowerUpSequence never sets this any other way. PanoramaTour uses
  // this to unlock the rest of the scene (see the svr-tour-locked wrapper
  // there) once the visitor has actually powered the rig up, and re-locks
  // it if a device gets switched back off (e.g. Power down) — the lock
  // state simply mirrors "are all devices currently on" live.
  onPoweredChange,
  // Which real element on this panel the onboarding tour (see
  // src/tour/OnboardingTour.jsx, wired up from PanoramaTour.jsx) wants
  // highlighted right now, or null/undefined outside of the tour:
  // "devices" glows the device list, and "power-button" glows the "Power
  // up in order" button specifically. Purely a `.svr-tour-glow` class
  // toggle — no other behavior here changes based on the tour. The "select
  // a hotspot" step doesn't highlight anything on this panel — it points at
  // the hotspot marker directly in the scene instead (see PanoramaTour's
  // tourGlowMarkerId), since it asks the visitor to click there rather than
  // use this panel.
  tourHighlight,
  // True while PanoramaTour has a pending "focus this hotspot" request (see
  // its own focus-hotspot effect) and the rig isn't powered yet — a visitor
  // routed here from a specific chapter (CoursePage's "← Back to the
  // studio") came for that piece of gear, not to redo the power-up
  // sequence first. Runs the same instant sequence as clicking "Power up
  // Control Room" — see the effect below.
  autoPowerUp,
  // Bumped (to a new, distinct number each time — see PanoramaTour's own
  // comment on powerDownSignal) whenever the visitor restarts the tour
  // from the toolbar's replay button. Powers everything back off so the
  // tour's first step ("power up the rig") isn't asking the visitor to
  // click a button that's already lit — see the effect below.
  powerDownSignal,
}) {
  const [collapsed, setCollapsed] = useState(false);
  // Tracks whether the panel was auto-collapsed by the effect below (as
  // opposed to the visitor manually clicking the toggle), so closing the DAW
  // module knows whether it's responsible for bringing the panel back.
  const wasAutoCollapsedRef = useRef(false);
  // This panel is specifically the Control Room's power-up signal chain —
  // it's keyed off SIGNAL_ORDER, a fixed list of Control Room gear. The
  // Recording Room's own gear hotspots (mic-stand, stereo-overheads; see
  // roomsData.js) are plain numbered info hotspots, same as any other gear
  // marker, but they don't belong to a "power up the room" narrative, so
  // this panel stays hidden there — same behavior as before the Recording
  // Room had any markers at all (devices.length === 0 below).
  const devices = useMemo(
    () => (room?.id === "studio-room" ? buildDeviceList(room) : []),
    [room]
  );
  const roomKey = room?.id || "default";

  const [round, setRound] = useState(() => freshRoundState(devices));
  const [muted, setMuted] = useState(false);
  const [rowFx, setRowFx] = useState({}); // { [deviceId]: "success" }
  // True while the "Power up in order" animation is stepping through
  // devices — used to disable the trigger button mid-run and to let a room
  // change / power-down interrupt it cleanly.
  const [sequencing, setSequencing] = useState(false);

  const audioCtxRef = useRef(null);
  const fxTimers = useRef({});
  const sequenceTimers = useRef([]);

  const dispatch = useDispatch();
  // Whether the Control Room rig has been powered up — lives in Redux
  // (controlRoomSlice) rather than component state or a ref, specifically
  // so it survives everything a purely local flag wouldn't: room changes
  // and even this whole component unmounting — which happens on every
  // navigation away from /studio and back (see App.jsx's <Routes>), not
  // just on logout. Written at the two places the power state actually
  // changes (classicPowerUpSequence finishing, powerDownAll) and read by
  // the room-change effect below to decide whether re-entering this room
  // should show the rig powered-on instead of resetting to fresh/off. This
  // is the half of "Control Room stays powered until Power down or Log
  // off" that lives in this component; the slice's own logOff case in
  // extraReducers covers the log-off half.
  const controlRoomPowered = useSelector((state) => state.controlRoom.powered);

  function clearSequenceTimers() {
    sequenceTimers.current.forEach(clearTimeout);
    sequenceTimers.current = [];
  }

  // Opening the DAW workstation (or any future interactive module) takes
  // over the full screen, so the left-docked panel just gets in the way —
  // collapse it automatically the moment activeModule is set. Closing that
  // module (activeModule going back to null) reverses it, but only if this
  // effect was the one that collapsed it in the first place, so a manual
  // collapse the visitor did before opening the module isn't force-reopened.
  useEffect(() => {
    if (activeModule) {
      wasAutoCollapsedRef.current = true;
      setCollapsed(true);
    } else if (wasAutoCollapsedRef.current) {
      wasAutoCollapsedRef.current = false;
      setCollapsed(false);
    }
  }, [activeModule]);

  // The onboarding tour (see src/tour/, wired up from PanoramaTour.jsx)
  // points at something on this panel — force it open. Without this, a
  // visitor who collapsed the panel (or hit it while still auto-collapsed
  // from a just-closed DAW module, see the effect above) would land on the
  // tour's very first, mandatory "power up the rig" step with no way to
  // even see the power switches. The className guard below backs this up
  // for the same frame the tour starts targeting this panel, before this
  // effect's setCollapsed(false) has had a chance to commit.
  useEffect(() => {
    if (tourHighlight) setCollapsed(false);
  }, [tourHighlight]);

  // Re-derive the round whenever the room (and therefore its device list)
  // changes — e.g. the visitor walks into a different room.
  useEffect(() => {
    clearSequenceTimers();
    setSequencing(false);
    // The rig is meant to stay powered once it's on, through every room
    // change, until an explicit Power down or a logout (see
    // controlRoomPowered's own comment above) — so a powered room is
    // restored powered-on here instead of wiped back to fresh/off whenever
    // the Redux flag says the rig is on.
    setRound(controlRoomPowered ? allOnRoundState(devices) : freshRoundState(devices));
    setRowFx({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  useEffect(
    () => () => {
      Object.values(fxTimers.current).forEach((t) => clearTimeout(t));
      clearSequenceTimers();
    },
    []
  );

  // Reports "fully powered" to the parent tour. Guarded on devices.length so
  // a room with no chain at all (e.g. the Recording Room, which renders no
  // panel — see the early return just below) never reports back and can't
  // clobber whatever power state the Studio last set; only a room that
  // actually has a panel gets a say here.
  const allDevicesOn =
    devices.length > 0 && devices.every((d) => round.status[d.id] === "on");
  useEffect(() => {
    if (devices.length === 0) return;
    onPoweredChange?.(allDevicesOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDevicesOn, devices.length]);

  // Auto-power-up on behalf of a pending focus-hotspot request (see
  // autoPowerUp's own comment above) — runs the identical scripted sequence
  // as clicking "Power up Control Room" by hand. autoPoweredRef stops this
  // from re-firing on every re-render while autoPowerUp stays true, and
  // resets once PanoramaTour clears the request (autoPowerUp goes back to
  // false) so a later, separate deep link can still trigger it again.
  const autoPoweredRef = useRef(false);
  useEffect(() => {
    if (!autoPowerUp) {
      autoPoweredRef.current = false;
      return;
    }
    if (autoPoweredRef.current || devices.length === 0 || allDevicesOn) return;
    autoPoweredRef.current = true;
    classicPowerUpSequence();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately
    // only re-runs on autoPowerUp itself; allDevicesOn is read live.
  }, [autoPowerUp, devices.length]);

  // Powers everything back off on request (see powerDownSignal's own
  // comment above). powerDownSignal starts at 0 in PanoramaTour and only
  // ever counts up from there, so 0 always means "never requested" —
  // skipping it here means mounting this panel never power-cycles a rig
  // the visitor already had running.
  useEffect(() => {
    if (!powerDownSignal) return;
    powerDownAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires only on
    // powerDownSignal changing; powerDownAll itself doesn't need to be a dep.
  }, [powerDownSignal]);

  if (devices.length === 0) return null;

  // ---------- audio ----------
  function getCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  }
  function beep(freq, duration, type, delay, gainVal) {
    if (muted) return;
    try {
      const ac = getCtx();
      const t0 = ac.currentTime + (delay || 0);
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(gainVal || 0.05, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch (e) {
      /* audio unavailable, fail silently */
    }
  }

  // ---------- row fx (pulse / flash animations) ----------
  function pulseRow(id, type, duration) {
    setRowFx((prev) => ({ ...prev, [id]: type }));
    clearTimeout(fxTimers.current[id]);
    fxTimers.current[id] = setTimeout(() => {
      setRowFx((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, duration);
  }

  function powerDownAll() {
    clearSequenceTimers();
    setSequencing(false);
    setRound((prev) => {
      const status = {};
      devices.forEach((d) => {
        status[d.id] = "off";
      });
      return { ...prev, status };
    });
    // Explicit Power down is one of the only two things allowed to undo a
    // power-up (the other is logout) — clear the Redux flag so a later
    // re-entry doesn't restore the rig back on.
    dispatch(powerDown());
  }

  // There's no per-device switch to click here (see the row render below)
  // — the only way to bring the rig up is this scripted sequence, so it's
  // worth making the walk-up feel deliberate: one station at a time, in
  // signal order, each landing with a success pulse + rising chime, rather
  // than every device just snapping to "on" at once.
  function classicPowerUpSequence() {
    if (sequencing) return;
    clearSequenceTimers();
    setSequencing(true);
    setRound((prev) => {
      const status = {};
      devices.forEach((d) => {
        status[d.id] = "off";
      });
      return { ...prev, status };
    });

    const STEP_MS = 260;
    devices.forEach((d, i) => {
      const t = setTimeout(() => {
        setRound((prev) => ({ ...prev, status: { ...prev.status, [d.id]: "on" } }));
        pulseRow(d.id, "success", 650);
        beep(420 + i * 55, 0.1, "sine");
        if (i === devices.length - 1) {
          setSequencing(false);
          // Rig just finished powering up — set the Redux flag so a later
          // re-entry (e.g. walking to the Recording Room and back) restores
          // it powered-on instead of resetting. See controlRoomPowered's
          // own comment above.
          dispatch(powerUp());
        }
      }, STEP_MS * (i + 1));
      sequenceTimers.current.push(t);
    });
  }

  const eyebrowText = "Studio VR · Live signal path";
  const handleRowActivate = (device) => onSelectDevice(device.kind, device.id);

  return (
    <div
      className={
        "svr-hotspot-panel" +
        // "force open for the tour" intent as the effect above, enforced
        // directly in render too: whatever `collapsed` currently holds,
        // this panel never actually *renders* collapsed while the tour has
        // it (or something on it) highlighted.
        (collapsed && !tourHighlight ? " is-collapsed" : "")
      }
    >
      <div className="svr-hotspot-panel__header">
        <div className="svr-hotspot-panel__eyebrow">{eyebrowText}</div>
        <button
          className="svr-hotspot-mute-btn"
          onClick={() => setMuted((v) => !v)}
          aria-label="Toggle sound"
          title="Toggle sound"
          type="button"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            style={{ opacity: muted ? 0.35 : 1 }}
          >
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            <path d="M16 8a5 5 0 0 1 0 8" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
        </button>

        <h2 className="svr-hotspot-panel__title">Bring the Control Room online</h2>
        {/* Brief, static topic intro — what the room as a whole teaches —
            shown above the mechanics line and the device list below it, so
            a visitor knows what they're about to learn before they pick a
            device or power up the rig. */}
        <p className="svr-hotspot-panel__intro">
          <b>What you&apos;ll learn:</b> the studio&apos;s full signal chain —
          how a source gets patched in, gain-staged, converted, mixed, treated
          by the room, and finally reproduced through the monitors.
        </p>
        <p className="svr-hotspot-panel__sub">
          Power up Control Room to watch the rig come online in sequence, or
          click a device to walk over and read about it.
        </p>
      </div>

      <div className="svr-hotspot-panel__actions">
        <button
          className={
            "svr-hotspot-qbtn" +
            // Highlighted as the primary call-to-action while the rig is
            // still off — this is the only control that actually powers
            // the studio on, so it shouldn't blend in with Power down next
            // to it. Cleared once every device is on (allDevicesOn) or
            // while the sequence is already animating (sequencing), since
            // the "Powering up…"/disabled state already communicates that
            // on its own.
            (!allDevicesOn && !sequencing ? " svr-hotspot-qbtn--power-cta" : "") +
            (tourHighlight === "power-button" ? " svr-tour-glow" : "") +
            // Keeps the guide card anchored here for the rest of the
            // "power-up" step (see tourPanelHighlight in PanoramaTour.jsx —
            // .svr-tour-glow has to stay on this element or the card jumps
            // to its fallback corner) but drops the pulsing halo itself the
            // instant the rig is actually on — there's nothing left to
            // click here, so a still-pulsing button reads as a stale cue.
            (tourHighlight === "power-button" && allDevicesOn ? " svr-tour-glow--done" : "")
          }
          onClick={classicPowerUpSequence}
          disabled={sequencing}
          type="button"
          title={!allDevicesOn ? "Click to power on the control room" : undefined}
          aria-label={
            !allDevicesOn ? "Power up Control Room — click to power on the control room" : undefined
          }
        >
          {sequencing ? "Powering up…" : "Power up Control Room"}
        </button>
        <button
          className="svr-hotspot-qbtn svr-hotspot-qbtn--danger"
          onClick={powerDownAll}
          type="button"
        >
          Power down
        </button>
      </div>

      <div className="svr-hotspot-panel__legend">
        <span>
          <i className="svr-hotspot-dot svr-hotspot-dot--on" />
          On
        </span>
        <span>
          <i className="svr-hotspot-dot svr-hotspot-dot--off" />
          Off
        </span>
      </div>

      <div
        className={
          "svr-hotspot-panel__list" + (tourHighlight === "devices" ? " svr-tour-glow" : "")
        }
      >
        {devices.map((d, i) => {
          const nodeLabel = String(i + 1).padStart(2, "0");
          const state = round.status[d.id] || "off";
          const fx = rowFx[d.id];
          const req = buildClue(devices, i).replace(/^Clue: /, "");
          const statusLabel = { off: "Off", on: "Active" }[state];
          const isCurrent =
            (d.kind === "gear" && activeGear?.id === d.id) ||
            (d.kind === "interactive" && activeModule?.id === d.id);

          return (
            <div
              key={d.id}
              className={
                "svr-hotspot-row" +
                (isCurrent ? " svr-hotspot-row--current" : "") +
                (fx === "success" ? " success-pulse" : "")
              }
              data-state={state}
              role="button"
              tabIndex={0}
              onClick={() => handleRowActivate(d)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleRowActivate(d);
                }
              }}
            >
              <div className="svr-hotspot-rail">
                <div
                  className={
                    "svr-hotspot-rail__line svr-hotspot-rail__line--top" +
                    (i === 0 ? " is-hidden" : "")
                  }
                />
                <div className="svr-hotspot-rail__node">{nodeLabel}</div>
                <div
                  className={
                    "svr-hotspot-rail__line svr-hotspot-rail__line--bottom" +
                    (i === devices.length - 1 ? " is-hidden" : "")
                  }
                />
              </div>

              <div className="svr-hotspot-icon-wrap">
                <div
                  className="svr-hotspot-icon"
                  dangerouslySetInnerHTML={{ __html: ICONS[d.id] || "" }}
                />
              </div>

              <div className="svr-hotspot-info">
                <p className="svr-hotspot-name">{d.title}</p>
                <p className="svr-hotspot-req">{req}</p>
                <span className="svr-hotspot-status">{statusLabel}</span>
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="svr-hotspot-panel__toggle"
        onClick={() => setCollapsed((v) => !v)}
        type="button"
        aria-label={collapsed ? "Show hotspots panel" : "Hide hotspots panel"}
        title={collapsed ? "Show hotspots panel" : "Hide hotspots panel"}
      >
        {collapsed ? "›" : "‹"}
      </button>
    </div>
  );
}

export default StudioHotspotsPanel;
