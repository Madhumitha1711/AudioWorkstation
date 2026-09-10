import { useEffect, useRef, useState } from "react";
import "./labs.css";
import { useLabAudio } from "./useLabAudio";
import { useTheme } from "../../theme/ThemeContext";
import { drawScope, scopePalette, sliderToFreq, visualCyclesFor } from "./soundLabShared";

// Ported from design/what-is-sound-chapter.html's "04 WAVELENGTH" panel.
// λ = v / f (speed of sound in air ≈ 343 m/s) — the same log-scale
// frequency slider as FrequencyLab, but the readout and the accompanying
// "roughly the size of ___" comparison are about the physical length of one
// cycle in space, not the pitch itself.

const SPEED_OF_SOUND = 343; // m/s in air
// Matches the slider's actual log-scale range (see soundLabShared's
// sliderToFreq — shared with FrequencyLab) — the labels at each end of the
// slider used to just say "20 Hz"/"2,000 Hz", which understated where the
// slider's top end really lands (20,000 Hz, the top of human hearing).
// Anchoring these to the same MIN/MAX the slider itself covers keeps the
// printed scale honest.
const MIN_FREQ = 20;
const MAX_FREQ = 20000;

function compareText(l) {
  if (l > 5) return `≈ the length of a small room (${l.toFixed(1)} m)`;
  if (l > 1.5) return `≈ the width of a doorway (${l.toFixed(2)} m)`;
  if (l > 0.3) return `≈ the length of a guitar (${l.toFixed(2)} m)`;
  if (l > 0.05) return `≈ the width of a hand (${(l * 100).toFixed(0)} cm)`;
  return `≈ a fingertip (${(l * 100).toFixed(1)} cm) — highly directional`;
}

function formatLength(l) {
  return l >= 1 ? `${l.toFixed(2)} m` : `${(l * 100).toFixed(1)} cm`;
}

function formatPeriod(t) {
  return t >= 1 ? `${t.toFixed(2)} ms` : `${(t * 1000).toFixed(0)} µs`;
}

function WavelengthLab({ onInteract }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const scrollRef = useRef(0);
  const oscRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;
  const { getCtx, track, stopAll } = useLabAudio();
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  const colors = scopePalette(theme).colors;

  const [sliderVal, setSliderVal] = useState(480);
  const [playing, setPlaying] = useState(false);
  const sliderRef = useRef(sliderVal);
  sliderRef.current = sliderVal;

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  const freq = sliderToFreq(sliderVal);
  const lambda = SPEED_OF_SOUND / freq;
  const period = 1000 / freq; // ms — one full cycle's duration, T = 1/f

  useEffect(() => {
    if (!playing) {
      drawScope(canvasRef.current, {
        cycles: visualCyclesFor(freq, 2, 0.6),
        amp: 0.75,
        color: colors.blue,
        theme,
        label: `T = ${formatPeriod(period)}`,
      });
    }
  }, [freq, period, playing, theme, colors]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  useEffect(() => {
    if (playing && oscRef.current) {
      oscRef.current.frequency.setTargetAtTime(freq, getCtx().currentTime, 0.02);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freq, playing]);

  function loop() {
    const f = sliderToFreq(sliderRef.current);
    scrollRef.current += 0.15;
    drawScope(canvasRef.current, {
      cycles: visualCyclesFor(f, 2, 0.6),
      amp: 0.75,
      color: scopePalette(themeRef.current).colors.blue,
      theme: themeRef.current,
      scroll: scrollRef.current,
      label: `T = ${formatPeriod(1000 / f)}`,
    });
    rafRef.current = requestAnimationFrame(loop);
  }

  function togglePlay() {
    markInteracted();
    if (playing) {
      stopAll();
      cancelAnimationFrame(rafRef.current);
      oscRef.current = null;
      setPlaying(false);
      drawScope(canvasRef.current, {
        cycles: visualCyclesFor(sliderToFreq(sliderRef.current), 2, 0.6),
        amp: 0.75,
        color: colors.blue,
        theme,
        label: `T = ${formatPeriod(1000 / sliderToFreq(sliderRef.current))}`,
      });
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
    setPlaying(true);
    loop();
  }

  return (
    <div className="lab">
      <p className="lab-intro">
        Wavelength is the physical distance one full cycle takes up in space — tied to frequency
        through the speed of sound. Slide toward the low end and picture that wave stretching out
        meters long.
      </p>

      <div className="sound-lab-panel-head">
        <span className={`sound-lab-live-dot${playing ? " on" : ""}`} /> Tone + Visual Wavelength
      </div>

      <div className="sound-lab-frame">
        <canvas ref={canvasRef} className="sound-lab-canvas" width={560} height={170} style={{ aspectRatio: "560 / 170" }} />
      </div>

      <div className="sound-lab-readout-row">
        <div className="sound-lab-readout">
          <div className="rl">Frequency</div>
          <div className="rv accent">{freq.toLocaleString()} Hz</div>
        </div>
        <div className="sound-lab-readout">
          <div className="rl">Wavelength (λ)</div>
          <div className="rv" style={{ color: colors.green }}>
            {formatLength(lambda)}
          </div>
        </div>
      </div>

      <div className="sound-lab-slider-row">
        <div className="sound-lab-slider-labels">
          <span className="sound-lab-slider-label">
            <span className="freq">{MIN_FREQ} Hz</span>
            <span className="detail">{formatLength(SPEED_OF_SOUND / MIN_FREQ)}</span>
          </span>
          <span className="sound-lab-slider-label right">
            <span className="freq">{MAX_FREQ.toLocaleString()} Hz</span>
            <span className="detail">{formatLength(SPEED_OF_SOUND / MAX_FREQ)}</span>
          </span>
        </div>
        <input
          type="range"
          className="lab-slider"
          min="0"
          max="1000"
          value={sliderVal}
          onChange={(e) => {
            setSliderVal(+e.target.value);
            markInteracted();
          }}
        />
      </div>

      <div className="lab-actions">
        <button type="button" className={`lab-play-btn${playing ? " playing" : ""}`} onClick={togglePlay}>
          {playing ? "⏹ Stop" : "▶ Play Tone"}
        </button>
      </div>
      <p className="lab-hint">{compareText(lambda)}</p>
    </div>
  );
}

export default WavelengthLab;
