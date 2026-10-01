import { useEffect, useRef, useState } from "react";
import { KeyPoints } from "../../../../../components/KeyPoints";
import { useTheme } from "../../../../../theme/ThemeContext";
import { canvasFont } from "../../../../../theme/fonts";
import { scopePalette } from "../../shared/soundLabShared";
import { useLabAudio } from "../../shared/useLabAudio";
import "../../shared/labs.css";
import "./AmplificationLab.css";
import { AMPLIFICATION as LAB } from "./amplificationData";

// "Amplification / Amplifier" — interactive amplifier on top (gain control,
// in/out meters, live spectrum), description + key points below.
//
// No synthetic audio: the lab only ever amplifies the provided recording
// (LAB.sample.src). If that file isn't there yet (Vite's SPA fallback
// serves index.html for missing files, so a text/html response counts as
// missing too), Play stays available: each press re-tries the fetch, so a
// file dropped in later starts playing without a reload, and the status
// card says "No sample loaded" if it still isn't there.
//
// Audio graph (all in series, so every analyser is pulled by the
// destination and keeps updating in every browser):
//
//   BufferSource(loop) → inAn → gain → preAn → clipper → outAn → monitor → out
//
//   inAn    — what goes INTO the amplifier: IN meter + blue spectrum line.
//   gain    — the amplifier itself (0…+60 dB, or unity when "Original").
//   preAn   — the amplified signal before the ceiling. Web Audio is
//             floating point and wouldn't clip on its own, so this is what
//             tells us how far past 0 dBFS the student has pushed it (the
//             OUT meter reads it, including the red "over" region).
//   clipper — a 2-point WaveShaper curve [-1, 1]: identity inside ±1 and,
//             because WaveShaper clamps its input to the curve's ends,
//             a hard ceiling at 0 dBFS outside it. This is the real
//             converter/rail clipping the lesson talks about: it is audible,
//             and the new harmonics it creates show up in the spectrum.
//   outAn   — what comes OUT: green spectrum (post-clip, so distortion
//             products are visible).
//   monitor — fixed listening trim so a fully clipped signal isn't
//             painfully loud. It sits after every measurement point, so
//             it never affects what the meters/spectrum show.

const METER_MIN = -60;
const METER_MAX = 6;
const SPEC_F_MIN = 20;
const SPEC_F_MAX = 20000;
const SPEC_DB_MIN = -120;
const SPEC_DB_MAX = 0;
const MONITOR_TRIM = 0.5;
const RELEASE_DB_PER_S = 24; // meter fall-back speed
const HOLD_S = 1.5; // peak-hold tick
const CLIP_LATCH_S = 1.2; // clip LED stays lit this long

// Output-level zones (peak dBFS, OUT meter's held value). The target band
// (-18 … -6 dBFS) is also drawn on both meters.
const ZONES = [
  { id: "silent", below: -60, label: "No signal", tone: "dim" },
  { id: "weak", below: -30, label: "Too weak, add gain", tone: "warn" },
  { id: "low", below: -18, label: "Low, a little more", tone: "dim" },
  { id: "good", below: -6, label: "Healthy level", tone: "good" },
  { id: "hot", below: 0, label: "Hot, little headroom", tone: "warn" },
];
const CLIP_ZONE = { id: "clip", label: "Clipping!", tone: "danger" };
const TARGET_LOW = -18;
const TARGET_HIGH = -6;

const dbToLin = (db) => Math.pow(10, db / 20);
const linToDb = (lin) => (lin > 0 ? 20 * Math.log10(lin) : -Infinity);

function fmtDb(db, { sign = false } = {}) {
  if (!Number.isFinite(db) || db <= -99) return "−∞";
  const s = db.toFixed(1);
  return (sign && db > 0 ? "+" : "") + s.replace("-", "−");
}

function fmtRatio(db) {
  const r = dbToLin(db);
  if (r < 10) return `×${r.toFixed(2)}`;
  if (r < 100) return `×${r.toFixed(1)}`;
  return `×${Math.round(r).toLocaleString("en-US")}`;
}

// Meter position (0..100 %) for a dBFS value.
function pct(db) {
  const v = Math.min(METER_MAX, Math.max(METER_MIN, db));
  return ((v - METER_MIN) / (METER_MAX - METER_MIN)) * 100;
}

