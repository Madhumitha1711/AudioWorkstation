import { useEffect, useRef, useState } from "react";
import "./speakerListeningLab.css";
import "./lfEmitterLab.css";
import { PlayIcon, PauseIcon, LevelMeter, AhaBox, AudioNote } from "./listeningLabShared";

// LF Emitter hotspot's "LF Emitter Lab" — same treatment as the Speakers
// hotspot's Listening Lab (see SpeakerListeningLab.jsx): replaces the
// generic "Test your knowledge" quiz for the lf-emitter gear panel only
// (see PanoramaTour.jsx, which renders this instead of
// HotspotKnowledgeCheck whenever activeGear.id === "lf-emitter"). Ported
// from design/lf-emitter-lab.html, restructured from that mockup's
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
function LfEmitterLab({
  open,
  onClose,
  onBackToOverview,
  onStartCourse,
  // True while the onboarding tour's "Test your knowledge" step is
  // current (see src/tour/OnboardingTour.jsx, wired up from
  // PanoramaTour.jsx). That step's action (opening this lab) is already
  // done by the time this component is even open, so this isn't a
  // "click here" glow — it's purely a stable anchor for the guide
  // card's own position tracking. Without a .svr-tour-glow element to
  // measure against once the choice panel's own glowing button unmounts
  // (this lab replaces it), the card falls back to the viewport's
  // bottom-right corner — which is exactly where this panel itself
  // docks, so the two would overlap and the card would visibly jump
  // there. Paired with svr-tour-glow--done (see onboardingTour.css) so
  // it's a static ring, not the pulsing animation — there's nothing left
  // to click here. See HotspotPrecheck.jsx's tourAnchorPanel for the
  // same pattern.
  tourAnchorPanel,
  // True while the onboarding tour's "Start the course" step is current
  // (see src/tour/OnboardingTour.jsx). Unlike tourAnchorPanel above, this
  // really is a "click here" cue — it's the one remaining action that
  // step asks for — so it gets the full pulsing svr-tour-glow, same as
  // HotspotKnowledgeCheck's tourHighlightStartCourse.
  tourHighlightStartCourse,
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
      <div className={"svr-tour-gear-panel__head" + (tourAnchorPanel ? " svr-tour-glow svr-tour-glow--done" : "")}>
        <span className="svr-tour-gear-badge llab-badge" aria-hidden="true">
          🔊
        </span>
        <div className="svr-tour-gear-panel__titles">
          <div className="svr-tour-gear-panel__title">LF Emitter Lab</div>
          <div className="svr-tour-gear-panel__kicker">
            {tab.label} · {activeTab + 1} of {TABS.length}
          </div>
        </div>
        <button
          onClick={onClose}
          className="svr-tour-gear-panel__close"
          aria-label="Close LF Emitter Lab"
          type="button"
        >
          ×
        </button>
      </div>

      <div className="llab-tabs" role="tablist" aria-label="LF Emitter Lab experiments">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`lfelab-tab-${t.id}`}
            aria-selected={activeTab === i}
            aria-controls={`lfelab-panel-${t.id}`}
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
        id={`lfelab-panel-${tab.id}`}
        aria-labelledby={`lfelab-tab-${tab.id}`}
        // Remounting the module on tab switch (via key) stops its audio
        // automatically — see SpeakerListeningLab.jsx's identical comment.
        key={tab.id}
      >
        {activeTab === 0 && <ThunderModule />}
        {activeTab === 1 && <RippleTankModule />}
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
              className={
                "svr-tour-btn svr-tour-btn-primary" +
                (tourHighlightStartCourse ? " svr-tour-glow" : "")
              }
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
  { id: "thunder", n: "01", label: "Hearing vs. Feeling", short: "Feel It" },
  { id: "rippletank", n: "02", label: "Wavelength & Room Behavior", short: "Wavelength" },
];

