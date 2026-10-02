export const STUDIO_ROOMS = [
  {
    id: "recording-room",
    points: [
      "This is where the performance happens.",
      "Microphones capture the sound; nothing is mixed here.",
      "A wall box sends every mic signal to the control room.",
    ],
    tab: "Recording Room",
    title: "The Recording Room",
    lead: "Also called the live room — the space where the performance happens and musicians, singers and instruments are captured by microphones.",
    facts: [
      {
        label: "Purpose",
        text: "Capture the cleanest, most natural sound of the performer. Nothing is mixed here — the job is to get a great source onto the microphones.",
      },
      {
        label: "What's in it",
        text: "Microphones on stands, headphones with a cue mix so performers can hear themselves and the track, instruments and amps, and a wall box whose numbered sockets carry every mic signal through to the control room.",
      },
      {
        label: "Acoustics & Build",
        text: "Sized and treated to sound good rather than dead — a balance of absorption and diffusion, often with isolation booths so vocals or loud sources don't bleed into the other mics.",
      },
    ],
  },
  {
    id: "control-room",
    points: [
      "The engineer listens, records and mixes here.",
      "Console, outboard gear, the DAW and studio monitors live here.",
      "It's built for accurate listening, with a window into the recording room.",
    ],
    tab: "Control Room",
    title: "The Control Room",
    lead: "The engineer's room — every signal from the recording room arrives here to be monitored, shaped and recorded.",
    facts: [
      {
        label: "Purpose",
        text: "Listen critically and make decisions: set levels, route signals, record into the DAW and later mix. A talkback mic lets the engineer speak to the performers in their headphones.",
      },
      {
        label: "What's in it",
        text: "The mixing console or audio interface, mic preamps, outboard processors like EQs and compressors, the patch bay, the DAW computer, and a pair of studio monitors set up around the listening sweet spot.",
      },
      {
        label: "Acoustics & Build",
        text: "Built for accurate listening — a symmetrical layout with bass traps and absorption at the first-reflection points. A double-glazed window keeps sight lines to the recording room while keeping its sound out.",
      },
    ],
  },
];

export const studioRoomImagePath = (id) => `/studio-rooms/${id}.jpg`;
