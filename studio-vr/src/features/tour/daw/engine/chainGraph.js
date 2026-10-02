import {
  DEFAULTS as GATE_DEFAULTS,
  DEFAULT_SIDECHAIN as GATE_DEFAULT_SIDECHAIN,
} from "../../../../audio/effects/gateEngine";
import { DEFAULTS as DEESS_DEFAULTS } from "../../../../audio/effects/deEsserEngine";
import {
  makeDefaultBands as makeDefaultCompBands,
  DEFAULT_CROSSOVER as COMP_DEFAULT_CROSSOVER,
  DEFAULT_SIDECHAIN as COMP_DEFAULT_SIDECHAIN,
  DEFAULT_OUTPUT_GAIN as COMP_DEFAULT_OUTPUT_GAIN,
  DEFAULT_MULTIBAND as COMP_DEFAULT_MULTIBAND,
} from "../../../../audio/effects/compressorEngine";
import { DEFAULTS as LIMITER_DEFAULTS } from "../../../../audio/effects/limiterEngine";
import { DEFAULTS as DELAY_DEFAULTS, DEFAULT_SYNC } from "../../../../audio/effects/delayEngine";
import { DEFAULTS as REVERB_DEFAULTS, DEFAULT_PRESET } from "../../../../audio/effects/reverbEngine";
import {
  DEFAULT_BANDS as EQ_DEFAULT_BANDS,
  ANALYSER_MIN_DB,
  ANALYSER_MAX_DB,
  applyOutputGain as applyEqOutputGain,
} from "../../../../audio/effects/equalizerEngine";
import { clamp } from "../lib/format";
import { TRACK_CHAIN_SCOPE } from "../lib/constants";
import { isOuterScope, baseRegionId } from "../lib/trackHelpers";

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
    if (r.start < cursor) continue;
    if (r.start > cursor) segments.push({ start: cursor, end: r.start, region: null });
    segments.push({ start: r.start, end: r.end, region: r });
    cursor = r.end;
  }
  if (cursor < duration) segments.push({ start: cursor, end: duration, region: null });
  return segments;
}

export function getChainArray(track, regionId) {
  if (!track) return undefined;
  if (regionId === TRACK_CHAIN_SCOPE) return track.chain;
  if (isOuterScope(regionId)) {
    const region = track.regions.find((r) => r.id === baseRegionId(regionId));
    if (!region) return undefined;
    return region.outerCustomized ? region.outerChain || [] : track.chain;
  }
  return track.regions.find((r) => r.id === regionId)?.chain;
}

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

export function disconnectChainSlots(chain) {
  chain.forEach((slot) => {
    try {
      slot.node?.disconnect();
    } catch {
    }
  });
}

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

export function collectMeters(items) {
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
