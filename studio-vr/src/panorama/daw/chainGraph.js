// ═══════════════════════════════════════════════════════════════════════════
// DAW Workstation — live audio-graph chain wiring (WebAudio, real-time)
// ═══════════════════════════════════════════════════════════════════════════
// Pure(ish) graph-building helpers used by DawWorkstationScreen's playFrom()
// to wire each track/portion's insert chain onto the live AudioContext. See
// offlineRender.js for the equivalent used by the Download buttons.
import {
  DEFAULTS as GATE_DEFAULTS,
  DEFAULT_SIDECHAIN as GATE_DEFAULT_SIDECHAIN,
} from "../../chapters/gateEngine";
import { DEFAULTS as DEESS_DEFAULTS } from "../../chapters/deEsserEngine";
import {
  makeDefaultBands as makeDefaultCompBands,
  DEFAULT_CROSSOVER as COMP_DEFAULT_CROSSOVER,
  DEFAULT_SIDECHAIN as COMP_DEFAULT_SIDECHAIN,
  DEFAULT_OUTPUT_GAIN as COMP_DEFAULT_OUTPUT_GAIN,
  DEFAULT_MULTIBAND as COMP_DEFAULT_MULTIBAND,
} from "../../chapters/compressorEngine";
import { DEFAULTS as LIMITER_DEFAULTS } from "../../chapters/limiterEngine";
import { DEFAULTS as DELAY_DEFAULTS, DEFAULT_SYNC } from "../../chapters/delayEngine";
import { DEFAULTS as REVERB_DEFAULTS, DEFAULT_PRESET } from "../../chapters/reverbEngine";
import {
  DEFAULT_BANDS as EQ_DEFAULT_BANDS,
  ANALYSER_MIN_DB,
  ANALYSER_MAX_DB,
  applyOutputGain as applyEqOutputGain,
} from "../../chapters/equalizerEngine";
import { clamp } from "./format";
import { TRACK_CHAIN_SCOPE } from "./constants";
import { isOuterScope, baseRegionId } from "./trackHelpers";

export function wireSlotNode(ctx, inputNode, slot) {
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
export function computeSegments(track) {
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
export function getChainArray(track, regionId) {
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
export function withChainArray(track, regionId, chain) {
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
export function disconnectChainSlots(chain) {
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
export function wireLiveChain(ctx, source, chain, trackId, regionId, refs) {
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

// Any hbargraph/vbargraph item is a read-only Faust METER output (gain
// reduction, live gain, etc.). Pulled out separately here so any plugin's
// own *EditorPanel (via getXLevels-style host callbacks) can read its live
// telemetry off meterValuesRef — populated below by a generic
// node.setOutputParamHandler subscription — with no per-plugin wiring.
export function collectMeters(items) {
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
export function defaultSlotExtras(key) {
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