// LED-style hard-stop gradient: target colour up to -6, warn up to 0,
// clip above. Same string for both meters, applied to a full-width layer
// that's revealed with clip-path, so colours stay fixed to the scale.
const METER_GRADIENT = `linear-gradient(90deg, var(--amp-good) 0 ${pct(TARGET_HIGH)}%, var(--amp-warn) ${pct(
  TARGET_HIGH,
)}% ${pct(0)}%, var(--amp-clip) ${pct(0)}%)`;
const METER_TICKS = [-60, -48, -36, -24, -18, -12, -6, 0, 6];
const GAIN_TICKS = [0, 10, 20, 30, 40, 50, 60];

function zoneFor(db, clipping) {
  if (clipping) return CLIP_ZONE;
  return ZONES.find((z) => db < z.below) || ZONES[ZONES.length - 1];
}

function peakOf(buf) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const a = Math.abs(buf[i]);
    if (a > p) p = a;
  }
  return p;
}

/** Fast-attack / slow-release meter value with a peak-hold tick. */
function stepMeter(m, peakDb, now, dt) {
  m.disp = peakDb >= m.disp ? peakDb : Math.max(peakDb, m.disp - RELEASE_DB_PER_S * dt);
  if (peakDb >= m.hold || now - m.holdT > HOLD_S) {
    m.hold = peakDb >= m.hold ? peakDb : m.disp;
    m.holdT = now;
  }
}
const freshMeter = () => ({ disp: -Infinity, hold: -Infinity, holdT: 0 });

// ---- spectrum canvas -------------------------------------------------------

const FREQ_GRID = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
const DB_GRID = [-100, -80, -60, -40, -20];

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/**
 * Log-frequency spectrum (20 Hz – 20 kHz) on a dBFS scale. `inData` /
 * `outData` are AnalyserNode.getFloatFrequencyData() arrays (or null when
 * idle). For each pixel column we take the loudest bin it covers, so
 * narrow peaks (and clipping harmonics) don't vanish between columns at
 * the high end, and interpolate at the low end where one bin spans many
 * pixels.
 */
