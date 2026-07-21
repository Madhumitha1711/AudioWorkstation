// Data-only definition of the studio tour: which panorama belongs to each
// room, how rooms connect to each other (doorway arrows), and which pieces
// of gear have a learning hotspot.
//
// Currently there's a single real room. Add more rooms to this array later
// (each with its own `panorama` and `links` back and forth) to rebuild a
// multi-room tour — the component already supports it.
//
// Each marker's `course` object is a placeholder for the real lesson content
// that should load when a student selects that hotspot (currently just
// rendered as a summary + objectives list in the side panel). Swap in real
// course/lesson data or wire `courseId` up to your LMS once that's ready.
//
// yaw / pitch values (in degrees) below are measured against the actual
// photo using placement mode ("P" in the running app). To add more:
//   1. Run the app.
//   2. Press "P" to turn on hotspot placement mode (see the on-screen hint).
//   3. Click exactly on the spot (gear, doorway) you want a hotspot on.
//   4. The yaw/pitch of that exact click is printed to the console and
//      shown on screen — copy those numbers into a new entry below.
//
// Each marker's `audio` field is the recorded narration clip that plays,
// spatialized to that hotspot's direction, when it's selected — the path
// must match a real file in public/audio/ exactly. Any common web audio
// format works (mp3, m4a, ogg, wav). If a file is missing, that hotspot
// just silently skips narration.
//
// A room's `roomBleed` field (optional) is a real audio file that loops
// quietly in the background for as long as the student is standing in that
// room, spatialized to a fixed (yaw, pitch) via HRTF — see
// startRoomBleed()/stopRoomBleed() in spatialAudioEngine.js. Unlike
// `markers[].audio` above it isn't triggered by clicking anything; it just
// plays on arrival, deliberately quiet, meant to read as sound leaking in
// from elsewhere (e.g. a session running in an adjacent room) rather than
// something happening in this one. `volumeControls` is the matching
// in-scene hotspot (its own yaw/pitch, separate from the bleed source's own
// position) that opens a small slider + mute panel for adjusting it —
// `target` names which `roomBleed`-shaped field it controls (only
// "roomBleed" exists today, but the indirection leaves room for more than
// one adjustable bed per room later).

