import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import { useLabAudio } from "../../shared/useLabAudio";
import { useTheme } from "../../../../../theme/ThemeContext";
import {
  drawScope,
  exactNoteForFreq,
  freqToSlider,
  noteNameToFreq,
  scopePalette,
  sliderToFreqPrecise,
  visualCyclesFor,
} from "../../shared/soundLabShared";

// Ported from design/what-is-sound-chapter.html's "02 FREQUENCY" panel — a
// real sine-wave oscillator swept by a log-scale slider (20 Hz–20,000 Hz,
// matching human hearing range) plus a one-shot 6-second sweep across the
// whole range. The mockup's freqPlay/freqSweep buttons are one control here
// (`mode` state) so the two never fight over the same oscillator.
//
// `freq` (not the slider position) is the single source of truth here, to
// 2 decimal places — the slider and the sweep both just set it, and
// everything else (oscillator pitch, scope trace, slider thumb position,
// note readout) is derived from it. The Frequency/Note readout boxes
// double as manual-entry fields (click the pencil to type an exact value
// in place — no separate "manual entry" section), and committing either
// one also just sets `freq`, so a typed value lands on the same log-scale
// slider position and wave a drag to that value would have produced.

const SWEEP_DURATION_SEC = 6;
const IDLE_LABEL = "▶ Play Tone";
const MIN_FREQ = 20;
const MAX_FREQ = 20000;

const clampFreq = (f) => Math.min(MAX_FREQ, Math.max(MIN_FREQ, f));
const round2 = (f) => Math.round(f * 100) / 100;

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
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  const colors = scopePalette(theme).colors;

  const [freq, setFreq] = useState(() => sliderToFreqPrecise(567));
  const [mode, setMode] = useState("idle"); // idle | tone | sweep
  const freqRef = useRef(freq);
  freqRef.current = freq;

  // Inline edit state for the Frequency/Note readout boxes — the pencil
  // icon in each swaps its value for a text input in place, rather than a
  // separate manual-entry section below the slider. Draft text only
  // exists while actually editing, seeded from the live value the moment
  // edit mode is entered.
  const [editingFreq, setEditingFreq] = useState(false);
  const [freqDraft, setFreqDraft] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  const stop = () => {
    stopAll();
    cancelAnimationFrame(rafRef.current);
    oscRef.current = null;
    setMode("idle");
    drawScope(canvasRef.current, { cycles: 5, amp: 0.7, color: colors.amber, theme });
  };

  // static trace whenever the frequency (or the theme) changes while idle
  useEffect(() => {
    if (mode === "idle") drawScope(canvasRef.current, { cycles: 5, amp: 0.7, color: colors.amber, theme });
  }, [freq, mode, theme, colors]);

  // retune the live oscillator whenever freq changes during a held tone
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
    const liveColors = scopePalette(themeRef.current).colors;
    drawScope(canvasRef.current, {
      cycles: visualCyclesFor(f),
      amp: 0.7,
      color: liveColors.amber,
      scroll: scrollRef.current,
      theme: themeRef.current,
    });
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
      const liveColors = scopePalette(themeRef.current).colors;
      drawScope(canvasRef.current, {
        cycles: visualCyclesFor(f),
        amp: 0.7,
        color: liveColors.amber,
        scroll: scrollRef.current,
        theme: themeRef.current,
      });
      rafRef.current = requestAnimationFrame(tick);
    }
    tick();
  }

  // Only ever shows a note name it can vouch for exactly (see
  // exactNoteForFreq) — most frequencies, including nearly everywhere the
  // slider lands, sit between notes and show nothing here.
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
        <canvas ref={canvasRef} className="sound-lab-canvas" width={560} height={160} style={{ aspectRatio: "560 / 160" }} />
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
          value={freqToSlider(freq)}
          disabled={mode === "sweep"}
          onChange={(e) => {
            setFreq(sliderToFreqPrecise(+e.target.value));
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
    </div>
  );
}

export default FrequencyLab;
