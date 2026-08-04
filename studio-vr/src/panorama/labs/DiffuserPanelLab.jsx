import { useEffect, useRef, useState } from "react";
import "./speakerListeningLab.css";
import "./diffuserPanelLab.css";
import { PlayIcon, PauseIcon, LevelMeter, AhaBox, AudioNote } from "./listeningLabShared";

// Diffuser Panel hotspot's "Diffuser Panel Lab" — same treatment as the
// Speakers hotspot's Listening Lab (see SpeakerListeningLab.jsx): replaces
// the generic "Test your knowledge" quiz for the diffuser-panel gear panel
// only (see PanoramaTour.jsx, which renders this instead of
// HotspotKnowledgeCheck whenever activeGear.id === "diffuser-panel").
// Ported from design/diffuser-panel-lab.html, restructured from that
// mockup's scroll-with-progress-dots layout into two navigable tabs — one
// per experiment — same as MixingConsoleLab.jsx/SoundCardLab.jsx.
//
// Reuses the exact same docked .svr-tour-gear-panel.llab-panel-shell shell,
// width, tab bar, and take-away chip/overlay interaction as
// SpeakerListeningLab (see listeningLabShared.jsx and speakerListeningLab.css
// for the shared pieces) so this reads as the same "Listening Lab" family,
// just with different content inside.
//
// AUDIO IS UI-ONLY FOR NOW — see SpeakerListeningLab.jsx's own comment for
// why: every module wires up a real <audio> element pointed at a
// `public/audio/listening-lab/...` path that doesn't exist yet, play()
// failures are swallowed, and the "playing" look is driven by React state
// rather than real playback events.
function DiffuserPanelLab({ open, onClose, onBackToOverview, onStartCourse }) {
  const [activeTab, setActiveTab] = useState(0);

  // Every visit starts back on experiment one — a fresh "before the lesson"
  // primer each time it's opened, not a resumable session.
  useEffect(() => {
    if (open) setActiveTab(0);
  }, [open]);

  if (!open) return null;

  const tab = TABS[activeTab];

  return (
    <div className="svr-tour-gear-panel llab-panel-shell">
      <div className="svr-tour-gear-panel__head">
        <span className="svr-tour-gear-badge llab-badge" aria-hidden="true">
          🪩
        </span>
        <div className="svr-tour-gear-panel__titles">
          <div className="svr-tour-gear-panel__title">Diffuser Panel Lab</div>
          <div className="svr-tour-gear-panel__kicker">
            {tab.label} · {activeTab + 1} of {TABS.length}
          </div>
        </div>
        <button
          onClick={onClose}
          className="svr-tour-gear-panel__close"
          aria-label="Close Diffuser Panel Lab"
          type="button"
        >
          ×
        </button>
      </div>

      <div className="llab-tabs" role="tablist" aria-label="Diffuser Panel Lab experiments">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`dflab-tab-${t.id}`}
            aria-selected={activeTab === i}
            aria-controls={`dflab-panel-${t.id}`}
            className={"llab-tab" + (activeTab === i ? " active" : "")}
            onClick={() => setActiveTab(i)}
            title={t.label}
          >
            <span className="llab-tab__n mono">{t.n}</span>
            <span className="llab-tab__label">{t.short}</span>
          </button>
        ))}
      </div>

      <div
        className="svr-tour-gear-panel__body"
        role="tabpanel"
        id={`dflab-panel-${tab.id}`}
        aria-labelledby={`dflab-tab-${tab.id}`}
        // Remounting the module on tab switch (via key) stops its audio
        // automatically — see SpeakerListeningLab.jsx's identical comment.
        key={tab.id}
      >
        {activeTab === 0 && <DiscoBallModule />}
        {activeTab === 1 && <WaveBreakerModule />}
      </div>

      <div className="svr-tour-gear-panel__footer">
        <div className="svr-tour-gear-panel__footer-row">
          <button
            type="button"
            className="svr-tour-btn svr-tour-btn-secondary"
            onClick={onBackToOverview}
          >
            ← Back
          </button>
          {onStartCourse && (
            <button
              type="button"
              className="svr-tour-btn svr-tour-btn-primary"
              onClick={onStartCourse}
            >
              Start course →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: "discoball", n: "01", label: "Echo Scattering", short: "Scatter" },
  { id: "wavebreaker", n: "02", label: "Reflection Softening", short: "Decay" },
];

// ============================================================
// Icons
// ============================================================
function FlatWallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </svg>
  );
}
function DiffuserWallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="9" />
      <line x1="15" y1="9" x2="15" y2="15" />
      <line x1="9" y1="15" x2="9" y2="21" />
    </svg>
  );
}
function SpeakerSourceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 10v4h3l5 4V6l-5 4H4z" />
      <path d="M16 9a4 4 0 0 1 0 6" />
      <path d="M19 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}
function EarListenerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 4a6 6 0 0 0-6 6c0 2 1 3 1 5a3 3 0 0 0 3 3" />
      <path d="M12 4a6 6 0 0 1 6 6c0 4-3 4-3 8" />
    </svg>
  );
}

