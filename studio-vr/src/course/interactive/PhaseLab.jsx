import { useEffect, useRef, useState } from "react";
import "./labs.css";
import { useLabAudio } from "./useLabAudio";
import { COLORS, hiDpiCanvas } from "./soundLabShared";

// Ported from design/what-is-sound-chapter.html's "05 PHASE" panel: two
// identical 300 Hz tones, started together, with Wave B routed through a
// DelayNode holding a fraction of one period equal to the chosen phase
// offset — summed acoustically in the room (not mixed in the graph) so the
// cancellation you hear near 180° is the real thing, not a simulation.
//
// The mockup itself set this offset once, at start time (oscB.start(now +
// delay)), which can't be changed on a running oscillator — so dragging the
// slider while a tone was playing had to stop it. Using a DelayNode instead
// keeps the same acoustic result but as a live, automatable parameter:
// delayTime can be ramped in real time (see the effect below), so the tone
// keeps playing continuously while you sweep the slider through the
// reinforcing → cancelling transition — which is arguably the more useful
// version of this demo to actually hear.
//
// The three-row canvas (Wave A / Wave B / Sum) is specific to this lab so
// it's drawn locally rather than through soundLabShared's generic
// single-trace drawScope.

const TONE_FREQ = 300;

function delayForDeg(deg) {
  return (deg / 360) * (1 / TONE_FREQ);
}

function relationshipLabel(deg) {
  const d = Math.min(deg, 360 - deg);
  if (d < 20) return "Reinforcing";
  if (d > 160) return "Cancelling";
  return "Partial cancellation";
}

function drawPhase(canvas, deg, scroll) {
  const hd = hiDpiCanvas(canvas);
  if (!hd) return;
  const { ctx: c, w, h } = hd;
  c.clearRect(0, 0, w, h);
  const rowH = h / 3;

  function sineRow(offsetY, phaseDeg, color) {
    c.beginPath();
    c.strokeStyle = color;
    c.lineWidth = 1.5;
    for (let x = 0; x <= w; x++) {
      const t = (x / w) * 4 * Math.PI * 2 + (phaseDeg * Math.PI) / 180 + scroll;
      const y = offsetY - Math.sin(t) * (rowH * 0.36);
      if (x === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }
  sineRow(rowH * 0.5, 0, COLORS.amber);
  sineRow(rowH * 1.5, deg, COLORS.green);

  c.beginPath();
  c.strokeStyle = COLORS.blue;
  c.lineWidth = 2;
  for (let x = 0; x <= w; x++) {
    const t = (x / w) * 4 * Math.PI * 2 + scroll;
    const y1 = Math.sin(t);
    const y2 = Math.sin(t + (deg * Math.PI) / 180);
    const y = rowH * 2.5 - ((y1 + y2) / 2) * (rowH * 0.36);
    if (x === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.stroke();

  c.fillStyle = COLORS.label;
  c.font = "bold 11px monospace";
  c.fillText("WAVE A", 8, rowH * 0.5 - rowH * 0.42);
  c.fillText("WAVE B", 8, rowH * 1.5 - rowH * 0.42);
  c.fillText("SUM", 8, rowH * 2.5 - rowH * 0.42);
}

function PhaseLab({ onInteract }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const scrollRef = useRef(0);
  const delayRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  const { getCtx, track, stopAll } = useLabAudio();

  const [deg, setDeg] = useState(0);
  const [playing, setPlaying] = useState(false);
  const degRef = useRef(deg);
  degRef.current = deg;

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  useEffect(() => {
    if (!playing) drawPhase(canvasRef.current, deg, 0);
  }, [deg, playing]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // Live-ramp the running delay (and therefore the acoustic phase
  // relationship) as the slider moves, instead of stopping playback.
  useEffect(() => {
    if (playing && delayRef.current) {
      delayRef.current.delayTime.setTargetAtTime(delayForDeg(deg), getCtx().currentTime, 0.01);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deg, playing]);

  function loop() {
    scrollRef.current += 0.12;
    drawPhase(canvasRef.current, degRef.current, scrollRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }

  function stop() {
    stopAll();
    cancelAnimationFrame(rafRef.current);
    delayRef.current = null;
    setPlaying(false);
    drawPhase(canvasRef.current, degRef.current, 0);
  }

  function play() {
    const ctx = getCtx();
    const merge = track(ctx.createGain());
    merge.gain.value = 0.12;
    const oscA = track(ctx.createOscillator());
    const oscB = track(ctx.createOscillator());
    oscA.type = "sine";
    oscB.type = "sine";
    oscA.frequency.value = TONE_FREQ;
    oscB.frequency.value = TONE_FREQ;
    const delay = track(ctx.createDelay(1));
    delay.delayTime.value = delayForDeg(degRef.current);
    oscA.connect(merge);
    oscB.connect(delay).connect(merge);
    merge.connect(ctx.destination);
    const now = ctx.currentTime;
    oscA.start(now);
    oscB.start(now);
    delayRef.current = delay;
    setPlaying(true);
    loop();
  }

  function togglePlay() {
    markInteracted();
    if (playing) stop();
    else play();
  }

  function onSlide(e) {
    setDeg(+e.target.value);
    markInteracted();
  }

  const rel = relationshipLabel(deg);
  const relClass = rel === "Reinforcing" ? "accent" : rel === "Cancelling" ? "danger" : "";

  return (
    <div className="lab">
      <p className="lab-intro">
        Two identical 300 Hz tones, one shifted by the phase offset below. In phase, they reinforce;
        180° apart, one's peaks line up with the other's troughs and they cancel — drag the slider
        while it's playing and listen for the combined tone thinning out near 180°.
      </p>

      <div className="sound-lab-panel-head">
        <span className={`sound-lab-live-dot${playing ? " on" : ""}`} /> Wave A + Wave B → Sum
      </div>

      <div className="sound-lab-frame">
        <canvas ref={canvasRef} className="sound-lab-canvas" width={560} height={200} style={{ aspectRatio: "560 / 200" }} />
      </div>

      <div className="sound-lab-readout-row">
        <div className="sound-lab-readout">
          <div className="rl">Phase Offset</div>
          <div className="rv accent">{deg}°</div>
        </div>
        <div className="sound-lab-readout">
          <div className="rl">Relationship</div>
          <div className={`rv ${relClass}`}>{rel}</div>
        </div>
      </div>

      <div className="sound-lab-slider-row">
        <div className="sound-lab-slider-labels">
          <span>0° in phase</span>
          <span>360°</span>
        </div>
        <input type="range" className="lab-slider" min="0" max="360" value={deg} onChange={onSlide} />
      </div>

      <div className="lab-actions">
        <button type="button" className={`lab-play-btn${playing ? " playing" : ""}`} onClick={togglePlay}>
          {playing ? "⏹ Stop" : "▶ Play Both Tones"}
        </button>
      </div>
      <p className="lab-hint">
        Listen near 180° — the combined tone should noticeably thin out or near-vanish as the two
        waves cancel.
      </p>
    </div>
  );
}

export default PhaseLab;