export const ROOMS = [
  {
    id: "studio-room",
    name: "Studio",
    panorama: "/paranoma.png",
    // Ambient bed profile for this room — see startAmbientBed() /
    // setRoomAmbience() in spatialAudioEngine.js. This is the control
    // room's live-ish, slightly airy tone (synthetic filtered noise, not a
    // recording).
    ambience: { filterFreq: 500, gain: 0.03, gustDepth: 0.015 },
    // Faint, continuous "something's happening next door" bed — a real
    // recording (unlike the synthetic ambience above), positioned roughly
    // toward the recording-room doorway (compare the door link's yaw/pitch
    // just below) so it reads as bleeding through the wall from an active
    // session in there rather than playing in this room. Kept quiet by
    // design — see BLEED_CEILING_GAIN in spatialAudioEngine.js, which the
    // volumeControls slider below can only ever turn up to, never past.
    roomBleed: {
      audio: "/audio/AndresGuazzelli_FloresDeAbril_Full/02_Piano.wav",
      yaw: 127.7,
      pitch: 0.4,
    },
    links: [
      {
        nodeId: "recording-room",
        yaw: 120.5,
        pitch: -3.4,
      },
    ],
    // In-scene control for the roomBleed bed above: its own hotspot
    // (separate position from the bleed source itself) that opens a small
    // volume slider + mute panel. See the `kind: "volume"` marker handling
    // in PanoramaTour.jsx.
    volumeControls: [
      {
        id: "recording-room-bleed-volume",
        target: "roomBleed",
        yaw: 58.3,
        pitch: -20.1,
        title: "Recording Room Bleed",
      },
    ],
    markers: [
      {
        id: "speaker",
        yaw: 322.3,
        pitch: -3.3,
        title: "Speakers",
        audio: "/audio/speaker.mp3",
        // The rotatable 3D scan preview for this piece of gear now lives on
        // the matching lesson page instead (see TOPICS[0].model in
        // course/courseData.js) — the hotspot panel stays text + audio only.
        description:
          "A two-way nearfield/midfield monitor: a dome tweeter handles high frequencies while the larger woofer below covers mids and bass. The slots on either side of the tweeter are bass reflex ports — they vent air pressure from behind the woofer to extend low-frequency output without needing a larger sealed cabinet.",
        course: {
          id: "studio-monitors-101",
          objectives: [
            "Nearfield vs midfield vs far-field monitoring, and when each is used",
            "Why monitors are designed for a flat, uncolored frequency response",
            "Ported (bass reflex) vs sealed cabinet design and how each shapes bass",
            "Two-way vs three-way speaker crossover designs",
          ],
        },
      },
      {
        id: "mixing-console",
        yaw: 357.4,
        pitch: -21.8,
        title: "Mixing Console",
        audio: "/audio/mixing-console.mp3",
        description:
          "The centerpiece of the control room. A large-format analog console sums every microphone and instrument signal, giving the engineer independent control over level, EQ, and routing for each channel before it's mixed down to a stereo or surround master.",
        course: {
          id: "mixing-console-101",
          objectives: [
            "Channel strips: gain, EQ, aux sends, and routing",
            "Analog summing vs in-the-box (DAW) summing",
            "Bus and group routing for subgroups (drums, vocals, etc.)",
            "Talkback, monitoring, and control room signal flow",
          ],
        },
      },
      {
        id: "patch-bay",
        yaw: 208.0,
        pitch: -13.8,
        title: "Patch Bay",
        audio: "/audio/patch-bay.mp3",
        description:
          "A patch bay exposes the inputs and outputs of every piece of gear in the room on a single panel, letting an engineer route signal between the console, outboard gear, and DAW interface using patch cables instead of permanently wiring everything together.",
        course: {
          id: "patchbay-101",
          objectives: [
            "Normalled vs half-normalled vs fully patched connections",
            "Why patch bays make session recall and routing changes fast",
            "Balanced vs unbalanced cabling (TRS vs TS vs XLR)",
            "Common patch bay workflows: inserting outboard gear on a channel",
          ],
        },
      },
      {
        id: "preamp-rack",
        yaw: 236.5,
        pitch: -10.8,
        title: "Preamp Rack",
        audio: "/audio/preamp.mp3",
        description:
          "Microphone preamps boost the very low-level signal from a microphone up to line level before it reaches the console or converter. Different preamps impart their own character — transformer-based designs add warmth and saturation, while clean designs aim for transparency.",
        course: {
          id: "preamp-rack-101",
          objectives: [
            "Why mics need a preamp before hitting the console",
            "Gain staging and avoiding clipping or noise",
            "Transformer-based vs solid-state preamp coloration",
            "Matching preamp character to a source (vocals, drums, etc.)",
          ],
        },
      },
      {
        id: "diffuser-panel",
        yaw: 63.7,
        pitch: 17.8,
        title: "Acoustic Diffuser",
        audio: "/audio/diffuser.mp3",
        description:
          "Unlike absorption panels, which soak up sound energy, diffusers scatter reflections in many directions. This breaks up strong early reflections and flutter echo while preserving the room's liveliness, which is why control rooms often mix diffusion and absorption rather than deadening the room completely.",
        course: {
          id: "diffuser-101",
          objectives: [
            "Absorption vs diffusion vs reflection",
            "Why over-treating a room with pure absorption sounds \"dead\"",
            "The reflection-free zone concept around the mix position",
            "Common diffuser designs (QRD, skyline/binary diffusers)",
          ],
        },
      },
      {
        id: "lf-emitter",
        yaw: 73.8,
        pitch: -22.3,
        title: "Low Frequency Emitter",
        audio: "/audio/lfe.mp3",
        description:
          "A dedicated low-frequency driver (sometimes called a subwoofer or LFE unit) reproduces the bottom octaves that a monitor's woofer can't move enough air to handle cleanly. Because bass wavelengths are long and room modes color low end heavily, placement and room correction matter as much as the driver itself.",
        course: {
          id: "lf-emitter-101",
          objectives: [
            "Why low frequencies need dedicated drivers and larger excursion",
            "Room modes and standing waves, and how they color bass response",
            "Subwoofer placement and crossover integration with main monitors",
            "Bass management: mono vs stereo low end, and LFE channel basics",
          ],
        },
      },
      {
        id: "sound-card",
        yaw: 26.7,
        pitch: -15.4,
        title: "Sound Card",
        audio: "/audio/sound-card.mp3",
        description:
          "The audio interface (sound card) converts analog signal from mics and instruments into digital audio the DAW can record, and converts it back to analog for monitoring. Its converters, clocking, and I/O count set the practical limits on recording quality and how many channels can be tracked at once.",
        course: {
          id: "sound-card-101",
          objectives: [
            "Analog-to-digital and digital-to-analog conversion basics",
            "Sample rate, bit depth, and how they affect recording quality",
            "Clocking and why word clock stability matters in a session",
            "I/O count, latency, and driver considerations when choosing an interface",
          ],
        },
      },
    ],
    // Functional processing hotspots — distinct from the descriptive `markers`
    // above: instead of opening a read-only info panel, these open a live
    // full-screen module wired to real Faust WASM DSPs that actually process
    // an uploaded (or built-in demo) audio file. Rendered in PanoramaTour.jsx
    // with an icon marker instead of a numbered badge so they read as
    // "interactive module" at a glance rather than "read more about this
    // gear". The DAW hotspot (see panorama/DawWorkstationScreen.jsx) opens a
    // full-screen "walked up to the desk" DAW UI with a single track, a
    // draggable selection, and a chainable insert rack built from
    // public/faust/{ParamEQ,compressor,limiter,Gate,deesser,delay,reverb} —
    // its processed output plays back through the two real studio monitor
    // positions (see STUDIO_SPEAKERS in audio/spatialAudioEngine.js) for a
    // genuine binaural "sitting between the speakers" feel that pans as you
    // look around, instead of playing dead-center.
    interactiveMarkers: [
      {
        id: "daw-screens",
        type: "daw",
        yaw: 0,
        pitch: 8,
        title: "DAW Workstation",
      },
    ],
  },
  {
    id: "recording-room",
    name: "Recording Room",
    panorama: "/recording.png",
    // Quieter, more damped tone than the control room — a treated
    // recording space has far less ambient hiss/liveliness.
    ambience: { filterFreq: 220, gain: 0.012, gustDepth: 0.006 },
    links: [
      {
        nodeId: "studio-room",
        yaw: 256.3,
        pitch: -5.3,
      },
    ],
    markers: [],
  },
];

export const START_NODE_ID = "studio-room";
