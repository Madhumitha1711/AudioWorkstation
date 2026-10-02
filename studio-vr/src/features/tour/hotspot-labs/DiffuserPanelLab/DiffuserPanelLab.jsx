import { useState } from "react";
import { LabShell } from "../shared/LabShell";
import "./DiffuserPanelLab.css";
import { AhaBox, LineIcon, PlayBar, SegControl } from "../shared/listeningLabShared";
import { useLoopPlayer, useRepeatPlayer } from "../shared/useLoopPlayer";

export default function DiffuserPanelLab(props) {
  return (
    <LabShell
      {...props}
      icon="🪩"
      title="Diffuser Panel Lab"
      tabs={TABS}
      modules={[DiscoBallModule, WaveBreakerModule]}
    />
  );
}

const TABS = [
  { id: "discoball", n: "01", label: "Echo Scattering", short: "Scatter" },
  { id: "wavebreaker", n: "02", label: "Reflection Softening", short: "Decay" },
];

function FlatWallIcon() {
  return (
    <LineIcon>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    </LineIcon>
  );
}
function DiffuserWallIcon() {
  return (
    <LineIcon>
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="9" />
    <line x1="15" y1="9" x2="15" y2="15" />
    <line x1="9" y1="15" x2="9" y2="21" />
    </LineIcon>
  );
}
function SpeakerSourceIcon() {
  return (
    <LineIcon>
    <path d="M4 10v4h3l5 4V6l-5 4H4z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
    <path d="M19 6.5a8 8 0 0 1 0 11" />
    </LineIcon>
  );
}
function EarListenerIcon() {
  return (
    <LineIcon>
    <path d="M12 4a6 6 0 0 0-6 6c0 2 1 3 1 5a3 3 0 0 0 3 3" />
    <path d="M12 4a6 6 0 0 1 6 6c0 4-3 4-3 8" />
    </LineIcon>
  );
}

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
  const [pulseKey, setPulseKey] = useState(0);
  const { mode, playing, revealed, selectMode, togglePlay } = useLoopPlayer(AUDIO_SOURCES_1, "flat", () => setPulseKey((k) => k + 1));

  const s = SCATTER_MODES[mode];
  const isDiffuser = mode === "diffuser";
  const srcX = 48;
  const earX = 252;
  const topY = 33;
  const wallY = isDiffuser ? 108 : 120;
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
        <SegControl options={SEG_1} value={mode} onSelect={selectMode} label="Choose a wall type" />

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

        <PlayBar playing={playing} onToggle={togglePlay} />

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
  const { autoRepeat, revealed, audioRef, toggleAuto, play: dropStone } = useRepeatPlayer(AUDIO_SOURCES_2.flat);

  const selectMode = (m) => {
    setMode(m);
    const audio = audioRef.current;
    if (audio) audio.src = AUDIO_SOURCES_2[m];
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
        <SegControl options={SEG_2} value={mode} onSelect={selectMode} label="Choose a wall surface" />

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
