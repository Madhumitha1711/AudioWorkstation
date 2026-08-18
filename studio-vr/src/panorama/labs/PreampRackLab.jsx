import { useEffect, useMemo, useRef, useState } from "react";
import "./speakerListeningLab.css";
import "./preampRackLab.css";
import { PlayIcon, PauseIcon, LevelMeter, AhaBox, AudioNote } from "./listeningLabShared";

// Preamp Rack hotspot's "Preamp Rack Lab" — same treatment as the Speakers
// hotspot's Listening Lab (see SpeakerListeningLab.jsx): replaces the
// generic "Test your knowledge" quiz for the preamp-rack gear panel only
// (see PanoramaTour.jsx, which renders this instead of
// HotspotKnowledgeCheck whenever activeGear.id === "preamp-rack"). Ported
// from design/preamp-rack-lab.html, restructured from that mockup's
// scroll-with-progress-dots layout into two navigable tabs — one per
// experiment — same as MixingConsoleLab.jsx/SoundCardLab.jsx.
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
function PreampRackLab({ open, onClose, onBackToOverview, onStartCourse }) {
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
          🎙️
        </span>
        <div className="svr-tour-gear-panel__titles">
          <div className="svr-tour-gear-panel__title">Preamp Rack Lab</div>
          <div className="svr-tour-gear-panel__kicker">
            {tab.label} · {activeTab + 1} of {TABS.length}
          </div>
        </div>
        <button
          onClick={onClose}
          className="svr-tour-gear-panel__close"
          aria-label="Close Preamp Rack Lab"
          type="button"
        >
          ×
        </button>
      </div>

      <div className="llab-tabs" role="tablist" aria-label="Preamp Rack Lab experiments">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`prlab-tab-${t.id}`}
            aria-selected={activeTab === i}
            aria-controls={`prlab-panel-${t.id}`}
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
        id={`prlab-panel-${tab.id}`}
        aria-labelledby={`prlab-tab-${tab.id}`}
        // Remounting the module on tab switch (via key) stops its audio
        // automatically — see SpeakerListeningLab.jsx's identical comment.
        key={tab.id}
      >
        {activeTab === 0 && <TelescopeModule />}
        {activeTab === 1 && <LensModule />}
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
  { id: "telescope", n: "01", label: "Gain Staging", short: "Gain" },
  { id: "lens", n: "02", label: "Preamp Character", short: "Character" },
];

// ============================================================
// Icons
// ============================================================
function LowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  );
}
function SweetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
      <path d="M8 11h6M11 8v6" />
    </svg>
  );
}
function HighIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
      <path d="M7 8l8 6M15 8l-8 6" />
    </svg>
  );
}
function TransparentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}
function TubeStyleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <ellipse cx="12" cy="10" rx="3" ry="4" />
      <line x1="12" y1="14" x2="12" y2="18" />
    </svg>
  );
}
function TransformerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="16" r="3" />
      <path d="M10.5 9.5l3 3" />
    </svg>
  );
}

// ============================================================
// MODULE 1 — The Sound Telescope (gain staging)
// ============================================================
const AUDIO_SOURCES_1 = {
  low: "/audio/listening-lab/telescope-low.mp3",
  sweet: "/audio/listening-lab/telescope-sweet.mp3",
  high: "/audio/listening-lab/telescope-high.mp3",
};
const GAIN_MODES = {
  low: {
    reading: "TOO LOW",
    fillPos: "6%",
    color: "#8b8890",
    caption:
      "The voice is a faint whisper, barely rising above the background hiss — there's nothing here for the rest of the studio to work with.",
  },
  sweet: {
    reading: "SWEET SPOT",
    fillPos: "50%",
    color: "#5fd9a0",
    caption:
      "The voice zooms in to full, rich, detailed clarity — exactly the healthy line-level signal the rest of the studio expects.",
  },
  high: {
    reading: "TOO HIGH — CLIPPING",
    fillPos: "92%",
    color: "#e8615f",
    caption:
      "The wave bursts past the lens frame — the tops and bottoms get flattened off, causing harsh, ugly distortion called clipping.",
  },
};
const SEG_1 = [
  { key: "low", label: "Too Low", Icon: LowIcon },
  { key: "sweet", label: "Sweet Spot", Icon: SweetIcon },
  { key: "high", label: "Too High", Icon: HighIcon },
];

