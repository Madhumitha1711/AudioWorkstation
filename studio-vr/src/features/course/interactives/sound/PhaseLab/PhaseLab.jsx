import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import { useLabAudio } from "../../shared/useLabAudio";
import { useTheme } from "../../../../../theme/ThemeContext";
import { hiDpiCanvas, scopePalette } from "../../shared/soundLabShared";
import { canvasFont } from "../../../../../theme/fonts";

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
// The two-section canvas (Wave A "+" Wave B stacked on top, Sum below)
// is specific to this lab so it's drawn locally rather than through
// soundLabShared's generic single-trace drawScope.

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

// Cycles shown across the canvas width - higher = shorter drawn wavelength.
const CYCLES = 8;

function drawPhase(canvas, deg, scroll, theme = "dark") {
  const hd = hiDpiCanvas(canvas);
  if (!hd) return;
  const { ctx: c, w, h } = hd;
  const colors = scopePalette(theme).colors;
  c.clearRect(0, 0, w, h);

  // Section 1 (top half): Wave A on top, a "+" in the gap, Wave B below it.
  // Section 2 (bottom half): their sum, with the tallest trace so it reads large.
  const topH = h * 0.5;
  const sumH = h - topH;
  const aMid = topH * 0.2;
  const plusMid = topH * 0.5;
  const bMid = topH * 0.8;
  const sumMid = topH + sumH / 2;
  const phaseRad = (deg * Math.PI) / 180;
  const tAt = (x) => (x / w) * CYCLES * Math.PI * 2 + scroll;

  // Draws one sine trace across the horizontal span [x0, x1], all sharing
  // tAt()'s wavelength and time base.
  function trace(color, width, x0, x1, yFor) {
    c.beginPath();
    c.strokeStyle = color;
    c.lineWidth = width;
    for (let x = x0; x <= x1; x++) {
      const y = yFor(tAt(x));
      if (x === x0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.stroke();
  }

  // Divider between the two sections.
  c.strokeStyle = colors.label;
  c.globalAlpha = 0.25;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, topH);
  c.lineTo(w, topH);
  c.stroke();
  c.globalAlpha = 1;

  // Section 1: Wave A and Wave B as separate full-width rows, stacked
  // vertically with a "+" between them - read top-to-bottom as "A + B",
  // with the Sum section below as the result. Both share tAt()'s time base
  // so their relative phase lines up column-for-column with the Sum.
  const AMP = topH * 0.15;
  trace(colors.amber, 1.5, 0, w, (t) => aMid - Math.sin(t) * AMP);
  trace(colors.green, 1.5, 0, w, (t) => bMid - Math.sin(t + phaseRad) * AMP);

  c.fillStyle = colors.label;
  c.font = canvasFont(22, { weight: 700, mono: true });
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("+", w / 2, plusMid);
  c.textAlign = "start";
  c.textBaseline = "alphabetic";

  // Section 2: the true (unnormalized) sum, ranging ±2 - scaled so the fully
  // reinforced peak fills most of this section (with some headroom), and flattens toward the
  // centerline as the tones cancel near 180°.
  const SUM_UNIT = sumH * 0.18;
  trace(colors.blue, 2.5, 0, w, (t) => sumMid - (Math.sin(t) + Math.sin(t + phaseRad)) * SUM_UNIT);

  c.font = canvasFont(11, { weight: 700, mono: true });
  c.fillStyle = colors.amber;
  c.fillText("WAVE A", 8, 12);
  c.fillStyle = colors.green;
  c.fillText("WAVE B", 8, topH * 0.62);
  c.fillStyle = colors.label;
  c.fillText("SUM", 8, topH + 14);
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
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

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
    if (!playing) drawPhase(canvasRef.current, deg, 0, theme);
  }, [deg, playing, theme]);

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
    drawPhase(canvasRef.current, degRef.current, scrollRef.current, themeRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }

  function stop() {
    stopAll();
    cancelAnimationFrame(rafRef.current);
    delayRef.current = null;
    setPlaying(false);
    drawPhase(canvasRef.current, degRef.current, 0, theme);
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
      <div className="sound-lab-panel-head">
        <span className={`sound-lab-live-dot${playing ? " on" : ""}`} /> Wave A + Wave B → Sum
      </div>

      <div className="sound-lab-frame">
        <canvas ref={canvasRef} className="sound-lab-canvas" width={560} height={340} style={{ aspectRatio: "560 / 340" }} />
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
    </div>
  );
}

export default PhaseLab;
