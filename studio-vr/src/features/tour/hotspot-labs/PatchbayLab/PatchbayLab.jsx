import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LabShell } from "../shared/LabShell";
import "./PatchbayLab.css";
import { AhaBox, LevelMeter, LineIcon, PauseIcon, PlayBar, PlayIcon, SegControl } from "../shared/listeningLabShared";
import { useLoopPlayer } from "../shared/useLoopPlayer";

export default function PatchbayLab(props) {
  return (
    <LabShell
      {...props}
      icon="🔀"
      title="Patchbay Lab"
      tabs={TABS}
      modules={[SwitchboardModule, RailroadModule]}
    />
  );
}

const TABS = [
  { id: "switchboard", n: "01", label: "Signal Routing", short: "Routing" },
  { id: "railroad", n: "02", label: "Signal Detours", short: "Detours" },
];

function MicIcon() {
  return (
    <LineIcon>
    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
    <path d="M19 11a7 7 0 0 1-14 0" />
    <line x1="12" y1="18" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
    </LineIcon>
  );
}
function ComputerIcon() {
  return (
    <LineIcon>
    <rect x="3" y="4" width="18" height="12" rx="1" />
    <path d="M6 10l2 -3 2 5 2 -6 2 4 2 -2" />
    <line x1="9" y1="19" x2="15" y2="19" />
    <line x1="12" y1="16" x2="12" y2="19" />
    </LineIcon>
  );
}
function TubeIcon() {
  return (
    <LineIcon>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <ellipse cx="12" cy="10" rx="3" ry="4" />
    <line x1="12" y1="14" x2="12" y2="18" />
    </LineIcon>
  );
}
function DirectIcon() {
  return (
    <LineIcon>
    <line x1="3" y1="12" x2="21" y2="12" />
    <polyline points="16 7 21 12 16 17" />
    </LineIcon>
  );
}
function DetourIcon() {
  return (
    <LineIcon>
    <path d="M3 12h6l3-5 3 10 3-5h3" />
    </LineIcon>
  );
}

const SOURCES = [
  { id: "singer", name: "Singer", color: "#e8934a" },
  { id: "synth", name: "Synthesizer", color: "#5fd9a0" },
  { id: "guitar", name: "Electric Guitar", color: "#a78bfa" },
];
const DESTS = [
  { id: "tape", name: "Tape Recorder" },
  { id: "headphones", name: "Headphones" },
  { id: "reverb", name: "Reverb Unit" },
];
const AUDIO_SOURCES = {
  singer: {
    dry: "/audio/listening-lab/patchbay-singer-dry.mp3",
    reverb: "/audio/listening-lab/patchbay-singer-reverb.mp3",
  },
  synth: {
    dry: "/audio/listening-lab/patchbay-synth-dry.mp3",
    reverb: "/audio/listening-lab/patchbay-synth-reverb.mp3",
  },
  guitar: {
    dry: "/audio/listening-lab/patchbay-guitar-dry.mp3",
    reverb: "/audio/listening-lab/patchbay-guitar-reverb.mp3",
  },
};

