import { useEffect, useRef, useState } from "react";
import "./speakerListeningLab.css";
import "./mixingConsoleLab.css";
import { PlayIcon, PauseIcon, LevelMeter, AhaBox, AudioNote } from "./listeningLabShared";
import { quickHelpHoverProps } from "../../help/helpHover";

// Mixing Console hotspot's "Mixing Console Lab" — same treatment as the
// Speakers hotspot's Listening Lab (see SpeakerListeningLab.jsx): replaces
// the generic "Test your knowledge" quiz for the mixing-console gear panel
// only (see PanoramaTour.jsx, which renders this instead of
// HotspotKnowledgeCheck whenever activeGear.id === "mixing-console"). Ported
// from design/mixing-console-lab.html, restructured from that mockup's
// scroll-with-progress-dots layout into two navigable tabs — one per
// experiment — instead of three, since this mockup only has two modules.
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
function MixingConsoleLab({
  open,
  onClose,
  onBackToOverview,
  onStartCourse,
  // Reports whatever's currently hovered/focused in this lab up to
  // PanoramaTour's Quick Help popup (help mode) — see helpHover.js and
  // QuickHelpPanel.jsx. Called with a short description on hover/focus
  // and `null` on leave/blur.
  onQuickHelp,
}) {
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
          🎚️
        </span>
        <div className="svr-tour-gear-panel__titles">
          <div className="svr-tour-gear-panel__title">Mixing Console Lab</div>
          <div className="svr-tour-gear-panel__kicker">
            {tab.label} · {activeTab + 1} of {TABS.length}
          </div>
        </div>
        <button
          onClick={onClose}
          className="svr-tour-gear-panel__close"
          aria-label="Close Mixing Console Lab"
          type="button"
          {...quickHelpHoverProps(onQuickHelp, "Close this lab and go back to the panel.")}
        >
          ×
        </button>
      </div>

      <div className="llab-tabs" role="tablist" aria-label="Mixing Console Lab experiments">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`mclab-tab-${t.id}`}
            aria-selected={activeTab === i}
            aria-controls={`mclab-panel-${t.id}`}
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
        id={`mclab-panel-${tab.id}`}
        aria-labelledby={`mclab-tab-${tab.id}`}
        // Remounting the module on tab switch (via key) stops its audio
        // automatically — see SpeakerListeningLab.jsx's identical comment.
        key={tab.id}
      >
        {activeTab === 0 && <AudioKitchenModule />}
        {activeTab === 1 && <SoundHighwayModule />}
      </div>

      <div className="svr-tour-gear-panel__footer">
        <div className="svr-tour-gear-panel__footer-row">
          <button
            type="button"
            className="svr-tour-btn svr-tour-btn-secondary"
            onClick={onBackToOverview}
            {...quickHelpHoverProps(onQuickHelp, "Go back to the choose-how-to-start overview.")}
          >
            ← Back
          </button>
          {onStartCourse && (
            <button
              type="button"
              className="svr-tour-btn svr-tour-btn-primary"
              onClick={onStartCourse}
              {...quickHelpHoverProps(onQuickHelp, "Jump straight into the full lesson for this topic.")}
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
  { id: "audio-kitchen", n: "01", label: "Channel Balance", short: "Balance" },
  { id: "sound-highway", n: "02", label: "Stereo Placement", short: "Panning" },
];

// ============================================================
// Icons
// ============================================================
function BowlIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 12h18a9 9 0 0 1-18 0z" />
      <line x1="12" y1="3" x2="12" y2="6" />
    </svg>
  );
}
function ChefHatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M6 10a3 3 0 0 1 1.7-4.6A3 3 0 0 1 11 3a3 3 0 0 1 3.3 2.4A3 3 0 0 1 18 10c0 2-1 3-2 3H8c-1 0-2-1-2-3z" />
      <path d="M8 21h8" />
      <path d="M9 21v-8" />
      <path d="M15 21v-8" />
    </svg>
  );
}
function OvercookedIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 2c1.6 2.6-1 3.8-1 6.4a2.6 2.6 0 0 0 5.2 0c0-1.6-.8-2.4-.8-2.4 1.6.9 2.6 3.2 2.6 5A6 6 0 0 1 6 11c0-4.2 3.4-5.8 3.4-8.4.8.8 1.6 1.6 2.6-.6z" />
    </svg>
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

// ============================================================
// MODULE 1 — The Audio Kitchen (channel balance)
// ============================================================
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
  const [mode, setMode] = useState("bland");
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.src = AUDIO_SOURCES_1.bland;
    audioRef.current = audio;
    return () => audio.pause();
  }, []);

  // Choosing a mix always starts it playing — same "switch stations, keep
  // listening" behavior SpeakerListeningLab's SpeakerTestModule uses.
  const selectMode = (m) => {
    setMode(m);
    setRevealed(true);
    setPlaying(true);
    const audio = audioRef.current;
    if (audio) {
      audio.src = AUDIO_SOURCES_1[m];
      audio.play().catch(() => { });
    }
  };

  const togglePlay = () => {
    setRevealed(true);
    const audio = audioRef.current;
    setPlaying((prev) => {
      const next = !prev;
      if (audio) {
        if (next) audio.play().catch(() => { });
        else audio.pause();
      }
      return next;
    });
  };

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
        <div className="llab-seg" role="group" aria-label="Choose a mix">
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
        {/* <AudioNote>mixing-console-kitchen-bland/chefs/overcooked.mp3</AudioNote> */}

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

// ============================================================
// MODULE 2 — The Sound Highway (stereo placement / panning)
// ============================================================
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
  const [autoRepeat, setAutoRepeat] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);
  const autoTimerRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = AUDIO_SOURCES_2.gridlock;
    audioRef.current = audio;
    return () => {
      audio.pause();
      clearInterval(autoTimerRef.current);
    };
  }, []);

  const playMix = () => {
    setRevealed(true);
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => { });
  };

  const stopAuto = () => {
    clearInterval(autoTimerRef.current);
    autoTimerRef.current = null;
    setAutoRepeat(false);
    audioRef.current?.pause();
  };

  // Selecting a stereo spread always plays the mix in it — same "pick it,
  // hear it" behavior as module 1's segmented toggle and
  // SpeakerListeningLab's RoomAcousticsModule.
  const selectZone = (key) => {
    setZone(key);
    const audio = audioRef.current;
    if (audio) audio.src = AUDIO_SOURCES_2[key];
    if (autoRepeat) stopAuto();
    setRevealed(true);
    audio?.play().catch(() => { });
  };

  const toggleAuto = () => {
    if (autoRepeat) {
      stopAuto();
      return;
    }
    setAutoRepeat(true);
    playMix();
    autoTimerRef.current = setInterval(playMix, 2000);
  };

  const current = ZONES[zone];
  // Cars are flagged "crowded" when two or more share nearly the same lane
  // (x position) — same collision test as the original mockup's
  // positionCars(), just recomputed from React state instead of mutating
  // the DOM directly.
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
            // Cars parked this low would have their label run past the
            // highway's bottom edge and get clipped by overflow:hidden —
            // flip the label to sit above the dot instead of below it.
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

        <div className="llab-seg" role="group" aria-label="Choose a stereo spread">
          {SEG_2.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={"llab-seg__btn" + (zone === key ? " active" : "")}
              onClick={() => selectZone(key)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>

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
        {/* <AudioNote>mixing-console-highway-gridlock/two/open.mp3</AudioNote> */}

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

export default MixingConsoleLab;
