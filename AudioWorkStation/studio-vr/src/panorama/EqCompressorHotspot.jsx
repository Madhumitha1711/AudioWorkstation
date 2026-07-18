import { useCallback, useEffect, useRef, useState } from "react";
import { FaustMonoDspGenerator } from "@grame/faustwasm";
import { compileFaustWasm } from "../faust/faustTypes";
import {
  initAudio,
  resumeAudio,
  getAudioContext,
  createStudioSpeakerBus,
} from "../audio/spatialAudioEngine";
import { Knob } from "../components/Knob";
import "../chapters/chapters.css";
import "./eqCompressorHotspot.css";

// ═══════════════════════════════════════════════════════════════════════════
// EQ + Compressor interactive hotspots — panorama/EqCompressorHotspot.jsx
// ═══════════════════════════════════════════════════════════════════════════
// Implements design/eq-compressor-hotspot-ui.html as a live panel, driven by
// the SAME real Faust WASM DSPs the Equalizer/Compressor course chapters use
// (public/faust/ParamEQ, public/faust/compressor — see chapters/Equalizer.jsx
// and chapters/Compressor.jsx for the full-featured versions this borrows
// its param addresses and audio-graph pattern from), instead of the design
// mockup's placeholder BiquadFilterNode/DynamicsCompressorNode stand-ins.
//
// Like a real channel strip, EQ and Compressor are two stages of ONE signal
// path (source -> Faust EQ -> Faust Compressor -> studio speakers), so a
// single "Upload audio" control feeds both panels — only one of the two
// panels is ever visible at a time (whichever hotspot was clicked), but the
// underlying engine and playback state is shared between them.
//
// The processed output is routed through createStudioSpeakerBus()
// (spatialAudioEngine.js) instead of straight to the destination, so it
// plays back through the two real studio monitor positions and pans/rotates
// with the listener as the student looks around the room — a genuine
// binaural "sitting between the speakers" effect, not just centered mono.

const EQ_BASE_PATH = "/faust/ParamEQ";
const COMP_BASE_PATH = "/faust/compressor";

// EQ param addresses this simplified module drives — the real ParamEQ patch
// is a full 8-band parametric (HPF, Low Shelf, 4x Peak, High Shelf, LPF; see
// chapters/Equalizer.jsx for the complete address list). This hotspot only
// exposes one parametric band plus the HPF/LPF, matching the design, and
// keeps every other band bypassed so it can't color the sound.
const EQ_ADDR = {
  hpfFreq: "/ParamEQ/HPF_Freq",
  hpfBypass: "/ParamEQ/HPF_Bypass",
  hpfOrder: "/ParamEQ/HPF_Order",
  lowShelfBypass: "/ParamEQ/Low_Shelf_Bypass",
  peak1Freq: "/ParamEQ/Peak1_Freq",
  peak1Gain: "/ParamEQ/Peak1_Gain",
  peak1Q: "/ParamEQ/Peak1_Q",
  peak1Bypass: "/ParamEQ/Peak1_Bypass",
  peak1DynamicOn: "/ParamEQ/Peak1_Dynamic_On",
  peak2Bypass: "/ParamEQ/Peak2_Bypass",
  peak3Bypass: "/ParamEQ/Peak3_Bypass",
  peak4Bypass: "/ParamEQ/Peak4_Bypass",
  highShelfBypass: "/ParamEQ/High_Shelf_Bypass",
  lpfFreq: "/ParamEQ/LPF_Freq",
  lpfBypass: "/ParamEQ/LPF_Bypass",
  lpfOrder: "/ParamEQ/LPF_Order",
};

