import { FaustMonoDspGenerator } from "@grame/faustwasm";
import { pushFaustParams as pushGateParams } from "../../../../audio/effects/gateEngine";
import { pushFaustParams as pushDeEsserParams } from "../../../../audio/effects/deEsserEngine";
import { pushFaustParams as pushCompParams } from "../../../../audio/effects/compressorEngine";
import { pushFaustParams as pushLimiterParams } from "../../../../audio/effects/limiterEngine";
import { pushFaustParams as pushDelayParams } from "../../../../audio/effects/delayEngine";
import { pushFaustParams as pushReverbParams } from "../../../../audio/effects/reverbEngine";
import { applyBandsToNode as applyEqBandsToNode, applyOutputGain as applyEqOutputGain } from "../../../../audio/effects/equalizerEngine";
import { wireSlotNode, computeSegments } from "./chainGraph";
import { trackIsAudible, computeDryScale } from "../lib/trackHelpers";

async function createOfflineSlotNode(offlineCtx, engineCache, slot) {
  const cached = engineCache.get(slot.key);
  if (!cached) return null;
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
  const portionGates = new Map();
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

export async function renderTrackOffline(engineCache, track) {
  const buffer = track.buffer;
  const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const chainOut = await buildOfflineTrackOutput(offlineCtx, engineCache, track, 0);
  const trackGain = offlineCtx.createGain();
  trackGain.gain.value = track.volume ?? 1;
  chainOut.connect(trackGain);
  const panner = offlineCtx.createStereoPanner();
  panner.pan.value = track.pan ?? 0;
  trackGain.connect(panner);
  panner.connect(offlineCtx.destination);
  return offlineCtx.startRendering();
}

export async function renderMixOffline(engineCache, tracks, sampleRate) {
  const list = tracks.filter((t) => t.buffer);
  if (list.length === 0) return null;
  const arrDur = list.reduce((max, t) => Math.max(max, (t.startAt ?? 0) + t.buffer.duration), 0);
  const length = Math.max(1, Math.ceil(arrDur * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.connect(offlineCtx.destination);

  const auxTracks = tracks.filter((t) => t.kind === "aux");
  const auxInputGains = new Map();
  auxTracks.forEach((auxTrack) => auxInputGains.set(auxTrack.id, offlineCtx.createGain()));

  for (const track of list) {
    const chainOut = await buildOfflineTrackOutput(offlineCtx, engineCache, track, track.startAt ?? 0);
    const trackGain = offlineCtx.createGain();
    trackGain.gain.value = trackIsAudible(track, tracks) ? (track.volume ?? 1) : 0;
    chainOut.connect(trackGain);
    (track.sends || []).forEach((send) => {
      if (send.muted) return;
      const targetInput = auxInputGains.get(send.busId);
      if (!targetInput) return;
      const tap = send.prePost === "pre" ? chainOut : trackGain;
      const sendPanner = offlineCtx.createStereoPanner();
      sendPanner.pan.value = send.fmp ? (track.pan ?? 0) : (send.pan ?? 0);
      const sendGain = offlineCtx.createGain();
      sendGain.gain.value = send.level ?? 1;
      tap.connect(sendPanner);
      sendPanner.connect(sendGain);
      sendGain.connect(targetInput);
    });
    const dryGain = offlineCtx.createGain();
    dryGain.gain.value = computeDryScale(track);
    const panner = offlineCtx.createStereoPanner();
    panner.pan.value = track.pan ?? 0;
    trackGain.connect(dryGain);
    dryGain.connect(panner);
    panner.connect(masterGain);
  }

  for (const auxTrack of auxTracks) {
    const auxInput = auxInputGains.get(auxTrack.id);
    const chainOut = await buildOfflineChain(offlineCtx, engineCache, auxTrack.chain, auxInput);
    const auxGain = offlineCtx.createGain();
    auxGain.gain.value = trackIsAudible(auxTrack, tracks) ? (auxTrack.volume ?? 1) : 0;
    chainOut.connect(auxGain);
    const panner = offlineCtx.createStereoPanner();
    panner.pan.value = auxTrack.pan ?? 0;
    auxGain.connect(panner);
    panner.connect(masterGain);
  }

  return offlineCtx.startRendering();
}
