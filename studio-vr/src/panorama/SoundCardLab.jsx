import { useEffect, useMemo, useRef, useState } from "react";
import "./speakerListeningLab.css";
import "./soundCardLab.css";
import { PlayIcon, PauseIcon, LevelMeter, AhaBox, AudioNote } from "./listeningLabShared";

// Sound Card hotspot's "Sound Card Lab" — same treatment as the Speakers
// hotspot's Listening Lab (see SpeakerListeningLab.jsx): replaces the
// generic "Test your knowledge" quiz for the sound-card gear panel only
// (see PanoramaTour.jsx, which renders this instead of
// HotspotKnowledgeCheck whenever activeGear.id === "sound-card"). Ported
// from design/sound-card-lab.html, restructured from that mockup's
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
function SoundCardLab({ open, onClose, onStartCourse }) {
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
          🔌
        </span>
        <div className="svr-tour-gear-panel__titles">
          <div className="svr-tour-gear-panel__title">Sound Card Lab</div>
          <div className="svr-tour-gear-panel__kicker">
            {tab.label} · {activeTab + 1} of {TABS.length}
          </div>
        </div>
        <button
          onClick={onClose}
          className="svr-tour-gear-panel__close"
          aria-label="Close Sound Card Lab"
          type="button"
        >
          ×
        </button>
      </div>

      <div className="llab-tabs" role="tablist" aria-label="Sound Card Lab experiments">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`sclab-tab-${t.id}`}
            aria-selected={activeTab === i}
            aria-controls={`sclab-panel-${t.id}`}
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
        id={`sclab-panel-${tab.id}`}
        aria-labelledby={`sclab-tab-${tab.id}`}
        // Remounting the module on tab switch (via key) stops its audio
        // automatically — see SpeakerListeningLab.jsx's identical comment.
        key={tab.id}
      >
        {activeTab === 0 && <ScannerModule />}
        {activeTab === 1 && <EchoMirrorModule />}
      </div>

      <div className="svr-tour-gear-panel__footer">
        <div className="svr-tour-gear-panel__footer-row">
          <button type="button" className="svr-tour-btn svr-tour-btn-secondary" onClick={onClose}>
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
  { id: "hd-scanner", n: "01", label: "Resolution & Conversion", short: "Resolution" },
  { id: "echo-mirror", n: "02", label: "Latency & Monitoring", short: "Latency" },
];

// ============================================================
// Icons
// ============================================================
function ScannerPhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}
function LaptopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M2 19h20l-2-3H4z" />
    </svg>
  );
}
// Same shape as the "sound-card" glyph in hotspotDevices.js's ICONS map —
// kept as its own local component (rather than importing/parsing that raw
// SVG string) so it can take a stroke color from CSS like every other icon
// here, reused for both "Studio Sound Card" (module 1) and "Studio
// Interface" (module 2) since they're the same physical device.
function SoundCardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="2" x2="9" y2="4" />
      <line x1="15" y1="2" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="22" />
      <line x1="15" y1="20" x2="15" y2="22" />
    </svg>
  );
}
function JackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v6M12 15v6" />
    </svg>
  );
}

// ============================================================
// MODULE 1 — The HD Document Scanner (resolution & conversion)
// ============================================================
const AUDIO_SOURCES_1 = {
  phone: "/audio/listening-lab/sound-card-scanner-phone.mp3",
  laptop: "/audio/listening-lab/sound-card-scanner-laptop.mp3",
  studio: "/audio/listening-lab/sound-card-scanner-studio.mp3",
};
const CURVES = {
  phone: {
    d: "M0,60 L80,60 L80,20 L160,20 L160,60 L240,60 L240,100 L320,100 L320,60 L400,60 L400,20 L480,20 L480,60 L560,60 L560,100 L640,100",
    color: "#e8615f",
    title: "CHEAP PHONE CONVERTER — 8-BIT-STYLE",
    caption: "The smooth curve gets chopped into big blocky steps — you can hear the grit and digital harshness.",
  },
  laptop: {
    d: "M0,60 L40,31.7 L80,20 L120,31.7 L160,60 L200,88.3 L240,100 L280,88.3 L320,60 L360,31.7 L400,20 L440,31.7 L480,60 L520,88.3 L560,100 L600,88.3 L640,60",
    color: "#e8934a",
    title: "STANDARD LAPTOP CONVERTER — 16-BIT-STYLE",
    caption: "Better resolution, but the curve still gets faceted — subtle details in the performance get rounded off.",
  },
  studio: {
    d: "M0,60 C40,20 80,20 120,60 C160,100 200,100 240,60 C280,20 320,20 360,60 C400,100 440,100 480,60 C520,20 560,20 600,60 C620,80 630,70 640,60",
    color: "#5fd9a0",
    title: "STUDIO SOUND CARD — 24-BIT/96KHZ",
    caption: "Every subtle curve of the original performance survives the trip into your computer, intact.",
  },
};
const SEG_1 = [
  { key: "phone", label: "Phone", Icon: ScannerPhoneIcon },
  { key: "laptop", label: "Laptop", Icon: LaptopIcon },
  { key: "studio", label: "Studio", Icon: SoundCardIcon },
];

