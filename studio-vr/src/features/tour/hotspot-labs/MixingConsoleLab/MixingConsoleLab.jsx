import { useState } from "react";
import { LabShell } from "../shared/LabShell";
import "./MixingConsoleLab.css";
import { AhaBox, LineIcon, PlayBar, SegControl } from "../shared/listeningLabShared";
import { useLoopPlayer, useRepeatPlayer } from "../shared/useLoopPlayer";

export default function MixingConsoleLab(props) {
  return (
    <LabShell
      {...props}
      icon="🎚️"
      title="Mixing Console Lab"
      tabs={TABS}
      modules={[AudioKitchenModule, SoundHighwayModule]}
    />
  );
}

const TABS = [
  { id: "audio-kitchen", n: "01", label: "Channel Balance", short: "Balance" },
  { id: "sound-highway", n: "02", label: "Stereo Placement", short: "Panning" },
];

function BowlIcon() {
  return (
    <LineIcon>
    <path d="M3 12h18a9 9 0 0 1-18 0z" />
    <line x1="12" y1="3" x2="12" y2="6" />
    </LineIcon>
  );
}
function ChefHatIcon() {
  return (
    <LineIcon>
    <path d="M6 10a3 3 0 0 1 1.7-4.6A3 3 0 0 1 11 3a3 3 0 0 1 3.3 2.4A3 3 0 0 1 18 10c0 2-1 3-2 3H8c-1 0-2-1-2-3z" />
    <path d="M8 21h8" />
    <path d="M9 21v-8" />
    <path d="M15 21v-8" />
    </LineIcon>
  );
}
function OvercookedIcon() {
  return (
    <LineIcon>
    <path d="M12 2c1.6 2.6-1 3.8-1 6.4a2.6 2.6 0 0 0 5.2 0c0-1.6-.8-2.4-.8-2.4 1.6.9 2.6 3.2 2.6 5A6 6 0 0 1 6 11c0-4.2 3.4-5.8 3.4-8.4.8.8 1.6 1.6 2.6-.6z" />
    </LineIcon>
  );
}
function GridlockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2" />
      <rect x="9" y="6" width="6" height="3" />
      <rect x="9" y="15" width="6" height="3" />
    </svg>
  );
}
function TwoLanesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2" />
      <rect x="5.5" y="9" width="5" height="3" />
      <rect x="13.5" y="14" width="5" height="3" />
    </svg>
  );
}
function OpenHighwayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2" />
      <rect x="4.8" y="6" width="4" height="3" />
      <rect x="9" y="14" width="4" height="3" />
      <rect x="15" y="9" width="4" height="3" />
    </svg>
  );
}

const AUDIO_SOURCES_1 = {
  bland: "/audio/listening-lab/mixing-console-kitchen-bland.mp3",
  chefs: "/audio/listening-lab/mixing-console-kitchen-chefs.mp3",
  overcooked: "/audio/listening-lab/mixing-console-kitchen-overcooked.mp3",
};
const MIXES = {
  bland: {
    title: "BLAND MIX — EVERYTHING TURNED DOWN",
    color: "#8b8890",
    levels: { vocal: 30, guitar: 25, drums: 35, bass: 20 },
    caption:
      "Every ingredient turned down evenly — the mix has no energy, like a stew with barely any seasoning.",
  },
  chefs: {
    title: "CHEF'S MIX — BALANCED",
    color: "#5fd9a0",
    levels: { vocal: 78, guitar: 55, drums: 68, bass: 60 },
    caption:
      "Each element sits at its own natural level — nothing is starving, nothing is drowning out the rest.",
  },
  overcooked: {
    title: "OVERCOOKED MIX — EVERYTHING MAXED",
    color: "#e8615f",
    levels: { vocal: 95, guitar: 90, drums: 98, bass: 92 },
    caption:
      "Every ingredient maxed out at once — instruments fight for the same space and nothing is actually clear.",
  },
};
const SEG_1 = [
  { key: "bland", label: "Bland", Icon: BowlIcon },
  { key: "chefs", label: "Chef's", Icon: ChefHatIcon },
  { key: "overcooked", label: "Overcooked", Icon: OvercookedIcon },
];
const INGREDIENTS = ["vocal", "guitar", "drums", "bass"];

function AudioKitchenModule() {
  const { mode, playing, revealed, selectMode, togglePlay } = useLoopPlayer(AUDIO_SOURCES_1, "bland");

  const mix = MIXES[mode];

  return (
    <div className="llab-module">
      <p className="llab-hook">
        A great dish isn't "more of everything" — too much salt ruins it, too
        little and it's bland. A mix works exactly the same way: every
        channel fader is an ingredient, and the engineer's job is tasting and
        adjusting until nothing overpowers anything else.
      </p>

      <div className="llab-card">
        <SegControl options={SEG_1} value={mode} onSelect={selectMode} label="Choose a mix" />

        <div className="mclab-kitchen-box">
          <div className="mclab-kitchen-label">
            <span>QUIET</span>
            <span>LOUD</span>
          </div>
          <div className="mclab-ingredients">
            {INGREDIENTS.map((key) => {
              const val = mix.levels[key];
              return (
                <div className="mclab-ingredient" key={key}>
                  <div className="mclab-ing-track">
                    <div
                      className="mclab-ing-fill"
                      style={{ height: `${val}%`, background: mix.color }}
                    />
                  </div>
                  <div className="mclab-ing-name mono">{key.toUpperCase()}</div>
                  <div className="mclab-ing-val">{val}</div>
                </div>
              );
            })}
          </div>
          <div className="mclab-kitchen-caption">{mix.caption}</div>
        </div>

        <PlayBar playing={playing} onToggle={togglePlay} />

        <AhaBox show={revealed}>
          A channel fader isn't a "louder" knob — it's a seasoning control.
          Mixing is the same skill as tasting and adjusting a recipe: turn
          one ingredient down so another can actually be heard, instead of
          pushing everything up at once.
        </AhaBox>
      </div>
    </div>
  );
}

