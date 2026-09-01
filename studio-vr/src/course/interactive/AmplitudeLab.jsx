import { useEffect, useRef, useState } from "react";
import "./labs.css";
import { useLabAudio } from "./useLabAudio";
import { COLORS, drawScope } from "./soundLabShared";

// Ported from design/what-is-sound-chapter.html's "03 AMPLITUDE" panel.
// Frequency is fixed at 440 Hz on purpose (per the mockup's hint) so
// amplitude is the only thing changing — the waveform's height moves, its
// shape doesn't. Slider is 0..100 "linear-ish" gain, converted to dB for
// the readout the same way the mockup does (20·log10, floored at -60 dB).

const FIXED_FREQ = 440;

function levelFromSlider(v) {
  return v / 100;
}
function dbFromLevel(lin) {
  if (lin <= 0) return -60;
  return Math.round(20 * Math.log10(lin));
}

function AmplitudeLab({ onInteract }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const scrollRef = useRef(0);
  const gainNodeRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  const { getCtx, track, stopAll } = useLabAudio();

  const [sliderVal, setSliderVal] = useState(60);
  const [playing, setPlaying] = useState(false);
  const sliderRef = useRef(sliderVal);
  sliderRef.current = sliderVal;

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  const level = levelFromSlider(sliderVal);
  const db = dbFromLevel(level);

  useEffect(() => {
    if (!playing) drawScope(canvasRef.current, { cycles: 6, amp: level, color: COLORS.green });
  }, [level, playing]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // live gain while a tone is held
  useEffect(() => {
    if (playing && gainNodeRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(level * 0.25, getCtx().currentTime, 0.05);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, playing]);

  function loop() {
    scrollRef.current += 0.25;
    drawScope(canvasRef.current, { cycles: 6, amp: levelFromSlider(sliderRef.current), color: COLORS.green, scroll: scrollRef.current });
    rafRef.current = requestAnimationFrame(loop);
  }

  function togglePlay() {
    markInteracted();
    if (playing) {
      stopAll();
      cancelAnimationFrame(rafRef.current);
      gainNodeRef.current = null;
      setPlaying(false);
      drawScope(canvasRef.current, { cycles: 6, amp: levelFromSlider(sliderRef.current), color: COLORS.green });
      return;
    }
    const ctx = getCtx();
    const osc = track(ctx.createOscillator());
    const gain = track(ctx.createGain());
    osc.type = "sine";
    osc.frequency.value = FIXED_FREQ;
    gain.gain.value = level * 0.25;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    gainNodeRef.current = gain;
    setPlaying(true);
    loop();
  }

  return (
    <div className="lab">
      <p className="lab-intro">
        Same 440 Hz tone throughout — only the volume slider changes. Watch the waveform's height
        grow and shrink; that's amplitude, and it's what your ears hear as loudness.
      </p>

      <div className="sound-lab-panel-head">
        <span className={`sound-lab-live-dot${playing ? " on" : ""}`} /> Tone + Volume Slider
      </div>

      <div className="sound-lab-frame">
        <canvas ref={canvasRef} className="sound-lab-canvas" width={560} height={160} style={{ aspectRatio: "560 / 160" }} />
      </div>

      <div className="sound-lab-readout-row">
        <div className="sound-lab-readout">
          <div className="rl">Level</div>
          <div className="rv accent">{db <= -60 ? "−∞ dB" : `${db} dB`}</div>
        </div>
        <div className="sound-lab-readout">
          <div className="rl">Meter</div>
          <div className="sound-lab-vu">
            <div className="sound-lab-vu-fill" style={{ width: `${level * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="sound-lab-slider-row">
        <div className="sound-lab-slider-labels">
          <span>Silent</span>
          <span>0 dB</span>
        </div>
        <input
          type="range"
          className="lab-slider"
          min="0"
          max="100"
          value={sliderVal}
          onChange={(e) => {
            setSliderVal(+e.target.value);
            markInteracted();
          }}
        />
      </div>

      <div className="lab-actions">
        <button type="button" className={`lab-play-btn${playing ? " playing" : ""}`} onClick={togglePlay}>
          {playing ? "⏹ Stop" : "▶ Play Tone (440 Hz)"}
        </button>
      </div>
      <p className="lab-hint">
        Frequency is fixed here so amplitude is the only thing changing — compare the waveform's
        height, not its shape.
      </p>
    </div>
  );
}

export default AmplitudeLab;