// ============================================================
// Icons
// ============================================================
function DesktopSpeakersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}
function SubwooferIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.6" />
    </svg>
  );
}
function HighFreqIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M2 12c1-3 2-3 3 0s2 3 3 0 2-3 3 0 2 3 3 0 2-3 3 0 2 3 3 0" />
    </svg>
  );
}
function LowFreqIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M1 12c3-8 8-8 11 0s8 8 11 0" />
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
function CouchObstacleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 12v6h16v-6" />
      <path d="M3 12a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" />
      <path d="M4 12v-2.5A1.5 1.5 0 0 1 5.5 8h1A1.5 1.5 0 0 1 8 9.5V12" />
      <path d="M20 12v-2.5A1.5 1.5 0 0 0 18.5 8h-1A1.5 1.5 0 0 0 16 9.5V12" />
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
// MODULE 1 — Feeling the Thunder (spectrum + chest rumble)
// ============================================================
const AUDIO_SOURCES_1 = {
  desktop: "/audio/listening-lab/thunder-desktop.mp3",
  sub: "/audio/listening-lab/thunder-sub.mp3",
};
const BIN_NAMES = ["20", "60", "150", "400", "1K", "2.5K", "6K", "16K"];
const BIN_KEYS = ["b0", "b1", "b2", "b3", "b4", "b5", "b6", "b7"];
const THUNDER_MODES = {
  desktop: {
    title: "DESKTOP SPEAKERS — THIN LOW END",
    rumble: false,
    levels: { b0: 8, b1: 15, b2: 35, b3: 55, b4: 70, b5: 75, b6: 68, b7: 60 },
    caption:
      "The high notes and dialogue are clear, but the explosion feels weak and thin — there's nothing moving air down low.",
  },
  sub: {
    title: "SUBWOOFER ON — FULL LOW END",
    rumble: true,
    levels: { b0: 72, b1: 78, b2: 65, b3: 55, b4: 70, b5: 75, b6: 68, b7: 60 },
    caption:
      "Deep bass frequencies now fill the bottom of the spectrum — the same explosion suddenly has real weight behind it.",
  },
};
const SEG_1 = [
  { key: "desktop", label: "Desktop Speakers", Icon: DesktopSpeakersIcon },
  { key: "sub", label: "Subwoofer On", Icon: SubwooferIcon },
];
const LOW_BINS = new Set(["b0", "b1", "b2"]);

function ThunderModule() {
  const [mode, setMode] = useState("desktop");
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.src = AUDIO_SOURCES_1.desktop;
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

  const t = THUNDER_MODES[mode];

  return (
    <div className="llab-module">
      <p className="llab-hook">
        You don't just hear a movie theater explosion or a passing parade
        bass drum — you feel your chest vibrate. Switch between two
        playback setups and watch what happens at the bottom of the
        spectrum.
      </p>

      <div className="llab-card">
        <div className="llab-seg" role="group" aria-label="Choose a playback setup">
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

        <div className="lfelab-spectrum-box">
          <div className="lfelab-spectrum-label mono">
            <span>20 HZ</span>
            <span>16 KHZ</span>
          </div>
          <div className="lfelab-spectrum">
            {BIN_KEYS.map((key, i) => {
              const val = t.levels[key];
              const isLow = LOW_BINS.has(key);
              const color = isLow ? (t.rumble ? "#a78bfa" : "#3a3a42") : "#5fa3d9";
              return (
                <div className="lfelab-bin" key={key}>
                  <div className="lfelab-bin-track">
                    <div className="lfelab-bin-fill" style={{ height: `${val}%`, background: color }} />
                  </div>
                  <div className="lfelab-bin-name mono">{BIN_NAMES[i]}</div>
                </div>
              );
            })}
          </div>

          <div className={"lfelab-rumble-row" + (t.rumble ? " on" : "")}>
            <span className="lfelab-rumble-dot" />
            <span className="lfelab-rumble-text mono">Chest Rumble</span>
            <span className="lfelab-rumble-status mono">{t.rumble ? "ON" : "OFF"}</span>
          </div>

          <div className="lfelab-spectrum-caption">{t.caption}</div>
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
        {/* <AudioNote>thunder-desktop/sub.mp3</AudioNote> */}

        <AhaBox show={revealed}>
          Standard studio monitors handle clarity, but low-frequency
          emitters produce the deep, long physical sound waves that give
          music warmth, power, and visceral feel — the difference between
          hearing an explosion and feeling one.
        </AhaBox>
      </div>
    </div>
  );
}

