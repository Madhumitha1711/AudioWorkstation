import { useEffect, useRef, useState } from "react";
import "./SweetSpotLab.css";

// Faithful port of design/sweet-spot-lab-ui.html's 2D top-down "stage +
// sidebar" screen. The mockup's separate 3D overlay (a full three.js scene
// gated behind an "Enter 3D Lab" button) has been dropped entirely — this
// screen *is* the lab now, not a preview of one.
//
// State stays in the same SVG-pixel space the design used (ROOM/SPK_Y/
// METERS_PER_PX below), only converting to real meters where the design
// itself did: display labels, and — new here — the positions that drive
// an actual Web Audio HRTF panner graph. The mockup's 2D screen was
// visual-only (no real sound, just decorative "sound ring" pulses); a
// play/stop control and the demo-tone/upload engine from earlier work has
// been carried over so the lab still teaches by ear, not just by eye.

const ROOM = { x: 30, y: 20, w: 740, h: 420 };
const SPK_Y = 90;
const METERS_PER_PX = 0.012;
const CENTER_X = ROOM.x + ROOM.w / 2;
const AMBER = "#e8934a";
const GREEN = "#5fd9a0";

const DEFAULT_STATE = { halfWidth: 150, toeDeg: 12, listenerX: CENTER_X, listenerY: 300 };

// One full swell-and-fade per side in the demo tones, alternating in
// stereo mode. A flat, continuous drone is one of the hardest signals to
// localize — low frequencies rely almost entirely on interaural timing
// cues, which need some kind of onset/envelope for the ear to lock onto.
const DEMO_PULSE_PERIOD_SEC = 1.8;
const RING_INTERVAL_MS = 850;

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