// ============================================================
// MODULE 1 — The Disco Ball Effect (echo scattering)
// ============================================================
const AUDIO_SOURCES_1 = {
  flat: "/audio/listening-lab/discoball-flat.mp3",
  diffuser: "/audio/listening-lab/discoball-diffuser.mp3",
};
const SCATTER_MODES = {
  flat: {
    title: "FLAT WALL — DIRECT SLAP-BACK",
    reading: "CONCENTRATED",
    caption:
      "All the energy bounces straight back along one path — a single loud, harsh slap-back echo aimed right at the listener.",
    spread: [3, 3, 4, 5, 96, 5, 4, 3, 3],
    color: "#e8615f",
  },
  diffuser: {
    title: "DIFFUSER PANEL — SCATTERED REFLECTIONS",
    reading: "SCATTERED",
    caption:
      "The wooden blocks break the same energy apart and send it out in many directions at once — like a disco ball scattering light.",
    spread: [34, 40, 37, 44, 46, 42, 38, 41, 35],
    color: "#5fd9a0",
  },
};
const SEG_1 = [
  { key: "flat", label: "Flat Bare Wall", Icon: FlatWallIcon },
  { key: "diffuser", label: "Diffuser Panel", Icon: DiffuserWallIcon },
];
const WALL_BLOCK_HEIGHTS = [10, 24, 14, 27, 18, 11];

