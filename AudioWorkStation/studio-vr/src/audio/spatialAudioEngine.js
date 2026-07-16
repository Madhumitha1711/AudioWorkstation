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
let masterGain = null;
// Separate output path for hotspot narration that stays audible even when
// "binaural" is switched off — see setMuted(). masterGain only carries the
// spatial-only ambient bed, so muting that doesn't have to mean total
// silence.
let narrationGain = null;
let ambientSource = null;
let ambientGain = null;
let ambientFilter = null;
let ambientDriftLfoGain = null;
let muted = false;
const bufferCache = new Map();
let currentNarrationSource = null;

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

  masterGain = audioCtx.createGain();
  masterGain.gain.value = muted ? 0 : 0.9;
  masterGain.connect(audioCtx.destination);

  // Always at full volume regardless of `muted` — narration should keep
  // playing (in plain, non-spatial form) even with binaural/ambient audio
  // switched off, rather than going completely silent.
  narrationGain = audioCtx.createGain();
  narrationGain.gain.value = 0.9;
  narrationGain.connect(audioCtx.destination);

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
  const driftLfo = audioCtx.createOscillator();
  driftLfo.type = "sine";
  driftLfo.frequency.value = 0.07; // one drift cycle every ~14s
  ambientDriftLfoGain = audioCtx.createGain();
  ambientDriftLfoGain.gain.value = profile.gustDepth;
  driftLfo.connect(ambientDriftLfoGain).connect(ambientGain.gain);
  driftLfo.start();

  ambientSource
    .connect(ambientFilter)
    .connect(ambientGain)
    .connect(masterGain);
  ambientSource.start();
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
 * When "binaural" is switched off (see setMuted()), this still plays —
 * just as plain, non-spatial audio through narrationGain instead of the
 * HRTF panner/masterGain path — rather than going silent.
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

  if (muted) {
    // Binaural off: plain non-spatial playback, always-on output path.
    source.connect(compressor).connect(makeupGain).connect(narrationGain);
  } else {
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

    source
      .connect(compressor)
      .connect(makeupGain)
      .connect(elevationShelf)
      .connect(panner)
      .connect(masterGain);
  }

  source.start();
  currentNarrationSource = source;
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
}

/**
 * Toggles "binaural" mode. This is NOT a full mute: it only silences the
 * ambient bed via masterGain. Hotspot narration keeps playing regardless —
 * see playHotspotNarration(), which routes through the always-on
 * narrationGain and drops the HRTF panner while this is true.
 *
 * The ambient bed itself isn't stopped, just silenced via masterGain, so it
 * picks back up instantly when re-enabled.
 */
export function setMuted(value) {
  muted = value;
  if (masterGain) {
    masterGain.gain.value = value ? 0 : 0.9;
  }
}

export function isMuted() {
  return muted;
}
