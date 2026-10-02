import { useEffect, useRef, useState } from "react";
import { LabShell } from "../shared/LabShell";
import { AhaBox, LineIcon, PlayBar, SegControl } from "../shared/listeningLabShared";
import { useLoopPlayer, useRepeatPlayer } from "../shared/useLoopPlayer";

export default function SpeakerListeningLab(props) {
  return (
    <LabShell
      {...props}
      icon="🎧"
      title="Listening Lab"
      tabs={TABS}
      modules={[SpeakerTestModule, RoomAcousticsModule, StereoImagingModule]}
    />
  );
}

const TABS = [
  { id: "speaker-test", n: "01", label: "Speaker Test", short: "Speakers" },
  { id: "room-acoustics", n: "02", label: "Room Acoustics", short: "Rooms" },
  { id: "stereo-imaging", n: "03", label: "Stereo Imaging", short: "Stereo" },
];

function PhoneIcon() {
  return (
    <LineIcon>
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <line x1="11" y1="18" x2="13" y2="18" />
    </LineIcon>
  );
}
function CarIcon() {
  return (
    <LineIcon>
    <path d="M3 13l1.5-5A2 2 0 0 1 6.4 6.5h11.2A2 2 0 0 1 19.5 8L21 13" />
    <rect x="2" y="13" width="20" height="5" rx="1.5" />
    <circle cx="6.5" cy="18.5" r="1.5" />
    <circle cx="17.5" cy="18.5" r="1.5" />
    </LineIcon>
  );
}
function MonitorIcon() {
  return (
    <LineIcon>
    <rect x="3" y="3" width="18" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
    </LineIcon>
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
  const { mode, playing, revealed, selectMode, togglePlay } = useLoopPlayer(AUDIO_SOURCES_1, "phone");

  const curve = CURVES[mode];

  return (
    <div className="llab-module">
      <p className="llab-hook">
        Why does a song sound amazing in your car, but thin off a phone
        speaker on the counter? Same song, three real recordings — captured
        through each system.
      </p>

      <div className="llab-card">
        <SegControl options={SEG_1} value={mode} onSelect={selectMode} label="Choose playback system" />

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

        <PlayBar playing={playing} onToggle={togglePlay} />

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
  const { autoRepeat, revealed, setRevealed, audioRef, stopAuto, toggleAuto, play: playNote } = useRepeatPlayer(AUDIO_SOURCES_2.bathroom);

  const selectRoom = (key) => {
    setRoom(key);
    const audio = audioRef.current;
    if (audio) audio.src = AUDIO_SOURCES_2[key];
    if (autoRepeat) stopAuto();
    setRevealed(true);
    audio?.play().catch(() => {});
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
        <SegControl options={SEG_2} value={room} onSelect={selectRoom} label="Choose room" />

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
        if (next) audio.play().catch(() => {});
        else audio.pause();
      }
      return next;
    });
  };

  return (
    <div className="llab-module">
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

        <PlayBar playing={playing} onToggle={togglePlay} />

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
