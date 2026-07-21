// A small singleton wrapper around the Web Audio API that provides real
// binaural/HRTF-panned audio, tied to wherever the student is currently
// looking in the panorama.
//
// Three things actually play: the ambient bed — a synthetic "mild air"
// tone (filtered white noise, see startAmbientBed() below; no audio file
// involved) — hotspot narration — real uploaded audio files (see
// playHotspotNarration) played on demand through an HRTF PannerNode when a
// hotspot is selected — genuinely spatial, unlike browser text-to-speech,
// which can't be routed through Web Audio nodes at all — and room bleed — a
// real audio file that loops quietly from a fixed point in a room's
// panorama for as long as the student is standing in that room (see
// startRoomBleed()), meant to read as sound leaking in from elsewhere
// (e.g. a session running in an adjacent room) rather than something
// playing in this one.
//
// Every spatialized source also passes through createElevationShelf(), a
// brightness cue layered on top of the HRTF panner to make up/down position
// more perceivable — generic (non-personalized) Web Audio HRTF is well
// known to convey elevation far less clearly than left/right. See the
// comment on that function for why.

let audioCtx = null;
// Final stage before the speakers — the ONLY thing setMuted()/isMuted()
// touches. Both masterGain and narrationGain feed into this, so toggling it
// silences everything (ambient bed + narration, spatial or not) and
// restores everything exactly as it was, with no side effects on the
// binaural routing below.
let outputGain = null;
let masterGain = null;
// Separate output path for hotspot narration used when binaural is
// switched off (see setBinauralEnabled()) — plain, non-spatial playback
// instead of routing through the HRTF panner. Both this and masterGain feed
// into outputGain, so the master mute above still silences narration
// either way.
let narrationGain = null;
let ambientSource = null;
let ambientGain = null;
let ambientFilter = null;
let ambientDriftLfoGain = null;
let ambientDriftLfo = null;
// Master mute: silences ALL audio via outputGain. Fully independent of
// binauralEnabled below — toggling one must never move the other.
let fullyMuted = false;
// Binaural/spatial toggle: crossfades whichever narration clip is playing
// right now between the HRTF panner path and the plain narrationGain path
// (see currentNarrationRouting below), and sets which path any new clip
// starts on. Never touches outputGain, so flipping it can't ever mute
// anything — only ever moves signal between the two always-audible paths.
let binauralEnabled = true;
const bufferCache = new Map();
let currentNarrationSource = null;
// The currently playing clip's spatial-path and plain-path gain nodes, kept
// around so setBinauralEnabled() can crossfade between them live — i.e.
// actually change how a clip sounds mid-playback, not just decide the route
// for whatever plays next.
let currentNarrationRouting = null;
// Generic registry of extra { spatialPathGain, plainPathGain } pairs whose
// crossfade setBinauralEnabled() should also drive, beyond whatever hotspot
// narration clip is currently playing above. createStudioSpeakerBus() (see
// below) registers itself here so the EQ/Compressor hotspots' studio-monitor
// output responds to the same global binaural toggle as narration does,
// without this module needing to know anything about who else is using it.
const extraBinauralRoutings = new Set();

// Default ambient profile used until a room supplies its own (see
// setRoomAmbience()). Values chosen to match the original "mild air" bed.
const DEFAULT_AMBIENCE = { filterFreq: 500, gain: 0.03, gustDepth: 0.015 };

