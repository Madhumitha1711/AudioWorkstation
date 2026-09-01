import { useEffect, useRef, useState } from "react";
import "./labs.css";
import { useLabAudio } from "./useLabAudio";
import { COLORS, drawScope, freqToSlider, midiToNote, sliderToFreq, visualCyclesFor } from "./soundLabShared";

// Ported from design/what-is-sound-chapter.html's "02 FREQUENCY" panel — a
// real sine-wave oscillator swept by a log-scale slider (20 Hz–20,000 Hz,
// matching human hearing range) plus a one-shot 6-second sweep across the
// whole range. The mockup's freqPlay/freqSweep buttons are one control here
// (`mode` state) so the two never fight over the same oscillator.

const SWEEP_DURATION_SEC = 6;
const IDLE_LABEL = "▶ Play Tone";

function FrequencyLab({ onInteract }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const scrollRef = useRef(0);
  const oscRef = useRef(null);
  const sweepStartRef = useRef(0);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  const { getCtx, track, stopAll } = useLabAudio();

  const [sliderVal, setSliderVal] = useState(567);
  const [mode, setMode] = useState("idle"); // idle | tone | sweep
  const sliderRef = useRef(sliderVal);
  sliderRef.current = sliderVal;

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  const freq = sliderToFreq(sliderVal);

  const stop = () => {
    stopAll();
    cancelAnimationFrame(rafRef.current);
    oscRef.current = null;
    setMode("idle");
    drawScope(canvasRef.current, { cycles: 5, amp: 0.7, color: COLORS.amber });
  };

  // static trace whenever the slider moves while idle
  useEffect(() => {
    if (mode === "idle") drawScope(canvasRef.current, { cycles: 5, amp: 0.7, color: COLORS.amber });
  }, [sliderVal, mode]);

  // retune the live oscillator as the slider moves during a held tone
  useEffect(() => {
    if (mode === "tone" && oscRef.current) {
      oscRef.current.frequency.setTargetAtTime(freq, getCtx().currentTime, 0.02);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq, mode]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function toneLoop() {
    const f = sliderToFreq(sliderRef.current);
    scrollRef.current += 0.15 + Math.min(f, 2000) / 4000;
    drawScope(canvasRef.current, { cycles: visualCyclesFor(f), amp: 0.7, color: COLORS.amber, scroll: scrollRef.current });
    rafRef.current = requestAnimationFrame(toneLoop);
  }

  function playTone() {
    markInteracted();
    if (mode !== "idle") {
      stop();
      return;
    }
    const ctx = getCtx();
    const osc = track(ctx.createOscillator());
    const gain = track(ctx.createGain());
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.12;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    oscRef.current = osc;
    setMode("tone");
    toneLoop();
  }

  function playSweep() {
    markInteracted();
    if (mode !== "idle") {
      stop();
      return;
    }
    const ctx = getCtx();
    const osc = track(ctx.createOscillator());
    const gain = track(ctx.createGain());
    osc.type = "sine";
    osc.frequency.setValueAtTime(20, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(20000, ctx.currentTime + SWEEP_DURATION_SEC);
    gain.gain.value = 0.12;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + SWEEP_DURATION_SEC);
    setMode("sweep");
    sweepStartRef.current = performance.now();

    function tick() {
      const elapsed = (performance.now() - sweepStartRef.current) / 1000;
      if (elapsed >= SWEEP_DURATION_SEC) {
        stop();
        return;
      }
      const f = 20 * Math.pow(1000, elapsed / SWEEP_DURATION_SEC);
      setSliderVal(freqToSlider(f));
      scrollRef.current += 0.15 + Math.min(f, 2000) / 4000;
      drawScope(canvasRef.current, { cycles: visualCyclesFor(f), amp: 0.7, color: COLORS.amber, scroll: scrollRef.current });
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }

  const note = midiToNote(freq);

  return (
    <div className="lab">
      <p className="lab-intro">
        Drag the slider to hear the same waveform repeat faster or slower — that repetition rate is
        frequency. Human hearing spans roughly 20 Hz to 20,000 Hz.
      </p>

      <div className="sound-lab-panel-head">
        <span className={`sound-lab-live-dot${mode !== "idle" ? " on" : ""}`} /> Tone Generator
      </div>

      <div className="sound-lab-frame">
        <canvas ref={canvasRef} className="sound-lab-canvas" width={560} height={160} style={{ aspectRatio: "560 / 160" }} />
      </div>

      <div className="sound-lab-readout-row">
        <div className="sound-lab-readout">
          <div className="rl">Frequency</div>
          <div className="rv accent">{freq.toLocaleString()} Hz</div>
        </div>
        <div className="sound-lab-readout">
          <div className="rl">Nearest Note</div>
          <div className="rv">{note}</div>
        </div>
      </div>

      <div className="sound-lab-slider-row">
        <div className="sound-lab-slider-labels">
          <span>20 Hz</span>
          <span>20,000 Hz</span>
        </div>
        <input
          type="range"
          className="lab-slider"
          min="0"
          max="1000"
          value={sliderVal}
          disabled={mode === "sweep"}
          onChange={(e) => {
            setSliderVal(+e.target.value);
            markInteracted();
          }}
        />
      </div>

      <div className="lab-actions">
        <button type="button" className={`lab-play-btn${mode === "tone" ? " playing" : ""}`} onClick={playTone} disabled={mode === "sweep"}>
          {mode === "tone" ? "⏹ Stop" : IDLE_LABEL}
        </button>
        <button type="button" className={`lab-play-btn ghost${mode === "sweep" ? " playing" : ""}`} onClick={playSweep} disabled={mode === "tone"}>
          {mode === "sweep" ? "⏹ Stop" : "↝ Sweep 20 Hz → 20 kHz"}
        </button>
      </div>
      <p className="lab-hint">
        Scope trace is visually rate-limited for legibility — real oscillation is far faster than a
        screen can usefully draw above a few hundred Hz.
      </p>
    </div>
  );
}

export default FrequencyLab;