// A faint noise field behind the "too low" trace — regenerated only when
// this module first renders "low" mode, not on every render, so the dots
// don't visibly jitter each time React re-renders for an unrelated reason.
function useNoiseDots(active) {
  return useMemo(() => {
    if (!active) return [];
    return Array.from({ length: 46 }, () => ({
      x: 8 + Math.random() * 134,
      y: 8 + Math.random() * 134,
      r: 0.5 + Math.random() * 0.7,
      o: 0.15 + Math.random() * 0.25,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

function waveSweep(amp, clip) {
  const cx = 75;
  const cy = 75;
  const w = 134;
  const pts = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = cx - w / 2 + t * w;
    let y = cy + Math.sin(t * 4 * Math.PI) * amp;
    if (clip) {
      const limit = 42;
      if (y > cy + limit) y = cy + limit;
      if (y < cy - limit) y = cy - limit;
    }
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return "M" + pts.join(" L");
}

function TelescopeModule() {
  const [mode, setMode] = useState("low");
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);
  const dots = useNoiseDots(mode === "low");

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.src = AUDIO_SOURCES_1.low;
    audioRef.current = audio;
    return () => audio.pause();
  }, []);

  const selectMode = (m) => {
    setMode(m);
    setRevealed(true);
    setPlaying(true);
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

  const g = GAIN_MODES[mode];

  return (
    <div className="llab-module">
      <p className="llab-hook">
        A whisper from a microphone is like a tiny, distant star — you need
        a telescope to magnify it so you can actually see it. Switch the
        magnification below and watch the signal come into focus.
      </p>

      <div className="llab-card">
        <div className="llab-seg" role="group" aria-label="Choose a gain setting">
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

        <div className="prlab-scope-wrap">
          <div className="prlab-scope-frame">
            <svg viewBox="0 0 150 150" aria-hidden="true">
              <line x1="8" y1="75" x2="142" y2="75" stroke="rgba(255,255,255,0.06)" />
              {mode === "low" &&
                dots.map((d, i) => (
                  <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#8b8890" opacity={d.o} />
                ))}
              {mode === "low" && (
                <path d={waveSweep(5, false)} fill="none" stroke="#8b8890" strokeWidth="1.2" />
              )}
              {mode === "sweet" && (
                <path d={waveSweep(38, false)} fill="none" stroke="#5fd9a0" strokeWidth="2" />
              )}
              {mode === "high" && (
                <path d={waveSweep(66, true)} fill="none" stroke="#e8615f" strokeWidth="2.2" />
              )}
            </svg>
            <div className={"prlab-clip-badge" + (mode === "high" ? " show" : "")}>⚠ CLIPPING</div>
          </div>

          <div className="prlab-scope-caption">{g.caption}</div>

          <div className="prlab-gain-meter">
            <div className="prlab-gain-meter-label mono">
              <span>GAIN</span>
              <span>{g.reading}</span>
            </div>
            <div className="prlab-gain-meter-track">
              <div className="prlab-gain-meter-zones">
                <span className="z-low" />
                <span className="z-sweet" />
                <span className="z-high" />
              </div>
              <div
                className="prlab-gain-meter-fill"
                style={{ left: g.fillPos, background: g.color, boxShadow: `0 0 8px ${g.color}` }}
              />
            </div>
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
        {/* <AudioNote>telescope-low/sweet/high.mp3</AudioNote> */}

        <AhaBox show={revealed}>
          Microphones output tiny, weak signals (mic level). A preamp's
          primary job is to boost that signal up to a healthy size (line
          level) so the rest of the studio can process it cleanly.
        </AhaBox>
      </div>
    </div>
  );
}

// ============================================================
// MODULE 2 — The Camera Lens Filter (preamp character)
// ============================================================
const AUDIO_SOURCES_2 = {
  transparent: "/audio/listening-lab/lens-transparent.mp3",
  tube: "/audio/listening-lab/lens-tube.mp3",
  transformer: "/audio/listening-lab/lens-transformer.mp3",
};
const DRY_WAVE =
  "M0,60 C26,25 53,25 80,60 C106,95 133,95 160,60 C186,25 213,25 240,60 C266,95 293,95 320,60 C346,25 373,25 400,60 C426,95 453,95 480,60 C506,25 533,25 560,60 C586,95 613,95 640,60";
const LENS_MODES = {
  transparent: {
    tint: "transparent",
    waveColor: "#ede9e3",
    strokeWidth: 2,
    soften: false,
    caption: "Exactly what went in comes out — crisp, neutral, and precise. Nothing added, nothing hidden.",
    reading: "MINIMAL",
    bars: [100, 6, 4, 3, 2],
    barColors: ["#5fa3d9", "#3a3a42", "#3a3a42", "#3a3a42", "#3a3a42"],
  },
  tube: {
    tint: "radial-gradient(circle at 50% 50%, rgba(232,147,74,0.35), rgba(232,147,74,0.05) 70%)",
    waveColor: "#e8934a",
    strokeWidth: 3,
    soften: true,
    caption: "Subtle harmonic warmth smooths out sharp edges — the same performance, just cozier.",
    reading: "WARM (2ND / 3RD)",
    bars: [100, 38, 26, 10, 5],
    barColors: ["#5fa3d9", "#e8934a", "#e8934a", "#6b4a2c", "#6b4a2c"],
  },
  transformer: {
    tint: "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.32), rgba(167,139,250,0.05) 70%)",
    waveColor: "#a78bfa",
    strokeWidth: 3,
    soften: false,
    caption: "Extra weight and punch get added up front — great for giving drums and bass some snap.",
    reading: "PUNCHY (LOW + 2ND)",
    bars: [100, 55, 18, 32, 8],
    barColors: ["#5fa3d9", "#a78bfa", "#4a3a6b", "#a78bfa", "#4a3a6b"],
  },
};
const SEG_2 = [
  { key: "transparent", label: "Transparent", Icon: TransparentIcon },
  { key: "tube", label: "Vintage Tube", Icon: TubeStyleIcon },
  { key: "transformer", label: "Transformer", Icon: TransformerIcon },
];
const HARMONIC_NAMES = ["FUND", "2ND", "3RD", "4TH", "5TH"];

function LensModule() {
  const [mode, setMode] = useState("transparent");
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.src = AUDIO_SOURCES_2.transparent;
    audioRef.current = audio;
    return () => audio.pause();
  }, []);

  const selectMode = (m) => {
    setMode(m);
    setRevealed(true);
    setPlaying(true);
    const audio = audioRef.current;
    if (audio) {
      audio.src = AUDIO_SOURCES_2[m];
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

  const m = LENS_MODES[mode];

  return (
    <div className="llab-module">
      <p className="llab-hook">
        Slightly tinting a camera lens with a warm vintage filter makes a
        photo feel cozy and nostalgic. Different preamps do the same thing
        to a vocal — switch between three styles below.
      </p>

      <div className="llab-card">
        <div className="llab-seg" role="group" aria-label="Choose a preamp style">
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

        <div className="prlab-lens-frame" style={{ background: m.tint }}>
          <svg className="llab-curve__shape" viewBox="0 0 640 120" preserveAspectRatio="none">
            <defs>
              {m.soften && (
                <filter id="prlab-soften" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="1.4" />
                </filter>
              )}
            </defs>
            <line x1="0" y1="60" x2="640" y2="60" stroke="rgba(255,255,255,0.08)" />
            <path
              d={DRY_WAVE}
              fill="none"
              stroke={m.waveColor}
              strokeWidth={m.strokeWidth}
              filter={m.soften ? "url(#prlab-soften)" : undefined}
            />
          </svg>
        </div>
        <div className="llab-curve__caption">{m.caption}</div>

        <div className="prlab-harmonics">
          <div className="prlab-harmonics-label mono">
            <span>ADDED HARMONIC CONTENT</span>
            <span>{m.reading}</span>
          </div>
          <div className="prlab-harmonics-viz">
            {m.bars.map((h, i) => (
              <div className="prlab-hbar" key={HARMONIC_NAMES[i]}>
                <div
                  className="prlab-hfill"
                  style={{ height: `${Math.max(3, h * 0.42)}px`, background: m.barColors[i] }}
                />
                <div className="prlab-hname mono">{HARMONIC_NAMES[i]}</div>
              </div>
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
        {/* <AudioNote>lens-transparent/tube/transformer.mp3</AudioNote> */}

        <AhaBox show={revealed}>
          Preamps don't just make sounds louder — different preamps act
          like color lenses, shaping the texture and character of your
          recording before it ever reaches the DAW.
        </AhaBox>
      </div>
    </div>
  );
}

export default PreampRackLab;