function ScannerModule() {
  const [mode, setMode] = useState("phone");
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.src = AUDIO_SOURCES_1.phone;
    audioRef.current = audio;
    return () => audio.pause();
  }, []);

  // Choosing a converter always starts it playing — same "switch stations,
  // keep listening" behavior as SpeakerListeningLab's SpeakerTestModule.
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

  const curve = CURVES[mode];

  return (
    <div className="llab-module">
      <p className="llab-hook">
        Scanning a hand-drawn artwork with a cheap printer vs. a high-end
        studio scanner. A smooth, organic sound wave — a real voice singing —
        gets converted differently depending on what's doing the converting.
        Switch between three converter qualities and hear the difference.
      </p>

      <div className="llab-card">
        <div className="llab-seg" role="group" aria-label="Choose a converter">
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

        <div className="llab-curve">
          <div className="llab-curve__label">
            <span className="mono">{curve.title}</span>
          </div>
          <svg className="llab-curve__shape" viewBox="0 0 640 120" preserveAspectRatio="none">
            <line x1="0" y1="60" x2="640" y2="60" stroke="rgba(255,255,255,0.08)" />
            <path d={curve.d} stroke={curve.color} fill="none" strokeWidth="3" />
          </svg>
          <div className="llab-curve__caption">{curve.caption}</div>
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
        {/* <AudioNote>sound-card-scanner-phone/laptop/studio.mp3</AudioNote> */}

        <AhaBox show={revealed}>
          A sound card is a high-definition translator — it converts
          real-world air movement into digital computer data. Higher
          bit-depth and sample rate (like the 24-bit/96kHz studio interface)
          mean less of the original performance gets thrown away in that
          translation.
        </AhaBox>
      </div>
    </div>
  );
}

// ============================================================
// MODULE 2 — The Echo-Free Mirror (latency & real-time monitoring)
// ============================================================
const AUDIO_SOURCE_2 = "/audio/listening-lab/sound-card-mirror-dry.mp3";
const MAX_MS = 220;
const BAR_COUNT = 18;
// Same wobbly-waveform look as the original mockup's generated bars, just a
// shorter run to fit the narrower docked panel.
const BAR_HEIGHTS = Array.from(
  { length: BAR_COUNT },
  (_, i) => 4 + Math.abs(Math.sin(i * 0.7)) * 12 + (i % 5 === 0 ? 3 : 0),
);
const MODES = {
  jack: { ms: 200, label: "200 ms", status: "distracting", title: "Distracting" },
  interface: { ms: 2, label: "< 3 ms", status: "seamless", title: "Seamless" },
};
const SEG_2 = [
  { key: "jack", label: "Computer Jack", Icon: JackIcon },
  { key: "interface", label: "Studio Interface", Icon: SoundCardIcon },
];

function EchoMirrorModule() {
  const [mode, setMode] = useState("jack");
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = AUDIO_SOURCE_2;
    audioRef.current = audio;
    return () => audio.pause();
  }, []);

  // Switching monitoring path only updates the visual (how far the "you
  // hear back" row shifts and fades) — same as the original mockup, where
  // the actual A/B moment is the trigger button below, not the toggle.
  const selectMode = (m) => {
    setMode(m);
    setRevealed(true);
  };

  const singPhrase = () => {
    setRevealed(true);
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => { });
  };

  const { ms, status, title } = MODES[mode];
  const maxShiftPx = 40;
  const shift = (ms / MAX_MS) * maxShiftPx;
  const opacity = ms < 10 ? 1 : Math.max(0.35, 1 - (ms / MAX_MS) * 0.6);

  const bars = useMemo(() => BAR_HEIGHTS, []);

  return (
    <div className="llab-module">
      <p className="llab-hook">
        Ever tried speaking on a video call when your own voice comes back to
        you half a second later? It makes you stutter. Switch between a
        standard computer jack and a studio interface to hear how much that
        round-trip delay changes.
      </p>

      <div className="llab-card">
        <div className="llab-seg" role="group" aria-label="Choose a monitoring path">
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

        <div className="sclab-echo-stage">
          <div className="sclab-echo-row">
            <div className="sclab-echo-tag mono">YOU SING</div>
            <div className="sclab-echo-track">
              <div className="sclab-echo-bars source">
                {bars.map((h, i) => (
                  <span key={i} style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>
          </div>
          <div className="sclab-echo-row">
            <div className="sclab-echo-tag mono">YOU HEAR BACK</div>
            <div className="sclab-echo-track">
              <div
                className="sclab-echo-bars return"
                style={{ transform: `translateX(${shift}px)`, opacity }}
              >
                {bars.map((h, i) => (
                  <span key={i} style={{ height: `${h}px` }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="sclab-delay-readout">
          <div className="sclab-delay-ms mono">{MODES[mode].label}</div>
          <div className={"sclab-delay-status " + status}>{title}</div>
        </div>

        <div className="llab-trigger-row">
          <button type="button" className="llab-trigger-btn" onClick={singPhrase}>
            🎤 Sing a phrase
          </button>
        </div>
        {/* <AudioNote>sound-card-mirror-dry.mp3</AudioNote> */}

        <AhaBox show={revealed}>
          A studio audio interface processes sound at ultra-fast speeds —
          under 3 milliseconds — so artists can hear themselves back in real
          time without a distracting delay. Anywhere past roughly 10ms, the
          brain can't reconcile "what I just sang" with "what I'm hearing,"
          and performers start to stumble.
        </AhaBox>
      </div>
    </div>
  );
}

export default SoundCardLab;
