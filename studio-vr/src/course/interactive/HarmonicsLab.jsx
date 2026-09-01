import { useEffect, useRef, useState } from "react";
import "./labs.css";
import { useLabAudio } from "./useLabAudio";
import { COLORS, SCOPE_GRID, SCOPE_BG, hiDpiCanvas } from "./soundLabShared";

// Ported from design/what-is-sound-chapter.html's "06 HARMONICS" panel: a
// draggable knob (pointer events, matching the mockup's harmKnob handler)
// adds whole-number-multiple partials on top of a 110 Hz fundamental, each
// a real oscillator at diminishing gain (1/n). While playing, the spectrum
// bars read an actual AnalyserNode (getByteFrequencyData) rather than just
// mirroring the target gains, so what's on screen is what's really in the
// signal.
//
// The mockup itself just switched each partial's gain on/off at a flat
// level, which sustains like an organ drawbar, not a struck string. Since
// this chapter's own Timbre lesson (TimbreLab.jsx) makes the point that
// envelope — not just harmonic content — is a huge part of what makes an
// instrument sound like itself, Play here runs the whole additive stack
// through one shared percussive envelope (fast attack, quick initial
// decay, slow ring-out) instead of a flat sustain — closer to a piano/
// plucked-string character. It's still additive sines, not a physical
// string model, so treat "piano-like" as "shaped like a struck note," the
// same simplified-approximation spirit as TimbreLab's four voices.

const FUNDAMENTAL = 110;
const MAX_HARMONICS = 8;
const BAR_COUNT = MAX_HARMONICS + 1;

function drawSpectrum(canvas, levels, harmCount) {
  const hd = hiDpiCanvas(canvas);
  if (!hd) return;
  const { ctx: c, w, h } = hd;
  c.clearRect(0, 0, w, h);
  c.fillStyle = SCOPE_BG;
  c.fillRect(0, 0, w, h);
  const gap = 8;
  const bw = (w - gap * (BAR_COUNT + 1)) / BAR_COUNT;
  for (let i = 0; i < BAR_COUNT; i++) {
    const lvl = levels[i] || 0;
    const bh = lvl * (h - 30);
    const x = gap + i * (bw + gap);
    c.fillStyle = i === 0 ? COLORS.amber : i <= harmCount ? COLORS.green : SCOPE_GRID;
    c.fillRect(x, h - 24 - bh, bw, bh);
    c.fillStyle = COLORS.label;
    c.font = "bold 11px monospace";
    c.textAlign = "center";
    c.fillText(i === 0 ? "f" : `${i + 1}f`, x + bw / 2, h - 8);
  }
}

function HarmonicsLab({ onInteract }) {
  const canvasRef = useRef(null);
  const knobRef = useRef(null);
  const rafRef = useRef(null);
  const oscsRef = useRef([]); // gain nodes, one per partial
  const analyserRef = useRef(null);
  const dragRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  const { getCtx, track, stopAll } = useLabAudio();

  const [harmCount, setHarmCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const harmCountRef = useRef(harmCount);
  harmCountRef.current = harmCount;

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  // static preview bars (target gains, not measured) whenever idle
  useEffect(() => {
    if (playing) return;
    const levels = Array.from({ length: BAR_COUNT }, (_, i) => (i <= harmCount ? 1 / (i + 1) : 0));
    drawSpectrum(canvasRef.current, levels, harmCount);
  }, [harmCount, playing]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // live-adjust running oscillator gains as the knob moves
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
      // getByteFrequencyData quantizes into the analyser's fixed
      // minDecibels..maxDecibels window (default -100..-30 dBFS) and clamps
      // anything louder than maxDecibels to 255 — at this lab's gain
      // staging, every active harmonic's bin was landing above that
      // ceiling, so they all read as "maxed out" regardless of their real
      // relative level (the bug: bars all the same height while playing,
      // even though the idle preview correctly tapers them). getFloat-
      // FrequencyData returns the actual measured dB with no such clamp,
      // so each harmonic's level can be expressed as a true ratio to the
      // fundamental's own measured dB — recovering the same ~1/(i+1)
      // taper the idle preview shows, independent of how loud the overall
      // (decaying) envelope happens to be at that instant.
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
      drawSpectrum(canvasRef.current, levels, harmCountRef.current);
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
      drawSpectrum(canvasRef.current, levels, harmCountRef.current);
      return;
    }
    const ctx = getCtx();
    const master = track(ctx.createGain());
    master.gain.value = 1;
    // Shared percussive envelope for the whole stack — see the file-top
    // comment. exponentialRampToValueAtTime needs a strictly-positive
    // starting value, hence the tiny setValueAtTime floor rather than 0.
    const envelope = track(ctx.createGain());
    const now = ctx.currentTime;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.linearRampToValueAtTime(1, now + 0.006); // strike
    envelope.gain.exponentialRampToValueAtTime(0.45, now + 0.6); // initial decay
    envelope.gain.exponentialRampToValueAtTime(0.18, now + 4.5); // slow ring-out, held while playing
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
      <p className="lab-intro">
        A real instrument almost never produces one pure frequency — it stacks whole-number
        multiples of the fundamental on top of it. Drag the knob to add harmonics one at a time and
        hear (and see) the tone get brighter and more complex.
      </p>

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
      </div>

      <div className="lab-actions">
        <button type="button" className={`lab-play-btn${playing ? " playing" : ""}`} onClick={togglePlay}>
          {playing ? "⏹ Stop" : "▶ Play"}
        </button>
      </div>
      <p className="lab-hint">
        Drag the knob up/down (or scroll over it). Each step adds the next harmonic at a diminishing
        level — spectrum bars light up as they're added. Play triggers a struck, piano-like
        attack/decay rather than a flat organ-style sustain.
      </p>
    </div>
  );
}

export default HarmonicsLab;