function drawSpectrum(canvas, { inData, outData, sampleRate, theme, outTone, message }) {
  if (!canvas || !canvas.clientWidth) return;
  const { ctx, w, h } = fitCanvas(canvas);
  const pal = scopePalette(theme);
  const L = 36;
  const R = 10;
  const T = 10;
  const B = 20;
  const pw = w - L - R;
  const ph = h - T - B;
  const xOfF = (f) => L + (Math.log(f / SPEC_F_MIN) / Math.log(SPEC_F_MAX / SPEC_F_MIN)) * pw;
  const yOfDb = (db) => T + (1 - (Math.max(SPEC_DB_MIN, Math.min(SPEC_DB_MAX, db)) - SPEC_DB_MIN) / (SPEC_DB_MAX - SPEC_DB_MIN)) * ph;

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);

  // grid
  ctx.strokeStyle = pal.grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  FREQ_GRID.forEach((f) => {
    const x = Math.round(xOfF(f)) + 0.5;
    ctx.moveTo(x, T);
    ctx.lineTo(x, T + ph);
  });
  DB_GRID.forEach((db) => {
    const y = Math.round(yOfDb(db)) + 0.5;
    ctx.moveTo(L, y);
    ctx.lineTo(L + pw, y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = pal.colors.label;
  ctx.font = canvasFont(10, { mono: true });
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  FREQ_GRID.forEach((f) => ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, xOfF(f), T + ph + 5));
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  DB_GRID.forEach((db) => ctx.fillText(`${db}`, L - 6, yOfDb(db)));

  ctx.save();
  ctx.beginPath();
  ctx.rect(L, T, pw, ph);
  ctx.clip();

  const nyq = sampleRate / 2;
  const traceYs = (data) => {
    const bins = data.length;
    const ys = new Float32Array(Math.max(1, Math.ceil(pw)) + 1);
    for (let i = 0; i < ys.length; i++) {
      const f0 = SPEC_F_MIN * Math.pow(SPEC_F_MAX / SPEC_F_MIN, i / pw);
      const f1 = SPEC_F_MIN * Math.pow(SPEC_F_MAX / SPEC_F_MIN, (i + 1) / pw);
      const b0 = (f0 / nyq) * bins;
      const b1 = (f1 / nyq) * bins;
      let db;
      if (b1 - b0 < 1) {
        const lo = Math.min(bins - 1, Math.floor(b0));
        const hi = Math.min(bins - 1, lo + 1);
        const t = b0 - lo;
        db = data[lo] * (1 - t) + data[hi] * t;
      } else {
        db = -Infinity;
        const end = Math.min(bins, Math.ceil(b1));
        for (let b = Math.floor(b0); b < end; b++) if (data[b] > db) db = data[b];
      }
      ys[i] = yOfDb(Number.isFinite(db) ? db : SPEC_DB_MIN);
    }
    return ys;
  };
  const strokeTrace = (ys, color, width) => {
    ctx.beginPath();
    for (let i = 0; i < ys.length; i++) {
      const x = L + i;
      if (i === 0) ctx.moveTo(x, ys[i]);
      else ctx.lineTo(x, ys[i]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  const outColor = outTone === "danger" ? pal.colors.red : outTone === "warn" ? pal.colors.amber : pal.colors.green;
  let outYs = null;
  if (outData) {
    outYs = traceYs(outData);
    ctx.beginPath();
    ctx.moveTo(L, T + ph);
    for (let i = 0; i < outYs.length; i++) ctx.lineTo(L + i, outYs[i]);
    ctx.lineTo(L + outYs.length - 1, T + ph);
    ctx.closePath();
    ctx.fillStyle = outColor;
    ctx.globalAlpha = 0.16;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (inData) strokeTrace(traceYs(inData), pal.colors.blue, 1.25);
  if (outYs) strokeTrace(outYs, outColor, 1.75);
  ctx.restore();

  if (message) {
    ctx.fillStyle = pal.colors.label;
    ctx.font = canvasFont(12, { weight: 500 });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(message, L + pw / 2, T + ph / 2);
  }
}

// ---- component -------------------------------------------------------------

function AmplificationLab({ onInteract }) {
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const { getCtx } = useLabAudio();
  const [status, setStatus] = useState("loading"); // loading | ready | missing
  const [playing, setPlaying] = useState(false);
  const [gainDb, setGainDb] = useState(LAB.gain.initial);
  const [amplified, setAmplified] = useState(true);
  const [zone, setZone] = useState(null);

  const rawRef = useRef(null); // fetched ArrayBuffer
  const bufferRef = useRef(null); // decoded AudioBuffer
  const graphRef = useRef(null);
  const srcRef = useRef(null);
  const rafRef = useRef(0);
  const canvasRef = useRef(null);
  const zoneRef = useRef(null);
  const dataRef = useRef(null);
  const metersRef = useRef({ in: freshMeter(), out: freshMeter(), clipUntil: 0, lastT: 0, lastText: 0 });
  const effGainRef = useRef(0);

  // DOM refs updated straight from the rAF loop (no re-render per frame).
  const inFillRef = useRef(null);
  const inHoldRef = useRef(null);
  const inValRef = useRef(null);
  const outFillRef = useRef(null);
  const outHoldRef = useRef(null);
  const outValRef = useRef(null);
  const clipLedRef = useRef(null);

  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);
  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  const effectiveGain = amplified ? gainDb : 0;
  effGainRef.current = effectiveGain;

  // Fetch the provided recording (decoded lazily on first play, once an
  // AudioContext exists under a user gesture).
  const aliveRef = useRef(true);
  function loadSample() {
    return fetch(LAB.sample.src)
      .then((r) => {
        const ct = r.headers.get("content-type") || "";
        if (!r.ok || ct.includes("text/html")) throw new Error("missing");
        return r.arrayBuffer();
      })
      .then((ab) => {
        if (!aliveRef.current) return false;
        rawRef.current = ab;
        setStatus("ready");
        return true;
      })
      .catch(() => {
        if (aliveRef.current) setStatus("missing");
        return false;
      });
  }
  useEffect(() => {
    aliveRef.current = true;
    loadSample();
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live gain changes while playing (short ramp → no zipper noise).
  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    g.gain.gain.setTargetAtTime(dbToLin(effectiveGain), g.ctx.currentTime, 0.03);
  }, [effectiveGain]);

  // Idle spectrum frame (and on theme change / status change).
  const idleMessage =
    status === "loading" ? "Loading sample…" : "Press play to see the spectrum";
  const idleMessageRef = useRef(idleMessage);
  idleMessageRef.current = idleMessage;
  useEffect(() => {
    if (playing) return;
    drawSpectrum(canvasRef.current, { theme, message: idleMessage, sampleRate: 48000 });
  }, [playing, idleMessage, theme]);

  // Keep the idle frame crisp when the layout width changes.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!srcRef.current) drawSpectrum(el, { theme: themeRef.current, message: idleMessageRef.current, sampleRate: 48000 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function ensureGraph(ctx) {
    if (graphRef.current) return graphRef.current;
    const inAn = ctx.createAnalyser();
    inAn.fftSize = 8192;
    inAn.smoothingTimeConstant = 0.8;
    const gain = ctx.createGain();
    gain.gain.value = dbToLin(effGainRef.current);
    const preAn = ctx.createAnalyser();
    preAn.fftSize = 2048;
    const clipper = ctx.createWaveShaper();
    clipper.curve = new Float32Array([-1, 1]);
    clipper.oversample = "2x";
    const outAn = ctx.createAnalyser();
    outAn.fftSize = 8192;
    outAn.smoothingTimeConstant = 0.8;
    const monitor = ctx.createGain();
    monitor.gain.value = MONITOR_TRIM;
    inAn.connect(gain).connect(preAn).connect(clipper).connect(outAn).connect(monitor).connect(ctx.destination);
    dataRef.current = {
      inTime: new Float32Array(inAn.fftSize),
      preTime: new Float32Array(preAn.fftSize),
      inFreq: new Float32Array(inAn.frequencyBinCount),
      outFreq: new Float32Array(outAn.frequencyBinCount),
    };
    graphRef.current = { ctx, inAn, gain, preAn, clipper, outAn, monitor };
    return graphRef.current;
  }

  function setMeter(fillEl, holdEl, m) {
    if (fillEl) fillEl.style.clipPath = `inset(0 ${100 - pct(m.disp)}% 0 0)`;
    if (holdEl) {
      holdEl.style.left = `${pct(m.hold)}%`;
      holdEl.style.opacity = Number.isFinite(m.hold) && m.hold > METER_MIN ? "1" : "0";
    }
  }

  function resetMeters() {
    const M = metersRef.current;
    M.in = freshMeter();
    M.out = freshMeter();
    M.clipUntil = 0;
    setMeter(inFillRef.current, inHoldRef.current, M.in);
    setMeter(outFillRef.current, outHoldRef.current, M.out);
    if (inValRef.current) inValRef.current.textContent = "−∞";
    if (outValRef.current) outValRef.current.textContent = "−∞";
    clipLedRef.current?.classList.remove("on");
    zoneRef.current = null;
    setZone(null);
  }

  function tick() {
    const g = graphRef.current;
    const d = dataRef.current;
    if (!g || !d) return;
    const now = g.ctx.currentTime;
    const M = metersRef.current;
    const dt = M.lastT ? Math.min(0.1, now - M.lastT) : 0.016;
    M.lastT = now;

    g.inAn.getFloatTimeDomainData(d.inTime);
    g.preAn.getFloatTimeDomainData(d.preTime);
    const inPeak = peakOf(d.inTime);
    const prePeak = peakOf(d.preTime);
    stepMeter(M.in, linToDb(inPeak), now, dt);
    stepMeter(M.out, linToDb(prePeak), now, dt);
    if (prePeak >= 0.999) M.clipUntil = now + CLIP_LATCH_S;
    const clipping = now < M.clipUntil;

    setMeter(inFillRef.current, inHoldRef.current, M.in);
    setMeter(outFillRef.current, outHoldRef.current, M.out);
    clipLedRef.current?.classList.toggle("on", clipping);

    // Numbers change ~8×/s so they're readable.
    if (now - M.lastText > 0.12) {
      M.lastText = now;
      if (inValRef.current) inValRef.current.textContent = fmtDb(M.in.hold);
      if (outValRef.current) outValRef.current.textContent = fmtDb(M.out.hold, { sign: true });
    }

    const z = zoneFor(M.out.hold, clipping);
    if (zoneRef.current?.id !== z.id) {
      zoneRef.current = z;
      setZone(z);
    }

    g.inAn.getFloatFrequencyData(d.inFreq);
    g.outAn.getFloatFrequencyData(d.outFreq);
    drawSpectrum(canvasRef.current, {
      inData: d.inFreq,
      outData: d.outFreq,
      sampleRate: g.ctx.sampleRate,
      theme: themeRef.current,
      // Spectrum colour only warns when the output is hot or clipping
      // (a weak signal is still drawn in the normal "good" colour).
      outTone: z.id === "clip" ? "danger" : z.id === "hot" ? "warn" : "good",
    });
    rafRef.current = requestAnimationFrame(tick);
  }

  async function start() {
    markInteracted();
    // Create/resume the context inside the click (user gesture) before any await.
    const ctx = getCtx();
    if (!rawRef.current && !bufferRef.current && !(await loadSample())) return;
    if (srcRef.current) return; // double click while loading
    if (!bufferRef.current) {
      try {
        bufferRef.current = await ctx.decodeAudioData(rawRef.current.slice(0));
      } catch {
        setStatus("missing");
        return;
      }
    }
    const g = ensureGraph(ctx);
    g.gain.gain.setValueAtTime(dbToLin(effGainRef.current), ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = bufferRef.current;
    src.loop = true;
    src.connect(g.inAn);
    src.start();
    srcRef.current = src;
    metersRef.current.lastT = 0;
    setPlaying(true);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }

  function stop() {
    const src = srcRef.current;
    if (src) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
    }
    srcRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
    resetMeters();
  }

  // Stop the source on unmount (useLabAudio closes the context itself).
  useEffect(
    () => () => {
      try {
        srcRef.current?.stop();
      } catch {
        /* already stopped */
      }
    },
    [],
  );


  return (
    <div className="lab amp">
      {/* ── Interactive amplifier ───────────────────────────────────── */}
      <section className="amp-rig" aria-label="Amplifier">
        <div className="amp-head">
          <div className="sound-lab-panel-head amp-head-title">
            <span className={`sound-lab-live-dot${playing ? " on" : ""}`} /> Amplifier · Live spectrum
          </div>
          <div className="amp-legend" aria-hidden="true">
            <span className="amp-legend-item in">Input</span>
            <span className={`amp-legend-item out ${zone?.id === "clip" ? "danger" : zone?.id === "hot" ? "warn" : "good"}`}>
              Output
            </span>
          </div>
        </div>

        <div className="sound-lab-frame amp-frame">
          <canvas
            ref={canvasRef}
            className="amp-canvas"
            role="img"
            aria-label="Frequency spectrum of the input (blue line) and amplified output (filled), 20 Hz to 20 kHz"
          />
          <span className="amp-axis-note">Hz · dBFS</span>
        </div>

        <div className="amp-meters">
          <div className="amp-meter">
            <span className="amp-meter-label">In</span>
            <div className="amp-meter-track">
              <div className="amp-meter-target" style={{ left: `${pct(TARGET_LOW)}%`, width: `${pct(TARGET_HIGH) - pct(TARGET_LOW)}%` }} />
              <div ref={inFillRef} className="amp-meter-fill" style={{ background: METER_GRADIENT, clipPath: "inset(0 100% 0 0)" }} />
              <div ref={inHoldRef} className="amp-meter-hold" style={{ opacity: 0 }} />
            </div>
            <span ref={inValRef} className="amp-meter-val">−∞</span>
            <span className="amp-meter-led-spacer" />
          </div>
          <div className="amp-meter">
            <span className="amp-meter-label">Out</span>
            <div className="amp-meter-track">
              <div className="amp-meter-target" style={{ left: `${pct(TARGET_LOW)}%`, width: `${pct(TARGET_HIGH) - pct(TARGET_LOW)}%` }} />
              <div ref={outFillRef} className="amp-meter-fill" style={{ background: METER_GRADIENT, clipPath: "inset(0 100% 0 0)" }} />
              <div ref={outHoldRef} className="amp-meter-hold" style={{ opacity: 0 }} />
            </div>
            <span ref={outValRef} className="amp-meter-val">−∞</span>
            <span ref={clipLedRef} className="amp-clip-led" title="Clip">
              Clip
            </span>
          </div>
          <div className="amp-meter amp-meter-scale-row" aria-hidden="true">
            <span className="amp-meter-label" />
            <div className="amp-meter-scale">
              {METER_TICKS.map((t) => (
                <span key={t} style={{ left: `${pct(t)}%` }}>
                  {t > 0 ? `+${t}` : t === 0 ? "0" : `${t}`.replace("-", "−")}
                </span>
              ))}
            </div>
            <span className="amp-meter-val" />
            <span className="amp-meter-led-spacer" />
          </div>
        </div>

        <div className="amp-controls">
          <div className="amp-gain">
            <div className="amp-gain-head">
              <label className="lab-control-label" htmlFor="amp-gain-slider">
                Gain <span className="amp-gain-unity">0 dB = unity, no change</span>
              </label>
              <div className={`amp-gain-value${amplified ? "" : " bypassed"}`}>
                <span className="amp-gain-db">{fmtDb(gainDb, { sign: true })} dB</span>
                <span className="amp-gain-ratio">{fmtRatio(gainDb)}</span>
              </div>
            </div>
            <input
              id="amp-gain-slider"
              type="range"
              className="lab-slider"
              min={LAB.gain.min}
              max={LAB.gain.max}
              step={LAB.gain.step}
              value={gainDb}
              aria-valuetext={`${fmtDb(gainDb, { sign: true })} decibels, ${fmtRatio(gainDb)} voltage`}
              onChange={(e) => {
                setGainDb(+e.target.value);
                markInteracted();
              }}
            />
            <div className="sound-lab-slider-ticks">
              {GAIN_TICKS.map((t) => {
                const f = (t - LAB.gain.min) / (LAB.gain.max - LAB.gain.min);
                return (
                  <span key={t} className="sound-lab-slider-tick" style={{ left: `calc(8px + (100% - 16px) * ${f})` }}>
                    {t === 0 ? "0" : `+${t}`}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="amp-side">
            <div className="amp-status-card">
              <div className="rl">Output level</div>
              <div className={`amp-status ${zone?.tone || "idle"}`} aria-live="polite">
                {playing ? zone?.label || "…" : status === "missing" ? "No sample loaded" : "Not playing"}
              </div>
              <div className="amp-status-hint">Aim for peaks between −18 and −6 dBFS.</div>
            </div>
          </div>
        </div>

        <div className="lab-actions amp-actions">
          <button
            type="button"
            className={`lab-play-btn${playing ? " playing" : ""}`}
            onClick={playing ? stop : start}
          >
            {playing ? "⏹ Stop" : "▶ Play"}
          </button>
          <div className="lab-toggle-row amp-ab" role="group" aria-label="Compare">
            <button
              type="button"
              className={`lab-toggle${!amplified ? " selected" : ""}`}
              aria-pressed={!amplified}
              onClick={() => {
                setAmplified(false);
                markInteracted();
              }}
            >
              Original
            </button>
            <button
              type="button"
              className={`lab-toggle${amplified ? " selected" : ""}`}
              aria-pressed={amplified}
              onClick={() => {
                setAmplified(true);
                markInteracted();
              }}
            >
              Amplified
            </button>
          </div>
          <button type="button" className="lab-play-btn ghost amp-reset" onClick={() => setGainDb(LAB.gain.initial)} disabled={gainDb === LAB.gain.initial}>
            Reset gain
          </button>
        </div>
        <p className="lab-hint amp-hint">Start with your volume low. Push the gain past 0 dBFS to hear clipping and watch new harmonics appear.</p>
      </section>

      {/* ── Description + key points ────────────────────────────────── */}
      <h3 className="amp-title">{LAB.title}</h3>
      <p className="amp-lead">{LAB.lead}</p>
      <dl className="amp-sections">
        {LAB.sections.map((s) => (
          <div key={s.label} className="amp-section">
            <dt>{s.label}</dt>
            <dd>{s.text}</dd>
          </div>
        ))}
      </dl>
      <KeyPoints points={LAB.points} />
    </div>
  );
}

export default AmplificationLab;
