// Content for RoomTreatmentLab — step copy is verbatim from
// design/room-treatment.html. One room, one source, one mic position;
// treatment is added cumulatively.
//
// AUDIO: each step plays the recording at `src`. Put the files at
//   public/audio/room-treatment/<step-id>.wav
// (bare, absorption, basstraps, diffusion, full, plus overfoam for the
// experiment) — or point `src` anywhere else. Level-match the files. Until
// a file exists, its card shows an "Audio coming soon" placeholder.
//
// `plan` is what RoomPlan.jsx draws for the step: which walls have
// absorption panels, whether bass traps / diffuser / ceiling cloud are in,
// whether flutter echo is shown, and how strong the corner bass build-up is.
import { audioPath } from "../shared/useRoomAudio";

const DIR = "room-treatment";

export const STEPS = [
  {
    id: "bare",
    src: audioPath(DIR, "bare"),
    tag: "01 · Starting point",
    title: "Bare room",
    short: "bare",
    body: "An empty room with hard, parallel walls. Sound bounces around freely: there’s a ringing echo, a “boxy” tone, and some bass notes boom. This is what we’re going to fix.",
    plan: { absorb: [], traps: false, diffuser: false, cloud: false, foamAll: false, flutter: true, boom: 1 },
  },
  {
    id: "absorption",
    src: audioPath(DIR, "absorption"),
    tag: "02 · Tames echo",
    title: "+ Absorption panels",
    body: "Foam or fibreglass panels at the spots where sound first bounces off the walls and ceiling. They soak up the mid and high frequencies, so the ringing and flutter echo drop away and the source sounds clearer.",
    plan: { absorb: ["top", "bottom", "left"], traps: false, diffuser: false, cloud: false, foamAll: false, flutter: false, boom: 1 },
  },
  {
    id: "basstraps",
    src: audioPath(DIR, "basstraps"),
    tag: "03 · Controls bass",
    title: "+ Bass traps",
    body: "Thick absorbers in the corners, where low frequencies build up. Thin panels can’t stop bass, so this is what evens out the booming notes and makes the low end sound tight.",
    plan: { absorb: ["top", "bottom", "left"], traps: true, diffuser: false, cloud: false, foamAll: false, flutter: false, boom: 0.25 },
  },
  {
    id: "diffusion",
    src: audioPath(DIR, "diffusion"),
    tag: "04 · Keeps it natural",
    title: "+ Diffusers",
    body: "Uneven wooden surfaces that scatter sound in many directions instead of absorbing it. The room keeps some life and air, but without distinct echoes bouncing straight back at the mic.",
    plan: { absorb: ["top", "bottom", "left"], traps: true, diffuser: true, cloud: false, foamAll: false, flutter: false, boom: 0.25 },
  },
  {
    id: "full",
    src: audioPath(DIR, "full"),
    tag: "05 · Result",
    title: "Fully treated room",
    short: "treated",
    body: "Absorption, bass traps and diffusion together. The source sounds clear, balanced and natural, with a short, even decay. Compare it with the bare room: same source, same mic, same spot.",
    plan: { absorb: ["top", "bottom", "left"], traps: true, diffuser: true, cloud: true, foamAll: false, flutter: false, boom: 0.15 },
  },
];

// The "More foam isn't always better" point from the mockup's "Why this
// matters", made hearable: thin foam on every wall, nothing else.
export const OVERFOAM = {
  id: "overfoam",
  src: audioPath(DIR, "overfoam"),
  tag: "Experiment · Over-treated",
  title: "What if you just cover every wall in foam?",
  body: "Thin foam on every surface and nothing else. The mids and highs vanish, so it sounds dull and lifeless — but thin foam can’t touch the bass, so the booming notes from the bare room are all still there. A/B it against the fully treated room.",
  plan: { absorb: ["top", "bottom", "left", "right"], traps: false, diffuser: false, cloud: false, foamAll: true, flutter: false, boom: 1 },
};

export const ALL_STEPS = [...STEPS, OVERFOAM];

export const KEPT_SAME = "source, room, microphone, mic position, recording level, no effects.";

export const WHY = [
  [
    "Treatment is not soundproofing.",
    "Treatment controls how sound behaves inside the room. Soundproofing (isolation) stops sound getting in or out. Foam on the walls won’t stop your neighbour hearing you.",
  ],
  [
    "Each tool fixes a different problem.",
    "Absorption handles echo and brightness, bass traps handle the low end, and diffusers keep the room from sounding dead.",
  ],
  [
    "More foam isn’t always better.",
    "Covering every wall kills the highs but leaves the bass untouched, so the room ends up dull and boomy. Balance matters more than quantity.",
  ],
  [
    "It helps you listen, not just record.",
    "In a treated room you hear your mix accurately, so decisions you make there still sound right on headphones, in the car and on other speakers.",
  ],
];

export const TAKEAWAY =
  "start with the first reflection points and the corners. A few well-placed panels and bass traps make a bigger difference than covering every wall.";
