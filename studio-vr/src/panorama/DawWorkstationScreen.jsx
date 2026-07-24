import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaustMonoDspGenerator } from "@grame/faustwasm";
import { compileFaustWasm } from "../faust/faustTypes";
import {
  initAudio,
  resumeAudio,
  getAudioContext,
  createStudioSpeakerBus,
  stopAmbientBed,
  setRoomAmbience,
  stopRoomBleed,
  startRoomBleed,
} from "../audio/spatialAudioEngine";
import { GateEditorPanel } from "../chapters/NoiseGate";
import {
  DEFAULTS as GATE_DEFAULTS,
  DEFAULT_SIDECHAIN as GATE_DEFAULT_SIDECHAIN,
  pushFaustParams as pushGateParams,
  analyserPeakDb,
} from "../chapters/gateEngine";
import { DeEsserEditorPanel } from "../chapters/DeEsser";
import {
  DEFAULTS as DEESS_DEFAULTS,
  ADDR as DEESS_ADDR,
  pushFaustParams as pushDeEsserParams,
} from "../chapters/deEsserEngine";
import { CompressorEditorPanel } from "../chapters/Compressor";
import {
  BAND_IDS as COMP_BAND_IDS,
  makeDefaultBands as makeDefaultCompBands,
  DEFAULT_CROSSOVER as COMP_DEFAULT_CROSSOVER,
  DEFAULT_SIDECHAIN as COMP_DEFAULT_SIDECHAIN,
  DEFAULT_OUTPUT_GAIN as COMP_DEFAULT_OUTPUT_GAIN,
  DEFAULT_MULTIBAND as COMP_DEFAULT_MULTIBAND,
  ADDR as COMP_ADDR,
  pushFaustParams as pushCompParams,
} from "../chapters/compressorEngine";
import { LimiterEditorPanel } from "../chapters/Limiter";
import {
  DEFAULTS as LIMITER_DEFAULTS,
  ADDR as LIMITER_ADDR,
  pushFaustParams as pushLimiterParams,
} from "../chapters/limiterEngine";
import { DelayEditorPanel } from "../chapters/Delay";
import {
  DEFAULTS as DELAY_DEFAULTS,
  DEFAULT_SYNC,
  pushFaustParams as pushDelayParams,
  analyserPeakLinear,
} from "../chapters/delayEngine";
import { ReverbEditorPanel } from "../chapters/Reverb";
import {
  DEFAULTS as REVERB_DEFAULTS,
  DEFAULT_PRESET,
  pushFaustParams as pushReverbParams,
} from "../chapters/reverbEngine";
import { EqualizerEditorPanel } from "../chapters/Equalizer";
import {
  DEFAULT_BANDS as EQ_DEFAULT_BANDS,
  LIVE_GAIN_ADDR_TO_BAND,
  ANALYSER_MIN_DB,
  ANALYSER_MAX_DB,
  applyBandsToNode as applyEqBandsToNode,
  applyOutputGain as applyEqOutputGain,
} from "../chapters/equalizerEngine";
import { downloadAudioBufferAsWav } from "../audio/wavRender";
import "../chapters/chapters.css";
import "./dawWorkstationScreen.css";

// ═══════════════════════════════════════════════════════════════════════════
// DAW Workstation hotspot — panorama/DawWorkstationScreen.jsx
// ═══════════════════════════════════════════════════════════════════════════
// A multi-track MIX workstation: any number of real audio tracks (each a
// built-in demo loop, or a file the student uploads) sit side-by-side as
// mixer channel strips. Each track owns its own ordered insert chain (the
// same seven Faust-WASM plugin inserts the single-track version used —
// public/faust/ParamEQ, compressor, limiter, Gate, deesser, delay, reverb —
// see PLUGIN_DEFS below), applied to the WHOLE track, exactly like the
// original single-chain version of this screen — click a track in the
// tracklist to edit it in the bottom dock. On top of that, a track can also
// have any number of independent, non-overlapping PORTIONS — drag directly
// on the clip's waveform body to mark one (see
// beginRegionDrag/onRegionPointerMove/endRegionDrag below) — each with its
// OWN separate chain that runs IN SERIES AFTER the track's own chain, and
// ONLY within that portion's own time range (see
// computeSegments/wireLiveChain below for how the live graph layers these,
// and buildOfflineTrackOutput for the offline/download equivalent). Both
// scopes — the track's own chain, and any one of its portions' — are edited
// through the exact same dock/popup UI and the exact same
// (trackId, regionId) addressing (see TRACK_CHAIN_SCOPE/getChainArray),
// just pointed at different chain arrays. Clicking a portion selects it —
// highlighting it, switching the dock to its own chain, and scoping the
// transport to a preview loop of just that portion (see
// getPreviewWindow/playFrom); "✕ Exit Selection" (in the dock or the
// topbar, or Escape) deselects it, switches the dock back to the track's
// own whole-track chain, and returns Play to the whole arrangement. The
// thin strip at the top of each clip (.clip-header) is the drag handle for
// moving the track's own start position — dragging anywhere in the
// waveform body below it instead draws a new portion. Tracks can be added
// (upload or demo), removed, or have their audio replaced at any time
// (which clears that track's portions, since their time ranges wouldn't
// line up with new audio — the track's own whole-track chain isn't
// time-indexed, so it's left alone); each one plays back in sync with the
// others through its own chain(s) into a shared master bus. Clicking a
// chain chip opens that plugin's full editor in a popup: each plugin
// reuses its own standalone chapter lab's exact *EditorPanel component
// (GateEditorPanel, DeEsserEditorPanel, CompressorEditorPanel,
// LimiterEditorPanel, DelayEditorPanel, ReverbEditorPanel,
// EqualizerEditorPanel) — the real controls, curves, meters and live scope
// each lab already has — driven by this screen's own per-track/per-scope/
// per-slot Faust node/audio graph (see wireLiveChain/playFrom below)
// instead of a generic knob renderer. Opening a popup auto-previews by
// looping the mix (or just the selected portion) so the change is audible
// immediately.

const PLUGIN_DEFS = [
  { key: "gate", name: "Noise Gate", tag: "Dynamics", color: "green", basePath: "/faust/Gate", wiring: "selfSidechain3" },
  { key: "deess", name: "De-Esser", tag: "Dynamics", color: "purple", basePath: "/faust/deesser", wiring: "direct" },
  { key: "eq", name: "Equalizer", tag: "Tone", color: "teal", basePath: "/faust/ParamEQ", wiring: "direct" },
  { key: "comp", name: "Compressor", tag: "Dynamics", color: "amber", basePath: "/faust/compressor", wiring: "selfSidechain2" },
  { key: "limiter", name: "Limiter", tag: "Dynamics", color: "red", basePath: "/faust/limiter", wiring: "direct" },
  { key: "delay", name: "Delay", tag: "Send", color: "blue", basePath: "/faust/delay", wiring: "direct" },
  { key: "reverb", name: "Reverb", tag: "Send", color: "cyan", basePath: "/faust/reverb", wiring: "direct" },
];

const PLUGIN_ICON_PATHS = {
  gate: [{ d: "M4 4v16M20 4v16M4 12h6M14 12h6", cap: "round" }],
  deess: [
    { d: "M6 17c3 0 3-10 6-10s3 10 6 10", cap: "round", join: "round" },
    { d: "M3 21L21 3", cap: "round" },
  ],
  eq: [{ d: "M3 12h4l2-6 3 15 3-11 2 8 2-6h2", cap: "round", join: "round" }],
  comp: [
    { d: "M2 17c4 0 4-11 8-11s4 11 8 11 4-6 4-6", cap: "round", join: "round" },
    { d: "M2 7h20", opacity: 0.4 },
  ],
  limiter: [
    { d: "M3 16c3 0 4-9 7-9s2 9 5 9 3-5 6-5", cap: "round" },
    { d: "M3 7h18", opacity: 0.4 },
  ],
  delay: [{ circle: [6, 12, 3] }, { circle: [13, 12, 2.4], opacity: 0.7 }, { circle: [19, 12, 1.8], opacity: 0.45 }],
  reverb: [
    { d: "M4 12a3 3 0 0 1 3-3M4 12a6 6 0 0 1 6-6M4 12a9 9 0 0 1 9-9", cap: "round" },
    { circle: [4, 12, 1.4], fill: true },
  ],
};

function PluginIcon({ pkey }) {
  const parts = PLUGIN_ICON_PATHS[pkey] || [];
  return (
    <svg className="plugin-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      {parts.map((p, i) =>
        p.circle ? (
          <circle
            key={i}
            cx={p.circle[0]}
            cy={p.circle[1]}
            r={p.circle[2]}
            opacity={p.opacity}
            fill={p.fill ? "currentColor" : "none"}
            stroke={p.fill ? "none" : "currentColor"}
          />
        ) : (
          <path key={i} d={p.d} strokeLinecap={p.cap} strokeLinejoin={p.join} opacity={p.opacity} />
        ),
      )}
    </svg>
  );
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, "0")}`;
}

// ── Track colors — cycled across channel strips as they're added ──────────
const TRACK_COLORS = ["teal", "amber", "blue", "purple", "green", "red", "cyan"];

// A portion needs at least this many seconds of length to be kept — filters
// out a stray click (zero-length drag) on the waveform from creating a
// degenerate region.
const MIN_REGION_LEN = 0.05;

// Sentinel `regionId` meaning "the track's own whole-track chain" rather
// than one of its portions — lets every chain-management function
// (addOrSelectPlugin, removePlugin, wireLiveChain's runtime addressing,
// etc.) address either scope through the exact same
// `(trackId, regionId)` pair (see getChainArray/withChainArray below),
// instead of duplicating each of those functions once per scope.
const TRACK_CHAIN_SCOPE = "__track__";

// A portion's OWN "outer" pre-chain — a second, portion-private chain that
// runs before that portion's own chain but, unlike the track's whole-track
// chain, never plays during gaps or other portions. Addressed via a
// suffixed regionId (`${region.id}::outer`) so it slots into the exact same
// `(trackId, regionId)` addressing as the whole-track and portion-own
// scopes — see outerScopeId/isOuterScope/baseRegionId + getChainArray/
// withChainArray below.
const OUTER_CHAIN_SUFFIX = "::outer";
function outerScopeId(regionId) {
  return `${regionId}${OUTER_CHAIN_SUFFIX}`;
}
function isOuterScope(regionId) {
  return typeof regionId === "string" && regionId.endsWith(OUTER_CHAIN_SUFFIX);
}
function baseRegionId(regionId) {
  return isOuterScope(regionId) ? regionId.slice(0, -OUTER_CHAIN_SUFFIX.length) : regionId;
}

// Fallback room-tone profile used to restore the ambient bed when this
// screen closes (see the isOpen/ambient-bed effect below) — this screen
// doesn't know which room's own custom ambience (see roomsData.js) was
// playing before it opened, so it restores the same generic default
// PanoramaTour.jsx itself falls back to, rather than silence forever.
// Mirrors spatialAudioEngine's own (unexported) DEFAULT_AMBIENCE.
const DEFAULT_AMBIENCE = { filterFreq: 500, gain: 0.03, gustDepth: 0.015 };

// Same fallback reasoning as DEFAULT_AMBIENCE above, for the recording-room
// bleed (see startRoomBleed()/stopRoomBleed() in spatialAudioEngine.js and
// the `roomBleed` field in roomsData.js) — this screen doesn't know which
// room's bleed was playing, but the DAW hotspot only ever exists in the
// Studio room (see `interactiveMarkers` in roomsData.js), so this just
// mirrors that room's own roomBleed profile.
const ROOM_BLEED = {
  audio: "/audio/AndresGuazzelli_FloresDeAbril_Full/02_Piano.wav",
  yaw: 127.7,
  pitch: 0.4,
};

// ── Demo audio: real multitrack stems from a recording of Dvořák's
// "Hungarian Dance No. 5" (arr. Bolz & Knecht) — see
// public/audio/BolzAndKnecht_HungarianDanceNo5_Full/Readme.txt (educational
// use only, per that recording's own license). The mix seeds with all
// three as its default tracks the first time the DAW opens (see the
// seed-the-mix effect below); each track's own "D" demo button lets you
// pick any one of the three to (re)load onto it instead, via the dropdown
// next to it.
const DEMO_CLIPS = [
  { id: "acousticGtr", name: "Hungarian Dance No. 5 — Acoustic Gtr", url: "/audio/BolzAndKnecht_HungarianDanceNo5_Full/01_AcousticGtr.wav" },
  { id: "acousticGtrDI", name: "Hungarian Dance No. 5 — Acoustic Gtr DI", url: "/audio/BolzAndKnecht_HungarianDanceNo5_Full/02_AcousticGtrDI.wav" },
  { id: "saxophone", name: "Hungarian Dance No. 5 — Saxophone", url: "/audio/BolzAndKnecht_HungarianDanceNo5_Full/03_Saxophone.wav" },
];

// ── Synthetic fallback (used only if a real demo clip above fails to load
// — e.g. offline — so the DAW isn't left completely broken) ───────────────
function normAndFade(buf, peakTarget = 0.3) {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const scale = peakTarget / Math.max(peak, 0.001);
  for (let i = 0; i < L.length; i++) {
    L[i] *= scale;
    R[i] *= scale;
  }
  const sr = buf.sampleRate;
  const fadeN = Math.round(sr * 0.02);
  for (let i = 0; i < fadeN; i++) {
    const f = i / fadeN;
    L[i] *= f;
    R[i] *= f;
    const idx = L.length - 1 - i;
    L[idx] *= f;
    R[idx] *= f;
  }
}
function createDemoLoopBuffer(ctx) {
  const sr = ctx.sampleRate;
  const dur = 6;
  const buf = ctx.createBuffer(2, sr * dur, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const padNotes = [110.0, 130.81, 164.81, 196.0, 261.63];
  const harmonics = [
    [1, 1.0],
    [2, 0.35],
    [3, 0.18],
    [4, 0.09],
    [5, 0.05],
  ];
  for (const fund of padNotes) {
    for (const [ratio, amp] of harmonics) {
      const freq = fund * ratio;
      if (freq > sr / 2) continue;
      for (let n = 0; n < L.length; n++) {
        const t = n / sr;
        const env = Math.min(1, t / 0.4) * amp * 0.22;
        const s = Math.sin(2 * Math.PI * freq * t) * env;
        L[n] += s * 0.9;
        R[n] += s * 1.1;
      }
    }
  }
  const bassFreqs = [41.2, 55.0];
  for (let beat = 0; beat < 12; beat++) {
    const start = Math.round(beat * 0.5 * sr);
    const freq = bassFreqs[beat % 2];
    for (let i = 0; i < Math.round(0.45 * sr) && start + i < L.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 4) * 0.5;
      const s = Math.sin(2 * Math.PI * freq * t) * env;
      L[start + i] += s;
      R[start + i] += s;
    }
  }
  for (let e = 0; e < 48; e++) {
    const start = Math.round(e * 0.25 * sr);
    let prev = 0;
    for (let i = 0; i < Math.round(sr * 0.05) && start + i < L.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 45) * 0.18;
      const n = Math.random() * 2 - 1;
      const hp = n - prev * 0.94;
      prev = n;
      L[start + i] += hp * env;
      R[start + i] += hp * env;
    }
  }
  normAndFade(buf);
  return buf;
}

function computePeaks(buffer, buckets = 220) {
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  const len = buffer.length;
  const perBucket = Math.max(1, Math.floor(len / buckets));
  const peaks = new Array(buckets);
  for (let b = 0; b < buckets; b++) {
    const start = b * perBucket;
    const end = Math.min(len, start + perBucket);
    let min = 0,
      max = 0;
    for (let i = start; i < end; i++) {
      let v = 0;
      for (let c = 0; c < chans.length; c++) v += chans[c][i];
      v /= chans.length;
      if (v > max) max = v;
      if (v < min) min = v;
    }
    peaks[b] = [min, max];
  }
  return peaks;
}

function wireSlotNode(ctx, inputNode, slot) {
  if (slot.wiring === "selfSidechain2") {
    const merger = ctx.createChannelMerger(2);
    inputNode.connect(merger, 0, 0);
    inputNode.connect(merger, 0, 1);
    merger.connect(slot.node);
    return slot.node;
  }
  if (slot.wiring === "selfSidechain3") {
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(3);
    inputNode.connect(splitter);
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 1);
    inputNode.connect(merger, 0, 2);
    merger.connect(slot.node);
    return slot.node;
  }
  inputNode.connect(slot.node);
  return slot.node;
}

// Splits a track's [0, duration) into an ordered list of non-overlapping
// segments: gaps (`region: null`, played dry) and the track's own portions
// (`region: <the portion object>`, played through that portion's own chain
// — see wireLiveChain/buildOfflineChain). Portions are expected to already
// be non-overlapping (createRegion below only ever carves a new one out of
// a free gap), but this still sorts + clamps defensively so a malformed
// portion can't produce a negative-length or out-of-order segment.
function computeSegments(track) {
  const duration = track?.buffer?.duration ?? 0;
  if (duration <= 0) return [];
  const regions = [...(track.regions || [])]
    .map((r) => ({ ...r, start: clamp(r.start, 0, duration), end: clamp(r.end, 0, duration) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const segments = [];
  let cursor = 0;
  for (const r of regions) {
    if (r.start < cursor) continue; // overlaps the previous portion — skip rather than double-schedule
    if (r.start > cursor) segments.push({ start: cursor, end: r.start, region: null });
    segments.push({ start: r.start, end: r.end, region: r });
    cursor = r.end;
  }
  if (cursor < duration) segments.push({ start: cursor, end: duration, region: null });
  return segments;
}

// Resolves which chain array a `(trackId, regionId)` pair addresses:
// `track.chain` itself (the whole-track chain) when `regionId ===
// TRACK_CHAIN_SCOPE`, a portion's private `outerChain` when `regionId` is
// outer-suffixed (see outerScopeId above), or that portion's own `chain`
// otherwise. Every chain-management function below (addOrSelectPlugin,
// removePlugin, movePlugin, reorderPlugin, toggleBypass, updateSlot) goes
// through this pair so all three scopes are edited by the exact same code
// path.
function getChainArray(track, regionId) {
  if (!track) return undefined;
  if (regionId === TRACK_CHAIN_SCOPE) return track.chain;
  if (isOuterScope(regionId)) {
    const region = track.regions.find((r) => r.id === baseRegionId(regionId));
    if (!region) return undefined;
    // Until a portion's outer chain has been explicitly customized (see
    // forkOuterChainIfNeeded below), its "Outer (this portion)" scope is
    // just a read-through of the track's OWN whole-chain plugins — same
    // slots, same order — because that's what's actually already affecting
    // this portion (the track chain runs upstream of every portion,
    // customized or not). This also covers the case `region.outerChain`
    // itself is `undefined` (not `[]`) for a portion whose in-memory shape
    // predates this field — e.g. one created under a dev-server session
    // before the outer-chain feature landed and preserved across hot-reload
    // — which would otherwise make every falsy-guarded read (the dock's
    // render check, addOrSelectPlugin's early-return, etc.) treat the
    // portion as having no outer chain at all instead of an empty one, so
    // the dock silently rendered nothing.
    return region.outerCustomized ? region.outerChain || [] : track.chain;
  }
  return track.regions.find((r) => r.id === regionId)?.chain;
}

