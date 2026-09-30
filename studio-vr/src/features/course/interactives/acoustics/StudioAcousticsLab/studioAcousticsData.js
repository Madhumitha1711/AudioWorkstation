import { audioPath, imagePath } from "../shared/paths";

const DIR = "studio-acoustics";

export const ROOMS = [
  {
    id: "booth",
    points: [
      "Almost no echo reaches the mic.",
      "You hear only the source: close, clear and dry.",
      "This is the reference sound for the other rooms.",
    ],
    src: audioPath(DIR, "booth"),
    image: imagePath(DIR, "booth"),
    tab: "Vocal booth",
    title: "Vocal booth",
    short: "booth",
    body: "A small room covered in absorbing foam. Almost no echo reaches the mic, so you hear only the source: close, clear and dry. This is our reference sound.",
  },
  {
    id: "liveroom",
    points: [
      "A mix of absorption and diffusion.",
      "Adds a little natural space and stays clear.",
      "Good for drums and acoustic instruments.",
    ],
    src: audioPath(DIR, "liveroom"),
    image: imagePath(DIR, "liveroom"),
    tab: "Treated studio",
    title: "Treated studio room",
    short: "studio",
    body: "A bigger room with some absorption and some diffusion. You hear a little natural space around the sound, but it stays clear. Good for drums and acoustic instruments.",
  },
  {
    id: "bedroom",
    points: [
      "Bare walls close to the mic bounce sound straight back.",
      "The tone gets “boxy”, and some bass notes boom.",
      "Treatment is what fixes this.",
    ],
    src: audioPath(DIR, "bedroom"),
    image: imagePath(DIR, "bedroom"),
    tab: "Bedroom",
    title: "Untreated bedroom",
    short: "bedroom",
    body: "Bare walls close to the mic bounce sound back almost instantly. The echo is short, but it colours the tone, making it sound “boxy”. Some bass notes also boom more than others.",
  },
  {
    id: "bathroom",
    points: [
      "Hard tiles and glass reflect almost everything.",
      "The sound rings for over a second and turns harsh.",
      "Words blur together.",
    ],
    src: audioPath(DIR, "bathroom"),
    image: imagePath(DIR, "bathroom"),
    tab: "Bathroom",
    title: "Tiled bathroom",
    short: "bathroom",
    body: "Tiles and glass reflect almost everything. The sound rings for over a second, turns bright and harsh, and words start to blur into each other.",
  },
  {
    id: "hall",
    points: [
      "A long, smooth echo.",
      "Sounds far away even with a close mic.",
      "Lovely for orchestras, muddy for speech.",
    ],
    src: audioPath(DIR, "hall"),
    image: imagePath(DIR, "hall"),
    tab: "Large hall",
    title: "Large hall",
    short: "hall",
    body: "A long, smooth echo makes the source sound far away, even though the mic was just as close. Lovely for orchestras and choirs, but muddy for speech.",
  },
];

export const KEPT_SAME = "source, microphone, mic distance, recording level, no effects.";
