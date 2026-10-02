import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import "./StudioHotspotsPanel.css";
import { ICONS, buildDeviceList } from "../../data/hotspotDevices";
import { powerUp, powerDown } from "../../../../store/controlRoomSlice";
import { quickHelpHoverProps } from "../../help/helpHover";

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

function allOnRoundState(devices) {
  const status = {};
  devices.forEach((d) => {
    status[d.id] = "on";
  });
  return { status };
}

const MOBILE_QUERY = "(max-width: 960px)";

function StudioHotspotsPanel({
  room,
  activeGear,
  activeModule,
  onSelectDevice,
  onPoweredChange,
  autoPowerUp,
  onQuickHelp,
  openRequest = 0,
}) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(MOBILE_QUERY).matches
  );
  const [collapsed, setCollapsed] = useState(isMobile);
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return undefined;
    const onChange = (e) => {
      setIsMobile(e.matches);
      setCollapsed(e.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (openRequest) setCollapsed(false);
  }, [openRequest]);
  const drawerOpen = isMobile && !collapsed;
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setCollapsed(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);
  const wasAutoCollapsedRef = useRef(false);
  const devices = useMemo(
    () => (room?.id === "studio-room" ? buildDeviceList(room) : []),
    [room]
  );

  const [round, setRound] = useState(() => freshRoundState(devices));
  const [muted, setMuted] = useState(false);
  const [rowFx, setRowFx] = useState({});
  const [sequencing, setSequencing] = useState(false);

  const audioCtxRef = useRef(null);
  const fxTimers = useRef({});
  const sequenceTimers = useRef([]);

  const dispatch = useDispatch();
  const controlRoomPowered = useSelector((state) => state.controlRoom.powered);

  function clearSequenceTimers() {
    sequenceTimers.current.forEach(clearTimeout);
    sequenceTimers.current = [];
  }

  useEffect(() => {
    if (activeModule) {
      wasAutoCollapsedRef.current = true;
      setCollapsed(true);
    } else if (wasAutoCollapsedRef.current) {
      wasAutoCollapsedRef.current = false;
      setCollapsed(false);
    }
  }, [activeModule]);

  useEffect(() => {
    clearSequenceTimers();
    setSequencing(false);
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

  const allDevicesOn =
    devices.length > 0 && devices.every((d) => round.status[d.id] === "on");
  useEffect(() => {
    if (devices.length === 0) return;
    onPoweredChange?.(allDevicesOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDevicesOn, devices.length]);

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
  }, [autoPowerUp, devices.length]);

  if (devices.length === 0) return null;

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
    } catch {
    }
  }

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
    dispatch(powerDown());
  }

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
          dispatch(powerUp());
        }
      }, STEP_MS * (i + 1));
      sequenceTimers.current.push(t);
    });
  }

  const eyebrowText = "Studio VR · Live signal path";
  const handleRowActivate = (device) => {
    if (isMobile) setCollapsed(true);
    onSelectDevice(device.kind, device.id);
  };

  return (
    <>
    {drawerOpen && (
      <div className="svr-hotspot-backdrop" onClick={() => setCollapsed(true)} aria-hidden="true" />
    )}
    <div className={"svr-hotspot-panel" + (collapsed ? " is-collapsed" : "")}>
      <div className="svr-hotspot-panel__content" inert={isMobile && collapsed}>
      <div className="svr-hotspot-panel__header">
        <div className="svr-hotspot-panel__eyebrow">{eyebrowText}</div>
        <button
          className="svr-hotspot-mute-btn"
          onClick={() => setMuted((v) => !v)}
          aria-label="Toggle sound"
          title="Toggle sound"
          type="button"
          {...quickHelpHoverProps(onQuickHelp, "Mutes or unmutes the power-up sound effects on this panel.")}
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
            (!allDevicesOn && !sequencing ? " svr-hotspot-qbtn--power-cta" : "")
          }
          onClick={classicPowerUpSequence}
          disabled={sequencing}
          type="button"
          title={!allDevicesOn ? "Click to power on the control room" : undefined}
          aria-label={
            !allDevicesOn ? "Power up Control Room — click to power on the control room" : undefined
          }
          {...quickHelpHoverProps(
            onQuickHelp,
            "Powers up every device in the signal chain, in order, so you can explore the rest of the room."
          )}
        >
          {sequencing ? "Powering up…" : "Power up Control Room"}
        </button>
        <button
          className="svr-hotspot-qbtn svr-hotspot-qbtn--danger"
          onClick={powerDownAll}
          type="button"
          {...quickHelpHoverProps(onQuickHelp, "Powers the whole rig back down.")}
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

      <div className="svr-hotspot-panel__list">
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
              {...quickHelpHoverProps(onQuickHelp, `${d.title} — click to walk over and read about it.`)}
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

      </div>
      <button
        className="svr-hotspot-panel__toggle"
        onClick={() => setCollapsed((v) => !v)}
        type="button"
        aria-label={collapsed ? "Show hotspots panel" : "Hide hotspots panel"}
        title={collapsed ? "Show hotspots panel" : "Hide hotspots panel"}
        {...quickHelpHoverProps(onQuickHelp, collapsed ? "Show the hotspots panel." : "Hide the hotspots panel.")}
      >
        {isMobile && collapsed ? (
          <>
            <span className="svr-hotspot-panel__toggle-icon" aria-hidden="true">☰</span>
            <span className="svr-hotspot-panel__toggle-label">Rig</span>
          </>
        ) : collapsed ? "›" : "‹"}
      </button>
    </div>
    </>
  );
}

export default StudioHotspotsPanel;
