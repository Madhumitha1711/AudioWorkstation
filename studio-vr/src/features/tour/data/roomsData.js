export const ROOMS = [
  {
    id: "studio-room",
    name: "Control Room",
    panorama: "/paranoma.png",
    links: [
      {
        nodeId: "recording-room",
        yaw: 255.4,
        pitch: 4.7,
        arrivalYaw: 33.2,
        arrivalPitch: -3.9,
      },
    ],
    markers: [
      {
        id: "speaker",
        yaw: 22.4,
        pitch: -2.9,
        title: "Speakers",
        audio: "/audio/speaker.mp3",
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
    interactiveMarkers: [
      {
        id: "daw-desk",
        type: "daw",
        yaw: 62.0,
        pitch: 4.1,
        title: "DAW Workstation",
        icon: "⌨️",
        secondaryEntry: true,
      },
    ],
  },
  {
    id: "recording-room",
    name: "Recording Room",
    panorama: "/recording.png",
    links: [
      {
        nodeId: "studio-room",
        yaw: 285.7,
        pitch: 0.6,
        arrivalYaw: 75.4,
        arrivalPitch: -7.6,
      },
    ],
    markers: [
      {
        id: "mic-stand",
        yaw: 7.0,
        pitch: 12.9,
        title: "Microphone",
        description:
          "A large-diaphragm condenser on a boom stand, angled down at the drum kit from just above head height. Condensers like this one are prized for their detail and sensitivity — they capture a wide frequency range and fast transients accurately, which is why they're the default choice for overheads, vocals, and acoustic instruments in a treated room like this.",
        course: {
          id: "mic-stand-101",
          objectives: [
            "Dynamic vs. condenser vs. ribbon microphones, and what each is built for",
            "Polar patterns (cardioid, omnidirectional, figure-8) and what they reject vs. capture",
            "Frequency response and transient response as ways to compare mics",
            "Matching a mic's characteristics to a specific source and room",
          ],
        },
      },
      {
        id: "stereo-overheads",
        yaw: 56.3,
        pitch: 13.7,
        title: "Stereo Overhead Pair",
        description:
          "The matching mic on the opposite side of the kit — together the two form a stereo overhead pair. How these two capsules are spaced and angled relative to each other (and to the kit) determines the stereo image: get it right and the kit translates as a wide, coherent picture in mono-compatible stereo; get it wrong and instruments smear or partially cancel when summed to mono.",
        course: {
          id: "stereo-overheads-101",
          objectives: [
            "Spaced-pair, X/Y, and ORTF stereo miking techniques",
            "Mono compatibility and phase cancellation between two mics on one source",
            "The 3:1 rule for avoiding comb filtering between nearby microphones",
            "Distance miking and how it trades detail for room sound",
          ],
        },
      },
    ],
  },
];

export const START_NODE_ID = "studio-room";