// ---- Room bleed (see startRoomBleed() further down) ------------------------
// Starting position (0..1) of the in-scene volume-slider hotspot. At this
// default the bed sits roughly in line with the ambient bed's own gain
// (~0.03) — perceptible as "something's happening next door" without ever
// competing with it.
const DEFAULT_BLEED_VOLUME = 0.4;
// Gain at slider = 1 (100%), applied AFTER the compressor/makeup gain built
// in startRoomBleed() below — i.e. after the source recording's own (often
// much quieter/raw) mix level has already been normalized out, so this is a
// predictable multiplier on top of a consistently-loud signal rather than
// on top of whatever the recording happened to be mixed at.
//
// Deliberately capped so that even at 100% this never stops sounding like
// bleed-through from another room — the compressor/makeup stage alone would
// otherwise be loud enough (it's built for consistent audibility, not
// subtlety) to read as something playing in THIS room. Combined with
// BLEED_THROUGH_WALL_CUTOFF below (the muffling is what actually sells
// "another room" — this gain cap just keeps it from being loud regardless
// of how muffled it sounds).
const BLEED_CEILING_GAIN = 1.0;
// Lowpass cutoff (Hz) simulating sound transmission through a wall/door —
// real walls attenuate high frequencies far more than low ones, which is a
// big part of why bleed-through reads as "somewhere else" rather than just
// "quieter". Applied on top of the volume cap above, not instead of it —
// muffled-but-loud would still read as being in this room.
const BLEED_THROUGH_WALL_CUTOFF = 900;

// Guards a slow-loading clip against a stop/restart that happened while it
// was still fetching/decoding (e.g. the student walked to another room
// before the file finished decoding) — the stale response is dropped rather
// than starting a second, overlapping loop.
let bleedRequestToken = 0;
let bleedSource = null;
let bleedCompressor = null;
let bleedMakeupGain = null;
let bleedThroughWallFilter = null;
let bleedLevelGain = null; // the ONLY node setRoomBleedVolume()/setRoomBleedMuted() touch
let bleedSpatialPathGain = null;
let bleedPlainPathGain = null;
let bleedPanner = null;
let bleedElevationShelf = null;
let bleedRouting = null; // registered with extraBinauralRoutings while playing
let bleedVolume = DEFAULT_BLEED_VOLUME;
let bleedMuted = false;

function computeBleedGain() {
  return bleedMuted ? 0 : BLEED_CEILING_GAIN * bleedVolume;
}

/**
 * Converts yaw/pitch in degrees (same convention used throughout
 * roomsData.js) into a 3D direction vector, matching how Photo Sphere
 * Viewer orients its camera: yaw 0 = straight ahead, positive pitch = up.
 */
function sphericalToCartesian(yawDeg, pitchDeg, radius = 1) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  return {
    x: radius * Math.sin(yaw) * Math.cos(pitch),
    y: radius * Math.sin(pitch),
    z: -radius * Math.cos(yaw) * Math.cos(pitch),
  };
}

/**
 * Generic (non-personalized) Web Audio HRTF is well known to render
 * elevation much less clearly than left/right — the HRTF dataset the
 * browser ships with is an average across many ears, and front/back/up/down
 * cues are the first thing that averaging washes out (left/right survives
 * because it's mostly just interaural time/level difference, not pinna
 * shape). Real ears also brighten sounds from above and dull sounds from
 * below (the pinna acts like a filter) — that's a big part of how humans
 * actually judge elevation, and it's exactly the cue generic HRTF is
 * weakest at reproducing.
 *
 * This adds that cue back in manually: a gentle high-shelf boost for
 * sources above ear level and cut for sources below, layered on top of the
 * HRTF panner rather than replacing it. It doesn't fully close the gap with
 * left/right localization (nothing short of a personalized HRTF profile
 * really does), but it gives the ear a second, more reliable signal to
 * judge up/down by.
 */
function createElevationShelf(pitchDeg) {
  const shelf = audioCtx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 6000;
  const normalized = Math.max(-1, Math.min(1, pitchDeg / 45));
  shelf.gain.value = normalized * 7; // -7dB (below) .. +7dB (above)
  return shelf;
}

/** Creates the AudioContext + master gain and starts the ambient bed. Safe
 * to call more than once. Must be called from (or shortly after) a real
 * user gesture — browsers block audio until then. */
export function initAudio() {
  if (audioCtx) return audioCtx;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;

  audioCtx = new Ctx();

  outputGain = audioCtx.createGain();
  outputGain.gain.value = fullyMuted ? 0 : 1;
  outputGain.connect(audioCtx.destination);

  // Always at full volume — ambient bed audibility is controlled solely by
  // the master mute (outputGain) above, never by the binaural toggle.
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.9;
  masterGain.connect(outputGain);

  // Also always at full volume — narration should keep playing (in plain,
  // non-spatial form) even with binaural switched off, rather than going
  // silent. The master mute above still applies to this path too.
  narrationGain = audioCtx.createGain();
  narrationGain.gain.value = 0.9;
  narrationGain.connect(outputGain);

  startAmbientBed();

  return audioCtx;
}