// Compressor param addresses, single-band mode. The real compressor patch is
// a 4-band multiband compressor (see chapters/Compressor.jsx); with
// Multiband/Enable off, the "Low Band" controls act on the whole, unsplit
// signal — exactly a plain single-band compressor, matching the design.
const COMP_ADDR = {
  multibandEnable: "/compressor/Multiband_Enable",
  bypass: "/compressor/Low_Band_Bypass",
  threshold: "/compressor/Low_Band_Threshold",
  ratio: "/compressor/Low_Band_Ratio",
  knee: "/compressor/Low_Band_Knee",
  attack: "/compressor/Low_Band_Attack",
  release: "/compressor/Low_Band_Release",
  makeup: "/compressor/Low_Band_Makeup_Gain",
  gr: "/compressor/Low_Band_Gain_Reduction", // read-only hbargraph output
  scExternal: "/compressor/Sidechain_External_Sidechain",
  scListen: "/compressor/Sidechain_SC_Listen",
  scHpf: "/compressor/Sidechain_SC_HPF",
  outputWetDry: "/compressor/Output_Wet-Dry",
  outputGain: "/compressor/Output_Gain",
};

function setBool(node, addr, v) {
  node?.setParamValue(addr, v ? 1 : 0);
}

function applyEqParams(node, s, bypassed) {
  if (!node) return;
  setBool(node, EQ_ADDR.hpfBypass, bypassed || !s.hpfOn);
  node.setParamValue(EQ_ADDR.hpfFreq, s.hpf);
  node.setParamValue(EQ_ADDR.hpfOrder, 1); // ~24dB/oct
  setBool(node, EQ_ADDR.lowShelfBypass, true);
  setBool(node, EQ_ADDR.peak1Bypass, bypassed);
  setBool(node, EQ_ADDR.peak1DynamicOn, false);
  node.setParamValue(EQ_ADDR.peak1Freq, s.freq);
  node.setParamValue(EQ_ADDR.peak1Q, s.q);
  node.setParamValue(EQ_ADDR.peak1Gain, bypassed ? 0 : s.gain);
  setBool(node, EQ_ADDR.peak2Bypass, true);
  setBool(node, EQ_ADDR.peak3Bypass, true);
  setBool(node, EQ_ADDR.peak4Bypass, true);
  setBool(node, EQ_ADDR.highShelfBypass, true);
  setBool(node, EQ_ADDR.lpfBypass, bypassed || !s.lpfOn);
  node.setParamValue(EQ_ADDR.lpfFreq, s.lpf);
  node.setParamValue(EQ_ADDR.lpfOrder, 1);
}

