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
// Each `links[]` entry's `yaw`/`pitch` place the door hotspot within the
// *current* room's photo — where it appears on screen, nothing else. The
// separate `arrivalYaw`/`arrivalPitch` on that same entry is the camera
// direction the viewer lands facing once that door is clicked, inside the
// *destination* room's photo (see onNodeChanged() in PanoramaTour.jsx, which
// snaps to it right as the new node loads). These are independent because
// the two panoramas don't share a coordinate frame — "105.7 yaw" in the
// studio room's photo has no relation to any angle in the recording room's
// photo.
//
// To make a doorway feel like actually walking in (the door you just came
// through ends up behind you, out of frame), set arrivalYaw to the
// *destination* room's own door-yaw for the link back, plus/minus 180°. E.g.
// the recording room's door back to the studio sits at yaw 285.7 in its own
// photo (below), so the studio's link *into* the recording room uses
// arrivalYaw 105.7 (285.7 - 180, wrapped to 0-360).
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
    name: "Control Room",
    panorama: "/paranoma.png",
    // Ambient bed profile for this room — see startAmbientBed() /
    // setRoomAmbience() in spatialAudioEngine.js. Filtered down to a duller,
    // more muffled tone than before (synthetic filtered noise, not a
    // recording) — the control room should read as more closed-in than the
    // recording room now.
    ambience: { filterFreq: 200, gain: 0.03, gustDepth: 0.015 },
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
        yaw: 255.4,
        pitch: 4.7,
        // Where the camera lands, looking into the recording room, once
        // this door is clicked — independent of the yaw/pitch above, which
        // only places the door hotspot within *this* room's photo. Set to
        // the exact opposite (+180°) of the recording room's own door yaw
        // (285.7, see that room's links[] below) so the door the student
        // just walked through is directly behind them on arrival.
        arrivalYaw: 105.7,
        arrivalPitch: -16.8,
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
        yaw: 117.0,
        pitch: -19.6,
        title: "Recording Room Bleed",
      },
    ],
    markers: [
      {
        id: "speaker",
        yaw: 22.4,
        pitch: -2.9,
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
        yaw: 51.7,
        pitch: -20.0,
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
        yaw: 294.5,
        pitch: -15.2,
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
        yaw: 315.0,
        pitch: -19.2,
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
        yaw: 124.0,
        pitch: 19.4,
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
        yaw: 133.7,
        pitch: -19.8,
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
        yaw: 88.5,
        pitch: -15.1,
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
      // 8th gear hotspot — up at the monitors themselves (same spot the DAW
      // hotspot originally used before it briefly moved to a purely
      // interactive marker). Behaves exactly like every hotspot above: a
      // numbered badge (8, since it's declared last in this array) that
      // opens the standard svr-tour-gear-panel with description + course/quiz
      // choice. `course.id: "daw-screens"` matches the existing ready-to-go
      // topic in course/courseData.js (full lessons + a 5-question
      // "daw-assessment" quiz), so "Test your knowledge" and "Start course"
      // both work already, same as any other numbered hotspot. The separate
      // `daw-desk` interactive marker below is what actually opens the live
      // DawWorkstationScreen — this one is read-only info, on purpose.
      {
        id: "daw-screens",
        yaw: 62.2,
        pitch: 14.8,
        title: "DAW Workstation",
        description:
          "The dual displays run the software brain of the studio — a Digital Audio Workstation (DAW) that records, edits, arranges, and mixes audio once it's been converted to digital form. It's the modern equivalent of a multitrack tape machine, a mixing console, and a full rack of outboard effects, all represented as tracks, faders, and plugins on screen.",
        course: {
          id: "daw-screens",
          objectives: [
            "What a DAW actually does: recording, editing, arranging, processing, and mixing audio in one program",
            "Recall — instantly returning a session to an exact prior state, something an analog console can't do on its own",
            "Comping: assembling one ideal take by combining the best parts of multiple recorded takes",
            "Non-destructive editing and plugin processing vs. a one-way, destructive print through outboard hardware",
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
      // Desk/keyboard-height entry point — separate from the "daw-screens"
      // numbered gear hotspot above (same monitors, but that one just opens
      // an info panel). This is the one that actually opens the live DAW UI.
      // Kept its own `icon` (keyboard, not the default screen glyph) since
      // it's the only interactive marker left here, but the override still
      // reads correctly either way (see interactiveMarkerHtml in
      // PanoramaTour.jsx).
      {
        id: "daw-desk",
        type: "daw",
        yaw: 62.0,
        pitch: 4.1,
        title: "DAW Workstation",
        icon: "⌨️",
        // Kept out of the left-docked StudioHotspotsPanel device list /
        // power-up game (see buildDeviceList in hotspotDevices.js) — the
        // numbered "daw-screens" gear hotspot above is what represents this
        // spot in that list (and in SIGNAL_ORDER's signal chain); this is
        // just an extra way to reach the live module from the scene, not a
        // second real device to power up.
        secondaryEntry: true,
      },
    ],
  },
  {
    id: "recording-room",
    name: "Recording Room",
    panorama: "/recording.png",
    // Pushed noticeably louder than the control room — still on the
    // damped/dull side (a treated recording space still has less
    // high-frequency liveliness than the control room), but the level
    // itself should now read as clearly higher, not just slightly.
    ambience: { filterFreq: 220, gain: 0.09, gustDepth: 0.045 },
    roomBleed: {
      audio: "/audio/AndresGuazzelli_FloresDeAbril_Full/02_Piano.wav",
      yaw: 127.7,
      pitch: 0.4,
    },
    links: [
      {
        nodeId: "studio-room",
        yaw: 285.7,
        pitch: 0.6,
        // Where the camera lands, looking into the studio room, once this
        // door is clicked. Set to the exact opposite (+180°) of the studio
        // room's own door yaw (255.4, see that room's links[] above) so the
        // door the student just walked through is directly behind them on
        // arrival.
        arrivalYaw: 75.4,
        arrivalPitch: -7.6,
      },
    ],
    markers: [],
  },
];

export const START_NODE_ID = "studio-room";