// Returns a new track with the chain at `regionId` replaced by `chain` —
// the write-side counterpart of getChainArray above. Any write to an outer
// scope also stamps `outerCustomized: true` — the moment a portion's outer
// chain is actually written to (add/remove/reorder/bypass/param-change —
// see forkOuterChainIfNeeded, which is what seeds `chain` with a private
// snapshot the very first time this fires for a given portion) it stops
// being a read-through of the track's chain and becomes this portion's own,
// independent of the track chain and every other portion from then on.
function withChainArray(track, regionId, chain) {
  if (regionId === TRACK_CHAIN_SCOPE) return { ...track, chain };
  if (isOuterScope(regionId)) {
    const rid = baseRegionId(regionId);
    return {
      ...track,
      regions: track.regions.map((r) => (r.id === rid ? { ...r, outerChain: chain, outerCustomized: true } : r)),
    };
  }
  return { ...track, regions: track.regions.map((r) => (r.id === regionId ? { ...r, chain } : r)) };
}

// Disconnects every live Faust node in a chain array — used whenever a
// chain (the track's own, or one of its portions') is torn down: track
// removal, audio replacement, portion deletion, or closing the DAW.
function disconnectChainSlots(chain) {
  chain.forEach((slot) => {
    try {
      slot.node?.disconnect();
    } catch {
      /* ok */
    }
  });
}

// Wires one portion's own ordered insert chain (in order, respecting
// per-slot Bypass) onto `source` — the live-graph equivalent of
// buildOfflineChain below, plus the analysers/meters every open plugin
// editor reads from (slotRuntimeRef/meterValuesRef/eqRuntimeRef, keyed by
// `${trackId}:${regionId}[:${slotKey}]` so two portions running the same
// plugin type never collide). Returns the chain's tail node the caller
// connects onward (to that track's own volume/mute gain).
function wireLiveChain(ctx, source, chain, trackId, regionId, refs) {
  const activeChain = chain.filter((s) => s.node && s.status === "ready");
  let chainOut = source;
  const extraNodes = [];
  activeChain.forEach((slot) => {
    const slotIn = ctx.createGain();
    const bypassGain = ctx.createGain();
    const slotWetGain = ctx.createGain();
    const slotOut = ctx.createGain();
    const scopeAnalyser = ctx.createAnalyser();
    scopeAnalyser.fftSize = 1024;
    // Pre-effect tap (dry, before this slot's own bypass mix) and a
    // post-bypass-mix tap — together these let a slot's editor (e.g.
    // GateEditorPanel) show a real input-vs-output scope that actually
    // reflects Bypass, same as the chapter labs' own dry/wet/final
    // analyser trio (dryAnal / wetAnal / finalAnal).
    const inputAnalyser = ctx.createAnalyser();
    inputAnalyser.fftSize = 1024;
    const outputAnalyser = ctx.createAnalyser();
    outputAnalyser.fftSize = 1024;
    bypassGain.gain.value = slot.bypassed ? 1 : 0;
    slotWetGain.gain.value = slot.bypassed ? 0 : 1;
    chainOut.connect(slotIn);
    slotIn.connect(bypassGain);
    slotIn.connect(inputAnalyser);
    bypassGain.connect(slotOut);
    let tail = wireSlotNode(ctx, slotIn, slot);
    // The EQ slot has its own output-gain trim (a plain WebAudio GainNode,
    // not a Faust param — see equalizerEngine's applyOutputGain) and its
    // own higher-resolution frequency-response analysers, matching the
    // standalone Chapter2b lab's ParamEQCurve exactly (2048 fft,
    // ANALYSER_MIN/MAX_DB) — tapped in parallel with the generic ones
    // every slot gets above.
    if (slot.key === "eq") {
      const eqOutputGain = ctx.createGain();
      tail.connect(eqOutputGain);
      tail = eqOutputGain;
      applyEqOutputGain(eqOutputGain, slot.outputGainDb ?? 0, ctx);
      const eqAnalyser = ctx.createAnalyser();
      eqAnalyser.fftSize = 2048;
      eqAnalyser.smoothingTimeConstant = 0.78;
      eqAnalyser.minDecibels = ANALYSER_MIN_DB;
      eqAnalyser.maxDecibels = ANALYSER_MAX_DB;
      const eqDryAnalyser = ctx.createAnalyser();
      eqDryAnalyser.fftSize = 2048;
      eqDryAnalyser.smoothingTimeConstant = 0.78;
      eqDryAnalyser.minDecibels = ANALYSER_MIN_DB;
      eqDryAnalyser.maxDecibels = ANALYSER_MAX_DB;
      slotIn.connect(eqDryAnalyser);
      tail.connect(eqAnalyser);
      refs.eqRuntimeRef.current.set(`${trackId}:${regionId}`, { outputGainNode: eqOutputGain, analyser: eqAnalyser, dryAnalyser: eqDryAnalyser });
      extraNodes.push(eqOutputGain, eqAnalyser, eqDryAnalyser);
      const ed = refs.activeEditorRef.current;
      if (ed?.trackId === trackId && ed?.regionId === regionId && ed?.key === "eq") {
        refs.eqAnalyserRef.current = eqAnalyser;
        refs.eqDryAnalyserRef.current = eqDryAnalyser;
      }
    }
    tail.connect(slotWetGain);
    tail.connect(scopeAnalyser);
    slotWetGain.connect(slotOut);
    slotOut.connect(outputAnalyser);
    extraNodes.push(slotIn, bypassGain, slotWetGain, slotOut, scopeAnalyser, inputAnalyser, outputAnalyser);
    refs.slotRuntimeRef.current.set(`${trackId}:${regionId}:${slot.key}`, { bypassGain, wetGain: slotWetGain, scopeAnalyser, inputAnalyser, outputAnalyser });
    chainOut = slotOut;
  });
  return { chainOut, extraNodes };
}

// ── Offline (non-realtime) rendering for the Download buttons ─────────────
// An AudioNode can't move between two different BaseAudioContexts, so a
// slot's live Faust node (created once, against the live AudioContext, when
// the plugin was added — see loadPluginEngine/addOrSelectPlugin) can't be
// reused here. Each of these builds brand-new nodes from the SAME cached
// factory (engineCacheRef — module + json, not tied to any context) against
// an OfflineAudioContext instead — same trick every standalone chapter lab's
// own renderXOffline already uses for its single-plugin "download the
// processed result" button (e.g. NoiseGate.jsx's renderGateOffline),
// generalized here across an arbitrary per-portion chain. No
// analysers/meters — nothing offline reads them.

async function createOfflineSlotNode(offlineCtx, engineCache, slot) {
  const cached = engineCache.get(slot.key);
  if (!cached) return null; // shouldn't happen — a "ready" slot already loaded its engine live
  const generator = new FaustMonoDspGenerator();
  const node = await generator.createNode(offlineCtx, cached.meta.name, cached.factory, false, 512);
  switch (slot.key) {
    case "gate":
      pushGateParams(node, slot.params, slot.sidechain);
      break;
    case "deess":
      pushDeEsserParams(node, slot.params);
      break;
    case "comp":
      pushCompParams(node, slot.bands, slot.crossover, slot.sidechain, slot.outputGainDb, false, slot.multiband);
      break;
    case "limiter":
      pushLimiterParams(node, slot.params);
      break;
    case "delay":
      pushDelayParams(node, slot.params);
      break;
    case "reverb":
      pushReverbParams(node, slot.params);
      break;
    case "eq":
      applyEqBandsToNode(node, slot.bands);
      break;
    default:
      break;
  }
  return node;
}

// Wires one portion's chain (in order, respecting per-slot Bypass) into
// `offlineCtx`, from `source` through to a returned tail node the caller
// connects onward from — the offline counterpart of wireLiveChain above,
// minus analysers/meters.
async function buildOfflineChain(offlineCtx, engineCache, chain, source) {
  const activeChain = chain.filter((s) => s.node && s.status === "ready");
  let chainOut = source;
  for (const slot of activeChain) {
    const node = await createOfflineSlotNode(offlineCtx, engineCache, slot);
    if (!node) continue;
    const slotIn = offlineCtx.createGain();
    const bypassGain = offlineCtx.createGain();
    const slotWetGain = offlineCtx.createGain();
    const slotOut = offlineCtx.createGain();
    bypassGain.gain.value = slot.bypassed ? 1 : 0;
    slotWetGain.gain.value = slot.bypassed ? 0 : 1;
    chainOut.connect(slotIn);
    slotIn.connect(bypassGain);
    bypassGain.connect(slotOut);
    let tail = wireSlotNode(offlineCtx, slotIn, { ...slot, node });
    if (slot.key === "eq") {
      const eqOutputGain = offlineCtx.createGain();
      tail.connect(eqOutputGain);
      tail = eqOutputGain;
      applyEqOutputGain(eqOutputGain, slot.outputGainDb ?? 0, offlineCtx);
    }
    tail.connect(slotWetGain);
    slotWetGain.connect(slotOut);
    chainOut = slotOut;
  }
  return chainOut;
}

// Renders one track's full timeline: a single source spanning the whole
// buffer runs through the track's own whole-track chain (buildOfflineChain
// against track.chain) — the true "outer" layer, always applied everywhere
// on the track — and that result is then split into as many parallel paths
// as the track has portions plus one "no portion" (dry-of-the-track-chain)
// path, each gated to be audible only during its own time window (see
// computeSegments) via plain on/off gain automation rather than re-slicing
// the buffer, since a portion's own chain needs to run on the ALREADY
// track-processed signal, not a fresh copy of the raw buffer. Within a
// portion's own path, the signal additionally runs through that portion's
// PRIVATE outerChain (buildOfflineChain against seg.region.outerChain —
// distinct from track.chain, and never heard in gaps or other portions)
// before its own chain, so a portion can layer extra "outer" processing
// that's scoped only to itself. Mirrors the live graph's own per-track
// block in playFrom() below, minus analysers/meters. `trackStartAt` offsets
// every segment boundary within `offlineCtx`'s timeline: 0 for a solo
// single-track render (see renderTrackOffline), or that track's own
// arrangement position for a full mixdown (see renderMixOffline).
async function buildOfflineTrackOutput(offlineCtx, engineCache, track, trackStartAt = 0) {
  const output = offlineCtx.createGain();
  const source = offlineCtx.createBufferSource();
  source.buffer = track.buffer;
  source.start(trackStartAt, 0, track.buffer.duration);

  const trackChainOut = await buildOfflineChain(offlineCtx, engineCache, track.chain, source);

  const dryGate = offlineCtx.createGain();
  dryGate.gain.value = 0;
  trackChainOut.connect(dryGate);
  dryGate.connect(output);

  const segments = computeSegments(track);
  const portionGates = new Map(); // regionId -> gate GainNode
  for (const seg of segments) {
    if (seg.region && !portionGates.has(seg.region.id)) {
      const portionOuterOut = await buildOfflineChain(offlineCtx, engineCache, seg.region.outerChain || [], trackChainOut);
      const portionChainOut = await buildOfflineChain(offlineCtx, engineCache, seg.region.chain, portionOuterOut);
      const gateGain = offlineCtx.createGain();
      gateGain.gain.value = 0;
      portionChainOut.connect(gateGain);
      gateGain.connect(output);
      portionGates.set(seg.region.id, gateGain);
    }
  }

  const allGates = [{ id: null, gain: dryGate }, ...Array.from(portionGates, ([id, gain]) => ({ id, gain }))];
  for (const seg of segments) {
    const at = trackStartAt + seg.start;
    const activeId = seg.region ? seg.region.id : null;
    allGates.forEach(({ id, gain }) => {
      gain.gain.setValueAtTime(id === activeId ? 1 : 0, at);
    });
  }

  return output;
}

// "Download" (an individual track): renders one track's own portions + its
// own volume fader, alone, at that track's native channel count/length/
// sample rate — a solo stem export. Mute is deliberately ignored (soloing a
// muted track's stem is presumably the point of downloading it); everything
// else (portions/chains, per-slot bypass, volume) matches exactly what that
// channel strip contributes to the live mix.
async function renderTrackOffline(engineCache, track) {
  const buffer = track.buffer;
  const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const chainOut = await buildOfflineTrackOutput(offlineCtx, engineCache, track, 0);
  const trackGain = offlineCtx.createGain();
  trackGain.gain.value = track.volume ?? 1;
  chainOut.connect(trackGain);
  trackGain.connect(offlineCtx.destination);
  return offlineCtx.startRendering();
}