const AUDIO_SOURCES_2 = {
  gridlock: "/audio/listening-lab/mixing-console-highway-gridlock.mp3",
  two: "/audio/listening-lab/mixing-console-highway-two.mp3",
  open: "/audio/listening-lab/mixing-console-highway-open.mp3",
};
const SEG_2 = [
  { key: "gridlock", label: "Gridlock", Icon: GridlockIcon },
  { key: "two", label: "Two Lanes", Icon: TwoLanesIcon },
  { key: "open", label: "Open Hwy", Icon: OpenHighwayIcon },
];
const ZONES = {
  gridlock: {
    reading: "HIGH",
    bars: [95, 88, 92, 85, 90, 80, 86, 90, 84, 88],
    positions: {
      vocal: [50, 28],
      guitar: [48, 50],
      drums: [52, 50],
      bass: [50, 72],
      keys: [46, 28],
    },
  },
  two: {
    reading: "MEDIUM",
    bars: [55, 40, 60, 35, 45, 30, 50, 38, 42, 48],
    positions: {
      vocal: [50, 50],
      guitar: [25, 25],
      drums: [50, 80],
      bass: [50, 20],
      keys: [75, 75],
    },
  },
  open: {
    reading: "LOW",
    bars: [18, 12, 20, 10, 16, 8, 14, 10, 12, 15],
    positions: {
      vocal: [50, 50],
      guitar: [15, 30],
      drums: [65, 75],
      bass: [35, 75],
      keys: [85, 30],
    },
  },
};
const CARS = [
  { key: "vocal", tag: "VOCAL", color: "#e8934a" },
  { key: "guitar", tag: "GUITAR", color: "#5fd9a0" },
  { key: "drums", tag: "DRUMS", color: "#5fa3d9" },
  { key: "bass", tag: "BASS", color: "#8b8890" },
  { key: "keys", tag: "KEYS", color: "#e8615f" },
];

function SoundHighwayModule() {
  const [zone, setZone] = useState("gridlock");
  const { autoRepeat, revealed, setRevealed, audioRef, stopAuto, toggleAuto, play: playMix } = useRepeatPlayer(AUDIO_SOURCES_2.gridlock);

  const selectZone = (key) => {
    setZone(key);
    const audio = audioRef.current;
    if (audio) audio.src = AUDIO_SOURCES_2[key];
    if (autoRepeat) stopAuto();
    setRevealed(true);
    audio?.play().catch(() => {});
  };

  const current = ZONES[zone];
  const crowdedKeys = new Set();
  CARS.forEach(({ key }) => {
    const [x] = current.positions[key];
    const overlaps = CARS.filter(({ key: k2 }) => Math.abs(current.positions[k2][0] - x) < 10);
    if (overlaps.length > 1) crowdedKeys.add(key);
  });

  return (
    <div className="llab-module">
      <p className="llab-hook">
        Put every car on a single-lane road and they collide bumper to
        bumper. Give them separate lanes and traffic flows freely, even at
        rush hour. Panning does the same job for a mix — it gives each
        instrument its own lane across the stereo field instead of piling
        every sound into the center.
      </p>

      <div className="llab-card">
        <div className="mclab-highway" aria-hidden="true">
          <div className="mclab-lane l1" />
          <div className="mclab-lane l2" />
          <div className="mclab-lane l3" />
          {CARS.map(({ key, tag, color }) => {
            const [x, y] = current.positions[key];
            const isLowLane = y >= 65;
            const className =
              "mclab-car" +
              (crowdedKeys.has(key) ? " crowded" : "") +
              (isLowLane ? " mclab-car--label-above" : "");
            return (
              <div
                key={key}
                className={className}
                data-tag={tag}
                style={{ background: color, left: `${x}%`, top: `${y}%` }}
              />
            );
          })}
        </div>

        <SegControl options={SEG_2} value={zone} onSelect={selectZone} label="Choose a stereo spread" />

        <div className="mclab-clash-label">
          <span>CLASH METER</span>
          <span className="mono">{current.reading}</span>
        </div>
        <div className="llab-decay" aria-hidden="true">
          {current.bars.map((h, i) => (
            <span key={i} style={{ height: `${Math.max(2, h * 0.34)}px` }} />
          ))}
        </div>

        <div className="llab-trigger-row">
          <button type="button" className="llab-trigger-btn" onClick={playMix}>
            ▶ Play the mix
          </button>
          <label className="llab-auto-toggle">
            <input type="checkbox" checked={autoRepeat} onChange={toggleAuto} />
            Repeat
          </label>
        </div>

        <AhaBox show={revealed}>
          Panning isn't decoration — it's traffic control. Two instruments
          sharing the same frequency range <em>and</em> the same spot in the
          stereo field will always crowd each other. Move one left, one
          right, and there's suddenly room for both to be heard clearly.
        </AhaBox>
      </div>
    </div>
  );
}
