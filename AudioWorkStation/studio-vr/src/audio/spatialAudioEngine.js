// A small singleton wrapper around the Web Audio API that provides real
// binaural/HRTF-panned audio, tied to wherever the student is currently
// looking in the panorama.
//
// Only two things actually play: the ambient bed — a synthetic "mild air"
// tone (filtered white noise, see startAmbientBed() below; no audio file
// involved) — and hotspot narration — real uploaded audio files (see
// playHotspotNarration) played on demand through an HRTF PannerNode when a
// hotspot is selected — genuinely spatial, unlike browser text-to-speech,
// which can't be routed through Web Audio nodes at all.
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

// Default ambient profile used until a room supplies its own (see
// setRoomAmbience()). Values chosen to match the original "mild air" bed.
const DEFAULT_AMBIENCE = { filterFreq: 500, gain: 0.03, gustDepth: 0.015 };

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
  if (audioCtx && currentNarrationRouting) {
    const now = audioCtx.currentTime;
    const RAMP = 0.06; // short crossfade so the switch isn't an audible click
    const { plainPathGain, spatialPathGain } = currentNarrationRouting;
    spatialPathGain.gain.cancelScheduledValues(now);
    spatialPathGain.gain.linearRampToValueAtTime(value ? 1 : 0, now + RAMP);
    plainPathGain.gain.cancelScheduledValues(now);
    plainPathGain.gain.linearRampToValueAtTime(value ? 0 : 1, now + RAMP);
  }
}

export function isBinauralEnabled() {
  return binauralEnabled;
}