function SwitchboardModule() {
  const [connections, setConnections] = useState({});
  const [armedSource, setArmedSource] = useState(null);
  const [playingDest, setPlayingDest] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [coords, setCoords] = useState({});
  const [size, setSize] = useState({ width: 0, height: 0 });
  const boardRef = useRef(null);
  const jackRefs = useRef({});
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audioRef.current = audio;
    return () => audio.pause();
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const board = boardRef.current;
      if (!board) return;
      const b = board.getBoundingClientRect();
      setSize({ width: b.width, height: b.height });
      const next = {};
      Object.entries(jackRefs.current).forEach(([id, el]) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        next[id] = { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 };
      });
      setCoords(next);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const stopPlayback = () => {
    audioRef.current?.pause();
    setPlayingDest(null);
  };

  const toggleArm = (sourceId) => {
    setArmedSource((prev) => (prev === sourceId ? null : sourceId));
  };

  const connectTo = (destId) => {
    if (!armedSource) return;
    setConnections((prev) => ({ ...prev, [armedSource]: destId }));
    setArmedSource(null);
    stopPlayback();
  };

  useEffect(() => {
    if (connections.synth === "reverb") setRevealed(true);
  }, [connections]);

  const resetPatch = () => {
    setConnections({});
    setArmedSource(null);
    stopPlayback();
  };

  const toggleDestPlay = (destId) => {
    const srcId = Object.keys(connections).find((s) => connections[s] === destId);
    if (!srcId) return;
    if (playingDest === destId) {
      stopPlayback();
      return;
    }
    const audio = audioRef.current;
    if (audio) {
      audio.src = AUDIO_SOURCES[srcId][destId === "reverb" ? "reverb" : "dry"];
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
    setPlayingDest(destId);
  };

  const connectedSourceIds = new Set(Object.keys(connections));
  const connectedDestIds = new Set(Object.values(connections));

  let statusText = "Tap a source, then tap a destination to patch it in.";
  const entries = Object.entries(connections);
  if (entries.length) {
    statusText = entries
      .map(([s, d]) => `${SOURCES.find((x) => x.id === s).name} → ${DESTS.find((x) => x.id === d).name}`)
      .join("   ·   ");
  }

  return (
    <div className="llab-module">
      <p className="llab-hook">
        How did old-school phone operators connect a caller to a home?
        They plugged a cable directly into a board. Try it yourself — tap the Synthesizer jack,
        then tap the Reverb Unit jack, and listen to what happens to its output.
      </p>

      <div className="llab-card">
        <div className="pblab-board" ref={boardRef}>
          <svg
            className="pblab-board-svg"
            viewBox={`0 0 ${size.width || 1} ${size.height || 1}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {entries.map(([srcId, destId]) => {
              const p1 = coords[srcId];
              const p2 = coords[destId];
              if (!p1 || !p2) return null;
              const color = SOURCES.find((s) => s.id === srcId).color;
              const midX = (p1.x + p2.x) / 2;
              return (
                <path
                  key={srcId}
                  d={`M ${p1.x},${p1.y} C ${midX},${p1.y} ${midX},${p2.y} ${p2.x},${p2.y}`}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  opacity="0.85"
                />
              );
            })}
          </svg>

          <div className="pblab-col">
            <div className="pblab-col-label mono">Sources</div>
            {SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={
                  "pblab-jack source" +
                  (armedSource === s.id ? " armed" : "") +
                  (connectedSourceIds.has(s.id) ? " connected" : "")
                }
                style={{ "--jc": s.color }}
                onClick={() => toggleArm(s.id)}
                aria-pressed={armedSource === s.id}
              >
                <span className="pblab-jack-dot" ref={(el) => (jackRefs.current[s.id] = el)} />
                <span className="pblab-jack-text">
                  <span className="pblab-jack-name">{s.name}</span>
                  {armedSource === s.id && <span className="pblab-jack-hint">tap a destination →</span>}
                </span>
              </button>
            ))}
          </div>

          <div className="pblab-col dest">
            <div className="pblab-col-label mono">Destinations</div>
            {DESTS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={
                  "pblab-jack dest" +
                  (connectedDestIds.has(d.id) ? " connected" : "") +
                  (armedSource ? " armable" : "")
                }
                onClick={() => connectTo(d.id)}
              >
                <span className="pblab-jack-text">
                  <span className="pblab-jack-name">{d.name}</span>
                </span>
                <span className="pblab-jack-dot" ref={(el) => (jackRefs.current[d.id] = el)} />
              </button>
            ))}
          </div>
        </div>

        <div className="pblab-status mono">{statusText}</div>

        <div className="pblab-outputs">
          {DESTS.map((d) => {
            const srcId = Object.keys(connections).find((s) => connections[s] === d.id);
            const tag = srcId
              ? `${SOURCES.find((s) => s.id === srcId).name}${d.id === "reverb" ? " + reverb" : " (dry)"}`
              : "— no signal —";
            return (
              <div
                key={d.id}
                className={
                  "pblab-output-row" +
                  (srcId ? " has-signal" : "") +
                  (playingDest === d.id ? " playing" : "")
                }
              >
                <div className="pblab-output-name mono">{d.name.toUpperCase()}</div>
                <button
                  type="button"
                  className="pblab-output-play"
                  disabled={!srcId}
                  onClick={() => toggleDestPlay(d.id)}
                  aria-label={playingDest === d.id ? `Pause ${d.name}` : `Play ${d.name}`}
                >
                  {playingDest === d.id ? <PauseIcon /> : <PlayIcon />}
                </button>
                <LevelMeter playing={playingDest === d.id} />
                <div className="pblab-output-tag mono">{tag}</div>
              </div>
            );
          })}
        </div>

        <div className="llab-trigger-row">
          <button type="button" className="llab-trigger-btn" onClick={resetPatch}>
            Reset patch
          </button>
        </div>

        <AhaBox show={revealed}>
          A patch bay is just a central control hub. It brings the hidden
          back-panel plugs of every piece of studio gear to one easy front
          panel, so you can re-route audio in seconds without crawling
          behind a desk.
        </AhaBox>
      </div>
    </div>
  );
}

const AUDIO_SOURCES_2 = {
  direct: "/audio/listening-lab/railroad-direct.mp3",
  detour: "/audio/listening-lab/railroad-detour.mp3",
};
const TRACK_MODES = {
  direct: {
    title: "TRACK A — DIRECT TO COMPUTER",
    caption: "The vocal goes straight into the computer — clean, dry, and completely unprocessed.",
    color: "#5fd9a0",
    wave: "M0,60 C30,20 60,20 90,60 C120,100 150,100 180,60 C210,20 240,20 270,60 C300,100 330,100 360,60 C390,20 420,20 450,60 C480,100 510,100 540,60 C570,20 600,20 630,60",
  },
  detour: {
    title: "TRACK B — DETOUR THROUGH TUBE GEAR",
    caption:
      "The vocal gets rerouted through a vintage tube unit first, adding warm analog grit before reaching the computer.",
    color: "#e8934a",
    wave: "M0,60 C15,15 35,15 45,55 L50,75 C60,95 70,95 90,60 C105,25 125,15 135,55 L140,75 C150,100 160,90 180,60 C195,20 215,15 225,55 L230,75 C240,100 250,90 270,60 C285,22 305,15 315,55 L320,75 C330,100 340,90 360,60",
  },
};
const SEG_2 = [
  { key: "direct", label: "Track A — Direct", Icon: DirectIcon },
  { key: "detour", label: "Track B — Detour", Icon: DetourIcon },
];

function RailroadModule() {
  const { mode, playing, revealed, selectMode, togglePlay } = useLoopPlayer(AUDIO_SOURCES_2, "direct");

  const track = TRACK_MODES[mode];
  const isDetour = mode === "detour";

  return (
    <div className="llab-module">
      <p className="llab-hook">
        Train tracks use switches to redirect a train to a new station
        without rebuilding the tracks. Flip the switch below to send the
        vocal down a different track before it reaches the computer.
      </p>

      <div className="llab-card">
        <SegControl options={SEG_2} value={mode} onSelect={selectMode} label="Choose a track" />

        <div className="pblab-track-box">
          <div className="pblab-track-label mono">
            <span>MIC</span>
            <span>{track.title}</span>
            <span>COMPUTER</span>
          </div>
          <div className="pblab-track-stage">
            <svg viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true">
              <line
                x1="30"
                y1="45"
                x2="270"
                y2="45"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="5"
                strokeLinecap="round"
              />
              {isDetour ? (
                <path
                  d="M 30,45 Q 150,80 270,45"
                  fill="none"
                  stroke={track.color}
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              ) : (
                <line
                  x1="30"
                  y1="45"
                  x2="270"
                  y2="45"
                  stroke={track.color}
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              )}
            </svg>
            <div className="pblab-track-icon mic">
              <MicIcon />
            </div>
            {isDetour && (
              <div className="pblab-track-icon tube">
                <TubeIcon />
              </div>
            )}
            <div className="pblab-track-icon computer">
              <ComputerIcon />
            </div>
          </div>
          <div className="pblab-track-caption">{track.caption}</div>
        </div>

        <div className="llab-curve">
          <div className="llab-curve__label">
            <span className="mono">SIGNAL AT COMPUTER</span>
          </div>
          <svg className="llab-curve__shape" viewBox="0 0 640 120" preserveAspectRatio="none">
            <line x1="0" y1="60" x2="640" y2="60" stroke="rgba(255,255,255,0.08)" />
            <path d={track.wave} stroke={track.color} fill="none" strokeWidth="3" />
          </svg>
        </div>

        <PlayBar playing={playing} onToggle={togglePlay} />

        <AhaBox show={revealed}>
          A patch bay lets you create custom detours for your sound, sending
          it through any combination of studio gear before it gets
          recorded — same source, different path, different result.
        </AhaBox>
      </div>
    </div>
  );
}
