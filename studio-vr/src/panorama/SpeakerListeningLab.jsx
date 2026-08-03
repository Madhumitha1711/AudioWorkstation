import { useEffect, useRef, useState } from "react";
import "./speakerListeningLab.css";
import { PlayIcon, PauseIcon, LevelMeter, AhaBox, AudioNote } from "./listeningLabShared";

// Speakers hotspot's "Listening Lab" — replaces the generic "Test your
// knowledge" quiz for the speaker gear panel only (see PanoramaTour.jsx,
// which renders this instead of HotspotKnowledgeCheck whenever
// activeGear.id === "speaker"). Ported from design/speakek-listening-lab.html,
// restructured from that mockup's scroll-with-progress-dots layout into
// three navigable tabs.
//
// Reuses the same docked .svr-tour-gear-panel shell as the choice panel and
// HotspotKnowledgeCheck (top-right, 320px, see panoramaTour.css) instead of
// taking over the full screen — this is meant to feel like the same rail
// the visitor was already looking at, just showing a different "activity"
// inside it, not a separate takeover surface like the DAW workstation.
// Every module's own visuals are scaled down to fit that width.
//
// The transport button, level meter, and take-away chip/overlay
// (PlayIcon/PauseIcon/LevelMeter/AhaBox/AudioNote) live in
// ./listeningLabShared.jsx — this was the first lab built, but those bits
// are generic and now shared with MixingConsoleLab.jsx and SoundCardLab.jsx
// too, so every gear hotspot's lab gets identical panel height/width and
// take-away behavior instead of three copies slowly drifting apart.
//
// AUDIO IS UI-ONLY FOR NOW. Every module below wires up a real <audio>
// element pointed at a `public/audio/listening-lab/...` path (see the
// AUDIO_SOURCES_* maps in each module), but none of those files exist yet —
// real recordings get dropped in later. play() failures are caught and
// swallowed everywhere (same pattern already used by the room's ambient/
// narration audio elsewhere in this app — see spatialAudioEngine.js), and
// the "playing" look (icon swap, pulsing level meter) is driven by React
// state rather than real playback events, so the whole UI already reads and
// animates correctly with silence today and needs zero changes once real
// clips land at those paths. A small mono caption under each transport
// spells out the exact expected filenames as a placeholder/checklist for
// whoever adds the audio.
function SpeakerListeningLab({ open, onClose, onStartCourse }) {
  const [activeTab, setActiveTab] = useState(0);

  // Every visit starts back on experiment one — this is a fresh "before the
  // lesson" primer each time it's opened, not a resumable session.
  useEffect(() => {
    if (open) setActiveTab(0);
  }, [open]);

  if (!open) return null;

  const tab = TABS[activeTab];

  return (
    <div className="svr-tour-gear-panel llab-panel-shell">
      <div className="svr-tour-gear-panel__head">
        <span className="svr-tour-gear-badge llab-badge" aria-hidden="true">
          🎧
        </span>
        <div className="svr-tour-gear-panel__titles">
          <div className="svr-tour-gear-panel__title">Listening Lab</div>
          <div className="svr-tour-gear-panel__kicker">
            {tab.label} · {activeTab + 1} of {TABS.length}
          </div>
        </div>
        <button
          onClick={onClose}
          className="svr-tour-gear-panel__close"
          aria-label="Close Listening Lab"
          type="button"
        >
          ×
        </button>
      </div>

      <div className="llab-tabs" role="tablist" aria-label="Listening Lab experiments">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`llab-tab-${t.id}`}
            aria-selected={activeTab === i}
            aria-controls={`llab-panel-${t.id}`}
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
        id={`llab-panel-${tab.id}`}
        aria-labelledby={`llab-tab-${tab.id}`}
        // Remounting the module on tab switch (via key) is what stops its
        // audio automatically — each module's own cleanup effect pauses
        // and releases its <audio> element on unmount, so there's no
        // separate "stop the other tabs" bookkeeping needed here the way
        // the original scrolling design required.
        key={tab.id}
      >
        {activeTab === 0 && <SpeakerTestModule />}
        {activeTab === 1 && <RoomAcousticsModule />}
        {activeTab === 2 && <StereoImagingModule />}
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
  { id: "speaker-test", n: "01", label: "Speaker Test", short: "Speakers" },
  { id: "room-acoustics", n: "02", label: "Room Acoustics", short: "Rooms" },
  { id: "stereo-imaging", n: "03", label: "Stereo Imaging", short: "Stereo" },
];