function applyCompParams(node, s, bypassed) {
  if (!node) return;
  node.setParamValue(COMP_ADDR.multibandEnable, 0);
  setBool(node, COMP_ADDR.bypass, false);
  node.setParamValue(COMP_ADDR.threshold, s.threshold);
  node.setParamValue(COMP_ADDR.ratio, s.ratio);
  node.setParamValue(COMP_ADDR.knee, 6);
  node.setParamValue(COMP_ADDR.attack, s.attack);
  node.setParamValue(COMP_ADDR.release, s.release);
  node.setParamValue(COMP_ADDR.makeup, s.makeup);
  setBool(node, COMP_ADDR.scExternal, false);
  setBool(node, COMP_ADDR.scListen, false);
  node.setParamValue(COMP_ADDR.scHpf, 20);
  node.setParamValue(COMP_ADDR.outputWetDry, bypassed ? 0 : 100);
  node.setParamValue(COMP_ADDR.outputGain, 0);
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const fmtFreq = (v) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2).replace(/\.00$/, ".0")} kHz` : `${Math.round(v)} Hz`;
const fmtQ = (v) => v.toFixed(2);
const fmtDb = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;
const fmtDbPlain = (v) => `${v.toFixed(1)} dB`;
const fmtRatio = (v) => `${v.toFixed(1)}:1`;
const fmtMs = (v) => (v < 10 ? `${v.toFixed(1)} ms` : `${Math.round(v)} ms`);

const DEFAULT_EQ = { hpfOn: false, hpf: 80, lpfOn: false, lpf: 12000, freq: 1000, q: 0.7, gain: 0 };
const DEFAULT_COMP = { threshold: -18, ratio: 4, attack: 10, release: 120, makeup: 4 };

// Wraps the app's shared <Knob> (drag-vertical, linear) with a log-frequency
// (or any exponential-curve) mapping, so dragging a Freq/Ratio/etc. knob
// feels like "equal pixels = equal octaves/decades" instead of the huge
// 20-20000Hz range being crammed into a linear drag. Nothing about Knob.jsx
// itself needs to change — value/onChange are just warped through log2 on
// the way in/out.
function LogKnob({ label, min, max, value, onChange, fmt, accent, size, disabled }) {
  const toLog = (v) => Math.log2(v);
  const fromLog = (t) => Math.pow(2, t);
  const spec = {
    label,
    min: toLog(min),
    max: toLog(max),
    step: (toLog(max) - toLog(min)) / 500,
    fmt: (t) => fmt(fromLog(t)),
    accent,
  };
  return (
    <Knob
      spec={spec}
      value={toLog(clamp(value, min, max))}
      onChange={(t) => onChange(fromLog(t))}
      disabled={disabled}
      size={size}
    />
  );
}

// ── EQ curve math (ported from design/eq-compressor-hotspot-ui.html) ───────
const F_MIN = 20, F_MAX = 20000, EQ_RANGE_DB = 18;
const EQ_M = { l: 30, r: 6, t: 6, b: 16 };
const EQ_W = 308, EQ_H = 104;
const EQ_PW = EQ_W - EQ_M.l - EQ_M.r, EQ_PH = EQ_H - EQ_M.t - EQ_M.b;
const eqFx = (f) => EQ_M.l + (EQ_PW * Math.log(f / F_MIN)) / Math.log(F_MAX / F_MIN);
const eqGy = (db) => EQ_M.t + EQ_PH / 2 - (clamp(db, -EQ_RANGE_DB, EQ_RANGE_DB) / EQ_RANGE_DB) * (EQ_PH / 2);
function bellDb(s, f) {
  const bw = 1 / Math.max(0.15, s.q);
  const oct = Math.log2(f / s.freq);
  return s.gain * Math.exp(-((oct / bw) ** 2));
}
function eqFilterDb(s, f) {
  let db = 0;
  if (s.hpfOn && f < s.hpf) db += -24 * Math.log2(s.hpf / f);
  if (s.lpfOn && f > s.lpf) db += -24 * Math.log2(f / s.lpf);
  return db;
}
function buildEqPath(s) {
  let d = "";
  for (let i = 0; i <= 72; i++) {
    const f = F_MIN * Math.pow(F_MAX / F_MIN, i / 72);
    const db = bellDb(s, f) + eqFilterDb(s, f);
    d += `${i === 0 ? "M" : "L"} ${eqFx(f).toFixed(1)} ${eqGy(db).toFixed(1)} `;
  }
  return d.trim();
}

// ── Compressor transfer curve math ──────────────────────────────────────────
const CDB_MIN = -40, CDB_MAX = 0, COUT_MIN = -40, COUT_MAX = 20;
const CM = { l: 28, r: 6, t: 6, b: 16 };
const CW = 258, CH = 104;
const CPW = CW - CM.l - CM.r, CPH = CH - CM.t - CM.b;
const compCx = (db) => CM.l + (CPW * (db - CDB_MIN)) / (CDB_MAX - CDB_MIN);
const compCy = (db) => CM.t + CPH - (CPH * (clamp(db, COUT_MIN, COUT_MAX) - COUT_MIN)) / (COUT_MAX - COUT_MIN);
function compOut(s, db) {
  const shaped = db <= s.threshold ? db : s.threshold + (db - s.threshold) / s.ratio;
  return shaped + s.makeup;
}

function EqCompressorHotspot({ open, onClose }) {
  const moduleType = open?.type ?? null;

  // ── Faust engines (loaded once, shared by both panels) ────────────────────
  const [engineStatus, setEngineStatus] = useState("idle"); // idle|loading|ready|error
  const [engineError, setEngineError] = useState(null);
  const eqFactoryRef = useRef(null);
  const compFactoryRef = useRef(null);
  const eqGeneratorRef = useRef(null);
  const compGeneratorRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setEngineStatus("loading");
    setEngineError(null);
    (async () => {
      try {
        const [eqMeta, eqMod, compMeta, compMod] = await Promise.all([
          fetch(`${EQ_BASE_PATH}/dsp-meta.json`).then((r) => r.json()),
          compileFaustWasm(`${EQ_BASE_PATH}/dsp-module.wasm`),
          fetch(`${COMP_BASE_PATH}/dsp-meta.json`).then((r) => r.json()),
          compileFaustWasm(`${COMP_BASE_PATH}/dsp-module.wasm`),
        ]);
        if (cancelled) return;
        eqFactoryRef.current = { module: eqMod, json: JSON.stringify(eqMeta), soundfiles: {} };
        compFactoryRef.current = { module: compMod, json: JSON.stringify(compMeta), soundfiles: {} };
        eqGeneratorRef.current = new FaustMonoDspGenerator();
        compGeneratorRef.current = new FaustMonoDspGenerator();
        setEngineStatus("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("[EqCompressorHotspot] failed to load Faust engines", err);
        setEngineError(err instanceof Error ? err.message : String(err));
        setEngineStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Shared audio graph: source -> EQ -> Compressor -> studio speakers ─────
  const graphRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [grValue, setGrValue] = useState(0);

  const [eqState, setEqState] = useState(DEFAULT_EQ);
  const [compState, setCompState] = useState(DEFAULT_COMP);
  const [eqBypassed, setEqBypassed] = useState(false);
  const [compBypassed, setCompBypassed] = useState(false);
  // Mirrors of the four pieces of state above, kept live via the effects
  // just below. buildGraph() is only recreated when engineStatus changes
  // (see its own useCallback deps), so if it closed over eqState/compState
  // directly it would apply whatever they were AT THAT TIME — stale knob
  // tweaks made before the very first upload. Reading through these refs
  // instead means buildGraph() always applies whatever the knobs show right
  // now, no matter when it was created.
  const eqStateRef = useRef(eqState);
  const compStateRef = useRef(compState);
  const eqBypassedRef = useRef(eqBypassed);
  const compBypassedRef = useRef(compBypassed);
  useEffect(() => {
    eqStateRef.current = eqState;
  }, [eqState]);
  useEffect(() => {
    compStateRef.current = compState;
  }, [compState]);
  useEffect(() => {
    eqBypassedRef.current = eqBypassed;
  }, [eqBypassed]);
  useEffect(() => {
    compBypassedRef.current = compBypassed;
  }, [compBypassed]);

  const teardownGraph = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    try {
      g.source.stop();
    } catch {
      /* already stopped */
    }
    try {
      g.source.disconnect();
    } catch {
      /* ok */
    }
    try {
      g.transportGain.disconnect();
    } catch {
      /* ok */
    }
    try {
      g.eqNode.disconnect();
    } catch {
      /* ok */
    }
    try {
      g.merger.disconnect();
    } catch {
      /* ok */
    }
    try {
      g.compNode.disconnect();
    } catch {
      /* ok */
    }
    g.speakerBus?.dispose();
    graphRef.current = null;
    setIsPlaying(false);
    setGrValue(0);
  }, []);

  const buildGraph = useCallback(
    async (arrayBuffer) => {
      if (engineStatus !== "ready" || !eqGeneratorRef.current || !compGeneratorRef.current) {
        setUploadError("The Faust engines are still loading — try again in a moment.");
        return;
      }
      setUploadError("");
      initAudio();
      resumeAudio();
      const ctx = getAudioContext();
      if (!ctx) {
        setUploadError("Could not start the audio engine.");
        return;
      }
      if (ctx.state === "suspended") await ctx.resume();

      let audioBuffer;
      try {
        audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      } catch (err) {
        console.error("[EqCompressorHotspot] failed to decode uploaded audio", err);
        setUploadError("Could not decode that audio file.");
        return;
      }

      teardownGraph();

      let eqNode, compNode;
      try {
        eqNode = await eqGeneratorRef.current.createNode(ctx, "ParamEQ", eqFactoryRef.current, false, 512);
        compNode = await compGeneratorRef.current.createNode(ctx, "compressor", compFactoryRef.current, false, 512);
      } catch (err) {
        console.error("[EqCompressorHotspot] failed to build Faust nodes", err);
        setUploadError("Could not start the Faust engine — see console for details.");
        return;
      }

      applyEqParams(eqNode, eqStateRef.current, eqBypassedRef.current);
      applyCompParams(compNode, compStateRef.current, compBypassedRef.current);

      setGrValue(0);
      compNode.setOutputParamHandler?.((path, value) => {
        if (path === COMP_ADDR.gr) setGrValue(clamp(-value, 0, 24));
      });

      // The compressor DSP declares 2 audio inputs (main + sidechain
      // detector) exposed as one 2-channel input — merge the EQ's output
      // onto both channels for a self-sidechain (no external sidechain
      // source here), mirroring chapters/Compressor.jsx's
      // connectMainAndSidechain().
      const merger = ctx.createChannelMerger(2);
      eqNode.connect(merger, 0, 0);
      eqNode.connect(merger, 0, 1);
      merger.connect(compNode);

      const speakerBus = createStudioSpeakerBus();

      const transportGain = ctx.createGain();
      transportGain.gain.value = 1;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.loop = true;
      source.connect(transportGain).connect(eqNode);

      if (speakerBus) {
        compNode.connect(speakerBus.input);
      } else {
        // Shouldn't normally happen (initAudio() above ensures a context),
        // but stay audible rather than silently doing nothing.
        compNode.connect(ctx.destination);
      }

      source.start();

      graphRef.current = { ctx, source, transportGain, eqNode, merger, compNode, speakerBus };
      setIsPlaying(true);
    },
    [engineStatus, teardownGraph],
  );

  // Stops audio + tears down the Faust audio graph whenever the panel is
  // closed OR switched to the other module (moduleType changing at all —
  // 'eq'/'compressor' -> null, or 'eq' <-> 'compressor'). This is a cleanup
  // function, not the effect body: React runs it right before re-running the
  // effect for a new moduleType (or on unmount), i.e. exactly on the
  // "leaving whichever module was open" transition, which is what should
  // silence playback — opening a module for the first time (null -> a type)
  // has no prior cleanup to run, so nothing is torn down that shouldn't be.
  useEffect(() => {
    return () => {
      teardownGraph();
      setFileName("");
      setUploadError("");
    };
  }, [moduleType, teardownGraph]);

  // Live param pushes whenever a knob moves and a graph already exists.
  useEffect(() => {
    if (graphRef.current) applyEqParams(graphRef.current.eqNode, eqState, eqBypassed);
  }, [eqState, eqBypassed]);
  useEffect(() => {
    if (graphRef.current) applyCompParams(graphRef.current.compNode, compState, compBypassed);
  }, [compState, compBypassed]);

  const handleFile = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setFileName(file.name);
      try {
        const arrayBuffer = await file.arrayBuffer();
        await buildGraph(arrayBuffer);
      } catch (err) {
        console.error("[EqCompressorHotspot] upload failed", err);
        setUploadError("Could not load that file.");
      }
    },
    [buildGraph],
  );

  const togglePlay = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    const next = !isPlaying;
    g.transportGain.gain.setTargetAtTime(next ? 1 : 0, g.ctx.currentTime, 0.01);
    setIsPlaying(next);
  }, [isPlaying]);

  if (!moduleType) return null;

  const audioBar = (idPrefix) => (
    <div className="eqcomp-audio-bar">
      <input
        type="file"
        accept="audio/*"
        id={`eqcomp-file-${idPrefix}`}
        className="eqcomp-audio-file-input"
        onChange={handleFile}
      />
      <label htmlFor={`eqcomp-file-${idPrefix}`} className="eqcomp-audio-upload-btn">
        Upload audio
      </label>
      <div className={"eqcomp-audio-name" + (fileName ? " loaded" : "")}>
        {fileName || "No file loaded"}
      </div>
      <button
        type="button"
        className={"eqcomp-audio-play-btn" + (isPlaying ? " playing" : "")}
        disabled={!fileName}
        onClick={togglePlay}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
    </div>
  );

  return (
    <div className="chapter-lab eqcomp-root">
      {moduleType === "eq" && (
        <div className="eqcomp-panel">
          <div className="eqcomp-panel__head">
            <div className="eqcomp-panel__badge">🎚</div>
            <div className="eqcomp-panel__titles">
              <div className="eqcomp-panel__title">{open.title || "Channel EQ"}</div>
              <div className="eqcomp-panel__kicker">EQ hotspot · Faust ParamEQ</div>
            </div>
            <button className="eqcomp-panel__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <div className="eqcomp-panel__body">
            {audioBar("eq")}
            {uploadError && <div className="eqcomp-engine-error">{uploadError}</div>}
            {engineStatus === "loading" && (
              <div className="eqcomp-engine-status">Loading Faust EQ engine…</div>
            )}
            {engineStatus === "error" && (
              <div className="eqcomp-engine-error">Faust engine failed to load: {engineError}</div>
            )}

            <div className="eqcomp-screen">
              <div className="eqcomp-screen-label">
                <span>RESPONSE</span>
                <span className="val">20 Hz–20 kHz</span>
              </div>
              <svg viewBox={`0 0 ${EQ_W} ${EQ_H}`} width={EQ_W} height={EQ_H} style={{ display: "block", maxWidth: "100%" }}>
                <g>
                  {[-18, -9, 0, 9, 18].map((db) => (
                    <g key={db}>
                      <line
                        className={"eqcomp-axis-line" + (db === 0 ? " zero" : "")}
                        x1={EQ_M.l}
                        x2={EQ_M.l + EQ_PW}
                        y1={eqGy(db)}
                        y2={eqGy(db)}
                      />
                      <text className="eqcomp-axis-tick" x={EQ_M.l - 5} y={eqGy(db) + 2.6} textAnchor="end">
                        {db > 0 ? `+${db}` : db}
                      </text>
                    </g>
                  ))}
                  {[20, 100, 1000, 10000, 20000].map((f, i, arr) => (
                    <g key={f}>
                      <line className="eqcomp-axis-line" x1={eqFx(f)} x2={eqFx(f)} y1={EQ_M.t} y2={EQ_M.t + EQ_PH} />
                      <text
                        className="eqcomp-axis-tick"
                        x={eqFx(f)}
                        y={EQ_H - 4}
                        textAnchor={i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle"}
                      >
                        {f >= 1000 ? `${f / 1000}k` : f}
                      </text>
                    </g>
                  ))}
                </g>
                {eqState.hpfOn && (
                  <line
                    x1={eqFx(eqState.hpf)}
                    x2={eqFx(eqState.hpf)}
                    y1={EQ_M.t}
                    y2={EQ_M.t + EQ_PH}
                    stroke="#2DD4BF"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                    opacity="0.5"
                  />
                )}
                {eqState.lpfOn && (
                  <line
                    x1={eqFx(eqState.lpf)}
                    x2={eqFx(eqState.lpf)}
                    y1={EQ_M.t}
                    y2={EQ_M.t + EQ_PH}
                    stroke="#2DD4BF"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                    opacity="0.5"
                  />
                )}
                <path d={buildEqPath(eqState)} fill="none" stroke="#4D9EFF" strokeWidth="2" strokeLinejoin="round" />
                <circle
                  cx={eqFx(eqState.freq)}
                  cy={eqGy(bellDb(eqState, eqState.freq) + eqFilterDb(eqState, eqState.freq))}
                  r="3"
                  fill="#4D9EFF"
                />
              </svg>
            </div>

            <div>
              <div className="eqcomp-filter-header">
                <span className="knob-name" style={{ letterSpacing: ".1em" }}>
                  FILTERS
                </span>
              </div>
              <div className="eqcomp-knob-rack filters">
                <div>
                  <div className="eqcomp-filter-header" style={{ marginBottom: 2 }}>
                    <div
                      className={"eqcomp-filter-toggle" + (eqState.hpfOn ? " on" : "")}
                      onClick={() => setEqState((s) => ({ ...s, hpfOn: !s.hpfOn }))}
                      role="switch"
                      aria-checked={eqState.hpfOn}
                      tabIndex={0}
                    >
                      <span className="thumb" />
                    </div>
                  </div>
                  <LogKnob
                    label="HPF"
                    min={20}
                    max={500}
                    value={eqState.hpf}
                    disabled={!eqState.hpfOn}
                    onChange={(v) => setEqState((s) => ({ ...s, hpf: v }))}
                    fmt={fmtFreq}
                    accent="var(--teal)"
                    size={46}
                  />
                </div>
                <div>
                  <div className="eqcomp-filter-header" style={{ marginBottom: 2 }}>
                    <div
                      className={"eqcomp-filter-toggle" + (eqState.lpfOn ? " on" : "")}
                      onClick={() => setEqState((s) => ({ ...s, lpfOn: !s.lpfOn }))}
                      role="switch"
                      aria-checked={eqState.lpfOn}
                      tabIndex={0}
                    >
                      <span className="thumb" />
                    </div>
                  </div>
                  <LogKnob
                    label="LPF"
                    min={2000}
                    max={20000}
                    value={eqState.lpf}
                    disabled={!eqState.lpfOn}
                    onChange={(v) => setEqState((s) => ({ ...s, lpf: v }))}
                    fmt={fmtFreq}
                    accent="var(--teal)"
                    size={46}
                  />
                </div>
              </div>
            </div>

            <div className="eqcomp-rack-divider">PARAMETRIC BAND</div>

            <div className="eqcomp-knob-rack">
              <LogKnob
                label="Freq"
                min={20}
                max={20000}
                value={eqState.freq}
                onChange={(v) => setEqState((s) => ({ ...s, freq: v }))}
                fmt={fmtFreq}
                accent="var(--blue)"
              />
              <LogKnob
                label="Q"
                min={0.1}
                max={10}
                value={eqState.q}
                onChange={(v) => setEqState((s) => ({ ...s, q: v }))}
                fmt={fmtQ}
                accent="var(--blue)"
              />
              <Knob
                spec={{ label: "Gain", min: -18, max: 18, step: 0.1, fmt: fmtDb, accent: "var(--blue)" }}
                value={eqState.gain}
                onChange={(v) => setEqState((s) => ({ ...s, gain: v }))}
              />
            </div>
          </div>

          <div className="eqcomp-panel__footer">
            <div className="eqcomp-hint">Drag a knob to adjust</div>
            <label
              className={"eqcomp-pill-toggle" + (eqBypassed ? " on" : "")}
              onClick={() => setEqBypassed((v) => !v)}
            >
              <span className="eqcomp-pill-toggle__track">
                <span className="eqcomp-pill-toggle__thumb" />
              </span>
              Bypass
            </label>
            <button className="eqcomp-btn-reset" onClick={() => setEqState(DEFAULT_EQ)}>
              Reset
            </button>
          </div>
        </div>
      )}

      {moduleType === "compressor" && (
        <div className="eqcomp-panel">
          <div className="eqcomp-panel__head">
            <div className="eqcomp-panel__badge eqcomp-panel__badge--comp">🎛</div>
            <div className="eqcomp-panel__titles">
              <div className="eqcomp-panel__title">{open.title || "Compressor"}</div>
              <div className="eqcomp-panel__kicker">Dynamics hotspot · Faust Compressor</div>
            </div>
            <button className="eqcomp-panel__close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <div className="eqcomp-panel__body">
            {audioBar("comp")}
            {uploadError && <div className="eqcomp-engine-error">{uploadError}</div>}
            {engineStatus === "loading" && (
              <div className="eqcomp-engine-status">Loading Faust compressor engine…</div>
            )}
            {engineStatus === "error" && (
              <div className="eqcomp-engine-error">Faust engine failed to load: {engineError}</div>
            )}

            <div className="eqcomp-screen">
              <div className="eqcomp-screen-label">
                <span>TRANSFER</span>
                <span className="val">dB in → dB out</span>
              </div>
              <div className="eqcomp-comp-scope-row">
                <div className="eqcomp-gr-col">
                  <div className="eqcomp-gr-col-lbl">GR</div>
                  <div className="eqcomp-gr-bar-track">
                    <div className="eqcomp-gr-bar-fill" style={{ height: `${((grValue / 24) * 100).toFixed(1)}%` }} />
                  </div>
                  <div className="eqcomp-gr-col-num">{grValue.toFixed(1)}</div>
                  <div className="eqcomp-gr-col-status">{grValue > 0.3 ? "active" : "idle"}</div>
                </div>
                <svg viewBox={`0 0 ${CW} ${CH}`} width={CW} height={CH} style={{ display: "block", maxWidth: "100%" }}>
                  <g>
                    {[-40, -20, 0].map((db) => (
                      <g key={`x${db}`}>
                        <line
                          className={"eqcomp-axis-line" + (db === 0 ? " zero" : "")}
                          x1={compCx(db)}
                          x2={compCx(db)}
                          y1={CM.t}
                          y2={CM.t + CPH}
                        />
                        <text
                          className="eqcomp-axis-tick"
                          x={compCx(db)}
                          y={CH - 4}
                          textAnchor={db === CDB_MIN ? "start" : db === CDB_MAX ? "end" : "middle"}
                        >
                          {db}
                        </text>
                      </g>
                    ))}
                    {[-40, -20, 0, 20].map((db) => (
                      <g key={`y${db}`}>
                        <line
                          className={"eqcomp-axis-line" + (db === 0 ? " zero" : "")}
                          x1={CM.l}
                          x2={CM.l + CPW}
                          y1={compCy(db)}
                          y2={compCy(db)}
                        />
                        <text className="eqcomp-axis-tick" x={CM.l - 5} y={compCy(db) + 2.6} textAnchor="end">
                          {db > 0 ? `+${db}` : db}
                        </text>
                      </g>
                    ))}
                  </g>
                  <line
                    x1={compCx(CDB_MIN)}
                    y1={compCy(CDB_MIN)}
                    x2={compCx(CDB_MAX)}
                    y2={compCy(CDB_MAX)}
                    stroke="#2E2E3D"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                  <path
                    d={`M ${compCx(CDB_MIN).toFixed(1)} ${compCy(compOut(compState, CDB_MIN)).toFixed(1)} L ${compCx(
                      compState.threshold,
                    ).toFixed(1)} ${compCy(compOut(compState, compState.threshold)).toFixed(1)} L ${compCx(
                      CDB_MAX,
                    ).toFixed(1)} ${compCy(compOut(compState, CDB_MAX)).toFixed(1)}`}
                    fill="none"
                    stroke="#F5A623"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={compCx(compState.threshold)}
                    cy={compCy(compOut(compState, compState.threshold))}
                    r="3"
                    fill="#F5A623"
                  />
                </svg>
              </div>
            </div>

            <div className="eqcomp-knob-rack">
              <Knob
                spec={{ label: "Thresh", min: -40, max: 0, step: 0.5, fmt: fmtDbPlain, accent: "var(--amber)" }}
                value={compState.threshold}
                onChange={(v) => setCompState((s) => ({ ...s, threshold: v }))}
              />
              <LogKnob
                label="Ratio"
                min={1}
                max={20}
                value={compState.ratio}
                onChange={(v) => setCompState((s) => ({ ...s, ratio: v }))}
                fmt={fmtRatio}
                accent="var(--amber)"
              />
              <LogKnob
                label="Attack"
                min={0.1}
                max={100}
                value={compState.attack}
                onChange={(v) => setCompState((s) => ({ ...s, attack: v }))}
                fmt={fmtMs}
                accent="var(--amber)"
              />
              <LogKnob
                label="Release"
                min={10}
                max={1000}
                value={compState.release}
                onChange={(v) => setCompState((s) => ({ ...s, release: v }))}
                fmt={fmtMs}
                accent="var(--amber)"
              />
              <Knob
                spec={{ label: "Makeup", min: 0, max: 24, step: 0.1, fmt: fmtDb, accent: "var(--amber)" }}
                value={compState.makeup}
                onChange={(v) => setCompState((s) => ({ ...s, makeup: v }))}
              />
            </div>
          </div>

          <div className="eqcomp-panel__footer">
            <div className="eqcomp-hint">Drag a knob to adjust</div>
            <label
              className={"eqcomp-pill-toggle" + (compBypassed ? " on" : "")}
              onClick={() => setCompBypassed((v) => !v)}
            >
              <span className="eqcomp-pill-toggle__track">
                <span className="eqcomp-pill-toggle__thumb" />
              </span>
              Bypass
            </label>
            <button className="eqcomp-btn-reset" onClick={() => setCompState(DEFAULT_COMP)}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EqCompressorHotspot;