function DiscoBallModule() {
  const [mode, setMode] = useState("flat");
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.src = AUDIO_SOURCES_1.flat;
    audioRef.current = audio;
    return () => audio.pause();
  }, []);

  const selectMode = (m) => {
    setMode(m);
    setRevealed(true);
    setPlaying(true);
    setPulseKey((k) => k + 1);
    const audio = audioRef.current;
    if (audio) {
      audio.src = AUDIO_SOURCES_1[m];
      audio.play().catch(() => {});
    }
  };

  const togglePlay = () => {
    setRevealed(true);
    const audio = audioRef.current;
    setPlaying((prev) => {
      const next = !prev;
      if (audio) {
        if (next) audio.play().catch(() => {});
        else audio.pause();
      }
      return next;
    });
  };

  const s = SCATTER_MODES[mode];
  const isDiffuser = mode === "diffuser";
  const srcX = 48;
  const earX = 252;
  const topY = 33;
  const wallY = isDiffuser ? 108 : 120;
  // Fan of secondary rays, only drawn for the diffuser case — same target
  // points as the original mockup's positionCars-style hand-picked spread.
  const fanTargets = [
    [earX, topY],
    [95, 20],
    [195, 14],
    [235, 64],
    [70, 64],
    [150, 20],
  ];

  return (
    <div className="llab-module">
      <p className="llab-hook">
        Shining a flashlight at a flat mirror reflects one blinding beam
        straight back into your eyes. Shining it at a disco ball scatters
        light gently all across the room. A drum clap does the exact same
        thing when it hits a wall — switch the wall type below and see (and
        hear) where the sound goes.
      </p>

      <div className="llab-card">
        <div className="llab-seg" role="group" aria-label="Choose a wall type">
          {SEG_1.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={"llab-seg__btn" + (mode === key ? " active" : "")}
              onClick={() => selectMode(key)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>

        <div className="dflab-scatter-box">
          <div className="dflab-scatter-label mono">
            <span>SOURCE</span>
            <span>LISTENER</span>
          </div>
          <div className="dflab-room-label mono">SAME ROOM — THE WALL IS BEHIND BOTH OF THEM</div>
          <div className="dflab-scatter-stage">
            <svg viewBox="0 0 300 150" preserveAspectRatio="none" aria-hidden="true">
              {isDiffuser ? (
                <>
                  <line
                    x1={srcX}
                    y1={topY}
                    x2="150"
                    y2={wallY}
                    stroke="var(--llab-amber)"
                    strokeWidth="2"
                    opacity="0.85"
                  />
                  {fanTargets.map(([x, y], i) => (
                    <line
                      key={i}
                      x1="150"
                      y1={wallY}
                      x2={x}
                      y2={y}
                      stroke="#5fd9a0"
                      strokeWidth={i === 0 ? 2 : 1.3}
                      opacity={i === 0 ? 0.9 : 0.45}
                    />
                  ))}
                </>
              ) : (
                <>
                  <polyline
                    points={`${srcX},${topY} 150,${wallY} ${earX},${topY}`}
                    fill="none"
                    stroke="var(--llab-amber)"
                    strokeWidth="2"
                    opacity="0.85"
                  />
                  <line x1="150" y1={wallY} x2={earX} y2={topY} stroke="#e8615f" strokeWidth="2.6" />
                </>
              )}
            </svg>
            <div className="dflab-scatter-icon source">
              <SpeakerSourceIcon />
            </div>
            <div className={"dflab-wall" + (isDiffuser ? " diffuser" : " flat")}>
              {isDiffuser &&
                WALL_BLOCK_HEIGHTS.map((h, i) => (
                  <span key={i} className="dflab-wall-block" style={{ height: `${h}px` }} />
                ))}
            </div>
            <span key={pulseKey} className="dflab-flash" style={{ borderColor: s.color }} />
            <div className="dflab-scatter-icon ear">
              <EarListenerIcon />
            </div>
          </div>
          <div className="dflab-scatter-caption">{s.caption}</div>

          <div className="dflab-spread-label mono">
            <span>REFLECTION SPREAD</span>
            <span>{s.reading}</span>
          </div>
          <div className="llab-decay" aria-hidden="true">
            {s.spread.map((h, i) => (
              <span key={i} style={{ height: `${Math.max(2, h * 0.34)}px`, background: s.color }} />
            ))}
          </div>
        </div>

        <div className="llab-playbar">
          <button
            className="llab-play"
            onClick={togglePlay}
            type="button"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <LevelMeter playing={playing} />
        </div>
        {/* <AudioNote>discoball-flat/diffuser.mp3</AudioNote> */}

        <AhaBox show={revealed}>
          Diffusers don't destroy sound or trap it — they scatter echo
          energy in all directions, the same way a disco ball scatters a
          flashlight beam. That's why a treated room sounds open and
          natural instead of leaving your ears ringing.
        </AhaBox>
      </div>
    </div>
  );
}

// ============================================================
// MODULE 2 — The Sound Wave Breaker (echo decay over time)
// ============================================================
const AUDIO_SOURCES_2 = {
  flat: "/audio/listening-lab/ripple-smooth.mp3",
  diffuser: "/audio/listening-lab/ripple-diffuser.mp3",
};
const DECAY_MODES = {
  flat: { reading: "ONE HARSH SPIKE", bars: [98, 8, 6, 5, 4, 3, 3, 2, 2, 1] },
  diffuser: { reading: "SMOOTH NATURAL DECAY", bars: [45, 42, 38, 35, 30, 26, 22, 18, 14, 10] },
};
const SEG_2 = [
  { key: "flat", label: "Smooth Wall", Icon: FlatWallIcon },
  { key: "diffuser", label: "Diffuser Wall", Icon: DiffuserWallIcon },
];

function barColor(h, i) {
  if (i === 0 && h > 90) return "#e8615f";
  return h > 40 ? "#e8934a" : "#5fd9a0";
}

function WaveBreakerModule() {
  const [mode, setMode] = useState("flat");
  const [autoRepeat, setAutoRepeat] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);
  const autoTimerRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = AUDIO_SOURCES_2.flat;
    audioRef.current = audio;
    return () => {
      audio.pause();
      clearInterval(autoTimerRef.current);
    };
  }, []);

  const dropStone = () => {
    setRevealed(true);
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  const stopAuto = () => {
    clearInterval(autoTimerRef.current);
    autoTimerRef.current = null;
    setAutoRepeat(false);
    audioRef.current?.pause();
  };

  const selectMode = (m) => {
    setMode(m);
    const audio = audioRef.current;
    if (audio) audio.src = AUDIO_SOURCES_2[m];
  };

  const toggleAuto = () => {
    if (autoRepeat) {
      stopAuto();
      return;
    }
    setAutoRepeat(true);
    dropStone();
    autoTimerRef.current = setInterval(dropStone, 2000);
  };

  const d = DECAY_MODES[mode];

  return (
    <div className="llab-module">
      <p className="llab-hook">
        Dropping a stone in a calm pool creates a sharp wave that bounces
        off a flat concrete wall in one clean ring. Ocean breakwaters use
        jagged rocks to break that wave into tiny, harmless ripples before
        it can crash back. A diffuser panel is a breakwater for a drum hit.
      </p>

      <div className="llab-card">
        <div className="llab-seg" role="group" aria-label="Choose a wall surface">
          {SEG_2.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={"llab-seg__btn" + (mode === key ? " active" : "")}
              onClick={() => selectMode(key)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>

        <div className="dflab-decay-label mono">
          <span>ECHO DECAY OVER TIME</span>
          <span>{d.reading}</span>
        </div>
        <div className="llab-decay" aria-hidden="true">
          {d.bars.map((h, i) => (
            <span key={i} style={{ height: `${Math.max(2, h * 0.55)}px`, background: barColor(h, i) }} />
          ))}
        </div>

        <div className="llab-trigger-row">
          <button type="button" className="llab-trigger-btn" onClick={dropStone}>
            ▶ Drop a stone
          </button>
          <label className="llab-auto-toggle">
            <input type="checkbox" checked={autoRepeat} onChange={toggleAuto} />
            Auto-repeat every 2s
          </label>
        </div>
        {/* <AudioNote>ripple-smooth/diffuser.mp3</AudioNote> */}

        <AhaBox show={revealed}>
          Diffusers keep the room's live energy while eliminating harsh,
          distracting echoes. The sound doesn't disappear — it just stops
          arriving back as one clean, loud ring and instead trickles back
          as a soft, natural decay.
        </AhaBox>
      </div>
    </div>
  );
}

export default DiffuserPanelLab;
