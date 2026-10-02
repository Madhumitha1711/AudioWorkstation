import { useEffect, useMemo, useRef, useState } from "react";
import { LabShell } from "../shared/LabShell";
import "./SoundCardLab.css";
import { AhaBox, LineIcon, PlayBar, SegControl } from "../shared/listeningLabShared";
import { useLoopPlayer } from "../shared/useLoopPlayer";
import {
  newAudioContext,
  rampGain,
  applyScannerProfile,
  startScannerTune,
  stopScannerTune,
  createScannerNodes,
  teardownScannerNodes,
} from "./soundCardLabSynthAudio";

export default function SoundCardLab(props) {
  return (
    <LabShell
      {...props}
      icon="🔌"
      title="Sound Card Lab"
      tabs={TABS}
      modules={[ScannerModule, EchoMirrorModule]}
    />
  );
}

const TABS = [
  { id: "hd-scanner", n: "01", label: "Resolution & Conversion", short: "Resolution" },
  { id: "echo-mirror", n: "02", label: "Latency & Monitoring", short: "Latency" },
];

function ScannerPhoneIcon() {
  return (
    <LineIcon>
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <line x1="11" y1="18" x2="13" y2="18" />
    </LineIcon>
  );
}
function LaptopIcon() {
  return (
    <LineIcon>
    <rect x="3" y="4" width="18" height="12" rx="1.5" />
    <path d="M2 19h20l-2-3H4z" />
    </LineIcon>
  );
}
function SoundCardIcon() {
  return (
    <LineIcon>
    <rect x="4" y="4" width="16" height="16" rx="1" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="2" x2="9" y2="4" />
    <line x1="15" y1="2" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="22" />
    <line x1="15" y1="20" x2="15" y2="22" />
    </LineIcon>
  );
}
function JackIcon() {
  return (
    <LineIcon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v6M12 15v6" />
    </LineIcon>
  );
}

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

  useEffect(() => {
    const ctx = newAudioContext();
    const nodes = createScannerNodes(ctx);
    audioCtxRef.current = ctx;
    nodesRef.current = nodes;

    return () => {
      teardownScannerNodes(nodes);
      ctx.close().catch(() => {});
    };
  }, []);

  const selectMode = (m) => {
    setMode(m);
    setRevealed(true);
    setPlaying(true);
    const ctx = audioCtxRef.current;
    const nodes = nodesRef.current;
    if (ctx && nodes) {
      ctx.resume().catch(() => {});
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
        ctx.resume().catch(() => {});
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
        <SegControl options={SEG_1} value={mode} onSelect={selectMode} label="Choose a converter" />

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

const MAX_MS = 220;
const BAR_COUNT = 18;
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
  const { mode, playing, revealed, selectMode, togglePlay } = useLoopPlayer(AUDIO_SOURCES_2, "jack");

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
        <SegControl options={SEG_2} value={mode} onSelect={selectMode} label="Choose a monitoring path" />

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

        <PlayBar playing={playing} onToggle={togglePlay} />

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
