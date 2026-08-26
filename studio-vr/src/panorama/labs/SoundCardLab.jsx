import { useEffect, useMemo, useRef, useState } from "react";
import "./speakerListeningLab.css";
import "./soundCardLab.css";
import { PlayIcon, PauseIcon, LevelMeter, AhaBox, AudioNote } from "./listeningLabShared";
import {
  newAudioContext,
  rampGain,
  applyScannerProfile,
  startScannerTune,
  stopScannerTune,
  createScannerNodes,
  teardownScannerNodes,
} from "./soundCardLabSynthAudio";

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
// UNLIKE the rest of the "Listening Lab" family (SpeakerListeningLab,
// MixingConsoleLab, and every other panorama/*Lab.jsx) — but only for
// MODULE 1 (the HD Document Scanner) — audio is REAL, not a UI-only
// placeholder pointed at a missing recording. Bit-depth reduction is
// something the Web Audio API can synthesize and process live, in-browser,
// with no dependency on recording (and shipping) a real vocal take through
// three different converters, so a live Web Audio graph is strictly better
// there than a canned recording: it's the actual mechanism being taught,
// not a stand-in for it, and it needs zero asset files. That engine
// (SCANNER_PROFILES, the quantizer curve, the note scheduler, and graph
// construction) lives in ./soundCardLabSynthAudio.js, not in this file; see
// that file's header comment for why it's split out, and see ScannerModule
// below for how this component drives it. It still swallows AudioContext
// errors the same way the rest of the app swallows <audio> play() failures,
// since autoplay-restricted browsers can leave a context suspended until a
// user gesture resumes it.
//
// MODULE 2 (the Echo-Free Mirror) instead follows the same UI-only
// placeholder pattern as every other Listening Lab module — a real <audio>
// element pointed at a `public/audio/listening-lab/...` path that doesn't
// exist yet (see SpeakerListeningLab.jsx's header comment for the full
// rationale) — rather than trying to approximate delayed auditory feedback
// out of oscillators. See EchoMirrorModule below.
function SoundCardLab({
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
// The actual tune/bit-crusher engine (SCANNER_PROFILES, the quantizer
// curve, the note scheduler, and graph construction) lives in
// ./soundCardLabSynthAudio.js — this module just drives it: builds the
// nodes once per mount, lets the user pick a converter or play/pause, and
// renders the curve/caption that goes with whichever converter is active.
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
  const audioCtxRef = useRef(null);
  const nodesRef = useRef(null);

  // Builds the tune -> quantizer -> lowpass -> master graph once (via
  // createScannerNodes, in ./soundCardLabSynthAudio.js) and leaves it
  // running for the module's whole lifetime; play/pause just ramps
  // masterGain and starts/stops the note scheduler (see
  // togglePlay/selectMode) instead of start()/stop()-ing the oscillators
  // themselves — an OscillatorNode can only ever be started once, so
  // restarting it per play-press isn't an option the way it is with
  // <audio>.play()/.pause().
  useEffect(() => {
    const ctx = newAudioContext();
    const nodes = createScannerNodes(ctx);
    audioCtxRef.current = ctx;
    nodesRef.current = nodes;

    return () => {
      teardownScannerNodes(nodes);
      ctx.close().catch(() => { });
    };
  }, []);

  // Choosing a converter always starts it playing — same "switch stations,
  // keep listening" behavior as SpeakerListeningLab's SpeakerTestModule.
  // startScannerTune is idempotent, so this doesn't restart the tune from
  // the top if it's already looping — it just leaves it running while the
  // converter (and therefore the crunch) underneath it changes.
  const selectMode = (m) => {
    setMode(m);
    setRevealed(true);
    setPlaying(true);
    const ctx = audioCtxRef.current;
    const nodes = nodesRef.current;
    if (ctx && nodes) {
      ctx.resume().catch(() => { });
      applyScannerProfile(nodes, ctx, m);
      rampGain(nodes.masterGain, ctx, 0.9);
      startScannerTune(ctx, nodes);
    }
  };

  const togglePlay = () => {
    setRevealed(true);
    const ctx = audioCtxRef.current;
    const nodes = nodesRef.current;
    setPlaying((prev) => {
      const next = !prev;
      if (ctx && nodes) {
        ctx.resume().catch(() => { });
        rampGain(nodes.masterGain, ctx, next ? 0.9 : 0);
        if (next) startScannerTune(ctx, nodes);
        else stopScannerTune(nodes);
      }
      return next;
    });
  };

  const curve = CURVES[mode];

  return (
    <div className="llab-module">
      <p className="llab-hook">
        Scanning a hand-drawn artwork with a cheap printer vs. a high-end
        studio scanner. A smooth, organic sound wave — here, a simple looping
        tune — gets converted differently depending on what's doing the
        converting. Switch between three converter qualities and hear the
        same tune played back through each one.
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
// AUDIO IS UI-ONLY HERE, same pattern as every module in SpeakerListeningLab
// and MixingConsoleLab (see SpeakerListeningLab.jsx's header comment for the
// full rationale): a real <audio> element pointed at a
// `public/audio/listening-lab/...` path that doesn't exist yet, play()
// failures swallowed, and the "playing" look driven by React state rather
// than real playback events. MODES below is just display data (the ms
// readout and status chip next to whichever placeholder clip is selected),
// not a live delay parameter — there's no Web Audio graph in this module.
const MAX_MS = 220;
const BAR_COUNT = 18;
// Same wobbly-waveform look as the original mockup's generated bars, just a
// shorter run to fit the narrower docked panel.
const BAR_HEIGHTS = Array.from(
  { length: BAR_COUNT },
  (_, i) => 4 + Math.abs(Math.sin(i * 0.7)) * 12 + (i % 5 === 0 ? 3 : 0),
);
const AUDIO_SOURCES_2 = {
  jack: "/audio/listening-lab/sound-card-jack.mp3",
  interface: "/audio/listening-lab/sound-card-interface.mp3",
};
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
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.src = AUDIO_SOURCES_2.jack;
    audioRef.current = audio;
    return () => audio.pause();
  }, []);

  // Choosing a monitoring path always starts it playing — same "switch
  // stations, keep listening" behavior as SpeakerListeningLab's
  // SpeakerTestModule and ScannerModule above.
  const selectMode = (m) => {
    setMode(m);
    setRevealed(true);
    setPlaying(true);
    const audio = audioRef.current;
    if (audio) {
      audio.src = AUDIO_SOURCES_2[m];
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
        {/* <AudioNote>sound-card-jack/interface.mp3</AudioNote> */}

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
