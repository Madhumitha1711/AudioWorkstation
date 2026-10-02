import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import { useLabAudio } from "../../shared/useLabAudio";
import { useTheme } from "../../../../../theme/ThemeContext";
import { hiDpiCanvas, scopePalette } from "../../shared/soundLabShared";
import { canvasFont } from "../../../../../theme/fonts";
import { useInteractOnce } from "../../shared/useInteractOnce";

const FUNDAMENTAL = 110;
const MAX_HARMONICS = 8;
const BAR_COUNT = MAX_HARMONICS + 1;

function drawSpectrum(canvas, levels, harmCount, theme = "dark") {
  const hd = hiDpiCanvas(canvas);
  if (!hd) return;
  const { ctx: c, w, h } = hd;
  const pal = scopePalette(theme);
  c.clearRect(0, 0, w, h);
  c.fillStyle = pal.bg;
  c.fillRect(0, 0, w, h);
  const gap = 8;
  const bw = (w - gap * (BAR_COUNT + 1)) / BAR_COUNT;
  for (let i = 0; i < BAR_COUNT; i++) {
    const lvl = levels[i] || 0;
    const bh = lvl * (h - 30);
    const x = gap + i * (bw + gap);
    c.fillStyle = i === 0 ? pal.colors.amber : i <= harmCount ? pal.colors.green : pal.grid;
    c.fillRect(x, h - 24 - bh, bw, bh);
    c.fillStyle = pal.colors.label;
    c.font = canvasFont(11, { weight: 700, mono: true });
    c.textAlign = "center";
    c.fillText(i === 0 ? "f" : `${i + 1}f`, x + bw / 2, h - 8);
  }
}

