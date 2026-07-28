import { useEffect, useMemo, useRef, useState } from "react";
import "./studioHotspotsPanel.css";
import { ICONS, WARN_ICON, buildDeviceList } from "./hotspotDevices";

// The left-docked "Studio Hotspots" panel — now *is* the power-up challenge
// from design/studio-hotspots-panel.html, ported in full: mute button,
// Game/Classic mode switch, attempts/faults/hints/time stats, hint system,
// timer, best-score persistence, and the confetti completion overlay all
// live permanently in the docked rail instead of behind a separate button.
//
// One deliberate departure from the design: clicking a row (anywhere except
// the power switch) still drives real navigation — it walks the camera up
// to that hotspot in the scene and opens its info panel, exactly like
// clicking the hotspot's marker directly. That's app navigation, not part
// of the game, so it works the same in both Game and Classic mode and
// isn't gated by power state.
//
// SIGNAL_ORDER/ICONS/buildDeviceList live in hotspotDevices.js, shared with
// nothing else right now but kept separate so this file stays focused on
// the panel itself.

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mmss(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function loadGameMode(roomKey) {
  try {
    const v = localStorage.getItem(`studioHotspotGameMode:${roomKey}`);
    return v === null ? true : v === "true";
  } catch (e) {
    return true;
  }
}
function saveGameMode(roomKey, v) {
  try {
    localStorage.setItem(`studioHotspotGameMode:${roomKey}`, String(v));
  } catch (e) {
    /* storage unavailable */
  }
}
function loadBest(roomKey) {
  try {
    return JSON.parse(localStorage.getItem(`studioHotspotBest:${roomKey}`) || "null");
  } catch (e) {
    return null;
  }
}
function saveBest(roomKey, rec) {
  try {
    localStorage.setItem(`studioHotspotBest:${roomKey}`, JSON.stringify(rec));
  } catch (e) {
    /* storage unavailable */
  }
}

// "Attempts" is a lifetime play-count for this room's challenge — how many
// times the visitor has started the game — not a per-round tally. It only
// ever goes up (persisted in localStorage, same pattern as best-score) and
// is untouched by New Round / room changes resetting the rest of `round`.
function loadAttempts(roomKey) {
  try {
    const v = parseInt(localStorage.getItem(`studioHotspotAttempts:${roomKey}`), 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch (e) {
    return 0;
  }
}
function saveAttempts(roomKey, n) {
  try {
    localStorage.setItem(`studioHotspotAttempts:${roomKey}`, String(n));
  } catch (e) {
    /* storage unavailable */
  }
}

function buildClue(devices, canonicalIndex) {
  if (canonicalIndex === 0) return "Clue: no dependency — this powers first.";
  const prevTitle = devices[canonicalIndex - 1]?.title;
  if (canonicalIndex === devices.length - 1) {
    return `Clue: requires ${prevTitle} — this powers last.`;
  }
  return `Clue: requires ${prevTitle}.`;
}

function freshRoundState(devices, gameMode) {
  const status = {};
  const consecutiveMiss = {};
  devices.forEach((d) => {
    status[d.id] = "off";
    consecutiveMiss[d.id] = 0;
  });
  return {
    order: gameMode ? shuffle(devices) : devices.slice(),
    status,
    consecutiveMiss,
    revealedHints: {},
    mistakes: 0,
    hintsUsed: 0,
    roundOver: false,
    startedAt: null,
    finishedAt: null,
  };
}

function StudioHotspotsPanel({ room, activeGear, activeModule, onSelectDevice }) {
  const [collapsed, setCollapsed] = useState(false);
  // Tracks whether the panel was auto-collapsed by the effect below (as
  // opposed to the visitor manually clicking the toggle), so closing the DAW
  // module knows whether it's responsible for bringing the panel back.
  const wasAutoCollapsedRef = useRef(false);
  const devices = useMemo(() => buildDeviceList(room), [room]);
  const roomKey = room?.id || "default";

  const [gameMode, setGameMode] = useState(() => loadGameMode(roomKey));
  const [round, setRound] = useState(() => freshRoundState(devices, gameMode));
  const [muted, setMuted] = useState(false);
  const [best, setBest] = useState(() => loadBest(roomKey));
  // Lifetime "times played" counter for the Attempts stat — see
  // loadAttempts/saveAttempts above. Seeded from whatever's already in
  // localStorage for this room; recordGamePlayed() below bumps + persists it
  // every time a fresh game actually starts in Game mode.
  const [gamesPlayed, setGamesPlayed] = useState(() => loadAttempts(roomKey));
  const [now, setNow] = useState(Date.now());
  const [shaking, setShaking] = useState(false);
  const [rowFx, setRowFx] = useState({}); // { [deviceId]: "success" | "error" | "hint" }
  const [confetti, setConfetti] = useState([]);
  const [overlayHidden, setOverlayHidden] = useState(false);
  // True while the Classic-mode "Power up in order" animation is stepping
  // through devices — used to disable the trigger button mid-run and to
  // let a room change / power-down interrupt it cleanly.
  const [sequencing, setSequencing] = useState(false);

  const audioCtxRef = useRef(null);
  const fxTimers = useRef({});
  const shakeTimer = useRef(null);
  const sequenceTimers = useRef([]);
  // Guards the room-change effect below against StrictMode's dev-only
  // mount→cleanup→mount double-invoke: without this, recordGamePlayed()
  // would run twice on first load (and on every genuine room change) and
  // double-count that one play. The ref survives both invokes since
  // StrictMode replays effects on the same component instance, so
  // comparing against the last roomKey we actually recorded catches the
  // duplicate call while still recording every real room change.
  const lastRecordedRoomKeyRef = useRef(null);

  function clearSequenceTimers() {
    sequenceTimers.current.forEach(clearTimeout);
    sequenceTimers.current = [];
  }

  function triggerShake() {
    setShaking(false);
    clearTimeout(shakeTimer.current);
    requestAnimationFrame(() => {
      setShaking(true);
      shakeTimer.current = setTimeout(() => setShaking(false), 450);
    });
  }

  // Bumps + persists the lifetime Attempts counter whenever a fresh game
  // actually starts in Game mode (initial load, room change, mode toggle,
  // New Round/Play again). Classic mode isn't "the game", so switching to
  // or starting in Classic just re-syncs the display from storage instead
  // of counting a play.
  function recordGamePlayed(key, mode) {
    if (!mode) {
      setGamesPlayed(loadAttempts(key));
      return;
    }
    const next = loadAttempts(key) + 1;
    saveAttempts(key, next);
    setGamesPlayed(next);
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

  // Re-derive the round whenever the room (and therefore its device list)
  // changes — e.g. the visitor walks into a different room.
  useEffect(() => {
    clearSequenceTimers();
    setSequencing(false);
    const mode = loadGameMode(roomKey);
    setGameMode(mode);
    setRound(freshRoundState(devices, mode));
    setBest(loadBest(roomKey));
    if (lastRecordedRoomKeyRef.current !== roomKey) {
      lastRecordedRoomKeyRef.current = roomKey;
      recordGamePlayed(roomKey, mode);
    }
    setConfetti([]);
    setRowFx({});
    setOverlayHidden(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  useEffect(() => {
    if (!round.startedAt || round.roundOver) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [round.startedAt, round.roundOver]);

  useEffect(
    () => () => {
      Object.values(fxTimers.current).forEach((t) => clearTimeout(t));
      clearTimeout(shakeTimer.current);
      clearSequenceTimers();
    },
    []
  );

  if (devices.length === 0) return null;

  const elapsed = round.startedAt
    ? (round.roundOver ? round.finishedAt ?? now : now) - round.startedAt
    : 0;

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
  const soundOn = () => gameMode && (beep(520, 0.09, "sine"), beep(780, 0.12, "sine", 0.06));
  const soundOff = () => gameMode && beep(280, 0.08, "sine");
  const soundError = () =>
    gameMode && (beep(160, 0.25, "sawtooth", 0, 0.06), beep(110, 0.3, "sawtooth", 0.05, 0.05));
  const soundHint = () => gameMode && beep(880, 0.15, "triangle");
  const soundComplete = () =>
    gameMode &&
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => beep(f, 0.35, "sine", i * 0.12, 0.06));

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

  function launchConfetti() {
    const colors = ["#22c76a", "#7dffb8", "#ffffff", "#17c76a"];
    const pieces = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: 1.6 + Math.random() * 1.2,
      delay: Math.random() * 0.4,
      rotate: Math.random() * 360,
    }));
    setConfetti(pieces);
  }

  function finishRound(mistakes, hintsUsed, startedAt) {
    const finishedAt = Date.now();
    const elapsedSec = startedAt ? (finishedAt - startedAt) / 1000 : 0;
    soundComplete();

    const prevBest = loadBest(roomKey);
    let nextBest = prevBest;
    if (
      !prevBest ||
      mistakes < prevBest.mistakes ||
      (mistakes === prevBest.mistakes && elapsedSec < prevBest.time)
    ) {
      nextBest = { mistakes, time: elapsedSec, hints: hintsUsed };
      saveBest(roomKey, nextBest);
    }
    setBest(nextBest);
    setOverlayHidden(false);
    launchConfetti();
    return finishedAt;
  }

  // Reads `round` from the render closure rather than a setState updater —
  // togglePower() only ever runs once per click, so the closed-over value
  // is already current, and keeping the (audio/animation) side effects out
  // of an updater avoids them double-firing under React StrictMode.
  function togglePower(id) {
    if (round.roundOver) return;
    const idx = devices.findIndex((d) => d.id === id);
    const predId = idx > 0 ? devices[idx - 1].id : null;

    const current = round.status[id] || "off";
    const status = { ...round.status };
    const consecutiveMiss = { ...round.consecutiveMiss };
    const revealedHints = { ...round.revealedHints };
    let mistakes = round.mistakes;
    const startedAt = round.startedAt || Date.now();

    if (current === "off" || current === "error") {
      const isCorrect = !predId || round.status[predId] === "on";
      if (isCorrect) {
        status[id] = "on";
        consecutiveMiss[id] = 0;
        soundOn();
        pulseRow(id, "success", 650);
      } else {
        status[id] = "error";
        mistakes += 1;
        consecutiveMiss[id] = (consecutiveMiss[id] || 0) + 1;
        if (consecutiveMiss[id] >= 2) revealedHints[id] = true;
        soundError();
        triggerShake();
        pulseRow(id, "error", 500);
      }
    } else {
      status[id] = "off";
      soundOff();
      for (let j = idx + 1; j < devices.length; j += 1) {
        if (status[devices[j].id] !== "off") status[devices[j].id] = "off";
      }
    }

    const onCount = devices.filter((d) => status[d.id] === "on").length;
    const willFinish = gameMode && onCount === devices.length && !round.roundOver;
    const roundOver = willFinish || round.roundOver;
    const finishedAt = willFinish
      ? finishRound(mistakes, round.hintsUsed, startedAt)
      : round.finishedAt;

    setRound({
      ...round,
      status,
      consecutiveMiss,
      revealedHints,
      mistakes,
      startedAt,
      roundOver,
      finishedAt,
    });
  }

  function hint() {
    if (round.roundOver) return;
    const target = devices.find((d) => round.status[d.id] !== "on");
    if (!target) return;
    soundHint();
    pulseRow(target.id, "hint", 1600);
    setRound((prev) => ({
      ...prev,
      hintsUsed: prev.hintsUsed + 1,
      revealedHints: { ...prev.revealedHints, [target.id]: true },
    }));
  }

  function newRound() {
    setConfetti([]);
    setOverlayHidden(false);
    setRound(freshRoundState(devices, gameMode));
    recordGamePlayed(roomKey, gameMode);
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
  }

  // Classic mode has no per-device switch to click (see the row render
  // below) — the only way to bring the rig up is this scripted sequence,
  // so it's worth making the walk-up feel deliberate: one station at a
  // time, in signal order, each landing with the same success pulse +
  // rising chime a correct guess gets in Game mode, rather than every
  // device just snapping to "on" at once.
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
        // Not gated behind `gameMode &&` like soundOn/soundOff — those stay
        // Game-mode-only by design, but this sequence is Classic mode's own
        // moment and reads better with a rising chime as each station
        // lands, same mute toggle respected via beep()'s own check.
        beep(420 + i * 55, 0.1, "sine");
        if (i === devices.length - 1) setSequencing(false);
      }, STEP_MS * (i + 1));
      sequenceTimers.current.push(t);
    });
  }

  function toggleGameMode() {
    clearSequenceTimers();
    setSequencing(false);
    const next = !gameMode;
    setGameMode(next);
    saveGameMode(roomKey, next);
    setConfetti([]);
    setOverlayHidden(false);
    setRound(freshRoundState(devices, next));
    setBest(loadBest(roomKey));
    recordGamePlayed(roomKey, next);
  }

  const anyError = devices.some((d) => round.status[d.id] === "error");
  const baseLabel = gameMode ? "Studio VR · Power-up challenge" : "Studio VR · Live signal path";
  const eyebrowText = round.roundOver
    ? "Studio VR · Sequence complete"
    : anyError
      ? "Studio VR · Breaker tripped"
      : baseLabel;
  const eyebrowClass =
    "svr-hotspot-panel__eyebrow" + (round.roundOver ? " complete" : anyError ? " fault" : "");

  const penalty = round.mistakes + round.hintsUsed;
  const starCount = penalty === 0 ? 3 : penalty <= 2 ? 2 : 1;

  const handleRowActivate = (device) => onSelectDevice(device.kind, device.id);

  return (
    <div
      className={
        "svr-hotspot-panel" + (collapsed ? " is-collapsed" : "") + (shaking ? " shake" : "")
      }
    >
      <div className="svr-hotspot-panel__header">
        <div className={eyebrowClass}>{eyebrowText}</div>
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

        <h2 className="svr-hotspot-panel__title">Bring the Studio online</h2>
        <p className="svr-hotspot-panel__sub">
          {gameMode
            ? "Work out the correct signal order and switch on every station, or click a device to walk over and read about it. Guess wrong and the breaker trips."
            : "Power up in order to watch the rig come online in sequence, or click a device to walk over and read about it."}
        </p>

        <div className="svr-hotspot-mode-row">
          <span className="svr-hotspot-mode-label">
            Game mode: <b>{gameMode ? "On" : "Off"}</b>
          </span>
          <div
            className={"svr-hotspot-mode-switch" + (gameMode ? " on" : "")}
            role="switch"
            tabIndex={0}
            aria-checked={gameMode}
            aria-label="Toggle game mode"
            onClick={toggleGameMode}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleGameMode();
              }
            }}
          >
            <div className="svr-hotspot-mode-switch__knob" />
          </div>
        </div>

        {gameMode && (
          <>
            <div className="svr-hotspot-stats">
              <div className="svr-hotspot-stat">
                <p className="svr-hotspot-stat-label">Attempts</p>
                <p className="svr-hotspot-stat-value">{gamesPlayed}</p>
              </div>
              <div className="svr-hotspot-stat">
                <p className="svr-hotspot-stat-label">Faults</p>
                <p
                  className={"svr-hotspot-stat-value" + (round.mistakes > 0 ? " has-faults" : "")}
                >
                  {round.mistakes}
                </p>
              </div>
              <div className="svr-hotspot-stat">
                <p className="svr-hotspot-stat-label">Hints</p>
                <p className="svr-hotspot-stat-value">{round.hintsUsed}</p>
              </div>
              <div className="svr-hotspot-stat">
                <p className="svr-hotspot-stat-label">Time</p>
                <p className="svr-hotspot-stat-value">{mmss(elapsed / 1000)}</p>
              </div>
            </div>
            <p className="svr-hotspot-best-line">
              {best ? (
                <>
                  Best clear: <b>{best.mistakes} faults</b> · <b>{mmss(best.time)}</b>
                </>
              ) : (
                "No clear yet — power it up once"
              )}
            </p>
          </>
        )}
      </div>

      {gameMode && (
        <div className="svr-hotspot-progress-track">
          {devices.map((d) => (
            <div
              key={d.id}
              className={"svr-hotspot-seg" + (round.status[d.id] === "on" ? " filled" : "")}
            />
          ))}
        </div>
      )}

      <div className="svr-hotspot-panel__actions">
        {gameMode && (
          <button className="svr-hotspot-qbtn svr-hotspot-qbtn--hint" onClick={hint} type="button">
            Hint
          </button>
        )}
        {gameMode && (
          <button className="svr-hotspot-qbtn" onClick={newRound} type="button">
            New round
          </button>
        )}
        {!gameMode && (
          <button
            className="svr-hotspot-qbtn"
            onClick={classicPowerUpSequence}
            disabled={sequencing}
            type="button"
          >
            {sequencing ? "Powering up…" : "Power up in order"}
          </button>
        )}
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
        {/* Classic mode has no per-device switch to misfire (see the row
            render below), so a device can never actually land in "error" —
            the tripped state, and its legend entry, is Game-mode-only. */}
        {gameMode && (
          <span>
            <i className="svr-hotspot-dot svr-hotspot-dot--error" />
            Tripped
          </span>
        )}
      </div>

      {/* Game mode: every device as a compact box+switch tile in a fixed
          CSS grid, sized to land on one screen — no per-device scrolling.
          Classic mode keeps the taller rail/list below, since it has no
          per-device switch and leans on the numbered signal-order read. */}
      {gameMode ? (
        <div className="svr-hotspot-panel__list svr-hotspot-panel__list--grid">
          <div className="svr-hotspot-grid">
            {round.order.map((d) => {
              const canonicalIndex = devices.findIndex((dv) => dv.id === d.id);
              const state = round.status[d.id] || "off";
              const fx = rowFx[d.id];
              const clue = buildClue(devices, canonicalIndex);
              const statusLabel = { off: "Off", on: "Active", error: "Tripped" }[state];
              const isCurrent =
                (d.kind === "gear" && activeGear?.id === d.id) ||
                (d.kind === "interactive" && activeModule?.id === d.id);

              return (
                <div
                  key={d.id}
                  className={
                    "svr-hotspot-box" +
                    (isCurrent ? " svr-hotspot-box--current" : "") +
                    (round.revealedHints[d.id] ? " hint-revealed" : "") +
                    (fx === "hint" ? " hint-pulse" : "") +
                    (fx === "success" ? " success-pulse" : "") +
                    (fx === "error" ? " error-flash" : "")
                  }
                  data-state={state}
                  role="button"
                  tabIndex={0}
                  title={d.title}
                  onClick={() => handleRowActivate(d)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowActivate(d);
                    }
                  }}
                >
                  <div className="svr-hotspot-box__top">
                    <div className="svr-hotspot-icon-wrap">
                      <div
                        className="svr-hotspot-icon"
                        dangerouslySetInnerHTML={{ __html: ICONS[d.id] || "" }}
                      />
                    </div>

                    <div
                      className="svr-hotspot-switch"
                      role="switch"
                      tabIndex={0}
                      aria-checked={state === "on"}
                      aria-label={`Toggle power for ${d.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePower(d.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          togglePower(d.id);
                        }
                      }}
                    >
                      <div className="svr-hotspot-switch__knob" />
                    </div>
                  </div>

                  <p className="svr-hotspot-box__name">{d.title}</p>
                  <span className="svr-hotspot-box__status">{statusLabel}</span>

                  {round.revealedHints[d.id] && (
                    <p className="svr-hotspot-box__hint">{clue}</p>
                  )}
                  {state === "error" && (
                    <div className="svr-hotspot-box__warn">
                      <span dangerouslySetInnerHTML={{ __html: WARN_ICON }} />
                      <span>Tripped</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="svr-hotspot-panel__list">
          {round.order.map((d, i) => {
            const canonicalIndex = devices.findIndex((dv) => dv.id === d.id);
            const nodeLabel = String(canonicalIndex + 1).padStart(2, "0");
            const state = round.status[d.id] || "off";
            const fx = rowFx[d.id];
            const clue = buildClue(devices, canonicalIndex);
            const req = clue.replace(/^Clue: /, "");
            const statusLabel = { off: "Off", on: "Active", error: "Tripped" }[state];
            const isCurrent =
              (d.kind === "gear" && activeGear?.id === d.id) ||
              (d.kind === "interactive" && activeModule?.id === d.id);

            return (
              <div
                key={d.id}
                className={
                  "svr-hotspot-row" +
                  (isCurrent ? " svr-hotspot-row--current" : "") +
                  (round.revealedHints[d.id] ? " hint-revealed" : "") +
                  (fx === "hint" ? " hint-pulse" : "") +
                  (fx === "success" ? " success-pulse" : "") +
                  (fx === "error" ? " error-flash" : "")
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
                      (i === round.order.length - 1 ? " is-hidden" : "")
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
                  {state === "error" && (
                    <div className="svr-hotspot-warn">
                      <span dangerouslySetInnerHTML={{ __html: WARN_ICON }} />
                      <span>Breaker tripped</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* <div className="svr-hotspot-panel__footer">
        {gameMode
          ? `${devices.length} stations, one correct order. Two wrong guesses on the same station will reveal a clue.`
          : `01–${String(devices.length).padStart(
            2,
            "0"
          )} reflect the recommended power-on sequence, patch level first, transducers last, to protect the monitors from switch-on transients.`}
      </div> */}

      <button
        className="svr-hotspot-panel__toggle"
        onClick={() => setCollapsed((v) => !v)}
        type="button"
        aria-label={collapsed ? "Show hotspots panel" : "Hide hotspots panel"}
        title={collapsed ? "Show hotspots panel" : "Hide hotspots panel"}
      >
        {collapsed ? "›" : "‹"}
      </button>

      <div
        className={"svr-hotspot-overlay" + (round.roundOver && !overlayHidden ? " visible" : "")}
      >
        <div className="svr-hotspot-confetti-layer">
          {confetti.map((p) => (
            <span
              key={p.id}
              className="svr-hotspot-confetti-piece"
              style={{
                left: `${p.left}%`,
                background: p.color,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
                transform: `rotate(${p.rotate}deg)`,
              }}
            />
          ))}
        </div>
        <div className="svr-hotspot-overlay-card">
          <div className="svr-hotspot-overlay-eyebrow">Signal restored</div>
          <div className="svr-hotspot-overlay-title">Sequence complete</div>
          <div className="svr-hotspot-stars">
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= starCount ? "on" : ""}>
                ★
              </span>
            ))}
          </div>
          <div className="svr-hotspot-overlay-summary">
            Signal restored in <b>{mmss(elapsed / 1000)}</b> · {round.mistakes} fault
            {round.mistakes === 1 ? "" : "s"} · {round.hintsUsed} hint
            {round.hintsUsed === 1 ? "" : "s"} used
          </div>
          <div className="svr-hotspot-overlay-actions">
            <button className="svr-hotspot-obtn svr-hotspot-obtn--primary" onClick={newRound} type="button">
              Play again
            </button>
            <button
              className="svr-hotspot-obtn svr-hotspot-obtn--secondary"
              onClick={() => setOverlayHidden(true)}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudioHotspotsPanel;
