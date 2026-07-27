// ═══════════════════════════════════════════════════════════════════════════
// DAW Workstation — offline (non-realtime) rendering for the Download buttons
// ═══════════════════════════════════════════════════════════════════════════
// An AudioNode can't move between two different BaseAudioContexts, so a
// slot's live Faust node (created once, against the live AudioContext — see
// loadPluginEngine/addOrSelectPlugin in DawWorkstationScreen.jsx) can't be
// reused here. Each of these builds brand-new nodes from the SAME cached
// factory (engineCache — module + json, not tied to any context) against an
// OfflineAudioContext instead — same trick every standalone chapter lab's
// own renderXOffline already uses for its single-plugin "download the
// processed result" button (e.g. NoiseGate.jsx's renderGateOffline),
// generalized here across an arbitrary per-portion chain. No
// analysers/meters — nothing offline reads them.
import { FaustMonoDspGenerator } from "@grame/faustwasm";
import { pushFaustParams as pushGateParams } from "../../chapters/gateEngine";
import { pushFaustParams as pushDeEsserParams } from "../../chapters/deEsserEngine";
import { pushFaustParams as pushCompParams } from "../../chapters/compressorEngine";
import { pushFaustParams as pushLimiterParams } from "../../chapters/limiterEngine";
import { pushFaustParams as pushDelayParams } from "../../chapters/delayEngine";
import { pushFaustParams as pushReverbParams } from "../../chapters/reverbEngine";
import { applyBandsToNode as applyEqBandsToNode, applyOutputGain as applyEqOutputGain } from "../../chapters/equalizerEngine";
import { wireSlotNode, computeSegments } from "./chainGraph";
import { trackIsAudible, computeDryScale } from "./trackHelpers";

export async function createOfflineSlotNode(offlineCtx, engineCache, slot) {
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
export async function buildOfflineChain(offlineCtx, engineCache, chain, source) {
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
export async function buildOfflineTrackOutput(offlineCtx, engineCache, track, trackStartAt = 0) {
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
export async function renderTrackOffline(engineCache, track) {
  const buffer = track.buffer;
  const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const chainOut = await buildOfflineTrackOutput(offlineCtx, engineCache, track, 0);
  const trackGain = offlineCtx.createGain();
  trackGain.gain.value = track.volume ?? 1;
  chainOut.connect(trackGain);
  // Pan is a channel-strip property (like volume), not a mix-relative
  // control (like mute/solo) — a soloed stem is expected to sound exactly
  // like this channel does in the mix, panning included.
  const panner = offlineCtx.createStereoPanner();
  panner.pan.value = track.pan ?? 0;
  trackGain.connect(panner);
  panner.connect(offlineCtx.destination);
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
export async function renderMixOffline(engineCache, tracks, sampleRate) {
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

  // Aux buses + Sends — the offline mirror of the live graph's own second
  // pass in playFrom(): every Aux track's own input gets summed from
  // whichever real tracks send to it (pre- or post-fader, per that send),
  // then runs through the Aux's own chain/volume/pan into the same
  // masterGain every real track lands on, exactly like the live graph.
  const auxTracks = tracks.filter((t) => t.kind === "aux");
  const auxInputGains = new Map();
  auxTracks.forEach((auxTrack) => auxInputGains.set(auxTrack.id, offlineCtx.createGain()));

  for (const track of list) {
    const chainOut = await buildOfflineTrackOutput(offlineCtx, engineCache, track, track.startAt ?? 0);
    const trackGain = offlineCtx.createGain();
    // Mute AND solo both apply to a full mixdown — unlike renderTrackOffline
    // (an isolated single-track stem), "tracks" here is the whole session,
    // so it needs to be silent everywhere Mute or an active Solo would
    // silence it live (see trackIsAudible).
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
    // Dry/direct path — scaled down by however much this track's own
    // post-fader Sends are diverting to their Aux buses above, matching the
    // live graph's own dryGain (see computeDryScale/playFrom).
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
