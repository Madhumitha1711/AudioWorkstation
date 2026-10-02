// Singleton audio graph. Master mute (outputGain) and binaural on/off (HRTF vs
// plain path crossfade) are independent controls — never couple them.
let audioCtx = null;
let outputGain = null;
let masterGain = null;
let narrationGain = null;
let fullyMuted = false;
let binauralEnabled = true;
let currentNarrationSource = null;
let currentNarrationRouting = null;
const extraBinauralRoutings = new Set();

function sphericalToCartesian(yawDeg, pitchDeg, radius = 1) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  return {
    x: radius * Math.sin(yaw) * Math.cos(pitch),
    y: radius * Math.sin(pitch),
    z: -radius * Math.cos(yaw) * Math.cos(pitch),
  };
}

// Generic HRTF conveys elevation poorly; a high-shelf adds a secondary up/down cue.
function createElevationShelf(pitchDeg) {
  const shelf = audioCtx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 6000;
  const normalized = Math.max(-1, Math.min(1, pitchDeg / 45));
  shelf.gain.value = normalized * 7;
  return shelf;
}

export function initAudio() {
  if (audioCtx) return audioCtx;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;

  audioCtx = new Ctx();

  outputGain = audioCtx.createGain();
  outputGain.gain.value = fullyMuted ? 0 : 1;
  outputGain.connect(audioCtx.destination);

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.9;
  masterGain.connect(outputGain);

  narrationGain = audioCtx.createGain();
  narrationGain.gain.value = 0.9;
  narrationGain.connect(outputGain);

  return audioCtx;
}

export function resumeAudio() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => { });
  }
}

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
    listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}

export function stopHotspotNarration() {
  if (currentNarrationSource) {
    try {
      currentNarrationSource.stop();
    } catch {
    }
    currentNarrationSource.disconnect();
    currentNarrationSource = null;
  }
  currentNarrationRouting = null;
}

export function setMuted(value) {
  fullyMuted = value;
  if (outputGain) {
    outputGain.gain.value = value ? 0 : 1;
  }
}

export function isMuted() {
  return fullyMuted;
}

export function setBinauralEnabled(value) {
  binauralEnabled = value;
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const RAMP = 0.06;
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

function registerBinauralRouting(routing) {
  extraBinauralRoutings.add(routing);
}

function unregisterBinauralRouting(routing) {
  extraBinauralRoutings.delete(routing);
}

const STUDIO_SPEAKERS = [
  { yaw: 322.0, pitch: 7.8 },
  { yaw: 36.8, pitch: 7.8 },
];

export function getAudioContext() {
  return audioCtx;
}

export function createStudioSpeakerBus({ independent = false } = {}) {
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

  const plainNodes = STUDIO_SPEAKERS.map((_, i) => {
    if (!audioCtx.createStereoPanner) {
      input.connect(plainPathGain);
      return null;
    }
    const panNode = audioCtx.createStereoPanner();
    panNode.pan.value = i === 0 ? -1 : 1;
    input.connect(panNode).connect(plainPathGain);
    return panNode;
  });

  const finalStage = independent ? audioCtx.createGain() : masterGain;
  if (independent) {
    finalStage.gain.value = 0.9;
    finalStage.connect(audioCtx.destination);
  }
  spatialPathGain.connect(finalStage);
  plainPathGain.connect(finalStage);

  const routing = { spatialPathGain, plainPathGain };
  registerBinauralRouting(routing);

  return {
    input,
    dispose() {
      unregisterBinauralRouting(routing);
      for (const { panner, shelf } of spatialNodes) {
        try { panner.disconnect(); } catch {  }
        try { shelf.disconnect(); } catch {  }
      }
      for (const panNode of plainNodes) {
        if (!panNode) continue;
        try { panNode.disconnect(); } catch {  }
      }
      try { spatialPathGain.disconnect(); } catch {  }
      try { plainPathGain.disconnect(); } catch {  }
      try { input.disconnect(); } catch {  }
      if (independent) {
        try { finalStage.disconnect(); } catch {  }
      }
    },
  };
}
