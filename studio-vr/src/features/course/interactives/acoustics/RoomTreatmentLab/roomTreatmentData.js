import { audioPath, imagePath } from "../shared/paths";

const DIR = "room-treatment";

export const STEPS = [
  {
    id: "bare",
    points: [
      "Hard, parallel walls bounce sound around.",
      "You hear ringing, a boxy tone and booming bass notes.",
      "This is the starting point to fix.",
    ],
    src: audioPath(DIR, "bare"),
    image: imagePath(DIR, "bare"),
    tab: "Bare room",
    title: "Bare room",
    short: "bare",
    body: "An empty room with hard, parallel walls. Sound bounces around freely: there’s a ringing echo, a “boxy” tone, and some bass notes boom. This is what we’re going to fix.",
  },
  {
    id: "absorption",
    points: [
      "Panels go where sound first hits the walls.",
      "They soak up mids and highs.",
      "Ringing and flutter echo go away.",
    ],
    src: audioPath(DIR, "absorption"),
    image: imagePath(DIR, "absorption"),
    tab: "Absorption",
    title: "+ Absorption panels",
    body: "Foam or fibreglass panels at the spots where sound first bounces off the walls and ceiling. They soak up the mid and high frequencies, so the ringing and flutter echo drop away and the source sounds clearer.",
  },
  {
    id: "basstraps",
    points: [
      "Thick absorbers go in the corners.",
      "Thin panels can't stop bass, but bass traps can.",
      "The low end becomes tight and even.",
    ],
    src: audioPath(DIR, "basstraps"),
    image: imagePath(DIR, "basstraps"),
    tab: "Bass traps",
    title: "+ Bass traps",
    body: "Thick absorbers in the corners, where low frequencies build up. Thin panels can’t stop bass, so this is what evens out the booming notes and makes the low end sound tight.",
  },
  {
    id: "diffusion",
    points: [
      "Diffusers scatter sound instead of soaking it up.",
      "They keep the room lively and natural.",
      "No distinct echoes bounce back at the mic.",
    ],
    src: audioPath(DIR, "diffusion"),
    image: imagePath(DIR, "diffusion"),
    tab: "Diffusers",
    title: "+ Diffusers",
    body: "Uneven wooden surfaces that scatter sound in many directions instead of absorbing it. The room keeps some life and air, but without distinct echoes bouncing straight back at the mic.",
  },
  {
    id: "full",
    points: [
      "Absorption, bass traps and diffusion together.",
      "Clear, balanced, natural sound.",
      "A/B it against the bare room to hear the difference.",
    ],
    src: audioPath(DIR, "full"),
    image: imagePath(DIR, "full"),
    tab: "Fully treated",
    title: "Fully treated room",
    short: "treated",
    body: "Absorption, bass traps and diffusion together. The source sounds clear, balanced and natural, with a short, even decay. Compare it with the bare room: same source, same mic, same spot.",
  },
];


export const OVERFOAM = {
  id: "overfoam",
  points: [
    "Thin foam everywhere kills the mids and highs.",
    "The bass problems are all still there.",
    "The result sounds dull, and the booming remains.",
  ],
  src: audioPath(DIR, "overfoam"),
  image: imagePath(DIR, "overfoam"),
  tab: "All foam",
  title: "What if you just cover every wall in foam?",
  body: "Thin foam on every surface and nothing else. The mids and highs vanish, so it sounds dull and lifeless — but thin foam can’t touch the bass, so the booming notes from the bare room are all still there. A/B it against the fully treated room.",
};

export const ALL_STEPS = [...STEPS, OVERFOAM];

export const KEPT_SAME = "source, room, microphone, mic position, recording level, no effects.";
