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
// spatialized to that hotspot's direction, when it's selected. Drop the
// matching file into public/audio/ using these exact names and it'll be
// picked up automatically — nothing else needs to change. Any common web
// audio format works (mp3, m4a, ogg, wav). If a file is missing, that
// hotspot just silently skips narration.
//
// The `-clean` files are the originals run through a noise-reduction +
// loudness-normalization pass (see public/audio/ for both versions). To
// re-process a newly uploaded original the same way:
//   ffmpeg -i original.m4a -af "highpass=f=90,afftdn=nr=18:nf=-25,\
//     loudnorm=I=-16:TP=-1.5:LRA=7,alimiter=limit=0.95" -c:a aac -b:a 192k \
//     original-clean.m4a

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
    links: [
      {
        nodeId: "recording-room",
        yaw: 120.5,
        pitch: -3.4,
      },
    ],
    markers: [
      {
        id: "speaker",
        yaw: 322.3,
        pitch: -3.3,
        title: "Speakers",
        audio: "/audio/speaker-clean.m4a",
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
        audio: "/audio/mixing-console-clean.m4a",
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
        id: "daw-screens",
        yaw: 0,
        pitch: 8,
        title: "DAW Workstation",
        // Uploaded filename is singular ("daw-screen"), not "daw-screens".
        audio: "/audio/daw-screen-clean.m4a",
        description:
          "The dual displays run the Digital Audio Workstation (DAW) — the software where recorded tracks are edited, arranged, processed with plugins, and mixed. Modern studios pair analog hardware like the console and outboard rack with a DAW for editing flexibility and recall.",
        course: {
          id: "daw-101",
          objectives: [
            "What a DAW does, and popular options (Pro Tools, Logic, Ableton, etc.)",
            "Recall: why analog consoles struggle to \"save\" a mix state and DAWs solve this",
            "Track editing, comping, and non-destructive editing",
            "Plugin processing vs outboard hardware processing",
          ],
        },
      },
      {
        id: "patch-bay",
        yaw: 208.0,
        pitch: -13.8,
        title: "Patch Bay",
        audio: "/audio/patch-bay-clean.m4a",
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
        audio: "/audio/preamp-rack-clean.m4a",
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
        audio: "/audio/diffuser-panel-clean.m4a",
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
        audio: "/audio/lf-emitter-clean.m4a",
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
        audio: "/audio/sound-card-clean.m4a",
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
