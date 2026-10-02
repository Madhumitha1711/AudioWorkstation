import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import { useLabAudio } from "../../shared/useLabAudio";
import { useTheme } from "../../../../../theme/ThemeContext";
import { hiDpiCanvas, scopePalette } from "../../shared/soundLabShared";
import { canvasFont } from "../../../../../theme/fonts";
import { useInteractOnce } from "../../shared/useInteractOnce";

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

const CYCLES = 8;

function drawPhase(canvas, deg, scroll, theme = "dark") {
  const hd = hiDpiCanvas(canvas);
  if (!hd) return;
  const { ctx: c, w, h } = hd;
  const colors = scopePalette(theme).colors;
  c.clearRect(0, 0, w, h);

  const topH = h * 0.5;
  const sumH = h - topH;
  const aMid = topH * 0.2;
  const plusMid = topH * 0.5;
  const bMid = topH * 0.8;
  const sumMid = topH + sumH / 2;
  const phaseRad = (deg * Math.PI) / 180;
  const tAt = (x) => (x / w) * CYCLES * Math.PI * 2 + scroll;

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

  c.strokeStyle = colors.label;
  c.globalAlpha = 0.25;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, topH);
  c.lineTo(w, topH);
  c.stroke();
  c.globalAlpha = 1;

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
  const markInteracted = useInteractOnce(onInteract);
  const { getCtx, track, stopAll } = useLabAudio();
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  const [deg, setDeg] = useState(0);
  const [playing, setPlaying] = useState(false);
  const degRef = useRef(deg);
  degRef.current = deg;

  useEffect(() => {
    if (!playing) drawPhase(canvasRef.current, deg, 0, theme);
  }, [deg, playing, theme]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

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