function HarmonicsLab({ onInteract }) {
  const canvasRef = useRef(null);
  const knobRef = useRef(null);
  const rafRef = useRef(null);
  const oscsRef = useRef([]);
  const analyserRef = useRef(null);
  const dragRef = useRef(null);
  const markInteracted = useInteractOnce(onInteract);
  const { getCtx, track, stopAll } = useLabAudio();
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  const [harmCount, setHarmCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const harmCountRef = useRef(harmCount);
  harmCountRef.current = harmCount;

  useEffect(() => {
    if (playing) return;
    const levels = Array.from({ length: BAR_COUNT }, (_, i) => (i <= harmCount ? 1 / (i + 1) : 0));
    drawSpectrum(canvasRef.current, levels, harmCount, theme);
  }, [harmCount, playing, theme]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  useEffect(() => {
    if (!playing) return;
    const ctx = getCtx();
    oscsRef.current.forEach((gainNode, i) => {
      const target = i <= harmCount ? (1 / (i + 1)) * 0.22 : 0;
      gainNode.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harmCount, playing]);

  function meterLoop() {
    const analyser = analyserRef.current;
    const ctx = getCtx();
    if (analyser) {
      const data = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(data);
      const binFor = (harmonicIndex) =>
        Math.round(((FUNDAMENTAL * (harmonicIndex + 1)) / (ctx.sampleRate / 2)) * data.length);
      const fundamentalDb = data[binFor(0)];
      const levels = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        if (i > harmCountRef.current) {
          levels.push(0);
          continue;
        }
        const db = data[binFor(i)];
        const ratio =
          Number.isFinite(db) && Number.isFinite(fundamentalDb) ? Math.pow(10, (db - fundamentalDb) / 20) : 0;
        levels.push(Math.max(0, Math.min(1, ratio)));
      }
      drawSpectrum(canvasRef.current, levels, harmCountRef.current, themeRef.current);
    }
    rafRef.current = requestAnimationFrame(meterLoop);
  }

  function togglePlay() {
    markInteracted();
    if (playing) {
      stopAll();
      cancelAnimationFrame(rafRef.current);
      oscsRef.current = [];
      analyserRef.current = null;
      setPlaying(false);
      const levels = Array.from({ length: BAR_COUNT }, (_, i) => (i <= harmCountRef.current ? 1 / (i + 1) : 0));
      drawSpectrum(canvasRef.current, levels, harmCountRef.current, theme);
      return;
    }
    const ctx = getCtx();
    const master = track(ctx.createGain());
    master.gain.value = 1;
    const envelope = track(ctx.createGain());
    const now = ctx.currentTime;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(1, now + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.45, now + 0.6);
    envelope.gain.exponentialRampToValueAtTime(0.18, now + 4.5);
    const analyser = track(ctx.createAnalyser());
    analyser.fftSize = 2048;
    master.connect(envelope);
    envelope.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;

    const gains = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      const osc = track(ctx.createOscillator());
      const g = track(ctx.createGain());
      osc.type = "sine";
      osc.frequency.value = FUNDAMENTAL * (i + 1);
      g.gain.value = i <= harmCountRef.current ? (1 / (i + 1)) * 0.22 : 0;
      osc.connect(g).connect(master);
      osc.start();
      gains.push(g);
    }
    oscsRef.current = gains;
    setPlaying(true);
    meterLoop();
  }

  function clampCount(n) {
    return Math.max(0, Math.min(MAX_HARMONICS, n));
  }

  function onKnobPointerDown(e) {
    dragRef.current = { startY: e.clientY, startVal: harmCount };
    knobRef.current?.setPointerCapture(e.pointerId);
    markInteracted();
  }
  function onKnobPointerMove(e) {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    setHarmCount(clampCount(Math.round(dragRef.current.startVal + dy / 12)));
  }
  function onKnobPointerUp() {
    dragRef.current = null;
  }
  function onKnobWheel(e) {
    e.preventDefault();
    markInteracted();
    setHarmCount((n) => clampCount(n + (e.deltaY < 0 ? 1 : -1)));
  }

  const angle = -135 + (harmCount / MAX_HARMONICS) * 270;
  const freqsLabel =
    harmCount === 0
      ? `Fundamental only — ${FUNDAMENTAL} Hz`
      : `${FUNDAMENTAL} Hz + ${harmCount} harmonic${harmCount > 1 ? "s" : ""} (${Array.from(
          { length: harmCount + 1 },
          (_, i) => FUNDAMENTAL * (i + 1),
        ).join(", ")} Hz)`;

  return (
    <div className="lab">
      <div className="sound-lab-panel-head">
        <span className={`sound-lab-live-dot${playing ? " on" : ""}`} /> Fundamental + Spectrum
      </div>

      <div className="sound-lab-frame">
        <canvas ref={canvasRef} className="sound-lab-canvas" width={560} height={170} style={{ aspectRatio: "560 / 170" }} />
      </div>

      <div className="sound-lab-knob-wrap">
        <div
          ref={knobRef}
          className="sound-lab-knob"
          role="slider"
          tabIndex={0}
          aria-label="Harmonics added"
          aria-valuemin={0}
          aria-valuemax={MAX_HARMONICS}
          aria-valuenow={harmCount}
          onPointerDown={onKnobPointerDown}
          onPointerMove={onKnobPointerMove}
          onPointerUp={onKnobPointerUp}
          onWheel={onKnobWheel}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowRight") {
              markInteracted();
              setHarmCount((n) => clampCount(n + 1));
            } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
              markInteracted();
              setHarmCount((n) => clampCount(n - 1));
            }
          }}
        >
          <div className="sound-lab-knob-indicator" style={{ transform: `translateX(-50%) rotate(${angle}deg)` }} />
          <div className="sound-lab-knob-center" />
        </div>
        <div className="sound-lab-knob-meta">
          <div className="l">Harmonics Added</div>
          <div className="v">{harmCount}</div>
          <div className="sub">{freqsLabel}</div>
        </div>
        <button
          type="button"
          className={`lab-play-btn sound-lab-knob-play${playing ? " playing" : ""}`}
          onClick={togglePlay}
        >
          {playing ? "⏹ Stop" : "▶ Play"}
        </button>
      </div>
    </div>
  );
}

export default HarmonicsLab;