// ============================================================
// Shared bits
// ============================================================

// PlayIcon, PauseIcon, LevelMeter, AhaBox, and AudioNote now live in
// ./listeningLabShared.jsx (imported above) so MixingConsoleLab.jsx and
// SoundCardLab.jsx can reuse the exact same transport button, level meter,
// and take-away chip/overlay interaction instead of redefining them.

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}
function CarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 13l1.5-5A2 2 0 0 1 6.4 6.5h11.2A2 2 0 0 1 19.5 8L21 13" />
      <rect x="2" y="13" width="20" height="5" rx="1.5" />
      <circle cx="6.5" cy="18.5" r="1.5" />
      <circle cx="17.5" cy="18.5" r="1.5" />
    </svg>
  );
}
function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}
function BathroomIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  );
}
function LivingRoomIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M4 18v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
      <path d="M4 18h16" />
      <path d="M6 12V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4" />
    </svg>
  );
}
function ClosetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="1" />
      <path d="M9 2v20M15 2v20" />
    </svg>
  );
}
// ============================================================
// MODULE 1 — Speaker Test (Car Stereo vs. Kitchen Radio)
// ============================================================
const AUDIO_SOURCES_1 = {
  phone: "/audio/listening-lab/module1-phone.mp3",
  car: "/audio/listening-lab/module1-car.mp3",
  studio: "/audio/listening-lab/module1-studio.mp3",
};
const CURVES = {
  phone: {
    d: "M0,90 L120,90 L200,45 L440,45 L520,90 L640,90",
    color: "#e8934a",
    title: "PHONE ON COUNTER",
    caption: "Bass and highs are cut — everything funnels through the mids.",
  },
  car: {
    d: "M0,20 L160,20 L260,55 L420,55 L520,15 L640,15",
    color: "#e8934a",
    title: "CAR STEREO",
    caption: "Bass is boosted hard, highs are pushed too — it flatters the song but hides the truth.",
  },
  studio: {
    d: "M0,60 L640,60",
    color: "#5fd9a0",
    title: "STUDIO MONITORS",
    caption: "A flat, honest line. What you hear is what's actually in the mix.",
  },
};
const SEG_1 = [
  { key: "phone", label: "Phone", Icon: PhoneIcon },
  { key: "car", label: "Car", Icon: CarIcon },
  { key: "studio", label: "Studio", Icon: MonitorIcon },
];

function SpeakerTestModule() {
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

  // Choosing a system always starts it playing — same "switch stations,
  // keep listening" behavior the original design used.
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
        Why does a song sound amazing in your car, but thin off a phone
        speaker on the counter? Same song, three real recordings — captured
        through each system.
      </p>

      <div className="llab-card">
        <div className="llab-seg" role="group" aria-label="Choose playback system">
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
        {/* <AudioNote>module1-phone/car/studio.mp3</AudioNote> */}

        <AhaBox show={revealed}>
          Consumer speakers <em>lie</em> to you on purpose — they boost bass
          or treble to sound exciting. Studio monitors tell the flat, boring
          truth, so if a mix sounds right on them, it'll translate
          everywhere else too.
        </AhaBox>
      </div>
    </div>
  );
}

// ============================================================
// MODULE 2 — Room Acoustics (The Shower-Singer Effect)
// ============================================================
const AUDIO_SOURCES_2 = {
  bathroom: "/audio/listening-lab/module2-bathroom.mp3",
  living: "/audio/listening-lab/module2-living.mp3",
  closet: "/audio/listening-lab/module2-closet.mp3",
};
const SEG_2 = [
  { key: "bathroom", label: "Bathroom", Icon: BathroomIcon, bars: [90, 70, 55, 42, 32, 24, 17, 12, 8, 5] },
  { key: "living", label: "Living Rm", Icon: LivingRoomIcon, bars: [70, 45, 26, 14, 7, 3, 0, 0, 0, 0] },
  { key: "closet", label: "Closet", Icon: ClosetIcon, bars: [55, 10, 2, 0, 0, 0, 0, 0, 0, 0] },
];
const ROOM_LABELS = {
  bathroom: "Tiled Bathroom",
  living: "Living Room",
  closet: "Closet Full of Coats",
};