// ============================================================
// MODULE 2 — The Ripple Tank (wavelength & room behavior)
// ============================================================
const AUDIO_SOURCES_2 = {
  high: "/audio/listening-lab/rippletank-high.mp3",
  low: "/audio/listening-lab/rippletank-low.mp3",
};
const RIPPLE_MODES = {
  high: {
    title: "HIGH FREQUENCY — SHORT, FAST RIPPLES",
    wavelength: "~1 FT",
    tag: "BLOCKED BY OBSTACLE",
    tagColor: "#5fa3d9",
    caption:
      "High-frequency waves are short enough that a couch or curtain stops them cold — the wave dies right at the obstacle.",
    cycles: 7,
    amp: 8,
    afterOpacity: 0.12,
  },
  low: {
    title: "LOW FREQUENCY — HUGE, SLOW BASS WAVES",
    wavelength: "~20 FT",
    tag: "PASSES RIGHT THROUGH",
    tagColor: "#a78bfa",
    caption:
      "Low bass waves are so wide that ordinary furniture barely registers — the wave just keeps rolling through the room, full strength.",
    cycles: 0.9,
    amp: 20,
    afterOpacity: 1,
  },
};
const SEG_2 = [
  { key: "high", label: "High Frequency", Icon: HighFreqIcon },
  { key: "low", label: "Low Frequency (Bass)", Icon: LowFreqIcon },
];

function buildWavePath(cycles, amp, xStart, xEnd, midY) {
  const pts = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = xStart + t * (xEnd - xStart);
    const y = midY + Math.sin(t * cycles * 2 * Math.PI) * amp;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return "M" + pts.join(" L");
}

function RippleTankModule() {
  const [mode, setMode] = useState("high");
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = AUDIO_SOURCES_2.high;
    audioRef.current = audio;
    return () => audio.pause();
  }, []);

  // Switching frequency only updates the visual (same "pick it, see it"
  // treatment as the original mockup) — the actual A/B moment is the
  // trigger button below.
  const selectMode = (m) => {
    setMode(m);
    setRevealed(true);
    const audio = audioRef.current;
    if (audio) audio.src = AUDIO_SOURCES_2[m];
  };

  const playTone = () => {
    setRevealed(true);
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  const r = RIPPLE_MODES[mode];
  const midY = 45;
  const srcX = 18;
  const wallX = 150;
  const endX = 282;
  const beforeD = buildWavePath(r.cycles * ((wallX - srcX) / (endX - srcX)), r.amp, srcX, wallX, midY);
  const afterD = buildWavePath(r.cycles * ((endX - wallX) / (endX - srcX)), r.amp, wallX, endX, midY);

  return (
    <div className="llab-module">
      <p className="llab-hook">
        Why can you hear bass from a car stereo three blocks away, even with
        its windows rolled up? Compare a short, fast high-frequency wave to
        a huge, slow bass wave and see what happens when each one meets a
        couch in its path.
      </p>

      <div className="llab-card">
        <div className="llab-seg" role="group" aria-label="Choose a frequency">
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

        <div className="lfelab-wave-box">
          <div className="lfelab-wave-label mono">
            <span>SPEAKER</span>
            <span>LISTENER</span>
          </div>
          <div className="lfelab-wave-stage">
            <svg viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true">
              <line x1={srcX} y1={midY} x2={endX} y2={midY} stroke="rgba(255,255,255,0.06)" />
              <path d={beforeD} fill="none" stroke="#e8934a" strokeWidth="2" />
              <path d={afterD} fill="none" stroke="#e8934a" strokeWidth="2" opacity={r.afterOpacity} />
            </svg>
            <div className="lfelab-wave-icon source">
              <SpeakerSourceIcon />
            </div>
            <div className="lfelab-wave-icon obstacle">
              <CouchObstacleIcon />
            </div>
            <div className="lfelab-wave-icon ear">
              <EarListenerIcon />
            </div>
          </div>
          <div className="lfelab-wave-caption">{r.caption}</div>

          <div className="lfelab-wavelength-row">
            <div className="lfelab-wavelength-val mono">{r.wavelength}</div>
            <div className="lfelab-wavelength-tag mono" style={{ color: r.tagColor }}>
              {r.tag}
            </div>
          </div>
        </div>

        <div className="llab-trigger-row">
          <button type="button" className="llab-trigger-btn" onClick={playTone}>
            ▶ Play the tone
          </button>
        </div>
        {/* <AudioNote>rippletank-high/low.mp3</AudioNote> */}

        <AhaBox show={revealed}>
          Low-frequency sound waves are massive — often 10 to 30 feet
          long — so they simply wrap around and pass through furniture and
          walls that would stop a short high-frequency wave cold. That's
          why bass leaks through a wall (or a rolled-up car window) when
          treble never does, and why subwoofer placement matters so much.
        </AhaBox>
      </div>
    </div>
  );
}

export default LfEmitterLab;