// "Download Mix": renders every track that has audio loaded through its own
// portions + volume + mute, summed together — a single pass across the
// whole arrangement's length (not looped, regardless of the transport's
// Loop toggle — a download should be one finite file), at `sampleRate` (the
// live AudioContext's own rate, so every track resamples to the same shared
// rate exactly like it does during live playback). Deliberately bypasses
// the VR room's spatial/HRTF speaker bus (createStudioSpeakerBus) — a
// download should be a plain stereo mixdown, not one colored by wherever
// the student's head happened to be facing.
async function renderMixOffline(engineCache, tracks, sampleRate) {
  const list = tracks.filter((t) => t.buffer);
  if (list.length === 0) return null;
  // Same "startAt, seconds" per-track clip position the live graph
  // schedules around in playFrom() — the arrangement's length is the
  // latest END point across all tracks, and each source starts at its own
  // absolute offset in the render instead of at 0.
  const arrDur = list.reduce((max, t) => Math.max(max, (t.startAt ?? 0) + t.buffer.duration), 0);
  const length = Math.max(1, Math.ceil(arrDur * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.connect(offlineCtx.destination);
  for (const track of list) {
    const chainOut = await buildOfflineTrackOutput(offlineCtx, engineCache, track, track.startAt ?? 0);
    const trackGain = offlineCtx.createGain();
    trackGain.gain.value = track.muted ? 0 : (track.volume ?? 1);
    chainOut.connect(trackGain);
    trackGain.connect(masterGain);
  }
  return offlineCtx.startRendering();
}

// Any hbargraph/vbargraph item is a read-only Faust METER output (gain
// reduction, live gain, etc.). Pulled out separately here so any plugin's
// own *EditorPanel (via getXLevels-style host callbacks) can read its live
// telemetry off meterValuesRef — populated below by a generic
// node.setOutputParamHandler subscription — with no per-plugin wiring.
function collectMeters(items) {
  // Some dsp-meta.json files (ParamEQ's per-band Live_Gain outputs) list the
  // same output address twice — dedupe so the meter bank doesn't render two
  // identical bars for one signal.
  const seen = new Set();
  const out = [];
  items
    .filter((it) => it.type === "hbargraph" || it.type === "vbargraph")
    .forEach((it) => {
      if (seen.has(it.address)) return;
      seen.add(it.address);
      out.push({ address: it.address, label: it.label, min: it.min ?? 0, max: it.max ?? 1 });
    });
  return out;
}

// Default typed state for a freshly-added plugin slot on a portion — same
// defaults each plugin's own standalone chapter lab starts from. Stored
// directly on the chain slot object (per portion, per plugin) rather than
// in one shared top-level React state, since a mix can now have the SAME
// plugin type on several different portions (even on the same track) at
// once, each with its own independent settings.
function defaultSlotExtras(key) {
  switch (key) {
    case "gate":
      return { params: GATE_DEFAULTS, sidechain: GATE_DEFAULT_SIDECHAIN };
    case "deess":
      return { params: DEESS_DEFAULTS };
    case "comp":
      return {
        bands: makeDefaultCompBands(),
        crossover: COMP_DEFAULT_CROSSOVER,
        sidechain: COMP_DEFAULT_SIDECHAIN,
        outputGainDb: COMP_DEFAULT_OUTPUT_GAIN,
        multiband: COMP_DEFAULT_MULTIBAND,
      };
    case "limiter":
      return { params: LIMITER_DEFAULTS };
    case "delay":
      return { params: DELAY_DEFAULTS, sync: DEFAULT_SYNC, link: false };
    case "reverb":
      return { params: REVERB_DEFAULTS, preset: DEFAULT_PRESET };
    case "eq":
      return { bands: EQ_DEFAULT_BANDS, outputGainDb: 0 };
    default:
      return {};
  }
}

function DawWorkstationScreen({ open, onClose }) {
  const isOpen = open?.type === "daw";

  // ── Tracks (multi-track mix) ────────────────────────────────────────────
  // Each track: { id, name, color, buffer, peaks, duration, loadError,
  //               regions: [portion...], volume, muted, startAt }. startAt
  //               (seconds) is where this track's clip begins in the
  //               arrangement — dragged via its clip's header strip (see
  //               beginClipDrag et al below). Each portion is
  //               { id, start, end, chain: [slot...] } — start/end are
  //               buffer-relative seconds (so a portion stays anchored to
  //               the same audio content if the clip is later moved), and
  //               each chain slot carries its own typed params (see
  //               defaultSlotExtras) so two portions — even on the same
  //               track — can each run their own independent instance of
  //               the same plugin. A track with no portions plays back dry.
  const [tracks, setTracks] = useState([]);
  const tracksRef = useRef([]);
  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  const trackIdRef = useRef(0);
  const regionIdRef = useRef(0);
  const demoBufferRef = useRef(null); // synthetic fallback buffer (see createDemoLoopBuffer), lazily created only if a real DEMO_CLIPS fetch fails
  const demoClipBuffersRef = useRef(new Map()); // DEMO_CLIPS id -> decoded AudioBuffer, so re-picking/re-seeding the same ~20-45MB stem doesn't re-fetch/re-decode it

  // Each track's own clip can start anywhere in the arrangement (see
  // track.startAt, seconds — dragged via the clip's header in the
  // arrangement pane below), so the arrangement's total length is the
  // latest of every track's own END point (startAt + its own duration), not
  // just the longest buffer.
  const arrangementDuration = useMemo(
    () => tracks.reduce((max, t) => Math.max(max, (t.startAt ?? 0) + (t.buffer?.duration ?? 0)), 0),
    [tracks],
  );

  // ── Track selection (the tracklist row that drives which track's clip is
  // in focus — like clicking a channel in a real DAW) ────────────────────
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const selectedTrackIdRef = useRef(null);
  useEffect(() => {
    selectedTrackIdRef.current = selectedTrackId;
  }, [selectedTrackId]);

  // ── Portion (region) selection — the highlighted portion whose own chain
  // drives the bottom dock's editor. Selecting a portion also scopes the
  // transport to a preview loop of just that portion (see
  // getPreviewWindow/playFrom below); "Exit Selection" (or Escape) clears
  // this and returns Play to the whole arrangement. ──────────────────────
  const [selectedRegion, setSelectedRegion] = useState(null); // { trackId, regionId } | null
  const selectedRegionRef = useRef(null);
  useEffect(() => {
    selectedRegionRef.current = selectedRegion;
  }, [selectedRegion]);

  // While a portion is selected, the dock can point at either that
  // portion's own chain ("portion") or the track's outer whole-track chain
  // ("track") without losing the portion highlight/preview-loop — see the
  // scope tabs in the dock header. Reset to "portion" whenever selection
  // changes so the dock always opens on the portion you just picked.
  const [dockScope, setDockScope] = useState("portion"); // "portion" | "track"

  // The portion currently being drawn by dragging on a clip's waveform body
  // — see beginRegionDrag/onRegionPointerMove/endRegionDrag below.
  const [draftRegion, setDraftRegion] = useState(null); // { trackId, start, end } | null

  // Drag-to-reorder the selected portion's insert chain (the ‹ › buttons on
  // each chip still work too — this is just a faster way to do the same
  // reorder).
  const [draggingKey, setDraggingKey] = useState(null);

  // Keeps the tracklist (left) and arrangement (right) scrolled together —
  // they're two independent scroll containers, same as the design mockup.
  const tracklistRef = useRef(null);
  const arrangementRef = useRef(null);
  const syncingScrollRef = useRef(false);
  const onTracklistScroll = useCallback(() => {
    if (syncingScrollRef.current) {
      syncingScrollRef.current = false;
      return;
    }
    if (arrangementRef.current && tracklistRef.current) {
      syncingScrollRef.current = true;
      arrangementRef.current.scrollTop = tracklistRef.current.scrollTop;
    }
  }, []);
  const onArrangementScroll = useCallback(() => {
    if (syncingScrollRef.current) {
      syncingScrollRef.current = false;
      return;
    }
    if (tracklistRef.current && arrangementRef.current) {
      syncingScrollRef.current = true;
      tracklistRef.current.scrollTop = arrangementRef.current.scrollTop;
    }
  }, []);

  // ── Plugin editor popup (which track + portion + plugin is open) ───────
  const [activeEditor, setActiveEditor] = useState(null); // { trackId, regionId, key } | null
  const activeEditorRef = useRef(null);
  useEffect(() => {
    activeEditorRef.current = activeEditor;
  }, [activeEditor]);

  const engineCacheRef = useRef(new Map()); // plugin key -> compiled Faust factory (shared across all tracks/portions)
  const slotRuntimeRef = useRef(new Map()); // `${trackId}:${regionId}:${key}` -> { bypassGain, wetGain, scopeAnalyser, inputAnalyser, outputAnalyser } (live, only while playing)
  const meterValuesRef = useRef(new Map()); // `${trackId}:${regionId}:${key}` -> { [address]: value }
  const eqRuntimeRef = useRef(new Map()); // `${trackId}:${regionId}` -> { outputGainNode, analyser, dryAnalyser } (EQ's extra nodes, live, only while playing)
  const eqAnalyserRef = useRef(null); // pointed at whichever portion's EQ analyser is currently open in the popup
  const eqDryAnalyserRef = useRef(null);
  const eqLiveDynGainRef = useRef({});

  // Small transient UI-only state for whichever plugin's popup is currently
  // open (only one popup is open at a time, so these don't need to be
  // per-track/per-portion/per-slot like the audio-affecting params above).
  const [gateIsOpen, setGateIsOpen] = useState(true);
  const [compSelectedBand, setCompSelectedBand] = useState("low");
  const [, setLimiterGainReduction] = useState(0);
  const [delayLink, setDelayLink] = useState(false);
  const [eqSelectedBandId, setEqSelectedBandId] = useState("peak1");
  const [eqSampleRate, setEqSampleRate] = useState(48000);

  // ── Transport (plays every track in the mix together, in sync) ─────────
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  const [loopOn, setLoopOn] = useState(true);
  const loopOnRef = useRef(loopOn);
  useEffect(() => {
    loopOnRef.current = loopOn;
  }, [loopOn]);
  const [playhead, setPlayhead] = useState(0);
  const graphRef = useRef(null);
  const pausedOffsetRef = useRef(0);
  const endTimeoutRef = useRef(null); // fires when a non-looping mix reaches the end of the longest track
  const playCallTokenRef = useRef(0); // guards against two concurrent playFrom() calls racing (see playFrom)
  const [meterLevel, setMeterLevel] = useState(0);

  // ── Download (individual track / full mix), offline-rendered — see
  // renderTrackOffline/renderMixOffline above ─────────────────────────────
  const [downloadingTrackId, setDownloadingTrackId] = useState(null); // id of the track currently being rendered, or null
  const [downloadingMix, setDownloadingMix] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const ensureContext = useCallback(async () => {
    initAudio();
    resumeAudio();
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (ctx.state === "suspended") await ctx.resume();
    return ctx;
  }, []);

  const loadPluginEngine = useCallback(async (ctx, def) => {
    let cached = engineCacheRef.current.get(def.key);
    if (!cached) {
      const metaJson = await (await fetch(`${def.basePath}/dsp-meta.json`)).json();
      const mod = await compileFaustWasm(`${def.basePath}/dsp-module.wasm`);
      cached = { factory: { module: mod, json: JSON.stringify(metaJson), soundfiles: {} }, meta: metaJson };
      engineCacheRef.current.set(def.key, cached);
    }
    const generator = new FaustMonoDspGenerator();
    const node = await generator.createNode(ctx, cached.meta.name, cached.factory, false, 512);
    return { node, meta: cached.meta };
  }, []);

  // Resolves the currently-selected portion (if any) into an absolute
  // [start, end) window in ARRANGEMENT seconds (i.e. that portion's own
  // buffer-relative bounds shifted by its track's current startAt) — read
  // fresh from tracksRef/selectedRegionRef every call, so it never goes
  // stale if the clip is dragged after the portion was selected.
  const getPreviewWindow = useCallback(() => {
    const sel = selectedRegionRef.current;
    if (!sel) return null;
    const track = tracksRef.current.find((t) => t.id === sel.trackId);
    const region = track?.regions.find((r) => r.id === sel.regionId);
    if (!track || !region) return null;
    const startAt = track.startAt ?? 0;
    return { start: startAt + region.start, end: startAt + region.end };
  }, []);

  // currentOffset() reports the shared transport position — a straight line
  // from startOffset for a single pass, wrapped within [loopStart, loopEnd)
  // when looping. loopStart/loopEnd span the whole arrangement normally, or
  // just the selected portion's own window while one is selected (see
  // getPreviewWindow/playFrom) — the whole arrangement restarts (or the
  // selected portion loops) together once that window's end is reached (see
  // the end-of-window timer in playFrom), rather than each track's own
  // AudioBufferSourceNode looping at its own buffer length; this is just the
  // shared playhead/scrub clock.
  const currentOffset = useCallback(() => {
    if (!isPlayingRef.current) return pausedOffsetRef.current;
    const ctx = getAudioContext();
    const g = graphRef.current;
    if (!ctx || !g) return pausedOffsetRef.current;
    const raw = g.startOffset + (ctx.currentTime - g.startCtxTime);
    if (g.loopEnabled) {
      const span = g.loopEnd - g.loopStart;
      if (span > 0) return g.loopStart + (((raw - g.loopStart) % span) + span) % span;
    }
    return raw;
  }, []);

  const teardownPlaybackGraph = useCallback(() => {
    if (endTimeoutRef.current) {
      clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = null;
    }
    const g = graphRef.current;
    if (!g) return;
    g.trackNodes.forEach(({ sources, extraNodes }) => {
      sources.forEach((source) => {
        try {
          source.stop();
        } catch {
          /* already stopped */
        }
        try {
          source.disconnect();
        } catch {
          /* ok */
        }
      });
      extraNodes.forEach((n) => {
        try {
          n.disconnect();
        } catch {
          /* ok */
        }
      });
    });
    tracksRef.current.forEach((t) => {
      disconnectChainSlots(t.chain);
      t.regions.forEach((region) => {
        disconnectChainSlots(region.chain);
        disconnectChainSlots(region.outerChain || []);
      });
    });
    try {
      g.masterGain.disconnect();
    } catch {
      /* ok */
    }
    try {
      g.meterAnalyser.disconnect();
    } catch {
      /* ok */
    }
    g.speakerBus?.dispose();
    graphRef.current = null;
    slotRuntimeRef.current.clear();
    eqRuntimeRef.current.clear();
    eqAnalyserRef.current = null;
    eqDryAnalyserRef.current = null;
  }, []);

  // Builds a fresh playback graph for every track that has audio loaded and
  // starts them all at the same instant. Each track gets a single source
  // spanning its whole buffer, run through that track's own whole-track
  // chain (the "outer" layer, in order, skipping bypassed slots — see
  // wireLiveChain) — then fanned out into one gated path per portion (each
  // running that portion's own chain, layered AFTER the track chain — the
  // "inner" layer) plus one gated "no portion" path carrying the track-chain
  // output straight through, so exactly one of those paths is open at any
  // given moment depending on where the transport is relative to that
  // track's own portions (see computeSegments) — all summed into that
  // track's own volume/mute gain, then into a shared master bus. Each
  // track's clip can start at its own point in the arrangement
  // (track.startAt, seconds — see setTrackStartAt/the clip drag handlers
  // below), so where in ITS OWN buffer a track needs to be at the shared
  // transport position `offset` depends on that track's own startAt: not
  // started yet (schedule it to begin later), partway through (start now,
  // partway into the buffer), or already finished this pass (skip it
  // entirely) — the same reasoning applies to each portion gate's own
  // on/off schedule. When a portion is selected (see getPreviewWindow), the
  // transport loops just that portion's own window instead of the whole
  // arrangement — otherwise it spans [0, arrangementDuration) and follows
  // the Loop toggle. A single pass plays and, once the loop window's end is
  // reached, a timer either flips the transport back to stopped (Loop off,
  // no portion selected) or restarts from the window's start (Loop on, or
  // any portion selected).
  const playFrom = useCallback(
    async (offset) => {
      const token = ++playCallTokenRef.current;
      const list = tracksRef.current.filter((t) => t.buffer);
      if (list.length === 0) return;
      const ctx = await ensureContext();
      if (!ctx) return;
      // If another playFrom() call was made while this one was waiting on
      // ensureContext(), let that newer call own the rebuild — otherwise
      // two overlapping calls each tear down and rebuild the graph, and
      // whichever finishes its (synchronous, post-await) work last wins in
      // a way that isn't predictable. This is what let adding several
      // plugins in a row race each other into a silent/inconsistent graph.
      if (token !== playCallTokenRef.current) return;
      teardownPlaybackGraph();
      setEqSampleRate(ctx.sampleRate);

      const arrDur = list.reduce((max, t) => Math.max(max, (t.startAt ?? 0) + t.buffer.duration), 0);
      const pw = getPreviewWindow();
      const loopStart = pw ? clamp(pw.start, 0, arrDur) : 0;
      const loopEnd = pw ? clamp(pw.end, 0, arrDur) : arrDur;
      const useLoop = pw ? true : loopOnRef.current;
      const clampedOffset = clamp(offset, loopStart, Math.max(loopStart, loopEnd));

      const masterGain = ctx.createGain();
      const meterAnalyser = ctx.createAnalyser();
      meterAnalyser.fftSize = 512;
      masterGain.connect(meterAnalyser);
      const speakerBus = createStudioSpeakerBus();
      if (speakerBus) masterGain.connect(speakerBus.input);
      else masterGain.connect(ctx.destination);

      const trackNodes = new Map();

      const refs = { slotRuntimeRef, eqRuntimeRef, activeEditorRef, eqAnalyserRef, eqDryAnalyserRef };

      list.forEach((track) => {
        const buffer = track.buffer;
        const startAt = track.startAt ?? 0;
        // This track's clip has already fully played out by the current
        // transport position — nothing to schedule for it this pass.
        if (clampedOffset >= startAt + buffer.duration) return;

        // A single source spans the WHOLE buffer (same scheduling as
        // before portions existed) — the track's own chain (the "outer"
        // layer) runs on it in full, start to finish; there's no need to
        // slice the buffer per-portion any more, because a portion's own
        // chain (the "inner" layer, see below) needs to process the
        // ALREADY track-chain-processed signal, not a fresh copy of the
        // raw audio.
        let bufferOffset = 0;
        let when = ctx.currentTime;
        if (clampedOffset < startAt) {
          when = ctx.currentTime + (startAt - clampedOffset);
        } else {
          bufferOffset = clampedOffset - startAt;
        }
        const playDuration = buffer.duration - bufferOffset;
        if (playDuration <= 0) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.start(when, bufferOffset, playDuration);

        const extraNodes = [];
        const { chainOut: trackChainOut, extraNodes: trackExtra } = wireLiveChain(
          ctx,
          source,
          track.chain,
          track.id,
          TRACK_CHAIN_SCOPE,
          refs,
        );
        extraNodes.push(...trackExtra);

        const trackGain = ctx.createGain();
        trackGain.gain.value = track.muted ? 0 : (track.volume ?? 1);

        // Fan the track-chain output into one path per portion (each
        // running that portion's own PRIVATE outer chain — see
        // outerScopeId/OUTER_CHAIN_SUFFIX — then that portion's own chain,
        // the "inner" layer, both layered AFTER the track's whole-track
        // chain but never heard outside this one portion) plus one "no
        // portion" dry-of-the-whole-track-chain path, then gate each path
        // so only the one matching wherever the transport currently is is
        // actually audible — see computeSegments for the ordered time
        // windows these gates follow.
        const dryGate = ctx.createGain();
        dryGate.gain.value = 0;
        trackChainOut.connect(dryGate);
        dryGate.connect(trackGain);
        extraNodes.push(dryGate);

        const segments = computeSegments(track);
        const portionGates = new Map(); // regionId -> gate GainNode
        segments.forEach((seg) => {
          if (seg.region && !portionGates.has(seg.region.id)) {
            const { chainOut: portionOuterOut, extraNodes: portionOuterExtra } = wireLiveChain(
              ctx,
              trackChainOut,
              seg.region.outerChain || [],
              track.id,
              outerScopeId(seg.region.id),
              refs,
            );
            const { chainOut: portionOut, extraNodes: portionExtra } = wireLiveChain(
              ctx,
              portionOuterOut,
              seg.region.chain,
              track.id,
              seg.region.id,
              refs,
            );
            const gateGain = ctx.createGain();
            gateGain.gain.value = 0;
            portionOut.connect(gateGain);
            gateGain.connect(trackGain);
            extraNodes.push(...portionOuterExtra, ...portionExtra, gateGain);
            portionGates.set(seg.region.id, gateGain);
          }
        });

        // Schedule each gate's on/off automation across the segments still
        // ahead of (or straddling) the current transport position — same
        // "skip anything already fully past, otherwise schedule relative to
        // ctx.currentTime" reasoning the old per-segment source scheduling
        // used, just driving gain automation instead of a source's own
        // start() now that every portion shares the single upstream source.
        const allGates = [{ id: null, gain: dryGate }, ...Array.from(portionGates, ([id, gain]) => ({ id, gain }))];
        segments.forEach((seg) => {
          const segAbsStart = startAt + seg.start;
          const segAbsEnd = startAt + seg.end;
          if (clampedOffset >= segAbsEnd) return;
          const atStart = clampedOffset < segAbsStart ? ctx.currentTime + (segAbsStart - clampedOffset) : ctx.currentTime;
          const activeId = seg.region ? seg.region.id : null;
          allGates.forEach(({ id, gain }) => {
            gain.gain.setValueAtTime(id === activeId ? 1 : 0, atStart);
          });
        });

        trackGain.connect(masterGain);
        trackNodes.set(track.id, { sources: [source], extraNodes, trackGain });
      });

      graphRef.current = {
        ctx,
        masterGain,
        meterAnalyser,
        speakerBus,
        trackNodes,
        loopEnabled: useLoop,
        loopStart,
        loopEnd,
        arrangementDuration: arrDur,
        startCtxTime: ctx.currentTime,
        startOffset: clampedOffset,
      };
      setIsPlaying(true);

      // Fires once the loop window's end (the whole arrangement, or just
      // the selected portion — see loopStart/loopEnd above) is reached.
      // Loop off (and no portion selected) stops the transport there.
      // Otherwise it restarts from the window's start.
      const remaining = Math.max(0, loopEnd - clampedOffset);
      endTimeoutRef.current = setTimeout(() => {
        endTimeoutRef.current = null;
        if (useLoop) {
          playFrom(loopStart);
        } else {
          pausedOffsetRef.current = loopStart;
          setPlayhead(loopStart);
          setIsPlaying(false);
        }
      }, remaining * 1000 + 40);
    },
    [ensureContext, teardownPlaybackGraph, getPreviewWindow],
  );

  const pause = useCallback(() => {
    if (!graphRef.current) return;
    pausedOffsetRef.current = clamp(currentOffset(), 0, arrangementDuration);
    teardownPlaybackGraph();
    setIsPlaying(false);
    setPlayhead(pausedOffsetRef.current);
  }, [currentOffset, arrangementDuration, teardownPlaybackGraph]);

  const stop = useCallback(() => {
    teardownPlaybackGraph();
    pausedOffsetRef.current = 0;
    setIsPlaying(false);
    setPlayhead(0);
  }, [teardownPlaybackGraph]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else playFrom(pausedOffsetRef.current);
  }, [isPlaying, pause, playFrom]);

  const rewind = useCallback(() => {
    if (isPlaying) playFrom(0);
    else {
      pausedOffsetRef.current = 0;
      setPlayhead(0);
    }
  }, [isPlaying, playFrom]);

  // Loop on/off is baked into the end-of-window timer at graph-build time
  // (see the setTimeout in playFrom) — flipping the loopOn state alone
  // doesn't touch a timer that's already scheduled, which is why the button
  // used to look like it had no effect on live playback (turning it off
  // didn't stop an already-looping mix, turning it on didn't make a
  // single-pass mix start looping). Update loopOnRef synchronously (state
  // updates apply on the next render, too late for the rebuild below to see
  // them) and, if already playing, rebuild the graph from the current
  // position so the new setting takes effect immediately. Has no effect
  // while a portion is selected — previewing a portion always loops (see
  // playFrom) until you Exit Selection.
  const toggleLoop = useCallback(() => {
    const next = !loopOnRef.current;
    loopOnRef.current = next;
    setLoopOn(next);
    if (isPlayingRef.current) playFrom(currentOffset());
  }, [playFrom, currentOffset]);

  // Playhead + master meter — each open plugin popup reads its own live
  // scope/meters directly (via getXLevels/getInputPeak-style host callbacks
  // called from that plugin's own *EditorPanel animation loop), so this poll
  // only needs to drive the main transport.
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      // Skip while a playhead scrub is in progress — the drag handlers own
      // `playhead` exclusively during that window (see
      // beginPlayheadDrag/onPlayheadPointerMove below); overwriting it here
      // with the still-playing-at-the-old-position live clock would fight
      // the drag and make the line jitter.
      if (!dragPlayheadRef.current) setPlayhead(clamp(currentOffset(), 0, arrangementDuration));
      const g = graphRef.current;
      if (g?.meterAnalyser) {
        const data = new Uint8Array(g.meterAnalyser.fftSize);
        g.meterAnalyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setMeterLevel(Math.sqrt(sum / data.length));
      }
    }, 90);
    return () => clearInterval(id);
  }, [isPlaying, currentOffset, arrangementDuration]);

  // Escape exits the currently-selected portion, same as the dock's "✕ Exit
  // Selection" button.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && selectedRegionRef.current) exitSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Track management (add / remove / upload / demo / volume) ───────────
  const addTrackWithBuffer = useCallback(
    (buffer, name) => {
      const n = ++trackIdRef.current;
      const id = `t${n}`;
      const color = TRACK_COLORS[(n - 1) % TRACK_COLORS.length];
      const peaks = computePeaks(buffer);
      const track = { id, name, color, buffer, peaks, duration: buffer.duration, loadError: "", chain: [], regions: [], volume: 1, muted: false, startAt: 0 };
      const next = [...tracksRef.current, track];
      tracksRef.current = next;
      setTracks(next);
      setSelectedTrackId(id);
      if (isPlayingRef.current) playFrom(currentOffset());
      return id;
    },
    [playFrom, currentOffset],
  );

  const addEmptyTrack = useCallback(() => {
    const n = ++trackIdRef.current;
    const id = `t${n}`;
    const color = TRACK_COLORS[(n - 1) % TRACK_COLORS.length];
    const track = { id, name: `Track ${n}`, color, buffer: null, peaks: null, duration: 0, loadError: "", chain: [], regions: [], volume: 1, muted: false, startAt: 0 };
    const next = [...tracksRef.current, track];
    tracksRef.current = next;
    setTracks(next);
    setSelectedTrackId(id);
  }, []);

  const removeTrack = useCallback(
    (id) => {
      const track = tracksRef.current.find((t) => t.id === id);
      const next = tracksRef.current.filter((t) => t.id !== id);
      tracksRef.current = next;
      setTracks(next);
      if (activeEditorRef.current?.trackId === id) setActiveEditor(null);
      if (selectedRegionRef.current?.trackId === id) {
        selectedRegionRef.current = null;
        setSelectedRegion(null);
      }
      if (selectedTrackIdRef.current === id) setSelectedTrackId(next.length > 0 ? next[0].id : null);
      if (track) {
        disconnectChainSlots(track.chain);
        track.regions.forEach((region) => {
          disconnectChainSlots(region.chain);
          disconnectChainSlots(region.outerChain || []);
        });
      }
      if (isPlayingRef.current) {
        if (next.length === 0) stop();
        else playFrom(currentOffset());
      }
    },
    [playFrom, currentOffset, stop],
  );

  // Fetches + decodes one of DEMO_CLIPS (cached by id — these are real
  // 20-45MB WAV stems, not worth re-downloading/re-decoding every time the
  // same one is picked again).
  const loadDemoClip = useCallback(async (ctx, clip) => {
    const cached = demoClipBuffersRef.current.get(clip.id);
    if (cached) return cached;
    const res = await fetch(clip.url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    demoClipBuffersRef.current.set(clip.id, decoded);
    return decoded;
  }, []);

  // Disconnects every plugin node in a track's own portions and clears any
  // selection/editor pointed at it — used right before that track's audio
  // is replaced (see loadDemoForTrack/handleTrackFile below), since a new
  // buffer invalidates the old portions' buffer-relative time ranges.
  const releaseTrackRegions = useCallback((id) => {
    const track = tracksRef.current.find((t) => t.id === id);
    track?.regions.forEach((region) => {
      disconnectChainSlots(region.chain);
      disconnectChainSlots(region.outerChain || []);
    });
    // Only close the popup if it was editing one of THIS track's portions
    // (which are about to be cleared) — the track's own whole-track chain
    // isn't time-indexed against the old audio, so it (and its popup, if
    // that's what's open) is left alone.
    if (activeEditorRef.current?.trackId === id && activeEditorRef.current?.regionId !== TRACK_CHAIN_SCOPE) {
      setActiveEditor(null);
    }
    if (selectedRegionRef.current?.trackId === id) {
      selectedRegionRef.current = null;
      setSelectedRegion(null);
    }
  }, []);

  // Loads one of DEMO_CLIPS onto a track — the per-track "D" demo dropdown.
  // Falls back to the synthetic pad (with a loadError note) if the real
  // clip can't be fetched/decoded, same spirit as handleTrackFile's own
  // error handling below.
  const loadDemoForTrack = useCallback(
    async (id, clip) => {
      const ctx = await ensureContext();
      if (!ctx) return;
      let buffer;
      let name = clip.name;
      let loadError = "";
      try {
        buffer = await loadDemoClip(ctx, clip);
      } catch (err) {
        console.error("[DawWorkstationScreen] failed to load demo clip", clip.id, err);
        if (!demoBufferRef.current) demoBufferRef.current = createDemoLoopBuffer(ctx);
        buffer = demoBufferRef.current;
        name = "Demo Loop";
        loadError = `Couldn't load "${clip.name}" — using a synthetic pad instead.`;
      }
      const peaks = computePeaks(buffer);
      releaseTrackRegions(id);
      const next = tracksRef.current.map((t) =>
        t.id === id ? { ...t, buffer, peaks, duration: buffer.duration, name, loadError, regions: [] } : t,
      );
      tracksRef.current = next;
      setTracks(next);
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [ensureContext, loadDemoClip, releaseTrackRegions, playFrom, currentOffset],
  );

  const handleTrackFile = useCallback(
    async (id, e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const ctx = await ensureContext();
      if (!ctx) {
        setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, loadError: "Could not start the audio engine." } : t)));
        return;
      }
      try {
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer);
        const peaks = computePeaks(decoded);
        releaseTrackRegions(id);
        const next = tracksRef.current.map((t) =>
          t.id === id ? { ...t, buffer: decoded, peaks, duration: decoded.duration, name: file.name, loadError: "", regions: [] } : t,
        );
        tracksRef.current = next;
        setTracks(next);
        if (isPlayingRef.current) playFrom(currentOffset());
      } catch (err) {
        console.error("[DawWorkstationScreen] upload failed", err);
        setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, loadError: "Could not decode that audio file." } : t)));
      }
    },
    [ensureContext, releaseTrackRegions, playFrom, currentOffset],
  );

  const setTrackVolume = useCallback((id, volume) => {
    const next = tracksRef.current.map((t) => (t.id === id ? { ...t, volume } : t));
    tracksRef.current = next;
    setTracks(next);
    const track = next.find((t) => t.id === id);
    const nodes = graphRef.current?.trackNodes.get(id);
    if (nodes && graphRef.current && track && !track.muted) {
      nodes.trackGain.gain.setTargetAtTime(volume, graphRef.current.ctx.currentTime, 0.01);
    }
  }, []);

  const toggleTrackMute = useCallback((id) => {
    let mutedNow = false;
    let volumeNow = 1;
    const next = tracksRef.current.map((t) => {
      if (t.id !== id) return t;
      mutedNow = !t.muted;
      volumeNow = t.volume ?? 1;
      return { ...t, muted: mutedNow };
    });
    tracksRef.current = next;
    setTracks(next);
    const nodes = graphRef.current?.trackNodes.get(id);
    if (nodes && graphRef.current) {
      nodes.trackGain.gain.setTargetAtTime(mutedNow ? 0 : volumeNow, graphRef.current.ctx.currentTime, 0.01);
    }
  }, []);

  // ── Move a track's clip start position (drag it anywhere in the
  // arrangement, like a real DAW) ─────────────────────────────────────────
  // Plain state update — no live graph rebuild here. A position drag can
  // fire many times a second; tearing down/rebuilding the whole playback
  // graph (every track's chains, every Faust node reconnected) on each of
  // those would be both wasteful and audibly glitchy. Whatever's already
  // playing keeps playing at its old position until the drag actually ends
  // (see endClipDrag below), then the graph rebuilds once from the current
  // transport position with the new startAt baked in.
  const setTrackStartAt = useCallback((id, startAt) => {
    const clamped = Math.max(0, startAt);
    const next = tracksRef.current.map((t) => (t.id === id ? { ...t, startAt: clamped } : t));
    tracksRef.current = next;
    setTracks(next);
  }, []);

  // { trackId, pointerId, startClientX, startAt, secondsPerPixel } while a
  // clip drag is in progress, else null. secondsPerPixel is snapshotted
  // once at drag start (from the arrangement pane's current width and the
  // arrangement's current duration) rather than recomputed every move —
  // the arrangement can get longer as you drag a clip further right, and
  // recomputing against that growing length mid-drag would make the clip
  // fight your own cursor instead of tracking it 1:1.
  const dragClipRef = useRef(null);

  const beginClipDrag = useCallback(
    (e, track) => {
      const container = arrangementRef.current;
      if (!container) return;
      e.stopPropagation();
      const containerWidth = container.clientWidth || 1;
      const secondsPerPixel = Math.max(arrangementDuration, 1) / containerWidth;
      dragClipRef.current = {
        trackId: track.id,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startAt: track.startAt ?? 0,
        secondsPerPixel,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ok — dragging still works without capture, just less robust if the pointer leaves the element */
      }
      setSelectedTrackId(track.id);
    },
    [arrangementDuration],
  );

  const onClipPointerMove = useCallback(
    (e) => {
      const drag = dragClipRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const deltaSec = (e.clientX - drag.startClientX) * drag.secondsPerPixel;
      setTrackStartAt(drag.trackId, drag.startAt + deltaSec);
    },
    [setTrackStartAt],
  );

  const endClipDrag = useCallback(
    (e) => {
      const drag = dragClipRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragClipRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ok */
      }
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [playFrom, currentOffset],
  );

  // ── Portion selection & management ──────────────────────────────────────
  // Selecting a portion highlights it, points the dock's chain editor at
  // it, and (if the mix is already playing) immediately switches the
  // transport to loop just that portion's own window.
  const selectRegion = useCallback(
    (trackId, regionId) => {
      selectedRegionRef.current = { trackId, regionId };
      setSelectedRegion({ trackId, regionId });
      setSelectedTrackId(trackId);
      setDockScope("portion");
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [playFrom, currentOffset],
  );

  // "✕ Exit Selection" (and Escape) — deselects the portion and returns Play
  // to covering the whole arrangement again.
  const exitSelection = useCallback(() => {
    selectedRegionRef.current = null;
    setSelectedRegion(null);
    setDockScope("portion");
    if (isPlayingRef.current) playFrom(currentOffset());
  }, [playFrom, currentOffset]);

  // Carves a new portion out of whichever dry gap (see computeSegments)
  // contains the drag's anchor point, clamped to that gap so it can never
  // overlap an existing portion on the same track. Auto-selects the new
  // portion once created.
  const createRegion = useCallback(
    (trackId, start, end) => {
      const track = tracksRef.current.find((t) => t.id === trackId);
      if (!track) return;
      const segments = computeSegments(track);
      const gap = segments.find((s) => s.region === null && start >= s.start - 1e-6 && start <= s.end + 1e-6);
      if (!gap) return;
      const s = Math.max(start, gap.start);
      const e = Math.min(end, gap.end);
      if (e - s < MIN_REGION_LEN) return;
      const id = `${trackId}-r${++regionIdRef.current}`;
      // outerCustomized: false — a fresh portion's "Outer" scope just reads
      // through to the track's own chain (see getChainArray) until someone
      // actually edits it there, at which point forkOuterChainIfNeeded
      // snapshots a private copy into outerChain and flips this to true.
      const region = { id, start: s, end: e, chain: [], outerChain: [], outerCustomized: false };
      const next = tracksRef.current.map((t) => (t.id === trackId ? { ...t, regions: [...t.regions, region] } : t));
      tracksRef.current = next;
      setTracks(next);
      selectRegion(trackId, id);
    },
    [selectRegion],
  );

  const removeRegion = useCallback(
    (trackId, regionId) => {
      const track = tracksRef.current.find((t) => t.id === trackId);
      const region = track?.regions.find((r) => r.id === regionId);
      const next = tracksRef.current.map((t) =>
        t.id === trackId ? { ...t, regions: t.regions.filter((r) => r.id !== regionId) } : t,
      );
      tracksRef.current = next;
      setTracks(next);
      region?.chain.forEach((slot) => {
        try {
          slot.node?.disconnect();
        } catch {
          /* ok */
        }
      });
      if (activeEditorRef.current?.trackId === trackId && activeEditorRef.current?.regionId === regionId) setActiveEditor(null);
      if (selectedRegionRef.current?.trackId === trackId && selectedRegionRef.current?.regionId === regionId) {
        selectedRegionRef.current = null;
        setSelectedRegion(null);
      }
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [currentOffset, playFrom],
  );

  // { trackId, pointerId, rectLeft, secondsPerPixel, anchor, duration }
  // while a portion is being drawn, else null. `anchor` is the buffer-
  // relative second where the drag started; the draft portion's start/end
  // are [min, max] of that anchor and the pointer's current position, so
  // dragging either left or right from the anchor both work.
  const dragRegionRef = useRef(null);

  const beginRegionDrag = useCallback((e, track) => {
    if (!track.buffer) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width || 1;
    const secondsPerPixel = track.duration / width;
    const anchor = clamp((e.clientX - rect.left) * secondsPerPixel, 0, track.duration);
    dragRegionRef.current = { trackId: track.id, pointerId: e.pointerId, rectLeft: rect.left, secondsPerPixel, anchor, duration: track.duration };
    setDraftRegion({ trackId: track.id, start: anchor, end: anchor });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ok — dragging still works without capture, just less robust if the pointer leaves the element */
    }
  }, []);

  const onRegionPointerMove = useCallback((e) => {
    const drag = dragRegionRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const cur = clamp((e.clientX - drag.rectLeft) * drag.secondsPerPixel, 0, drag.duration);
    const start = Math.min(drag.anchor, cur);
    const end = Math.max(drag.anchor, cur);
    setDraftRegion({ trackId: drag.trackId, start, end });
  }, []);

  const endRegionDrag = useCallback(
    (e) => {
      const drag = dragRegionRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragRegionRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ok */
      }
      setDraftRegion((current) => {
        if (current && current.trackId === drag.trackId && current.end - current.start >= MIN_REGION_LEN) {
          createRegion(current.trackId, current.start, current.end);
        }
        return null;
      });
    },
    [createRegion],
  );

  // ── Scrub: drag the red playhead line to seek to any position ──────────
  // Same "update visually every move, only touch the live audio graph once
  // the drag ends" split as the clip drag above — the mix keeps playing at
  // wherever it already was while you drag (rebuilding the whole playback
  // graph on every pointermove would glitch), and jumps to the new
  // position the moment you let go. Clamped to the selected portion's own
  // window while one is selected, same as playFrom's own loop bounds.
  // { pointerId, startClientX, startOffset, secondsPerPixel } while a scrub
  // is in progress, else null — also checked by the playhead-poll effect
  // above so it doesn't fight the drag by overwriting `playhead` with the
  // (stale, pre-seek) live position every tick.
  const dragPlayheadRef = useRef(null);

  const beginPlayheadDrag = useCallback(
    (e) => {
      const container = arrangementRef.current;
      if (!container || arrangementDuration <= 0) return;
      e.stopPropagation();
      const containerWidth = container.clientWidth || 1;
      dragPlayheadRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startOffset: currentOffset(),
        secondsPerPixel: arrangementDuration / containerWidth,
      };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ok — dragging still works without capture, just less robust if the pointer leaves the element */
      }
    },
    [arrangementDuration, currentOffset],
  );

  const onPlayheadPointerMove = useCallback(
    (e) => {
      const drag = dragPlayheadRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const deltaSec = (e.clientX - drag.startClientX) * drag.secondsPerPixel;
      const pw = getPreviewWindow();
      const lo = pw ? pw.start : 0;
      const hi = pw ? pw.end : arrangementDuration;
      const next = clamp(drag.startOffset + deltaSec, lo, hi);
      pausedOffsetRef.current = next;
      setPlayhead(next);
    },
    [arrangementDuration, getPreviewWindow],
  );

  const endPlayheadDrag = useCallback(
    (e) => {
      const drag = dragPlayheadRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragPlayheadRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ok */
      }
      if (isPlayingRef.current) playFrom(pausedOffsetRef.current);
    },
    [playFrom],
  );

  // Renders one track through its own portions + volume (offline, not the
  // live playback graph) and downloads the result as a WAV — the per-track
  // "Download" button in the tracklist.
  const handleDownloadTrack = useCallback(async (id) => {
    const track = tracksRef.current.find((t) => t.id === id);
    if (!track || !track.buffer) return;
    setDownloadError("");
    setDownloadingTrackId(id);
    try {
      const rendered = await renderTrackOffline(engineCacheRef.current, track);
      downloadAudioBufferAsWav(rendered, `${track.name || "track"}.wav`);
    } catch (err) {
      console.error("[DawWorkstationScreen] failed to render track for download", err);
      setDownloadError("Could not render that track for download — see console for details.");
    } finally {
      setDownloadingTrackId(null);
    }
  }, []);

  // Renders every track (its own portions + volume + mute) summed into one
  // mixdown (offline) and downloads it as a WAV — the topbar's "Download
  // Mix" button.
  const handleDownloadMix = useCallback(async () => {
    const list = tracksRef.current.filter((t) => t.buffer);
    if (list.length === 0) return;
    const ctx = await ensureContext();
    if (!ctx) return;
    setDownloadError("");
    setDownloadingMix(true);
    try {
      const rendered = await renderMixOffline(engineCacheRef.current, list, ctx.sampleRate);
      if (rendered) downloadAudioBufferAsWav(rendered, "studio-vr-mix.wav");
    } catch (err) {
      console.error("[DawWorkstationScreen] failed to render mix for download", err);
      setDownloadError("Could not render the mix for download — see console for details.");
    } finally {
      setDownloadingMix(false);
    }
  }, [ensureContext]);

  // The panorama's ambient "mild air" room tone AND the recording-room
  // bleed (both spatialAudioEngine module-level singletons — see
  // PanoramaTour.jsx) play continuously underneath the whole VR tour and
  // keep running even while this overlay is open on top of them, since
  // opening the DAW doesn't unmount PanoramaTour. Left alone, either would
  // bleed into the mix the whole time you're working here (ironic, for the
  // bleed one) — silence both for the duration the DAW is open, and restore
  // them (to generic defaults; see DEFAULT_AMBIENCE/ROOM_BLEED above — this
  // screen doesn't know the current room's own custom profiles) once you
  // exit back to the studio.
  useEffect(() => {
    if (isOpen) {
      stopAmbientBed();
      stopRoomBleed();
    } else {
      setRoomAmbience(DEFAULT_AMBIENCE);
      startRoomBleed(ROOM_BLEED.audio, ROOM_BLEED.yaw, ROOM_BLEED.pitch);
    }
  }, [isOpen]);

  // Seed the mix with all three Hungarian Dance No. 5 stems as its default
  // tracks the first time the screen opens — fetched in parallel (they're
  // real ~20-45MB files), then added as tracks in a fixed order so the
  // tracklist/colors come out the same every time regardless of which
  // fetch happens to resolve first.
  useEffect(() => {
    if (!isOpen || tracksRef.current.length > 0) return;
    (async () => {
      const ctx = await ensureContext();
      if (!ctx) return;
      const buffers = await Promise.all(
        DEMO_CLIPS.map((clip) =>
          loadDemoClip(ctx, clip).catch((err) => {
            console.error("[DawWorkstationScreen] failed to load default demo track", clip.id, err);
            return null;
          }),
        ),
      );
      let firstId = null;
      DEMO_CLIPS.forEach((clip, i) => {
        let buffer = buffers[i];
        let name = clip.name;
        if (!buffer) {
          if (!demoBufferRef.current) demoBufferRef.current = createDemoLoopBuffer(ctx);
          buffer = demoBufferRef.current;
          name = "Demo Loop";
        }
        const id = addTrackWithBuffer(buffer, name);
        if (firstId === null) firstId = id;
      });
      if (firstId !== null) setSelectedTrackId(firstId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Tear everything down on every open<->close transition (unconditional
  // cleanup keyed on `isOpen` — React runs it right BEFORE re-running this
  // effect for the new value, i.e. exactly on the open->closed transition
  // and again on unmount, not lazily on the next reopen).
  useEffect(() => {
    return () => {
      teardownPlaybackGraph();
      tracksRef.current.forEach((t) => {
        disconnectChainSlots(t.chain);
        t.regions.forEach((region) => {
        disconnectChainSlots(region.chain);
        disconnectChainSlots(region.outerChain || []);
      });
      });
      tracksRef.current = [];
      setTracks([]);
      setActiveEditor(null);
      selectedRegionRef.current = null;
      setSelectedRegion(null);
      setDraftRegion(null);
      pausedOffsetRef.current = 0;
      setPlayhead(0);
      setIsPlaying(false);
    };
  }, [isOpen, teardownPlaybackGraph]);

  // ── Per-portion insert chain management ─────────────────────────────────
  // Every function below addresses a chain through the same
  // `(trackId, regionId)` pair — `regionId === TRACK_CHAIN_SCOPE` targets
  // the track's own whole-track chain, any other regionId targets that
  // portion's own chain (layered after the track's) — via
  // getChainArray/withChainArray, so the whole-track chain and every
  // portion's chain share one implementation instead of two parallel ones.

  // Awaits a plugin's Faust engine, then flips its (already-present, status
  // "loading") chain slot to "ready" (or "error") in place. Shared by
  // addOrSelectPlugin (loading a brand-new slot the user just added) and
  // forkOuterChainIfNeeded (loading fresh engine instances for a portion's
  // private copy of the track's chain — a live Faust node holds its own
  // parameter state, so it can't be shared between the track's own signal
  // path and a portion's forked one; each scope needs its own instance).
  const loadSlotEngineFor = useCallback(
    async (trackId, regionId, def) => {
      const ctx = await ensureContext();
      if (!ctx) {
        const errored = tracksRef.current.map((t) =>
          t.id === trackId
            ? withChainArray(t, regionId, getChainArray(t, regionId).map((s) => (s.key === def.key ? { ...s, status: "error" } : s)))
            : t,
        );
        tracksRef.current = errored;
        setTracks(errored);
        return;
      }
      try {
        const { node, meta } = await loadPluginEngine(ctx, def);
        const stillTrack = tracksRef.current.find((t) => t.id === trackId);
        const stillChain = getChainArray(stillTrack, regionId);
        const stillSlot = stillChain?.find((s) => s.key === def.key);
        if (!stillSlot) {
          try {
            node.disconnect();
          } catch {
            /* ok */
          }
          return;
        }
        const flatItems = meta.ui?.[0]?.items ?? [];
        const meters = collectMeters(flatItems);
        const addressKey = `${trackId}:${regionId}:${def.key}`;
        // EQ gets its own dedicated handler straight into eqLiveDynGainRef
        // (bandId-keyed, matching EqualizerEditorPanel's contract) instead
        // of the generic address-keyed meterValuesRef every other plugin
        // here uses for its own getXLevels reads.
        if (def.key === "eq") {
          node.setOutputParamHandler?.((address, value) => {
            const bandId = LIVE_GAIN_ADDR_TO_BAND[address];
            if (bandId) eqLiveDynGainRef.current[bandId] = value;
          });
        } else if (meters.length && node.setOutputParamHandler) {
          node.setOutputParamHandler((address, value) => {
            const m = meterValuesRef.current.get(addressKey) || {};
            m[address] = value;
            meterValuesRef.current.set(addressKey, m);
          });
        }
        const ready = tracksRef.current.map((t) =>
          t.id === trackId
            ? withChainArray(
                t,
                regionId,
                getChainArray(t, regionId).map((s) => (s.key === def.key ? { ...s, node, meta, meters, status: "ready" } : s)),
              )
            : t,
        );
        tracksRef.current = ready;
        setTracks(ready);
        // Auto-rebuild the live graph once this plugin's Faust engine is
        // ready, so a plugin added while the mix is already playing becomes
        // audible immediately without a manual Process click. This used to
        // race when several plugins were added in a row (each resolving
        // this success path independently and each tearing down the
        // previous call's half-built graph); playFrom() is now guarded by
        // playCallTokenRef so only the most recent call actually rebuilds,
        // making it safe to trigger from here again.
        if (isPlayingRef.current) playFrom(currentOffset());
      } catch (err) {
        console.error("[DawWorkstationScreen] failed to load plugin", def.key, err);
        const errored = tracksRef.current.map((t) =>
          t.id === trackId
            ? withChainArray(
                t,
                regionId,
                getChainArray(t, regionId).map((s) => (s.key === def.key ? { ...s, status: "error" } : s)),
              )
            : t,
        );
        tracksRef.current = errored;
        setTracks(errored);
      }
    },
    [ensureContext, loadPluginEngine, currentOffset, playFrom],
  );

  // A portion's outer scope starts as a live read-through of the track's own
  // chain (see getChainArray) rather than an actually-private array — so a
  // portion nobody has customized still exactly tracks whatever the track
  // chain becomes later, and nothing needs forking just to look at it. The
  // first real edit from inside that scope — every mutator below
  // (addOrSelectPlugin, removePlugin, movePlugin, reorderPlugin,
  // toggleBypass, updateSlot) calls this first — snapshots the CURRENT
  // track chain into this portion's own `outerChain`, marks it
  // `outerCustomized`, and kicks off fresh engine loads for each cloned
  // slot (the track's own live nodes stay wired into the track's own path
  // and can't be reused here). After this, the portion's outer chain is
  // fully independent: it can be edited or have plugins removed freely
  // without touching the track chain or any other portion, or simply left
  // alone to keep following the track chain forever. No-ops if already
  // customized, or if `regionId` isn't an outer scope at all.
  const forkOuterChainIfNeeded = useCallback(
    (trackId, regionId) => {
      if (!isOuterScope(regionId)) return;
      const track = tracksRef.current.find((t) => t.id === trackId);
      const region = track?.regions.find((r) => r.id === baseRegionId(regionId));
      if (!track || !region || region.outerCustomized) return;
      const clonedChain = track.chain.map((slot) => ({
        ...slot,
        node: null,
        meta: null,
        meters: [],
        status: "loading",
      }));
      const next = tracksRef.current.map((t) =>
        t.id === trackId
          ? { ...t, regions: t.regions.map((r) => (r.id === region.id ? { ...r, outerChain: clonedChain, outerCustomized: true } : r)) }
          : t,
      );
      tracksRef.current = next;
      setTracks(next);
      clonedChain.forEach((slot) => {
        const def = PLUGIN_DEFS.find((d) => d.key === slot.key);
        if (def) void loadSlotEngineFor(trackId, regionId, def);
      });
    },
    [loadSlotEngineFor],
  );

  const addOrSelectPlugin = useCallback(
    async (trackId, regionId, def) => {
      const track = tracksRef.current.find((t) => t.id === trackId);
      const chainArr = getChainArray(track, regionId);
      if (!track || !chainArr) return;
      const existing = chainArr.find((s) => s.key === def.key);
      if (existing) {
        // Just opening the popup on a plugin that's already there (whether
        // inherited from the track chain or already private to this
        // portion) is a look, not an edit — no fork here. Actually changing
        // anything from inside that popup goes through updateSlot, which
        // forks on its own the moment a real change happens.
        setActiveEditor({ trackId, regionId, key: def.key });
        return;
      }
      // A genuinely new plugin (not already inherited or private) is
      // unambiguously a customization — fork this portion's outer chain
      // first (a no-op everywhere else, and if it's already customized) so
      // the new plugin lands in a private copy instead of the track's own.
      forkOuterChainIfNeeded(trackId, regionId);
      const loadingSlot = {
        key: def.key,
        name: def.name,
        color: def.color,
        tag: def.tag,
        wiring: def.wiring,
        node: null,
        meta: null,
        meters: [],
        status: "loading",
        bypassed: false,
        ...defaultSlotExtras(def.key),
      };
      const next = tracksRef.current.map((t) =>
        t.id === trackId ? withChainArray(t, regionId, [...getChainArray(t, regionId), loadingSlot]) : t,
      );
      tracksRef.current = next;
      setTracks(next);
      setActiveEditor({ trackId, regionId, key: def.key });
      await loadSlotEngineFor(trackId, regionId, def);
    },
    [forkOuterChainIfNeeded, loadSlotEngineFor],
  );

  const removePlugin = useCallback(
    (trackId, regionId, key) => {
      // Removing an inherited (not-yet-customized) plugin from a portion's
      // outer scope is still a customization — it means "not for this
      // portion" — so fork first, same as every other mutator here.
      forkOuterChainIfNeeded(trackId, regionId);
      const track = tracksRef.current.find((t) => t.id === trackId);
      const chainArr = getChainArray(track, regionId);
      const slot = chainArr?.find((s) => s.key === key);
      const next = tracksRef.current.map((t) =>
        t.id === trackId ? withChainArray(t, regionId, getChainArray(t, regionId).filter((s) => s.key !== key)) : t,
      );
      tracksRef.current = next;
      setTracks(next);
      if (
        activeEditorRef.current?.trackId === trackId &&
        activeEditorRef.current?.regionId === regionId &&
        activeEditorRef.current?.key === key
      ) {
        setActiveEditor(null);
      }
      try {
        slot?.node?.disconnect();
      } catch {
        /* ok */
      }
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [forkOuterChainIfNeeded, currentOffset, playFrom],
  );

  const movePlugin = useCallback(
    (trackId, regionId, key, dir) => {
      forkOuterChainIfNeeded(trackId, regionId);
      const track = tracksRef.current.find((t) => t.id === trackId);
      const chainArr = getChainArray(track, regionId);
      if (!chainArr) return;
      const idx = chainArr.findIndex((s) => s.key === key);
      const j = idx + dir;
      if (idx === -1 || j < 0 || j >= chainArr.length) return;
      const chain = [...chainArr];
      [chain[idx], chain[j]] = [chain[j], chain[idx]];
      const next = tracksRef.current.map((t) => (t.id === trackId ? withChainArray(t, regionId, chain) : t));
      tracksRef.current = next;
      setTracks(next);
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [forkOuterChainIfNeeded, currentOffset, playFrom],
  );

  // Drag-and-drop reorder: moves `fromKey` to sit where `toKey` currently is.
  const reorderPlugin = useCallback(
    (trackId, regionId, fromKey, toKey) => {
      if (fromKey === toKey) return;
      forkOuterChainIfNeeded(trackId, regionId);
      const track = tracksRef.current.find((t) => t.id === trackId);
      const chainArr = getChainArray(track, regionId);
      if (!chainArr) return;
      const fromIdx = chainArr.findIndex((s) => s.key === fromKey);
      const toIdx = chainArr.findIndex((s) => s.key === toKey);
      if (fromIdx === -1 || toIdx === -1) return;
      const chain = [...chainArr];
      const [moved] = chain.splice(fromIdx, 1);
      chain.splice(toIdx, 0, moved);
      const next = tracksRef.current.map((t) => (t.id === trackId ? withChainArray(t, regionId, chain) : t));
      tracksRef.current = next;
      setTracks(next);
      if (isPlayingRef.current) playFrom(currentOffset());
    },
    [forkOuterChainIfNeeded, currentOffset, playFrom],
  );

  const toggleBypass = useCallback(
    (trackId, regionId, key) => {
      forkOuterChainIfNeeded(trackId, regionId);
      let bypassedNow = false;
      const next = tracksRef.current.map((t) => {
        if (t.id !== trackId) return t;
        const chainArr = getChainArray(t, regionId);
        if (!chainArr) return t;
        const chain = chainArr.map((s) => {
          if (s.key !== key) return s;
          bypassedNow = !s.bypassed;
          return { ...s, bypassed: bypassedNow };
        });
        return withChainArray(t, regionId, chain);
      });
      tracksRef.current = next;
      setTracks(next);
      const live = slotRuntimeRef.current.get(`${trackId}:${regionId}:${key}`);
      if (live && graphRef.current) {
        const ctx = graphRef.current.ctx;
        live.bypassGain.gain.setTargetAtTime(bypassedNow ? 1 : 0, ctx.currentTime, 0.01);
        live.wetGain.gain.setTargetAtTime(bypassedNow ? 0 : 1, ctx.currentTime, 0.01);
      }
    },
    [forkOuterChainIfNeeded],
  );

  // Generic setter used by every *EditorPanel below to patch fields on
  // whichever track/portion + plugin slot is open in the popup (mirrors the
  // plain useState setters the standalone chapter labs pass their own
  // panels).
  const updateSlot = useCallback(
    (trackId, regionId, key, patch) => {
      // A param tweak from inside the popup is exactly the kind of edit that
      // should fork an inherited outer chain into a private one — do it
      // first so the patch below lands on the portion's own copy, not the
      // track's.
      forkOuterChainIfNeeded(trackId, regionId);
      setTracks((prev) => {
        const next = prev.map((t) => {
          if (t.id !== trackId) return t;
          const chainArr = getChainArray(t, regionId);
          if (!chainArr) return t;
          const chain = chainArr.map((s) => (s.key !== key ? s : { ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
          return withChainArray(t, regionId, chain);
        });
        tracksRef.current = next;
        return next;
      });
    },
    [forkOuterChainIfNeeded],
  );

  // Push every chain's (the track's own, and every one of its portions')
  // per-slot typed params onto its live Faust node, via each plugin's own
  // pushFaustParams (the same functions the standalone chapter labs use) —
  // runs across the whole mix on every params change.
  useEffect(() => {
    tracks.forEach((t) => {
      const scopes = [
        { regionId: TRACK_CHAIN_SCOPE, chain: t.chain },
        ...t.regions.flatMap((r) => [
          { regionId: r.id, chain: r.chain },
          { regionId: outerScopeId(r.id), chain: r.outerChain || [] },
        ]),
      ];
      scopes.forEach(({ regionId, chain }) => {
        chain.forEach((slot) => {
          if (!slot.node || slot.status !== "ready") return;
          if (slot.key === "gate") pushGateParams(slot.node, slot.params, slot.sidechain);
          else if (slot.key === "deess") pushDeEsserParams(slot.node, slot.params);
          else if (slot.key === "comp") pushCompParams(slot.node, slot.bands, slot.crossover, slot.sidechain, slot.outputGainDb, false, slot.multiband);
          else if (slot.key === "limiter") pushLimiterParams(slot.node, slot.params);
          else if (slot.key === "delay") pushDelayParams(slot.node, slot.params);
          else if (slot.key === "reverb") pushReverbParams(slot.node, slot.params);
          else if (slot.key === "eq") applyEqBandsToNode(slot.node, slot.bands);
        });
        const eqSlot = chain.find((s) => s.key === "eq");
        if (eqSlot) {
          const rt = eqRuntimeRef.current.get(`${t.id}:${regionId}`);
          if (rt?.outputGainNode) applyEqOutputGain(rt.outputGainNode, eqSlot.outputGainDb ?? 0, graphRef.current?.ctx);
        }
      });
    });
  }, [tracks]);

  // Point the EQ popup's analyser refs at whichever portion's live EQ nodes
  // are currently playing (or clear them when no EQ popup is open).
  useEffect(() => {
    if (activeEditor?.key === "eq") {
      const rt = eqRuntimeRef.current.get(`${activeEditor.trackId}:${activeEditor.regionId}`);
      eqAnalyserRef.current = rt?.analyser ?? null;
      eqDryAnalyserRef.current = rt?.dryAnalyser ?? null;
      eqLiveDynGainRef.current = {};
    } else {
      eqAnalyserRef.current = null;
      eqDryAnalyserRef.current = null;
    }
  }, [activeEditor]);

  // ── Live level getters for whichever plugin popup is open ──────────────
  // Stable identities (useCallback with no deps, reading activeEditorRef at
  // call time) — every *EditorPanel's own animation-frame effect lists
  // these in its dependency array, so a fresh function reference every
  // render would restart that loop constantly.
  const getNow = useCallback(() => graphRef.current?.ctx.currentTime ?? 0, []);

  const getGateLevels = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:gate`);
    if (!live) return null;
    const inputDb = analyserPeakDb(live.inputAnalyser);
    const outputDb = analyserPeakDb(live.outputAnalyser);
    if (inputDb === null || outputDb === null) return null;
    return { inputDb, outputDb, detectDb: inputDb };
  }, []);

  const getDeEsserInputDb = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:deess`);
    return live ? analyserPeakDb(live.inputAnalyser) : null;
  }, []);
  const getDeEsserGainReductionDb = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return 0;
    const mv = meterValuesRef.current.get(`${ed.trackId}:${ed.regionId}:deess`);
    return mv ? (mv[DEESS_ADDR.gainReduction] ?? 0) : 0;
  }, []);

  const getCompLevels = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:comp`);
    if (!live) return null;
    const inputDb = analyserPeakDb(live.inputAnalyser);
    const outputDb = analyserPeakDb(live.outputAnalyser);
    if (inputDb === null || outputDb === null) return null;
    const mv = meterValuesRef.current.get(`${ed.trackId}:${ed.regionId}:comp`) || {};
    const bandGr = {};
    for (const b of COMP_BAND_IDS) {
      const v = mv[COMP_ADDR.band(b).gr];
      bandGr[b] = v !== undefined ? Math.max(0, -v) : 0;
    }
    return { inputDb, outputDb, bandGr };
  }, []);

  const getLimiterLevels = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:limiter`);
    if (!live) return null;
    const inputDb = analyserPeakDb(live.inputAnalyser);
    const outputDb = analyserPeakDb(live.outputAnalyser);
    if (inputDb === null || outputDb === null) return null;
    const mv = meterValuesRef.current.get(`${ed.trackId}:${ed.regionId}:limiter`) || {};
    const gainReductionDb = mv[LIMITER_ADDR.gainReduction] ?? 0;
    return { inputDb, outputDb, gainReductionDb };
  }, []);

  const getDelayInputPeak = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:delay`);
    return live ? analyserPeakLinear(live.inputAnalyser) : null;
  }, []);
  const getDelayOutputPeak = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:delay`);
    return live ? analyserPeakLinear(live.outputAnalyser) : null;
  }, []);

  const getReverbInputPeak = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:reverb`);
    return live ? analyserPeakLinear(live.inputAnalyser) : null;
  }, []);
  const getReverbOutputPeak = useCallback(() => {
    const ed = activeEditorRef.current;
    if (!ed) return null;
    const live = slotRuntimeRef.current.get(`${ed.trackId}:${ed.regionId}:reverb`);
    return live ? analyserPeakLinear(live.outputAnalyser) : null;
  }, []);

  // Opening (or switching between) plugin popups used to auto-start/stop a
  // preview loop via an effect keyed on `activeEditor`. That fired on EVERY
  // popup switch — not just open/close — and raced with the plugin-load
  // completion path below, so adding several plugins in a row and clicking
  // between their editors could trigger two overlapping playFrom() calls
  // (each tearing down the other's half-built graph), which is what made
  // playback appear to "pause" when switching. A new plugin now auto-joins
  // an already-playing mix as soon as its engine finishes loading (see the
  // success path in addOrSelectPlugin, guarded by playCallTokenRef so it
  // can't race), so nothing needs to be clicked for it to become audible.
  // Process/Apply remain as explicit manual controls: Process (re)starts
  // the looped preview from the current position, Apply pushes the current
  // chain/params into an already-playing mix and closes the popup.
  const handleProcess = useCallback(() => {
    if (!loopOnRef.current) {
      setLoopOn(true);
      loopOnRef.current = true;
    }
    playFrom(pausedOffsetRef.current);
  }, [playFrom]);

  // Apply confirms the plugin (pushing it into an already-playing mix if
  // needed) and closes the popup.
  const handleApply = useCallback(() => {
    if (isPlayingRef.current) playFrom(currentOffset());
    setActiveEditor(null);
  }, [playFrom, currentOffset]);

  // Cancel just closes the popup without applying any pending changes — it
  // never removes the plugin from the chain, even if it was only just
  // added, since the plugin auto-processes into the live mix as soon as its
  // engine is ready. The only way to remove a plugin from the chain is the
  // explicit Remove button. This same handler backs the × close button and
  // clicking the backdrop, so every way of dismissing the popup behaves the
  // same way.
  const handleCancel = useCallback(() => {
    setActiveEditor(null);
  }, []);

  if (!isOpen) return null;

  const activeTrack = tracks.find((t) => t.id === activeEditor?.trackId);
  // `activeRegion` is only set for a REAL portion's popup — null for the
  // track's own whole-track chain (activeEditor.regionId === TRACK_CHAIN_SCOPE),
  // which the popup below uses to pick its tag text. `activeSlot` itself
  // resolves through getChainArray so it works for all three scopes.
  // baseRegionId un-suffixes an outer-scope id back to its region, so a
  // portion's private outer-chain popup still resolves to that portion.
  const activeRegion =
    activeEditor && activeEditor.regionId !== TRACK_CHAIN_SCOPE
      ? activeTrack?.regions.find((r) => r.id === baseRegionId(activeEditor.regionId))
      : null;
  const activeIsPortionOuter = !!(activeEditor && isOuterScope(activeEditor.regionId));
  const activeSlot = activeEditor ? getChainArray(activeTrack, activeEditor.regionId)?.find((s) => s.key === activeEditor.key) : undefined;
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) || null;
  const selectedRegionTrack = selectedRegion ? tracks.find((t) => t.id === selectedRegion.trackId) || null : null;
  const selectedRegionObj = selectedRegionTrack?.regions.find((r) => r.id === selectedRegion.regionId) || null;
  // The dock always edits ONE scope at a time. With a portion selected, the
  // "This portion" / "Track chain" tabs (dockScope) let you flip between
  // that portion's own chain and that SAME portion's own private outer
  // chain (outerScopeId — layered before the portion's own chain, after the
  // track's real whole-track chain, but never heard in gaps or other
  // portions) WITHOUT losing the portion highlight or preview loop; with no
  // portion selected there's only one scope, the selected track's real
  // whole-track chain (TRACK_CHAIN_SCOPE, heard everywhere on the track).
  const dockTrack = selectedRegionObj ? selectedRegionTrack : selectedTrack;
  const dockRegionId = selectedRegionObj
    ? dockScope === "track"
      ? outerScopeId(selectedRegionObj.id)
      : selectedRegionObj.id
    : TRACK_CHAIN_SCOPE;
  const dockChain = dockTrack ? getChainArray(dockTrack, dockRegionId) : undefined;
  // True only while the dock is showing a selected portion's PRIVATE outer
  // chain (the "Outer" tab) rather than its own chain or (with nothing
  // selected) the track's real whole-track chain.
  const dockOnPortionOuterScope = !!selectedRegionObj && dockScope === "track";
  const rulerMarks = Array.from({ length: Math.max(1, Math.ceil(arrangementDuration)) + 1 }, (_, i) => i);

  return (
    <div className="chapter-lab daw-root">
      <div className="daw-overlay is-open">
        <div className="daw-overlay-backdrop" />
        <div className="monitor-frame">
          <div className="daw-app">
            {/* Top bar: transport */}
            <div className="daw-topbar">
              <button className="exit-btn" onClick={onClose}>
                ‹ Exit to Studio
              </button>
              <div className="topbar-divider" />
              <div className="app-id">
                <div className="name">STUDIO VR — SESSION</div>
                <div className="daw-crumb">
                  STUDIO&nbsp;/&nbsp;CONTROL ROOM&nbsp;/&nbsp;<b>MIX WORKSTATION</b>
                </div>
              </div>
              <div className="topbar-divider" />
              <div className="transport">
                <button className="transport-btn" onClick={rewind} disabled={tracks.length === 0} title="Return to start">
                  ⏮
                </button>
                <button
                  className={"transport-btn play" + (isPlaying ? " is-playing" : "")}
                  onClick={togglePlay}
                  disabled={tracks.length === 0}
                  title="Play / Pause"
                >
                  {isPlaying ? "❚❚" : "▶"}
                </button>
                <button className="transport-btn" onClick={stop} disabled={tracks.length === 0} title="Stop">
                  ■
                </button>
                <button
                  className={"transport-btn loop" + (loopOn || selectedRegionObj ? " is-on" : "")}
                  onClick={toggleLoop}
                  disabled={!!selectedRegionObj}
                  title={selectedRegionObj ? "Loop is on automatically while previewing a portion" : "Loop the whole mix"}
                >
                  ⟲
                </button>
              </div>
              <div className="timecode">
                <span className="big">{fmtTime(playhead)}</span>
                <span className="bars">/ {fmtTime(arrangementDuration)}</span>
              </div>
              {selectedRegionObj && (
                <div className="preview-pill" title="Play is scoped to this portion — Exit to play the whole arrangement again">
                  Previewing {fmtTime(selectedRegionObj.start)}–{fmtTime(selectedRegionObj.end)}
                  <button onClick={exitSelection}>✕ Exit</button>
                </div>
              )}
              <div className="daw-topbar-right">
                <button
                  className="daw-btn small"
                  onClick={() => {
                    void handleDownloadMix();
                  }}
                  disabled={!tracks.some((t) => t.buffer) || downloadingMix}
                  title="Render every track's own portions + volume + mute, summed together, and download the mix as one WAV"
                >
                  {downloadingMix ? "Rendering…" : "Download Mix"}
                </button>
                <div>
                  <div className="master-meter">
                    {[0.5, 0.8, 1.05, 0.7].map((mul, i) => (
                      <i key={i} style={{ height: `${clamp(meterLevel * mul * 220, 8, 100)}%` }} />
                    ))}
                  </div>
                  <div className="master-label mono">MASTER</div>
                </div>
              </div>
            </div>

            {/* Body: tracklist (left) + arrangement/waveforms (right) —
                same layout as design/daw-workstation-screen-ui.html, just
                driven by the real multi-track state instead of mock data. */}
            <div className="daw-body">
              <div className="tracklist" ref={tracklistRef} onScroll={onTracklistScroll}>
                {tracks.map((track) => (
                  <div
                    key={track.id}
                    className={"track-row" + (track.id === selectedTrackId ? " is-selected" : "")}
                    style={{ "--track-color": `var(--${track.color})` }}
                    onClick={() => {
                      setSelectedTrackId(track.id);
                      if (selectedRegion && selectedRegion.trackId !== track.id) exitSelection();
                    }}
                  >
                    <div className="track-swatch" />
                    <div className="track-meta">
                      <div className="track-name">{track.name}</div>
                      <div className="track-sub mono">
                        {track.loadError ? (
                          <span className="track-sub-error">{track.loadError}</span>
                        ) : track.buffer ? (
                          `${track.startAt ? `@${fmtTime(track.startAt)} · ` : ""}${fmtTime(track.duration)} · ${track.chain.length} on track · ${track.regions.length} portion${track.regions.length === 1 ? "" : "s"}${track.muted ? " · Muted" : ""}`
                        ) : (
                          "No audio"
                        )}
                      </div>
                      <input
                        type="range"
                        className="track-vol"
                        min="0"
                        max="1.5"
                        step="0.01"
                        value={track.volume}
                        title="Volume"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setTrackVolume(track.id, parseFloat(e.target.value))}
                      />
                    </div>
                    <div className="track-btns">
                      <input
                        type="file"
                        accept="audio/*"
                        id={`daw-file-${track.id}`}
                        className="daw-file-input"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleTrackFile(track.id, e)}
                      />
                      <label htmlFor={`daw-file-${track.id}`} className="tbtn" title="Upload audio" onClick={(e) => e.stopPropagation()}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </label>
                      <div className="tbtn-select-wrap" onClick={(e) => e.stopPropagation()}>
                        <span className="tbtn" aria-hidden="true">
                          D
                        </span>
                        <select
                          className="tbtn-select"
                          value=""
                          title="Load a Hungarian Dance No. 5 stem onto this track"
                          aria-label="Load a demo clip onto this track"
                          onChange={(e) => {
                            const clip = DEMO_CLIPS.find((c) => c.id === e.target.value);
                            if (clip) loadDemoForTrack(track.id, clip);
                            e.target.value = "";
                          }}
                        >
                          <option value="" disabled>
                            Demo…
                          </option>
                          {DEMO_CLIPS.map((clip) => (
                            <option key={clip.id} value={clip.id}>
                              {clip.name.replace("Hungarian Dance No. 5 — ", "")}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        className={"tbtn m" + (track.muted ? " is-on" : "")}
                        title={track.muted ? "Unmute track" : "Mute track"}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTrackMute(track.id);
                        }}
                      >
                        M
                      </button>
                      <button
                        className="tbtn"
                        title={track.buffer ? "Download this track (its own portions + volume) as a WAV" : "Add audio to this track first"}
                        disabled={!track.buffer || downloadingTrackId === track.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDownloadTrack(track.id);
                        }}
                      >
                        {downloadingTrackId === track.id ? (
                          "…"
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 4v11M7.5 11.5 12 16l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M4 17v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      <button
                        className="tbtn danger"
                        title="Remove track"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTrack(track.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}

                <div className="track-row add-track-row" onClick={addEmptyTrack}>
                  <span className="add-track-plus">+</span>
                  <span>Add Track</span>
                </div>
              </div>

              <div className="arrangement" ref={arrangementRef} onScroll={onArrangementScroll}>
                <div className="ruler">
                  {rulerMarks.map((s) => (
                    <span key={s} className="ruler-mark" style={{ left: `${(s / Math.max(arrangementDuration, 1)) * 100}%` }}>
                      {s}s
                    </span>
                  ))}
                </div>
                <div className="arr-rows">
                  {tracks.map((track) => (
                    <div key={track.id} className="arr-row">
                      {track.peaks ? (
                        <div
                          className="clip"
                          style={{
                            "--track-color": `var(--${track.color})`,
                            left: `${clamp(((track.startAt ?? 0) / Math.max(arrangementDuration, 0.001)) * 100, 0, 100)}%`,
                            width: `${clamp((track.duration / Math.max(arrangementDuration, 0.001)) * 100, 0, 100)}%`,
                          }}
                        >
                          <div
                            className="clip-header"
                            title="Drag to move this track's start position — double-click to reset to 0:00"
                            onPointerDown={(e) => beginClipDrag(e, track)}
                            onPointerMove={onClipPointerMove}
                            onPointerUp={endClipDrag}
                            onPointerCancel={endClipDrag}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setTrackStartAt(track.id, 0);
                              if (isPlayingRef.current) playFrom(currentOffset());
                            }}
                          />
                          <div
                            className="clip-body"
                            title="Drag on the waveform to select a portion, then add a signal chain to it"
                            onPointerDown={(e) => beginRegionDrag(e, track)}
                            onPointerMove={onRegionPointerMove}
                            onPointerUp={endRegionDrag}
                            onPointerCancel={endRegionDrag}
                          >
                            <svg viewBox={`0 0 ${track.peaks.length} 100`} preserveAspectRatio="none" className="wave-svg">
                              {track.peaks.map(([min, max], i) => {
                                const y1 = 50 - max * 48;
                                const y2 = 50 - min * 48;
                                return <line key={i} x1={i} x2={i} y1={y1} y2={Math.max(y2, y1 + 0.6)} />;
                              })}
                            </svg>
                            {track.regions.map((region) => {
                              const isSelected = selectedRegion?.trackId === track.id && selectedRegion?.regionId === region.id;
                              // Before this portion's outer chain has been
                              // customized, it's just reading through to the
                              // track's own chain (see getChainArray) — show
                              // that real, currently-applied count here too
                              // instead of a misleading 0.
                              const outerCount = region.outerCustomized ? region.outerChain?.length || 0 : track.chain.length;
                              const totalCount = region.chain.length + outerCount;
                              return (
                                <div
                                  key={region.id}
                                  className={"clip-region" + (isSelected ? " is-selected" : "")}
                                  style={{
                                    left: `${clamp((region.start / Math.max(track.duration, 0.001)) * 100, 0, 100)}%`,
                                    width: `${clamp(((region.end - region.start) / Math.max(track.duration, 0.001)) * 100, 0, 100)}%`,
                                  }}
                                  title={`Portion ${fmtTime(region.start)}–${fmtTime(region.end)} · ${region.chain.length} plugin${region.chain.length === 1 ? "" : "s"}${outerCount ? ` + ${outerCount} outer${region.outerCustomized ? "" : " (inherited)"}` : ""} — click to edit its chain`}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    selectRegion(track.id, region.id);
                                  }}
                                >
                                  <button
                                    className="clip-region__remove"
                                    title="Delete this portion"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeRegion(track.id, region.id);
                                    }}
                                  >
                                    ×
                                  </button>
                                  {totalCount > 0 && <span className="clip-region__count mono">{totalCount}</span>}
                                </div>
                              );
                            })}
                            {draftRegion && draftRegion.trackId === track.id && (
                              <div
                                className="clip-region is-draft"
                                style={{
                                  left: `${clamp((draftRegion.start / Math.max(track.duration, 0.001)) * 100, 0, 100)}%`,
                                  width: `${clamp(((draftRegion.end - draftRegion.start) / Math.max(track.duration, 0.001)) * 100, 0, 100)}%`,
                                }}
                              />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="arr-row-empty">Upload or use demo</div>
                      )}
                    </div>
                  ))}
                  <div className="arr-row add-track-row-spacer" />
                </div>
                {arrangementDuration > 0 && (
                  <div
                    className="playhead"
                    title="Drag to seek to any position"
                    style={{ left: `${clamp((playhead / arrangementDuration) * 100, 0, 100)}%` }}
                    onPointerDown={beginPlayheadDrag}
                    onPointerMove={onPlayheadPointerMove}
                    onPointerUp={endPlayheadDrag}
                    onPointerCancel={endPlayheadDrag}
                  />
                )}
                {tracks.length === 0 && <div className="mixer-empty-hint">No tracks yet — click + Add Track on the left to get started.</div>}
              </div>
            </div>

            {/* Dock: signal chain for whichever scope is selected. With a
                portion selected, the Outer/This-portion tabs flip between
                that portion's own private outer chain and its own chain
                (both scoped ONLY to that portion — see playFrom); with no
                portion selected, the selected track's real whole-track
                chain, heard everywhere on the track. */}
            <div className="dock">
              <div className="dock-head">
                <div className="dock-title">
                  SIGNAL CHAIN{" "}
                  {selectedRegionObj ? (
                    <>
                      — <b style={{ color: `var(--${selectedRegionTrack.color})` }}>{selectedRegionTrack.name.toUpperCase()}</b>{" "}
                      <span className="mono">
                        [{fmtTime(selectedRegionObj.start)}–{fmtTime(selectedRegionObj.end)}]
                      </span>
                      {dockOnPortionOuterScope &&
                        (selectedRegionObj.outerCustomized ? " · outer (this portion only)" : " · outer (inherited from track — not yet customized)")}
                    </>
                  ) : selectedTrack ? (
                    <>
                      — <b style={{ color: `var(--${selectedTrack.color})` }}>{selectedTrack.name.toUpperCase()}</b> · whole track
                    </>
                  ) : (
                    <>— NO TRACK SELECTED</>
                  )}
                </div>
                {selectedRegionObj && (
                  <div className="dock-scope-tabs" role="tablist" aria-label="Chain scope">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dockScope === "track"}
                      className={"dock-scope-tab" + (dockScope === "track" ? " is-active" : "")}
                      onClick={() => setDockScope("track")}
                      title="Starts out showing the track's own chain, applied here same as everywhere else — edit, reorder, bypass, or remove a plugin to fork a private copy for only this portion, or leave it alone to keep following the track chain"
                    >
                      Outer (this portion)
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dockScope === "portion"}
                      className={"dock-scope-tab" + (dockScope === "portion" ? " is-active" : "")}
                      onClick={() => setDockScope("portion")}
                      title="Edit this portion's own chain — runs after its outer chain, only within the selected range"
                    >
                      This portion
                    </button>
                  </div>
                )}
                <div className="dock-head-right">
                  <div className="dock-hint">
                    {downloadError ? (
                      <span className="daw-error">{downloadError}</span>
                    ) : dockOnPortionOuterScope ? (
                      selectedRegionObj.outerCustomized ? (
                        "A pre-chain private to this portion — runs before its own chain below, and is never heard in gaps or other portions (edit the real whole-track chain by exiting selection first)"
                      ) : (
                        "Currently just following the track's own chain (shown below, nothing private yet) — edit, reorder, bypass, or remove a plugin here to fork a private copy for only this portion, or leave it as-is to keep inheriting the track chain"
                      )
                    ) : selectedRegionObj ? (
                      "Runs after this portion's own outer chain (see the Outer tab), only within this portion — click a plugin to add it, a chip to edit it"
                    ) : selectedTrack ? (
                      "Applies to the whole track — drag on the waveform to layer extra processing on top of a portion"
                    ) : (
                      "Select a track on the left"
                    )}
                  </div>
                  {selectedRegionObj && (
                    <button
                      className="daw-btn small"
                      onClick={exitSelection}
                      title="Deselect this portion — Play returns to the whole arrangement"
                    >
                      ✕ Exit Selection
                    </button>
                  )}
                </div>
              </div>

              {dockTrack && dockChain && (
                <>
                  {dockChain.length > 0 && (
                    <div className="chain-rack">
                      {dockChain.map((slot, i) => (
                        <div
                          key={slot.key}
                          className={
                            "chain-chip" +
                            (slot.bypassed ? " is-bypassed" : "") +
                            (slot.status === "error" ? " is-error" : "") +
                            (draggingKey === slot.key ? " is-dragging" : "")
                          }
                          style={{ "--pc": `var(--${slot.color})` }}
                          draggable
                          onDragStart={(e) => {
                            setDraggingKey(slot.key);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDraggingKey(null)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (draggingKey) reorderPlugin(dockTrack.id, dockRegionId, draggingKey, slot.key);
                            setDraggingKey(null);
                          }}
                          onClick={() => setActiveEditor({ trackId: dockTrack.id, regionId: dockRegionId, key: slot.key })}
                        >
                          <svg className="chain-chip__grip" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
                            <circle cx="2.5" cy="2.5" r="1.4" />
                            <circle cx="7.5" cy="2.5" r="1.4" />
                            <circle cx="2.5" cy="8" r="1.4" />
                            <circle cx="7.5" cy="8" r="1.4" />
                            <circle cx="2.5" cy="13.5" r="1.4" />
                            <circle cx="7.5" cy="13.5" r="1.4" />
                          </svg>
                          <span className="chain-chip__led" />
                          <PluginIcon pkey={slot.key} />
                          <span className="chain-chip__name">{slot.name}</span>
                          {slot.status === "loading" && <span className="chain-chip__status">…</span>}
                          <span className="chain-chip__btns">
                            <button
                              className={"bypass" + (slot.bypassed ? " is-on" : "")}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleBypass(dockTrack.id, dockRegionId, slot.key);
                              }}
                              title={slot.bypassed ? "Bypassed — click to re-enable" : "Bypass this plugin"}
                            >
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                                <path d="M8 2v5" strokeLinecap="round" />
                                <path d="M11.5 3.6a5 5 0 1 1-7 0" strokeLinecap="round" fill="none" />
                              </svg>
                            </button>
                            <button
                              disabled={i === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                movePlugin(dockTrack.id, dockRegionId, slot.key, -1);
                              }}
                              title="Move earlier"
                            >
                              ‹
                            </button>
                            <button
                              disabled={i === dockChain.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                movePlugin(dockTrack.id, dockRegionId, slot.key, 1);
                              }}
                              title="Move later"
                            >
                              ›
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removePlugin(dockTrack.id, dockRegionId, slot.key);
                              }}
                              title="Remove"
                            >
                              ×
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="plugin-grid">
                    {PLUGIN_DEFS.map((def) => {
                      const inChain = dockChain.some((s) => s.key === def.key);
                      return (
                        <div
                          key={def.key}
                          className={`plugin-slot c-${def.color}` + (inChain ? " is-active" : "")}
                          tabIndex={0}
                          onClick={() => addOrSelectPlugin(dockTrack.id, dockRegionId, def)}
                        >
                          {inChain && <span className="plugin-led" />}
                          <PluginIcon pkey={def.key} />
                          <div className="plugin-name">{def.name}</div>
                          <div className="plugin-tag mono">{def.tag}</div>
                          <div className="plugin-open mono">{inChain ? "EDIT →" : "ADD →"}</div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Plugin editor — a popup over everything else, per track/portion + plugin */}
        {activeSlot && activeTrack && (
          <div className="plugin-popup-overlay" onClick={handleCancel}>
            <div className="plugin-popup" style={{ "--pc": `var(--${activeSlot.color})` }} onClick={(e) => e.stopPropagation()}>
              <div className="plugin-popup__head">
                <PluginIcon pkey={activeSlot.key} />
                <div className="plugin-popup__titles">
                  <div className="plugin-popup__name">
                    {activeTrack.name} · {activeSlot.name}
                  </div>
                  <div className="plugin-popup__tag mono">
                    {activeSlot.tag} ·{" "}
                    {activeRegion
                      ? activeIsPortionOuter
                        ? `applied to ${fmtTime(activeRegion.start)}–${fmtTime(activeRegion.end)} only, before that portion's own chain${
                            activeRegion.outerCustomized ? "" : " (inherited from track — editing forks a private copy)"
                          }`
                        : `applied to ${fmtTime(activeRegion.start)}–${fmtTime(activeRegion.end)}, after the track's own chain`
                      : "applied to the whole track"}
                    {activeSlot.key === "gate" && activeSlot.status === "ready" && (
                      <> · {isPlaying ? (gateIsOpen ? "● OPEN" : "● CLOSED") : "○ IDLE"}</>
                    )}
                  </div>
                </div>
                <button
                  className="daw-btn small"
                  onClick={handleProcess}
                  title="Start/restart the preview loop so you can hear this track"
                >
                  {isPlaying ? "Processing…" : "▶ Process"}
                </button>
                <button
                  className="daw-btn small primary"
                  onClick={handleApply}
                  title="Keep this plugin in the chain, push it into the playing mix, and close"
                >
                  Apply
                </button>
                <button
                  className="daw-btn small"
                  onClick={handleCancel}
                  title="Close without changes"
                >
                  Cancel
                </button>
                <label className="daw-pill-toggle">
                  <input
                    type="checkbox"
                    checked={activeSlot.bypassed}
                    onChange={() => toggleBypass(activeTrack.id, activeEditor.regionId, activeSlot.key)}
                  />
                  Bypass
                </label>
                <button className="daw-btn small danger" onClick={() => removePlugin(activeTrack.id, activeEditor.regionId, activeSlot.key)}>
                  Remove
                </button>
                <button className="plugin-popup__close" onClick={handleCancel} aria-label="Close">
                  ×
                </button>
              </div>

              <div className="plugin-popup__body">
                {activeSlot.status === "loading" && <div className="daw-status">Loading Faust engine…</div>}
                {activeSlot.status === "error" && <div className="daw-error">Failed to load this plugin.</div>}
                {activeSlot.status === "ready" && activeSlot.key === "gate" && (
                  <GateEditorPanel
                    params={activeSlot.params}
                    setParams={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "gate", (s) => ({ params: typeof updater === "function" ? updater(s.params) : updater }))
                    }
                    sidechain={activeSlot.sidechain}
                    setSidechain={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "gate", (s) => ({ sidechain: typeof updater === "function" ? updater(s.sidechain) : updater }))
                    }
                    bypass={activeSlot.bypassed}
                    isPlaying={isPlaying}
                    getLevels={getGateLevels}
                    getNow={getNow}
                    onOpenChange={setGateIsOpen}
                  />
                )}
                {activeSlot.status === "ready" && activeSlot.key === "deess" && (
                  <DeEsserEditorPanel
                    params={activeSlot.params}
                    setParams={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "deess", (s) => ({ params: typeof updater === "function" ? updater(s.params) : updater }))
                    }
                    bypass={activeSlot.bypassed}
                    isPlaying={isPlaying}
                    getInputDb={getDeEsserInputDb}
                    getGainReductionDb={getDeEsserGainReductionDb}
                    getNow={getNow}
                  />
                )}
                {activeSlot.status === "ready" && activeSlot.key === "comp" && (
                  <CompressorEditorPanel
                    bands={activeSlot.bands}
                    setBands={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "comp", (s) => ({ bands: typeof updater === "function" ? updater(s.bands) : updater }))
                    }
                    crossover={activeSlot.crossover}
                    setCrossover={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "comp", (s) => ({ crossover: typeof updater === "function" ? updater(s.crossover) : updater }))
                    }
                    sidechain={activeSlot.sidechain}
                    setSidechain={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "comp", (s) => ({ sidechain: typeof updater === "function" ? updater(s.sidechain) : updater }))
                    }
                    outputGainDb={activeSlot.outputGainDb}
                    setOutputGainDb={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "comp", (s) => ({
                        outputGainDb: typeof updater === "function" ? updater(s.outputGainDb) : updater,
                      }))
                    }
                    selectedBand={compSelectedBand}
                    setSelectedBand={setCompSelectedBand}
                    multibandEnabled={activeSlot.multiband}
                    setMultibandEnabled={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "comp", (s) => ({ multiband: typeof updater === "function" ? updater(s.multiband) : updater }))
                    }
                    bypass={activeSlot.bypassed}
                    isPlaying={isPlaying}
                    getLevels={getCompLevels}
                    getNow={getNow}
                  />
                )}
                {activeSlot.status === "ready" && activeSlot.key === "limiter" && (
                  <LimiterEditorPanel
                    params={activeSlot.params}
                    setParams={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "limiter", (s) => ({ params: typeof updater === "function" ? updater(s.params) : updater }))
                    }
                    bypass={activeSlot.bypassed}
                    isPlaying={isPlaying}
                    getLevels={getLimiterLevels}
                    getNow={getNow}
                    onGainReductionChange={setLimiterGainReduction}
                  />
                )}
                {activeSlot.status === "ready" && activeSlot.key === "delay" && (
                  <DelayEditorPanel
                    params={activeSlot.params}
                    setParams={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "delay", (s) => ({ params: typeof updater === "function" ? updater(s.params) : updater }))
                    }
                    sync={activeSlot.sync}
                    setSync={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "delay", (s) => ({ sync: typeof updater === "function" ? updater(s.sync) : updater }))
                    }
                    link={delayLink}
                    setLink={setDelayLink}
                    isPlaying={isPlaying}
                    getInputPeak={getDelayInputPeak}
                    getOutputPeak={getDelayOutputPeak}
                    getNow={getNow}
                  />
                )}
                {activeSlot.status === "ready" && activeSlot.key === "reverb" && (
                  <ReverbEditorPanel
                    params={activeSlot.params}
                    setParams={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "reverb", (s) => ({ params: typeof updater === "function" ? updater(s.params) : updater }))
                    }
                    preset={activeSlot.preset}
                    setPreset={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "reverb", (s) => ({ preset: typeof updater === "function" ? updater(s.preset) : updater }))
                    }
                    isPlaying={isPlaying}
                    getInputPeak={getReverbInputPeak}
                    getOutputPeak={getReverbOutputPeak}
                    getNow={getNow}
                  />
                )}
                {activeSlot.status === "ready" && activeSlot.key === "eq" && (
                  <EqualizerEditorPanel
                    bands={activeSlot.bands}
                    setBands={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "eq", (s) => ({ bands: typeof updater === "function" ? updater(s.bands) : updater }))
                    }
                    selectedBandId={eqSelectedBandId}
                    setSelectedBandId={setEqSelectedBandId}
                    outputGainDb={activeSlot.outputGainDb}
                    setOutputGainDb={(updater) =>
                      updateSlot(activeTrack.id, activeEditor.regionId, "eq", (s) => ({
                        outputGainDb: typeof updater === "function" ? updater(s.outputGainDb) : updater,
                      }))
                    }
                    analyserRef={eqAnalyserRef}
                    dryAnalyserRef={eqDryAnalyserRef}
                    analyserActive={isPlaying}
                    sampleRate={eqSampleRate}
                    liveDynGainRef={eqLiveDynGainRef}
                    liveDynGainActive={isPlaying}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DawWorkstationScreen;