// Same simplified aim-cone geometry as the design's buildCone(): angleDeg
// 90 points straight "down" the room toward the listener, spreadDeg is the
// cone's total angular width, length is in SVG px. Returns just the path
// `d` string; the design's version returned a whole <path> tag.
function buildConePath(cx, cy, angleDeg, spreadDeg, length) {
  const a1 = ((angleDeg - spreadDeg / 2) * Math.PI) / 180;
  const a2 = ((angleDeg + spreadDeg / 2) * Math.PI) / 180;
  const x1 = cx + Math.cos(a1) * length;
  const y1 = cy + Math.sin(a1) * length;
  const x2 = cx + Math.cos(a2) * length;
  const y2 = cy + Math.sin(a2) * length;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${length} ${length} 0 0 1 ${x2} ${y2} Z`;
}

function setPannerPos(panner, x, y, z) {
  if (panner.positionX) {
    panner.positionX.value = x;
    panner.positionY.value = y;
    panner.positionZ.value = z;
  } else {
    panner.setPosition(x, y, z);
  }
}

// Which way the speaker itself is "facing" (its cone/dispersion axis), as
// opposed to setPannerPos above, which is just where it sits. Paired with
// coneInnerAngle/coneOuterAngle/coneOuterGain (see ensureAudioGraph) so
// toe-in actually does something acoustically, not just visually.
function setPannerOrientation(panner, x, y, z) {
  if (panner.orientationX) {
    panner.orientationX.value = x;
    panner.orientationY.value = y;
    panner.orientationZ.value = z;
  } else if (panner.setOrientation) {
    panner.setOrientation(x, y, z);
  }
}

// A slowly swelling tone (a sine LFO gating a GainNode) instead of a flat
// drone. phaseOffsetSec staggers when this side's gate LFO starts; two
// tones started exactly half a period apart swell in strict alternation,
// which is what makes stereo mode's "which side is that on" obvious.
function createPulsingTone(ctx, freq, phaseOffsetSec) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const gate = ctx.createGain();
  gate.gain.value = 0;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 1 / DEMO_PULSE_PERIOD_SEC;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
  const lfoOffset = ctx.createConstantSource();
  lfoOffset.offset.value = 0.5;

  lfo.connect(lfoDepth);
  lfoDepth.connect(gate.gain);
  lfoOffset.connect(gate.gain);
  osc.connect(gate);

  const now = ctx.currentTime;
  osc.start(now);
  lfoOffset.start(now);
  lfo.start(now + phaseOffsetSec);

  return {
    output: gate,
    stop() {
      [osc, lfo, lfoOffset].forEach((node) => {
        try {
          node.stop();
        } catch {
          /* already stopped */
        }
      });
      gate.disconnect();
    },
  };
}

let ringIdSeq = 0;

function SweetSpotLab({ onInteract }) {
  const svgRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragRef = useRef(null); // 'listener' | 'speakerL' | 'speakerR' | null
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  const audioApiRef = useRef({});

  const [halfWidth, setHalfWidth] = useState(DEFAULT_STATE.halfWidth);
  const [toeDeg, setToeDeg] = useState(DEFAULT_STATE.toeDeg);
  const [listenerX, setListenerX] = useState(DEFAULT_STATE.listenerX);
  const [listenerY, setListenerY] = useState(DEFAULT_STATE.listenerY);
  const [polarOn, setPolarOn] = useState(false);
  const [monoOn, setMonoOn] = useState(false);
  const [rings, setRings] = useState([]);

  const [audioOn, setAudioOn] = useState(false);
  const [audioSource, setAudioSource] = useState("demo");
  const [uploadedBuffer, setUploadedBuffer] = useState(null);
  const [uploadedName, setUploadedName] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  // ---- derived geometry + readouts (pure, recomputed every render) ----
  const lx = CENTER_X - halfWidth;
  const rx = CENTER_X + halfWidth;
  const dL = dist(listenerX, listenerY, lx, SPK_Y);
  const dR = dist(listenerX, listenerY, rx, SPK_Y);
  const diff = dL - dR;
  const maxDiff = halfWidth * 1.6;
  const pos = Math.max(-1, Math.min(1, -diff / maxDiff));
  const pct = 50 + pos * 50;

  let posLabel = "CENTER";
  if (Math.abs(pos) > 0.08) {
    const side = pos < 0 ? "LEFT" : "RIGHT";
    const strength = Math.abs(pos) > 0.55 ? "HARD " : "";
    posLabel = `${strength}${side}`;
  }
  const imageLabel = monoOn ? `${posLabel} · MONO` : posLabel;

  const asym = Math.abs(diff) / maxDiff;
  const toeFactor = toeDeg / 45;
  let corr = 1 - asym * 0.85 - Math.max(0, 0.3 - toeFactor * 0.3) * (asym > 0.05 ? 1 : 0);
  corr = Math.max(-0.2, Math.min(1, corr));
  const corrGood = corr > 0.5;
  const corrPct = ((corr + 0.2) / 1.2) * 100;

  const mL = (dL * METERS_PER_PX).toFixed(1);
  const mR = (dR * METERS_PER_PX).toFixed(1);
  const dPct = 50 + Math.max(-1, Math.min(1, -diff / maxDiff)) * 50;

  const widthMeters = (halfWidth * 2 * METERS_PER_PX).toFixed(1);
  const spread = Math.max(50, halfWidth * 0.65);
  const sweetCy = SPK_Y + halfWidth * 1.05;

  // ---- dragging (listener + either speaker, matching the design) ----
  function pointFromEvent(e) {
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const scaleX = 800 / rect.width;
    const scaleY = 460 / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  function startDrag(target) {
    return (e) => {
      dragRef.current = target;
      e.preventDefault();
    };
  }

  useEffect(() => {
    function onMove(e) {
      const target = dragRef.current;
      if (!target) return;
      if (e.cancelable) e.preventDefault();
      const p = pointFromEvent(e);
      if (target === "listener") {
        setListenerX(Math.max(ROOM.x + 20, Math.min(ROOM.x + ROOM.w - 20, p.x)));
        setListenerY(Math.max(SPK_Y + 40, Math.min(ROOM.y + ROOM.h - 20, p.y)));
      } else {
        setHalfWidth(Math.max(40, Math.min(300, Math.abs(p.x - CENTER_X))));
      }
      markInteracted();
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAll = () => {
    setHalfWidth(DEFAULT_STATE.halfWidth);
    setToeDeg(DEFAULT_STATE.toeDeg);
    setListenerX(DEFAULT_STATE.listenerX);
    setListenerY(DEFAULT_STATE.listenerY);
    markInteracted();
  };

  // ---- ambient sound-ring pulses, only while actually playing (the
  // design animates these unconditionally since its 2D screen never makes
  // real sound; tying them to audioOn here keeps what you see honest
  // about what you'd actually hear) ----
  useEffect(() => {
    if (!audioOn) return undefined;
    const spawn = () => {
      setRings((prev) => [
        ...prev,
        { id: ++ringIdSeq, side: "L", cx: lx, cy: SPK_Y },
        { id: ++ringIdSeq, side: monoOn ? "L" : "R", cx: rx, cy: SPK_Y },
      ]);
    };
    spawn();
    const id = setInterval(spawn, RING_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioOn, monoOn, lx, rx]);

  // ---- real Web Audio graph ----
  const ensureAudioGraph = () => {
    const a = audioApiRef.current;
    if (a.ctx) return a;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.destination);

    const pannerL = ctx.createPanner();
    const pannerR = ctx.createPanner();
    [pannerL, pannerR].forEach((p) => {
      p.panningModel = "HRTF";
      // refDistance ~= the closest practical listening position in this
      // room (see the listener drag clamp below), so standing right up
      // at the sweet spot reads as full, undamped level — and a much
      // steeper rolloffFactor than a "realistic" value (which, over the
      // room's actual size, produced only a ~7dB near-vs-far difference —
      // audible on paper but small enough to get lost under the demo
      // tone's own pulsing volume swings). This tuning gets that up
      // to a clearly perceptible ~15-17dB swing across the room instead.
      p.distanceModel = "inverse";
      p.refDistance = 2;
      p.maxDistance = 10;
      p.rolloffFactor = 5;
      // Real monitors beam energy forward rather than radiating equally
      // in every direction. PannerNode defaults coneInnerAngle/
      // coneOuterAngle to 360° each (no directivity at all), so these
      // have to be set explicitly for toe-in to do anything acoustically.
      p.coneInnerAngle = 12;
      p.coneOuterAngle = 70;
      p.coneOuterGain = 0.3;
      p.connect(master);
    });

    const gainL = ctx.createGain();
    gainL.gain.value = 0.9;
    gainL.connect(pannerL);
    const gainR = ctx.createGain();
    gainR.gain.value = 0.9;
    gainR.connect(pannerR);

    Object.assign(a, { ctx, master, pannerL, pannerR, gainL, gainR });
    return a;
  };

  function syncPannerGraph() {
    const a = audioApiRef.current;
    if (!a.ctx) return;
    const toeRad = (toeDeg * Math.PI) / 180;

    const lWorldX = (lx - CENTER_X) * METERS_PER_PX;
    const rWorldX = (rx - CENTER_X) * METERS_PER_PX;
    const listenerWorldX = (listenerX - CENTER_X) * METERS_PER_PX;
    const listenerWorldZ = (listenerY - SPK_Y) * METERS_PER_PX;

    setPannerPos(a.pannerL, lWorldX, 0.3, 0);
    setPannerPos(a.pannerR, rWorldX, 0.3, 0);
    setPannerOrientation(a.pannerL, Math.sin(toeRad), 0, Math.cos(toeRad));
    setPannerOrientation(a.pannerR, Math.sin(-toeRad), 0, Math.cos(-toeRad));

    // Listener orientation tracks the actual direction toward the speaker
    // midpoint rather than a fixed forward vector, so azimuth stays exact
    // at every listening position instead of just "close enough" near
    // dead center.
    const toOriginX = -listenerWorldX;
    const toOriginZ = -listenerWorldZ;
    const len = Math.hypot(toOriginX, toOriginZ) || 1;
    const fx = toOriginX / len;
    const fz = toOriginZ / len;

    const l = a.ctx.listener;
    if (l.positionX) {
      l.positionX.value = listenerWorldX;
      l.positionY.value = 1.0;
      l.positionZ.value = listenerWorldZ;
      l.forwardX.value = fx;
      l.forwardY.value = 0;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else if (l.setPosition) {
      l.setPosition(listenerWorldX, 1.0, listenerWorldZ);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  useEffect(() => {
    syncPannerGraph();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [halfWidth, toeDeg, listenerX, listenerY]);

  // Uploaded audio plays through an AudioBufferSourceNode instead of the
  // two oscillators. In stereo mode with a multi-channel file, a
  // ChannelSplitter sends the real left/right channels to the left/right
  // panner; in mono mode (or a mono file), the source fans out to both
  // gain nodes, which Web Audio downmixes automatically.
  const startUploadedSource = (a) => {
    const bufSrc = a.ctx.createBufferSource();
    bufSrc.buffer = uploadedBuffer;
    bufSrc.loop = true;
    if (!monoOn && uploadedBuffer.numberOfChannels > 1) {
      const splitter = a.ctx.createChannelSplitter(2);
      bufSrc.connect(splitter);
      splitter.connect(a.gainL, 0);
      splitter.connect(a.gainR, 1);
      a.splitter = splitter;
    } else {
      bufSrc.connect(a.gainL);
      bufSrc.connect(a.gainR);
    }
    bufSrc.start();
    a.bufSrc = bufSrc;
  };

  const startDemoTones = (a) => {
    const [fl, fr] = monoOn ? [246.94, 246.94] : [196.0, 293.66];
    const phaseR = monoOn ? 0 : DEMO_PULSE_PERIOD_SEC / 2;
    a.demoL = createPulsingTone(a.ctx, fl, 0);
    a.demoR = createPulsingTone(a.ctx, fr, phaseR);
    a.demoL.output.connect(a.gainL);
    a.demoR.output.connect(a.gainR);
  };

  const startAudio = () => {
    const a = ensureAudioGraph();
    if (a.ctx.state === "suspended") a.ctx.resume();
    if (audioSource === "uploaded" && uploadedBuffer) {
      startUploadedSource(a);
    } else {
      startDemoTones(a);
    }
    syncPannerGraph();
    setAudioOn(true);
    markInteracted();
  };

  const stopAudio = () => {
    const a = audioApiRef.current;
    if (a.demoL) {
      a.demoL.stop();
      a.demoL = null;
    }
    if (a.demoR) {
      a.demoR.stop();
      a.demoR = null;
    }
    if (a.bufSrc) {
      try {
        a.bufSrc.stop();
      } catch {
        /* already stopped */
      }
      a.bufSrc.disconnect();
      a.bufSrc = null;
    }
    if (a.splitter) {
      a.splitter.disconnect();
      a.splitter = null;
    }
    setAudioOn(false);
  };

  // Switching source/mono mid-playback needs the underlying nodes rebuilt
  // (a splitter vs. a plain fan-out is a different graph, and an
  // oscillator can't turn into a buffer source in place), so restart in
  // place whenever the current selection changes while playing.
  const audioOnRef = useRef(audioOn);
  audioOnRef.current = audioOn;
  useEffect(() => {
    if (audioOnRef.current) {
      stopAudio();
      startAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSource, uploadedBuffer, monoOn]);

  useEffect(() => {
    return () => {
      // audioApiRef holds plain mutable audio-node data (not a DOM ref),
      // and is intentionally read fresh here to pick up whatever
      // startAudio()/stopAudio() most recently stored on it.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const a = audioApiRef.current;
      a.demoL?.stop();
      a.demoR?.stop();
      if (a.bufSrc) {
        try {
          a.bufSrc.stop();
        } catch {
          /* already stopped */
        }
      }
      if (a.ctx) a.ctx.close().catch(() => {});
    };
  }, []);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError("");
    setDecoding(true);
    try {
      const a = ensureAudioGraph();
      if (a.ctx.state === "suspended") await a.ctx.resume();
      const arrayBuf = await file.arrayBuffer();
      const decoded = await a.ctx.decodeAudioData(arrayBuf);
      setUploadedBuffer(decoded);
      setUploadedName(file.name.replace(/\.[^/.]+$/, "").slice(0, 28));
      setAudioSource("uploaded");
      markInteracted();
    } catch (err) {
      console.error("Failed to decode audio file", err);
      setUploadError("Could not read that file — try an mp3, wav, or m4a.");
    } finally {
      setDecoding(false);
    }
  };

  // A pure hardware/OS sanity check, separate from the 3D... now 2D
  // panners above: two beeps routed straight to raw output channels 0 and
  // 1 via a ChannelMergerNode, bypassing PannerNode/HRTF/listener position
  // entirely. If the first beep isn't in your left ear and the second
  // isn't in your right, the swap is in your headphones or OS, not here.
  const testLeftRight = () => {
    const a = ensureAudioGraph();
    if (a.ctx.state === "suspended") a.ctx.resume();
    const now = a.ctx.currentTime;
    const merger = a.ctx.createChannelMerger(2);
    merger.connect(a.master);
    const beep = (channelIndex, startAt) => {
      const osc = a.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 440;
      const g = a.ctx.createGain();
      g.gain.setValueAtTime(0, startAt);
      g.gain.linearRampToValueAtTime(0.6, startAt + 0.015);
      g.gain.setValueAtTime(0.6, startAt + 0.22);
      g.gain.linearRampToValueAtTime(0, startAt + 0.28);
      osc.connect(g);
      g.connect(merger, 0, channelIndex);
      osc.start(startAt);
      osc.stop(startAt + 0.32);
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
      };
    };
    beep(0, now + 0.05); // raw output channel 0 = left
    beep(1, now + 0.55); // raw output channel 1 = right
    setTimeout(() => merger.disconnect(), 1200);
  };

  // Spacebar toggles play/stop, same as the other labs in this course —
  // guarded so it doesn't fire while typing/focused in a form control.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== "Space") return;
      const target = e.target;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      e.preventDefault();
      if (audioOn) {
        stopAudio();
      } else {
        startAudio();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioOn, audioSource, uploadedBuffer, monoOn]);

  return (
    <div className="sslab">
      <div className="sslab-header">
        <div className="sslab-eyebrow">LAB · STEREO IMAGING</div>
        <h3 className="sslab-title">The Sweet Spot</h3>
        <p className="sslab-desc">
          Drag the listener around the room and hear the stereo image shift. Move the speakers to feel how
          width, angle, and distance change what reaches each ear.
        </p>
      </div>

      <div className="sslab-chips">
        <button
          type="button"
          className="sslab-chip"
          onClick={() => {
            setListenerX(260);
            markInteracted();
          }}
        >
          → Walk off-center
        </button>
        <button
          type="button"
          className="sslab-chip"
          onClick={() => {
            setHalfWidth(90);
            markInteracted();
          }}
        >
          ↔ Narrow the pair
        </button>
        <button
          type="button"
          className="sslab-chip"
          onClick={() => {
            setToeDeg(30);
            markInteracted();
          }}
        >
          ◤ Add toe-in
        </button>
        <button
          type="button"
          className="sslab-chip"
          onClick={() => {
            setMonoOn(true);
            markInteracted();
          }}
        >
          ◎ Switch to mono source
        </button>
      </div>

      <div className="sslab-layout">
        <div className="sslab-stage">
          <div className="sslab-room">
            <svg viewBox="0 0 800 460" ref={svgRef}>
              <defs>
                <pattern id="sslabGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1611" strokeWidth="1" />
                </pattern>
                <radialGradient id="sslabSweetGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={GREEN} stopOpacity="0.22" />
                  <stop offset="70%" stopColor={GREEN} stopOpacity="0.05" />
                  <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
                </radialGradient>
                <radialGradient id="sslabRingL" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={AMBER} stopOpacity="0.5" />
                  <stop offset="100%" stopColor={AMBER} stopOpacity="0" />
                </radialGradient>
                <radialGradient id="sslabRingR" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={GREEN} stopOpacity="0.5" />
                  <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
                </radialGradient>
              </defs>

              <rect x={ROOM.x} y={ROOM.y} width={ROOM.w} height={ROOM.h} rx="10" fill="url(#sslabGrid)" />
              <rect
                x={ROOM.x}
                y={ROOM.y}
                width={ROOM.w}
                height={ROOM.h}
                rx="10"
                fill="none"
                stroke="#241f18"
                strokeWidth="1.5"
              />

              {polarOn && (
                <>
                  <path d={buildConePath(lx, SPK_Y, 90 - toeDeg, 150, 260)} fill={AMBER} opacity="0.07" />
                  <path d={buildConePath(lx, SPK_Y, 90 - toeDeg, 55, 220)} fill={GREEN} opacity="0.12" />
                  <path d={buildConePath(rx, SPK_Y, 90 + toeDeg, 150, 260)} fill={AMBER} opacity="0.07" />
                  <path d={buildConePath(rx, SPK_Y, 90 + toeDeg, 55, 220)} fill={GREEN} opacity="0.12" />
                </>
              )}

              <ellipse cx={CENTER_X} cy={sweetCy} rx={spread} ry={spread * 1.35} fill="url(#sslabSweetGlow)" />

              {rings.map((ring) => (
                <circle
                  key={ring.id}
                  className="sslab-ring"
                  cx={ring.cx}
                  cy={ring.cy}
                  r="4"
                  fill={ring.side === "L" ? "url(#sslabRingL)" : "url(#sslabRingR)"}
                  onAnimationEnd={() => setRings((prev) => prev.filter((r) => r.id !== ring.id))}
                />
              ))}

              <line
                x1={lx}
                y1={SPK_Y}
                x2={listenerX}
                y2={listenerY}
                stroke={AMBER}
                strokeWidth="1"
                strokeDasharray="3,4"
                opacity="0.35"
              />
              <line
                x1={rx}
                y1={SPK_Y}
                x2={listenerX}
                y2={listenerY}
                stroke={GREEN}
                strokeWidth="1"
                strokeDasharray="3,4"
                opacity="0.35"
              />
              <line x1={lx} y1={SPK_Y} x2={rx} y2={SPK_Y} stroke="#55504a" strokeWidth="1" />

              <g
                transform={`translate(${lx},${SPK_Y}) rotate(${toeDeg})`}
                style={{ cursor: "grab" }}
                onMouseDown={startDrag("speakerL")}
                onTouchStart={startDrag("speakerL")}
              >
                <rect x="-16" y="-22" width="32" height="44" rx="4" fill="#18140f" stroke="#2a241c" strokeWidth="1.5" />
                <circle cx="0" cy="-8" r="7" fill="#0a0908" stroke={AMBER} strokeWidth="1" />
                <circle cx="0" cy="10" r="10" fill="#0a0908" stroke={AMBER} strokeWidth="1" />
              </g>
              <g
                transform={`translate(${rx},${SPK_Y}) rotate(${-toeDeg})`}
                style={{ cursor: "grab" }}
                onMouseDown={startDrag("speakerR")}
                onTouchStart={startDrag("speakerR")}
              >
                <rect x="-16" y="-22" width="32" height="44" rx="4" fill="#18140f" stroke="#2a241c" strokeWidth="1.5" />
                <circle cx="0" cy="-8" r="7" fill="#0a0908" stroke={GREEN} strokeWidth="1" />
                <circle cx="0" cy="10" r="10" fill="#0a0908" stroke={GREEN} strokeWidth="1" />
              </g>

              <g
                transform={`translate(${listenerX},${listenerY})`}
                style={{ cursor: "grab" }}
                onMouseDown={startDrag("listener")}
                onTouchStart={startDrag("listener")}
              >
                <circle cx="0" cy="0" r="16" fill="#141210" stroke="#ece7de" strokeWidth="1.5" opacity="0.9" />
                <circle cx="0" cy="0" r="4" fill="#ece7de" />
                <path d="M 0 -22 L -6 -14 L 6 -14 Z" fill="#ece7de" opacity="0.8" />
              </g>
            </svg>
          </div>

          <div className="sslab-readouts">
            <div className="sslab-readout-card">
              <div className="sslab-readout-label">IMAGE POSITION</div>
              <div className="sslab-meter-track">
                <div className="sslab-meter-marker" />
                <div
                  className="sslab-meter-fill"
                  style={{
                    left: `${Math.min(50, pct)}%`,
                    width: `${Math.abs(pct - 50)}%`,
                    background:
                      pos < 0 ? `linear-gradient(90deg, ${AMBER}, transparent)` : `linear-gradient(90deg, transparent, ${GREEN})`,
                  }}
                />
              </div>
              <div className="sslab-readout-value mono">{imageLabel}</div>
            </div>
            <div className="sslab-readout-card">
              <div className="sslab-readout-label">PHASE CORRELATION</div>
              <div className="sslab-meter-track">
                <div className="sslab-meter-fill" style={{ left: 0, width: `${corrPct}%` }} />
              </div>
              <div className={`sslab-readout-value mono ${corrGood ? "good" : "bad"}`}>
                {(corr >= 0 ? "+" : "") + corr.toFixed(2)}
              </div>
            </div>
            <div className="sslab-readout-card">
              <div className="sslab-readout-label">DISTANCE L / R</div>
              <div className="sslab-meter-track">
                <div className="sslab-meter-marker" />
                <div
                  className="sslab-meter-fill"
                  style={{ left: `${Math.min(50, dPct)}%`, width: `${Math.abs(dPct - 50)}%` }}
                />
              </div>
              <div className="sslab-readout-value mono">
                {mL}m / {mR}m
              </div>
            </div>
          </div>
        </div>

        <div className="sslab-sidebar">
          <div>
            <div className="sslab-section-title">GEOMETRY</div>
            <div className="sslab-control">
              <div className="sslab-control-label">
                <span>Speaker width</span>
                <span className="val">{widthMeters} m</span>
              </div>
              <input
                type="range"
                min="60"
                max="220"
                value={halfWidth}
                onChange={(e) => setHalfWidth(parseFloat(e.target.value))}
                onPointerUp={markInteracted}
              />
            </div>
            <div className="sslab-control">
              <div className="sslab-control-label">
                <span>Toe-in angle</span>
                <span className="val">{toeDeg}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="45"
                value={toeDeg}
                onChange={(e) => setToeDeg(parseFloat(e.target.value))}
                onPointerUp={markInteracted}
              />
            </div>
          </div>

          <div>
            <div className="sslab-section-title">SOURCE</div>
            <div className="sslab-toggle-row">
              <div className="sslab-toggle-text">
                <div className="t-title">Polar pattern overlay</div>
                <div className="t-sub">Show bass vs. treble radiation</div>
              </div>
              <div
                className={`sslab-switch${polarOn ? " on" : ""}`}
                role="switch"
                aria-checked={polarOn}
                tabIndex={0}
                onClick={() => {
                  setPolarOn((v) => !v);
                  markInteracted();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPolarOn((v) => !v);
                    markInteracted();
                  }
                }}
              />
            </div>
            <div className="sslab-toggle-row">
              <div className="sslab-toggle-text">
                <div className="t-title">Mono source</div>
                <div className="t-sub">Test phantom center formation</div>
              </div>
              <div
                className={`sslab-switch${monoOn ? " on" : ""}`}
                role="switch"
                aria-checked={monoOn}
                tabIndex={0}
                onClick={() => {
                  setMonoOn((v) => !v);
                  markInteracted();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setMonoOn((v) => !v);
                    markInteracted();
                  }
                }}
              />
            </div>
          </div>

          <div>
            <div className="sslab-section-title">AUDIO</div>
            <div className="sslab-toggle-row">
              <div className="sslab-toggle-text">
                <div className="t-title">{uploadedBuffer ? `My audio · ${uploadedName}` : "Upload your own track"}</div>
                <div className="t-sub">{decoding ? "Decoding…" : "Play it through the same panners"}</div>
              </div>
              <button type="button" className="sslab-mini-btn" disabled={decoding} onClick={handleUploadClick}>
                {uploadedBuffer ? "CHANGE" : "UPLOAD"}
              </button>
            </div>
            {uploadedBuffer && (
              <div className="sslab-toggle-row">
                <div className="sslab-toggle-text">
                  <div className="t-title">Play my upload</div>
                  <div className="t-sub">{audioSource === "uploaded" ? "On — playing your track" : "Off — playing demo tones"}</div>
                </div>
                <div
                  className={`sslab-switch${audioSource === "uploaded" ? " on" : ""}`}
                  role="switch"
                  aria-checked={audioSource === "uploaded"}
                  tabIndex={0}
                  onClick={() => {
                    setAudioSource((s) => (s === "uploaded" ? "demo" : "uploaded"));
                    markInteracted();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setAudioSource((s) => (s === "uploaded" ? "demo" : "uploaded"));
                      markInteracted();
                    }
                  }}
                />
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelected} style={{ display: "none" }} />
            {uploadError && <div className="sslab-upload-error">{uploadError}</div>}
          </div>

          <div>
            <div className="sslab-section-title">LEGEND</div>
            <div className="sslab-legend">
              <div className="sslab-legend-row">
                <div className="sslab-swatch" style={{ background: GREEN }} />
                Sweet spot zone
              </div>
              <div className="sslab-legend-row">
                <div className="sslab-swatch" style={{ background: AMBER, opacity: 0.4 }} />
                Bass radiation (wide)
              </div>
              <div className="sslab-legend-row">
                <div className="sslab-swatch" style={{ background: GREEN, opacity: 0.7 }} />
                Treble radiation (narrow)
              </div>
            </div>
          </div>

          <button type="button" className="sslab-reset-btn" onClick={resetAll}>
            RESET TO DEFAULT TRIANGLE
          </button>
        </div>
      </div>

      <div className="sslab-try-it">
        <div className="sslab-try-it-left">
          <div className="sslab-try-it-icon">♪</div>
          <div>
            <div className="sslab-try-it-title">Try it yourself</div>
            <div className="sslab-try-it-sub">
              Drag the listener off-center and listen to the phantom image collapse toward one speaker. Then
              narrow the pair and add toe-in to hear the image lock back into focus. Real spatial-audio panner
              nodes track everything above in real time — headphones required.
            </div>
          </div>
        </div>
        <div className="sslab-try-it-actions">
          <button
            type="button"
            className={`sslab-audio-btn${audioOn ? " playing" : ""}`}
            onClick={() => (audioOn ? stopAudio() : startAudio())}
          >
            {audioOn ? "■ STOP" : audioSource === "uploaded" && uploadedBuffer ? "▶ PLAY MY AUDIO" : "▶ PLAY DEMO TONES"}
          </button>
          <button type="button" className="sslab-link-btn" onClick={testLeftRight}>
            🎧 Test L/R
          </button>
        </div>
      </div>
    </div>
  );
}

export default SweetSpotLab;