function RoomAcousticsModule() {
  const [room, setRoom] = useState("bathroom");
  const [autoRepeat, setAutoRepeat] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);
  const autoTimerRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = AUDIO_SOURCES_2.bathroom;
    audioRef.current = audio;
    return () => {
      audio.pause();
      clearInterval(autoTimerRef.current);
    };
  }, []);

  const playNote = () => {
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

  // Selecting a room always plays a note in it — same "pick it, hear it"
  // behavior as module 1/3's segmented toggles.
  const selectRoom = (key) => {
    setRoom(key);
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
    playNote();
    autoTimerRef.current = setInterval(playNote, 2000);
  };

  const current = SEG_2.find((r) => r.key === room);

  return (
    <div className="llab-module">
      <p className="llab-hook">
        Why does everyone sound like a pop star singing in a tiled bathroom?
        Switch between three real rooms and hear the same note recorded in
        each one — only the room around it changed.
      </p>

      <div className="llab-card">
        <div className="llab-seg" role="group" aria-label="Choose room">
          {SEG_2.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={"llab-seg__btn" + (room === key ? " active" : "")}
              onClick={() => selectRoom(key)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>

        <div className="llab-decay" aria-hidden="true">
          {current.bars.map((h, i) => (
            <span key={i} style={{ height: `${Math.max(2, h * 0.34)}px` }} />
          ))}
        </div>
        <div className="llab-decay-caption mono">{ROOM_LABELS[room].toUpperCase()} — DECAY</div>

        <div className="llab-trigger-row">
          <button type="button" className="llab-trigger-btn" onClick={playNote}>
            ▶ Play a note
          </button>
          <label className="llab-auto-toggle">
            <input type="checkbox" checked={autoRepeat} onChange={toggleAuto} />
            Repeat
          </label>
        </div>
        {/* <AudioNote>module2-bathroom/living/closet.mp3</AudioNote> */}

        <AhaBox show={revealed}>
          What you're hearing is the room bouncing sound back at you. Tile
          reflects almost everything; coats absorb almost everything.
          Studio monitors need a <em>treated</em> room so the space stops
          adding its own opinion to your mix.
        </AhaBox>
      </div>
    </div>
  );
}

// ============================================================
// MODULE 3 — Stereo Imaging (The Headphone Illusion)
// ============================================================
// This module used to let the student "toggle" between a speaker
// recording and a headphone recording of the same clip, with an
// illustration of the beams reaching each ear. That didn't actually
// teach anything real: a browser can't reroute audio to a different
// physical output on demand, so both "versions" just played out of
// whatever the student already had plugged in — the toggle changed a
// file, not what reached their ears. The only way to actually hear the
// headphone-vs-speaker difference is to change the real-world listening
// device, so this module just sends the student to do that themselves.
const AUDIO_SOURCE_3 = "/audio/listening-lab/module3-stereo-demo.mp3";

function StereoImagingModule() {
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.src = AUDIO_SOURCE_3;
    audioRef.current = audio;
    return () => audio.pause();
  }, []);

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

  return (
    <div className="llab-module">
      <p className="llab-hook">
        This one you have to feel for yourself. There's no way for a
        webpage to swap which physical device your sound comes out of, so
        a "headphones vs. speakers" toggle here would just be two files
        that sound identical on whatever you're using right now. Instead,
        do the real A/B test:
      </p>

      <div className="llab-card">
        <ol className="llab-task-steps">
          <li>
            <strong>Put on real headphones</strong> (earbuds count), press
            play below, and notice how the sound sits inside your head.
          </li>
          <li>
            <strong>Then play the same clip on an actual speaker</strong> —
            a phone or laptop speaker, a bluetooth speaker, or the room's
            monitors — out loud, and notice how it now feels like it's in
            front of you.
          </li>
        </ol>

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
        {/* <AudioNote>module3-stereo-demo.mp3</AudioNote> */}

        <AhaBox show={revealed}>
          Same file, same clip — the only thing that changes is the
          physical device the sound leaves through. Headphones feed each
          ear in total isolation, so panned and stereo elements can feel
          like they're inside your skull. Speakers mix both channels
          together in open air before either ear hears them, which is
          what creates a "stage" in front of you. That's why mixes get
          checked on both: something that feels wide on headphones can
          collapse — or shift — on speakers, and vice versa.
        </AhaBox>
      </div>
    </div>
  );
}

export default SpeakerListeningLab;
