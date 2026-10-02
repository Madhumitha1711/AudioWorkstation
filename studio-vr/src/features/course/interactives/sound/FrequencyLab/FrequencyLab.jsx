import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import { useLabAudio } from "../../shared/useLabAudio";
import { useTheme } from "../../../../../theme/ThemeContext";
import {
  drawTimeScope,
  exactNoteForFreq,
  formatDuration,
  freqToSliderPrecise,
  noteNameToFreq,
  scopePalette,
  sliderToFreqPrecise,
  timebaseFor,
} from "../../shared/soundLabShared";
import { useInteractOnce } from "../../shared/useInteractOnce";

const SWEEP_DURATION_SEC = 6;
const IDLE_LABEL = "▶ Play Tone";
const MIN_FREQ = 20;
const MAX_FREQ = 20000;

const SLIDER_TICKS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const tickLabel = (f) => (f >= 1000 ? `${f / 1000}k` : `${f}`);

const clampFreq = (f) => Math.min(MAX_FREQ, Math.max(MIN_FREQ, f));
const round2 = (f) => Math.round(f * 100) / 100;

function FrequencyLab({ onInteract }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const scrollRef = useRef(0);
  const oscRef = useRef(null);
  const sweepStartRef = useRef(0);
  const markInteracted = useInteractOnce(onInteract);
  const { getCtx, track, stopAll } = useLabAudio();
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  const colors = scopePalette(theme).colors;

  const [freq, setFreq] = useState(() => sliderToFreqPrecise(567));
  const [mode, setMode] = useState("idle");
  const freqRef = useRef(freq);
  freqRef.current = freq;

  const [editingFreq, setEditingFreq] = useState(false);
  const [freqDraft, setFreqDraft] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const stop = () => {
    stopAll();
    cancelAnimationFrame(rafRef.current);
    oscRef.current = null;
    setMode("idle");
    scrollRef.current = 0;
    drawFrame(freqRef.current, themeRef.current);
  };

  function drawFrame(f, t) {
    drawTimeScope(canvasRef.current, {
      freq: f,
      windowSec: timebaseFor(f),
      color: scopePalette(t).colors.amber,
      scroll: scrollRef.current,
      theme: t,
    });
  }

  useEffect(() => {
    if (mode === "idle") drawFrame(freq, theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq, mode, theme]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => drawFrame(freqRef.current, themeRef.current));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (mode === "tone" && oscRef.current) {
      oscRef.current.frequency.setTargetAtTime(freq, getCtx().currentTime, 0.02);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq, mode]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function toneLoop() {
    const f = freqRef.current;
    scrollRef.current += 0.15 + Math.min(f, 2000) / 4000;
    drawFrame(f, themeRef.current);
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
    osc.frequency.setValueAtTime(MIN_FREQ, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(MAX_FREQ, ctx.currentTime + SWEEP_DURATION_SEC);
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
      const f = MIN_FREQ * Math.pow(1000, elapsed / SWEEP_DURATION_SEC);
      setFreq(round2(f));
      scrollRef.current += 0.15 + Math.min(f, 2000) / 4000;
      drawFrame(f, themeRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }

  const note = exactNoteForFreq(freq);
  const editingDisabled = mode === "sweep";

  const startEditFreq = () => {
    if (editingDisabled) return;
    setFreqDraft(freq.toFixed(2));
    setEditingFreq(true);
  };
  const commitFreqDraft = (text) => {
    const n = parseFloat(text);
    if (Number.isFinite(n)) setFreq(round2(clampFreq(n)));
    setEditingFreq(false);
    markInteracted();
  };
  const cancelFreqDraft = () => setEditingFreq(false);

  const startEditNote = () => {
    if (editingDisabled) return;
    setNoteDraft(note ?? "");
    setEditingNote(true);
  };
  const commitNoteDraft = (text) => {
    const f = noteNameToFreq(text);
    if (f != null) setFreq(clampFreq(f));
    setEditingNote(false);
    markInteracted();
  };
  const cancelNoteDraft = () => setEditingNote(false);

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
        <canvas ref={canvasRef} className="sound-lab-canvas" width={560} height={190} style={{ aspectRatio: "560 / 190" }} />
      </div>

      <div className="sound-lab-readout-row">
        <div className="sound-lab-readout">
          <div className="rl">Frequency</div>
          {editingFreq ? (
            <input
              type="number"
              className="sound-lab-readout-input"
              autoFocus
              min={MIN_FREQ}
              max={MAX_FREQ}
              step="0.01"
              defaultValue={freqDraft}
              onBlur={(e) => commitFreqDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.target.blur();
                else if (e.key === "Escape") cancelFreqDraft();
              }}
            />
          ) : (
            <div className="rv accent sound-lab-readout-editable">
              <span>{freq.toFixed(2)} Hz</span>
              <button
                type="button"
                className="sound-lab-edit-btn"
                onClick={startEditFreq}
                disabled={editingDisabled}
                aria-label="Enter an exact frequency"
                title="Enter an exact frequency"
              >
                ✎
              </button>
            </div>
          )}
        </div>
        <div className="sound-lab-readout">
          <div className="rl">Note</div>
          {editingNote ? (
            <input
              type="text"
              className="sound-lab-readout-input"
              autoFocus
              placeholder="A4"
              defaultValue={noteDraft}
              onBlur={(e) => commitNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.target.blur();
                else if (e.key === "Escape") cancelNoteDraft();
              }}
            />
          ) : (
            <div className="rv sound-lab-readout-editable">
              <span>{note ?? ""}</span>
              <button
                type="button"
                className="sound-lab-edit-btn"
                onClick={startEditNote}
                disabled={editingDisabled}
                aria-label="Enter a note name"
                title="Enter a note name"
              >
                ✎
              </button>
            </div>
          )}
        </div>
        <div className="sound-lab-readout">
          <div className="rl">Period (T = 1/f)</div>
          <div className="rv" style={{ color: colors.green }}>{formatDuration(1 / freq)}</div>
        </div>
      </div>

      <div className="sound-lab-slider-row">
        <input
          type="range"
          className="lab-slider"
          min="0"
          max="1000"
          step="any"
          value={freqToSliderPrecise(freq)}
          disabled={mode === "sweep"}
          aria-label="Frequency"
          aria-valuetext={`${freq.toFixed(2)} Hz`}
          onChange={(e) => {
            setFreq(round2(clampFreq(sliderToFreqPrecise(+e.target.value))));
            markInteracted();
          }}
        />
        <div className="sound-lab-slider-ticks" aria-hidden="true">
          {SLIDER_TICKS.map((f) => (
            <span
              key={f}
              className="sound-lab-slider-tick"
              style={{ left: `calc(8px + (100% - 16px) * ${freqToSliderPrecise(f) / 1000})` }}
            >
              {tickLabel(f)}
            </span>
          ))}
        </div>
      </div>

      <div className="lab-actions">
        <button type="button" className={`lab-play-btn${mode === "tone" ? " playing" : ""}`} onClick={playTone} disabled={mode === "sweep"}>
          {mode === "tone" ? "⏹ Stop" : IDLE_LABEL}
        </button>
        <button type="button" className={`lab-play-btn ghost${mode === "sweep" ? " playing" : ""}`} onClick={playSweep} disabled={mode === "tone"}>
          {mode === "sweep" ? "⏹ Stop" : "↝ Sweep 20 Hz → 20 kHz"}
        </button>
      </div>
    </div>
  );
}

export default FrequencyLab;