/** Call this from a user gesture handler (e.g. a button click) to unlock
 * audio on browsers that created the context in a suspended state. */
export function resumeAudio() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => { });
  }
}

// Generates a buffer of plain white noise, looped and lowpass-filtered in
// startAmbientBed() into the "mild air" bed. No audio file involved.
function createAirNoiseBuffer() {
  const durationSeconds = 6;
  const bufferSize = audioCtx.sampleRate * durationSeconds;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function startAmbientBed(profile = DEFAULT_AMBIENCE) {
  if (!audioCtx || ambientSource) return;

  ambientSource = audioCtx.createBufferSource();
  ambientSource.buffer = createAirNoiseBuffer();
  ambientSource.loop = true;

  // Lowpass filter turns the raw white noise into a soft, airy hush rather
  // than hiss/static; `profile.filterFreq` sets how bright/dull it reads
  // per room (see `ambience` on each room in roomsData.js).
  ambientFilter = audioCtx.createBiquadFilter();
  ambientFilter.type = "lowpass";
  ambientFilter.frequency.value = profile.filterFreq;
  ambientFilter.Q.value = 0.3;

  ambientGain = audioCtx.createGain();
  ambientGain.gain.value = profile.gain; // mild bed, not the main event

  // Very slow, subtle gain drift so it reads as gently moving air rather
  // than a dead-flat tone.
  ambientDriftLfo = audioCtx.createOscillator();
  ambientDriftLfo.type = "sine";
  ambientDriftLfo.frequency.value = 0.07; // one drift cycle every ~14s
  ambientDriftLfoGain = audioCtx.createGain();
  ambientDriftLfoGain.gain.value = profile.gustDepth;
  ambientDriftLfo.connect(ambientDriftLfoGain).connect(ambientGain.gain);
  ambientDriftLfo.start();

  ambientSource
    .connect(ambientFilter)
    .connect(ambientGain)
    .connect(masterGain);
  ambientSource.start();
}

/**
 * Stops and tears down the ambient bed (buffer source, drift LFO, and their
 * gain/filter nodes). Needed because the bed is otherwise a fire-and-forget
 * loop with no natural end — leaving a screen that started it (e.g. the VR
 * studio tour) without stopping it here would let it keep playing
 * indefinitely in the background after navigating elsewhere, since
 * audioCtx/masterGain are a module-level singleton that outlives any one
 * screen. Safe to call even if nothing is currently playing. After this,
 * startAmbientBed()/setRoomAmbience() will start a fresh bed on next use.
 */
export function stopAmbientBed() {
  if (ambientDriftLfo) {
    try {
      ambientDriftLfo.stop();
    } catch {
      // already stopped
    }
    ambientDriftLfo.disconnect();
    ambientDriftLfo = null;
  }
  if (ambientSource) {
    try {
      ambientSource.stop();
    } catch {
      // already stopped
    }
    ambientSource.disconnect();
    ambientSource = null;
  }
  if (ambientFilter) {
    ambientFilter.disconnect();
    ambientFilter = null;
  }
  if (ambientGain) {
    ambientGain.disconnect();
    ambientGain = null;
  }
  if (ambientDriftLfoGain) {
    ambientDriftLfoGain.disconnect();
    ambientDriftLfoGain = null;
  }
}

/**
 * Smoothly re-tunes the ambient bed to a new room's character instead of
 * cutting/restarting it — e.g. crossfading from the control room's airier
 * tone to a treated recording room's quieter, more damped one as you walk
 * through a door. `profile` is `{ filterFreq, gain, gustDepth }` (see
 * `ambience` on each room in roomsData.js).
 */
export function setRoomAmbience(profile) {
  if (!audioCtx) return;
  if (!ambientSource) {
    startAmbientBed(profile);
    return;
  }
  const now = audioCtx.currentTime;
  const RAMP = 1.5; // seconds — long enough to read as a crossfade, not a jump
  ambientFilter.frequency.cancelScheduledValues(now);
  ambientFilter.frequency.linearRampToValueAtTime(profile.filterFreq, now + RAMP);
  ambientGain.gain.cancelScheduledValues(now);
  ambientGain.gain.linearRampToValueAtTime(profile.gain, now + RAMP);
  ambientDriftLfoGain.gain.cancelScheduledValues(now);
  ambientDriftLfoGain.gain.linearRampToValueAtTime(profile.gustDepth, now + RAMP);
}

/** Keeps the Web Audio listener facing the same direction as the camera, so
 * spatialized sources correctly pan/rotate as the student looks around.
 * Call this frequently (e.g. every 100-150ms) with the viewer's current
 * yaw/pitch, in degrees. */
export function updateListenerOrientation(yawDeg, pitchDeg) {
  if (!audioCtx) return;
  const listener = audioCtx.listener;
  const forward = sphericalToCartesian(yawDeg, pitchDeg, 1);
  const up = { x: 0, y: 1, z: 0 };

  if (listener.forwardX) {
    listener.forwardX.value = forward.x;
    listener.forwardY.value = forward.y;
    listener.forwardZ.value = forward.z;
    listener.upX.value = up.x;
    listener.upY.value = up.y;
    listener.upZ.value = up.z;
  } else if (listener.setOrientation) {
    // Older Safari fallback.
    listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}

/** Fetches + decodes an audio file once and caches the result by URL. */
async function loadAudioBuffer(url) {
  if (bufferCache.has(url)) return bufferCache.get(url);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Narration file not found: ${url} (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  bufferCache.set(url, audioBuffer);
  return audioBuffer;
}

/**
 * Plays a real recorded narration clip from a hotspot's direction, through
 * an HRTF panner — this is genuinely binaural, unlike browser
 * text-to-speech. `url` should point at an
 * uploaded audio file (e.g. "/audio/speaker.mp3"). If the file doesn't
 * exist yet, this fails quietly (logs a warning) rather than throwing.
 *
 * Both the HRTF-spatial path and the plain non-spatial path are built every
 * time and left connected for the whole clip — which one is actually
 * audible is controlled by a pair of gain nodes crossfaded according to
 * binauralEnabled. That's what lets setBinauralEnabled() flip a clip that's
 * already mid-playback between spatial and plain instead of only affecting
 * whatever plays next. Master mute (setMuted()) is independent of this and
 * silences either path equally.
 */
export async function playHotspotNarration(url, yawDeg, pitchDeg) {
  stopHotspotNarration();
  if (!audioCtx || !url) return;

  let buffer;
  try {
    buffer = await loadAudioBuffer(url);
  } catch (err) {
    console.warn("[spatial-audio]", err.message);
    return;
  }

  // Safety-net compressor + makeup gain on top of the file-level cleanup
  // (noise reduction + loudness normalization applied when the clip was
  // processed) so future narration uploads that haven't been cleaned yet
  // still come through clear and consistently loud.
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = -28;
  compressor.knee.value = 24;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.25;

  const makeupGain = audioCtx.createGain();
  makeupGain.gain.value = 1.4;

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(compressor).connect(makeupGain);

  // Plain (non-spatial) path — always built, gated by plainPathGain.
  const plainPathGain = audioCtx.createGain();
  plainPathGain.gain.value = binauralEnabled ? 0 : 1;
  makeupGain.connect(plainPathGain).connect(narrationGain);

  // Spatial (HRTF) path — always built, gated by spatialPathGain, so
  // toggling binaural mid-clip is just a crossfade between the two rather
  // than tearing down/rebuilding the graph.
  const panner = audioCtx.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;

  const pos = sphericalToCartesian(yawDeg, pitchDeg, 2.5);
  if (panner.positionX) {
    panner.positionX.value = pos.x;
    panner.positionY.value = pos.y;
    panner.positionZ.value = pos.z;
  } else if (panner.setPosition) {
    panner.setPosition(pos.x, pos.y, pos.z);
  }
  const elevationShelf = createElevationShelf(pitchDeg);

  const spatialPathGain = audioCtx.createGain();
  spatialPathGain.gain.value = binauralEnabled ? 1 : 0;
  makeupGain
    .connect(elevationShelf)
    .connect(panner)
    .connect(spatialPathGain)
    .connect(masterGain);

  source.start();
  currentNarrationSource = source;
  currentNarrationRouting = { plainPathGain, spatialPathGain };
}

/** Stops whatever narration clip is currently playing, if any. */
export function stopHotspotNarration() {
  if (currentNarrationSource) {
    try {
      currentNarrationSource.stop();
    } catch {
      // already stopped, ignore
    }
    currentNarrationSource.disconnect();
    currentNarrationSource = null;
  }
  currentNarrationRouting = null;
}

/**
 * Starts a real audio file looping quietly from a fixed point in the
 * current room's panorama — see the `roomBleed` field on a room in
 * roomsData.js. Unlike playHotspotNarration() above (one-shot, triggered by
 * clicking a marker) this loops indefinitely once started, and unlike the
 * synthetic ambient bed (startAmbientBed()) it's a real decoded audio file.
 *
 * Spatialized through the same HRTF panner + elevation shelf as narration,
 * fixed at (yawDeg, pitchDeg) — that position never moves, so what changes
 * as the student looks around is the *listener* orientation (see
 * updateListenerOrientation()), which is exactly what makes this correctly
 * pan/rotate with binaural HRTF as they turn toward or away from it. A
 * plain, non-HRTF fallback path is always built alongside the spatial one
 * and crossfaded by the shared binaural toggle (setBinauralEnabled()), same
 * as createStudioSpeakerBus() below, so switching binaural off still gives a
 * faint left/right sense of "off that way" instead of nothing.
 *
 * Raw multitrack stems (like the recording-room take used by default) are
 * mixed at very different, often much quieter levels than a finished
 * narration clip — e.g. the built-in default measures around -30dB average
 * with -8dB peaks, versus a normally-mixed clip sitting much hotter. A
 * safety-net compressor + makeup gain (same pattern as
 * playHotspotNarration()'s, just tuned harder for quieter, swingier raw
 * material) normalizes that out first, so BLEED_CEILING_GAIN below is a
 * predictable "how audible is the bleed" dial regardless of how the source
 * file itself happens to be mixed, and so pushing the volume slider to 100%
 * doesn't clip on the recording's own loud transients.
 *
 * Volume is entirely separate from the ambient bed and from hotspot
 * narration — see setRoomBleedVolume()/setRoomBleedMuted(), meant to be
 * driven by an in-scene volume-slider hotspot (roomsData.js
 * `volumeControls`) — and is deliberately capped (BLEED_CEILING_GAIN) below
 * a normal foreground level so it always reads as bleed-through from
 * another room. Safe to call again before a previous call's fetch/decode
 * has resolved, or while nothing is playing (e.g. from stopRoomBleed()) —
 * a stale response is dropped rather than starting two overlapping loops.
 */
export async function startRoomBleed(url, yawDeg, pitchDeg) {
  stopRoomBleed();
  if (!audioCtx || !masterGain || !url) return;

  const requestToken = ++bleedRequestToken;
  let buffer;
  try {
    buffer = await loadAudioBuffer(url);
  } catch (err) {
    console.warn("[spatial-audio]", err.message);
    return;
  }
  // A newer start/stop happened while this was loading — drop it rather
  // than starting a loop nobody asked for anymore.
  if (requestToken !== bleedRequestToken || !audioCtx) return;

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // Safety-net compressor + makeup gain — see the doc comment above. Harder
  // knee/ratio and slower release than narration's own compressor since
  // this is meant to tame an unmixed instrument take's peaks (not close-mic
  // speech) while still lifting its quiet average level.
  bleedCompressor = audioCtx.createDynamicsCompressor();
  bleedCompressor.threshold.value = -34;
  bleedCompressor.knee.value = 8;
  bleedCompressor.ratio.value = 8;
  bleedCompressor.attack.value = 0.008;
  bleedCompressor.release.value = 0.3;

  bleedMakeupGain = audioCtx.createGain();
  bleedMakeupGain.gain.value = 4.5;

  // "Through the wall" muffling — see BLEED_THROUGH_WALL_CUTOFF above. This
  // is what actually makes it read as another room rather than just a quiet
  // clip in this one.
  bleedThroughWallFilter = audioCtx.createBiquadFilter();
  bleedThroughWallFilter.type = "lowpass";
  bleedThroughWallFilter.frequency.value = BLEED_THROUGH_WALL_CUTOFF;
  bleedThroughWallFilter.Q.value = 0.6;

  bleedLevelGain = audioCtx.createGain();
  bleedLevelGain.gain.value = computeBleedGain();
  source
    .connect(bleedCompressor)
    .connect(bleedMakeupGain)
    .connect(bleedThroughWallFilter)
    .connect(bleedLevelGain);

  // Plain (non-spatial) path — always built, gated by bleedPlainPathGain.
  bleedPlainPathGain = audioCtx.createGain();
  bleedPlainPathGain.gain.value = binauralEnabled ? 0 : 1;
  bleedLevelGain.connect(bleedPlainPathGain).connect(masterGain);

  // Spatial (HRTF) path — always built, gated by bleedSpatialPathGain, so
  // toggling binaural is a crossfade rather than tearing down the graph.
  bleedPanner = audioCtx.createPanner();
  bleedPanner.panningModel = "HRTF";
  bleedPanner.distanceModel = "inverse";
  bleedPanner.refDistance = 1;
  const pos = sphericalToCartesian(yawDeg, pitchDeg, 2.5);
  if (bleedPanner.positionX) {
    bleedPanner.positionX.value = pos.x;
    bleedPanner.positionY.value = pos.y;
    bleedPanner.positionZ.value = pos.z;
  } else if (bleedPanner.setPosition) {
    bleedPanner.setPosition(pos.x, pos.y, pos.z);
  }
  bleedElevationShelf = createElevationShelf(pitchDeg);

  bleedSpatialPathGain = audioCtx.createGain();
  bleedSpatialPathGain.gain.value = binauralEnabled ? 1 : 0;
  bleedLevelGain
    .connect(bleedElevationShelf)
    .connect(bleedPanner)
    .connect(bleedSpatialPathGain)
    .connect(masterGain);

  source.start();
  bleedSource = source;
  bleedRouting = { spatialPathGain: bleedSpatialPathGain, plainPathGain: bleedPlainPathGain };
  registerBinauralRouting(bleedRouting);
}

/**
 * Stops and tears down the room-bleed loop (see startRoomBleed()), if one is
 * playing. Safe to call even if nothing is currently playing. Called on
 * every room change (a bleed source belongs to whichever room defined it)
 * and on unmounting the tour, for the same "otherwise it just keeps
 * playing forever" reason stopAmbientBed() exists.
 */
export function stopRoomBleed() {
  bleedRequestToken++; // invalidate any in-flight startRoomBleed() load
  if (bleedRouting) {
    unregisterBinauralRouting(bleedRouting);
    bleedRouting = null;
  }
  if (bleedSource) {
    try {
      bleedSource.stop();
    } catch {
      // already stopped
    }
    bleedSource.disconnect();
    bleedSource = null;
  }
  for (const node of [bleedCompressor, bleedMakeupGain, bleedThroughWallFilter, bleedLevelGain, bleedPlainPathGain, bleedSpatialPathGain, bleedPanner, bleedElevationShelf]) {
    if (node) {
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    }
  }
  bleedCompressor = null;
  bleedMakeupGain = null;
  bleedThroughWallFilter = null;
  bleedLevelGain = null;
  bleedPlainPathGain = null;
  bleedSpatialPathGain = null;
  bleedPanner = null;
  bleedElevationShelf = null;
}

/**
 * Sets the room-bleed's own volume (0..1) — entirely separate from the
 * master mute (setMuted()), the ambient bed, and narration. Meant to be
 * driven by an in-scene volume-slider hotspot on a 0-100 scale (divide by
 * 100 before passing in here). Ramped rather than snapped so dragging the
 * slider doesn't click.
 */
export function setRoomBleedVolume(value) {
  bleedVolume = Math.min(1, Math.max(0, value));
  if (!audioCtx || !bleedLevelGain) return;
  const now = audioCtx.currentTime;
  bleedLevelGain.gain.cancelScheduledValues(now);
  bleedLevelGain.gain.linearRampToValueAtTime(computeBleedGain(), now + 0.05);
}

/** Current room-bleed volume (0..1), persisted even while nothing is
 * playing so the slider reflects the right position after switching rooms. */
export function getRoomBleedVolume() {
  return bleedVolume;
}

/**
 * Mutes/unmutes just the room-bleed, independent of the master mute
 * (setMuted()) — muting this never touches the ambient bed or narration,
 * and the master mute still silences this too regardless of this flag.
 */
export function setRoomBleedMuted(value) {
  bleedMuted = value;
  if (!audioCtx || !bleedLevelGain) return;
  const now = audioCtx.currentTime;
  bleedLevelGain.gain.cancelScheduledValues(now);
  bleedLevelGain.gain.linearRampToValueAtTime(computeBleedGain(), now + 0.05);
}

export function isRoomBleedMuted() {
  return bleedMuted;
}

/**
 * Master mute — silences EVERYTHING (ambient bed + hotspot narration,
 * spatial or not) via the single outputGain stage both paths feed into.
 * Fully independent of setBinauralEnabled(): muting/unmuting never changes
 * whether narration is spatialized, and toggling binaural never changes
 * whether anything is audible.
 */
export function setMuted(value) {
  fullyMuted = value;
  if (outputGain) {
    outputGain.gain.value = value ? 0 : 1;
  }
}

export function isMuted() {
  return fullyMuted;
}

/**
 * Toggles binaural/spatial mode. This does NOT mute or unmute anything — it
 * crossfades whichever narration clip is currently playing between the
 * HRTF-panned path and the plain non-spatial path (both are always built
 * per-clip, see playHotspotNarration()), and sets the path any new clip
 * starts on. Both paths are equally audible/inaudible according to
 * setMuted() above, so flipping this can never go silent.
 */
export function setBinauralEnabled(value) {
  binauralEnabled = value;
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const RAMP = 0.06; // short crossfade so the switch isn't an audible click
  const routings = [];
  if (currentNarrationRouting) routings.push(currentNarrationRouting);
  extraBinauralRoutings.forEach((routing) => routings.push(routing));
  for (const { plainPathGain, spatialPathGain } of routings) {
    spatialPathGain.gain.cancelScheduledValues(now);
    spatialPathGain.gain.linearRampToValueAtTime(value ? 1 : 0, now + RAMP);
    plainPathGain.gain.cancelScheduledValues(now);
    plainPathGain.gain.linearRampToValueAtTime(value ? 0 : 1, now + RAMP);
  }
}

export function isBinauralEnabled() {
  return binauralEnabled;
}

/** Registers a { spatialPathGain, plainPathGain } pair so future
 * setBinauralEnabled() calls crossfade it too, in addition to whatever
 * hotspot narration is playing. Used by createStudioSpeakerBus(). */
export function registerBinauralRouting(routing) {
  extraBinauralRoutings.add(routing);
}

/** Undoes registerBinauralRouting() — call when the routing's nodes are
 * torn down so a stale reference isn't crossfaded forever. */
export function unregisterBinauralRouting(routing) {
  extraBinauralRoutings.delete(routing);
}

/**
 * Real-world positions (yaw/pitch, degrees — same convention as roomsData.js
 * marker positions) of the control room's two nearfield monitors. The
 * Faust-powered EQ and Compressor hotspots (see
 * panorama/EqCompressorHotspot.jsx) route whatever they're processing out
 * through createStudioSpeakerBus() below instead of straight to the
 * destination, so the processed audio genuinely appears to come from the
 * studio's own monitors — and, like every other spatialized source in this
 * module, moves correctly as the student looks around, via the same
 * updateListenerOrientation() calls PanoramaTour already makes.
 */
export const STUDIO_SPEAKERS = [
  { yaw: 322.0, pitch: 7.8 },
  { yaw: 36.8, pitch: 7.8 },
];

/**
 * Exposes the shared AudioContext (created by initAudio()) so other modules
 * — e.g. the EQ/Compressor hotspots — can build their own nodes on the exact
 * same context the listener orientation and master mute above already apply
 * to, instead of spinning up a second, unrelated AudioContext. Returns null
 * if initAudio() hasn't run yet.
 */
export function getAudioContext() {
  return audioCtx;
}

/**
 * Builds a two-speaker HRTF output bus: anything connected to the returned
 * `input` gain node plays back as if coming from both physical monitor
 * positions in STUDIO_SPEAKERS at once — a real stereo-monitor illusion, not
 * just a centered mono blob — panned/rotated live as the student looks
 * around, via the same listener orientation used everywhere else in this
 * module. A plain (non-HRTF) hard-panned left/right fallback path is always
 * built alongside the spatial one and crossfaded by the master binaural
 * toggle (see setBinauralEnabled()/registerBinauralRouting()), so switching
 * binaural off still gives a left/right sense of the two monitors instead of
 * collapsing to dead-center mono. Routes into masterGain, so setMuted()
 * silences this exactly like everything else in the room.
 *
 * Returns null if initAudio() hasn't run yet. Call the returned dispose()
 * when the source feeding this bus is torn down (e.g. the hotspot panel
 * rebuilds its audio graph, or the panorama unmounts) — otherwise the extra
 * nodes leak and keep responding to the binaural toggle forever.
 */
export function createStudioSpeakerBus() {
  if (!audioCtx || !masterGain) return null;

  const input = audioCtx.createGain();
  input.gain.value = 1;

  const spatialPathGain = audioCtx.createGain();
  spatialPathGain.gain.value = binauralEnabled ? 1 : 0;
  const plainPathGain = audioCtx.createGain();
  plainPathGain.gain.value = binauralEnabled ? 0 : 1;

  const spatialNodes = STUDIO_SPEAKERS.map(({ yaw, pitch }) => {
    const panner = audioCtx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    const pos = sphericalToCartesian(yaw, pitch, 2.5);
    if (panner.positionX) {
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
    } else if (panner.setPosition) {
      panner.setPosition(pos.x, pos.y, pos.z);
    }
    const shelf = createElevationShelf(pitch);
    input.connect(shelf).connect(panner).connect(spatialPathGain);
    return { panner, shelf };
  });

  // Plain fallback: a hard equal-power pan per speaker (first speaker left,
  // second right — matches how the two yaw values straddle straight-ahead)
  // so turning binaural off still reads as "two speakers", not mono.
  const plainNodes = STUDIO_SPEAKERS.map((_, i) => {
    if (!audioCtx.createStereoPanner) {
      // Extremely old browsers without StereoPannerNode: just sum to mono.
      input.connect(plainPathGain);
      return null;
    }
    const panNode = audioCtx.createStereoPanner();
    panNode.pan.value = i === 0 ? -1 : 1;
    input.connect(panNode).connect(plainPathGain);
    return panNode;
  });

  spatialPathGain.connect(masterGain);
  plainPathGain.connect(masterGain);

  const routing = { spatialPathGain, plainPathGain };
  registerBinauralRouting(routing);

  return {
    input,
    dispose() {
      unregisterBinauralRouting(routing);
      for (const { panner, shelf } of spatialNodes) {
        try { panner.disconnect(); } catch { /* already disconnected */ }
        try { shelf.disconnect(); } catch { /* already disconnected */ }
      }
      for (const panNode of plainNodes) {
        if (!panNode) continue;
        try { panNode.disconnect(); } catch { /* already disconnected */ }
      }
      try { spatialPathGain.disconnect(); } catch { /* already disconnected */ }
      try { plainPathGain.disconnect(); } catch { /* already disconnected */ }
      try { input.disconnect(); } catch { /* already disconnected */ }
    },
  };
}
