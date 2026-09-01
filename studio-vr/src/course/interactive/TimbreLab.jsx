import { useEffect, useRef, useState } from "react";
import "./labs.css";
import { useLabAudio } from "./useLabAudio";
import { COLORS, drawScope } from "./soundLabShared";

// Ported from design/what-is-sound-chapter.html's "07 TIMBRE" panel: the
// same 440 Hz note played back with four different oscillator waveforms
// (sine/triangle/sawtooth/square) so harmonic content alone — nothing about
// pitch or loudness — is what's changing. Wave icon paths are copied
// verbatim from the mockup's inline SVGs.

const FIXED_FREQ = 440;

const VOICES = [
  {
    wave: "sine",
    name: '"Flute" — Sine',
    desc: "Pure tone, almost no overtones. Soft, breathy.",
    path: "M0 13 Q 12.5 0 25 13 T 50 13 T 75 13 T 100 13",
    color: COLORS.amber,
  },
  {
    wave: "triangle",
    name: '"Clarinet" — Triangle',
    desc: "Odd harmonics only, quiet upper end. Rounder, hollow.",
    path: "M0 13 L12.5 1 L25 25 L37.5 1 L50 25 L62.5 1 L75 25 L87.5 1 L100 13",
    color: COLORS.green,
  },
  {
    wave: "sawtooth",
    name: '"Strings" — Sawtooth',
    desc: "Rich in odd + even harmonics. Bright, buzzy, dense.",
    path: "M0 25 L20 1 L20 25 L40 1 L40 25 L60 1 L60 25 L80 1 L80 25 L100 1",
    color: COLORS.blue,
  },
  {
    wave: "square",
    name: '"Reed" — Square',
    desc: "Odd harmonics, hollow and reedy. Nasal, edgy.",
    path: "M0 1 L0 1 L25 1 L25 25 L50 25 L50 1 L75 1 L75 25 L100 25",
    color: COLORS.red,
  },
];
const COLOR_BY_WAVE = Object.fromEntries(VOICES.map((v) => [v.wave, v.color]));

function TimbreLab({ onInteract }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const scrollRef = useRef(0);
  const oscRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  const { getCtx, track, stopAll } = useLabAudio();

  const [wave, setWave] = useState("sine");
  const [playing, setPlaying] = useState(false);
  const waveRef = useRef(wave);
  waveRef.current = wave;

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  useEffect(() => {
    if (!playing) drawScope(canvasRef.current, { cycles: 6, amp: 0.7, color: COLOR_BY_WAVE[wave] });
  }, [wave, playing]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  useEffect(() => {
    if (playing && oscRef.current) oscRef.current.type = wave;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wave, playing]);

  function loop() {
    scrollRef.current += 0.2;
    drawScope(canvasRef.current, { cycles: 6, amp: 0.7, color: COLOR_BY_WAVE[waveRef.current], scroll: scrollRef.current });
    rafRef.current = requestAnimationFrame(loop);
  }

  function togglePlay() {
    markInteracted();
    if (playing) {
      stopAll();
      cancelAnimationFrame(rafRef.current);
      oscRef.current = null;
      setPlaying(false);
      drawScope(canvasRef.current, { cycles: 6, amp: 0.7, color: COLOR_BY_WAVE[waveRef.current] });
      return;
    }
    const ctx = getCtx();
    const osc = track(ctx.createOscillator());
    const gain = track(ctx.createGain());
    osc.type = wave;
    osc.frequency.value = FIXED_FREQ;
    gain.gain.value = 0.12;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    oscRef.current = osc;
    setPlaying(true);
    loop();
  }

  function selectVoice(w) {
    setWave(w);
    markInteracted();
  }

  return (
    <div className="lab">
      <p className="lab-intro">
        Same 440 Hz note, four simplified voices — only harmonic content changes. That's timbre:
        everything about a sound's character that isn't pitch or loudness.
      </p>

      <div className="sound-lab-panel-head">
        <span className={`sound-lab-live-dot${playing ? " on" : ""}`} /> Same Pitch (A4 · 440 Hz), Four Voices
      </div>

      <div className="sound-lab-frame">
        <canvas ref={canvasRef} className="sound-lab-canvas" width={560} height={150} style={{ aspectRatio: "560 / 150" }} />
      </div>

      <div className="sound-lab-instrument-grid">
        {VOICES.map((v) => (
          <button
            type="button"
            key={v.wave}
            className={`sound-lab-inst-card${wave === v.wave ? " active" : ""}`}
            onClick={() => selectVoice(v.wave)}
          >
            <svg className="sound-lab-wave-icon" viewBox="0 0 100 26">
              <path d={v.path} fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <div className="iname">{v.name}</div>
            <div className="idesc">{v.desc}</div>
          </button>
        ))}
      </div>

      <div className="lab-actions">
        <button type="button" className={`lab-play-btn${playing ? " playing" : ""}`} onClick={togglePlay}>
          {playing ? "⏹ Stop" : "▶ Play Selected Voice"}
        </button>
      </div>
      <p className="lab-hint">
        Simplified synthesized approximations, not sampled instruments — real recordings arrive later
        in the course.
      </p>
    </div>
  );
}

export default TimbreLab;
