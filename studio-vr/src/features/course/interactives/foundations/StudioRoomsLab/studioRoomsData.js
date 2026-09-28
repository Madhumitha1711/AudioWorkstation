// Content for StudioRoomsLab — "The Studio: Recording Room and Control
// Room" (Foundations, courseData.js TOPICS[id="the-studio"], chapter 2).
// Same shape as StudioTypesLab's data, fed to the shared BriefingTabs:
//   id     — stable slug; also the image filename (see studioRoomImagePath)
//   tab    — short label for the tab bar
//   title  — heading under the image
//   lead   — one-line definition
//   facts  — labelled paragraphs shown under the lead
export const STUDIO_ROOMS = [
  {
    id: "recording-room",
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

// Photos aren't shot yet — drop them in public/studio-rooms/<id>.jpg and
// they appear automatically; until then each tab shows a placeholder frame.
export const studioRoomImagePath = (id) => `/studio-rooms/${id}.jpg`;
