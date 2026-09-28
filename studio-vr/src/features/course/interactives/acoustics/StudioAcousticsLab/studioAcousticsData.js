// Content for StudioAcousticsLab — copy is verbatim from
// design/studio-acoustics-rooms.html.
//
// One tab per room (`tab` = tab label). Each tab shows an image and the
// room's recording side by side, with the description underneath.
//
// AUDIO: public/audio/studio-acoustics/<room-id>.wav
// IMAGE: public/studio-acoustics/<room-id>.jpg
// (booth, liveroom, bedroom, bathroom, hall) — or point `src` / `image`
// anywhere else. Level-match the audio so no room wins just by being
// louder. Until a file exists its tab shows a placeholder.
import { audioPath, imagePath } from "../shared/paths";

const DIR = "studio-acoustics";

export const ROOMS = [
  {
    id: "booth",
    src: audioPath(DIR, "booth"),
    image: imagePath(DIR, "booth"),
    tab: "Vocal booth",
    title: "Vocal booth",
    short: "booth",
    body: "A small room covered in absorbing foam. Almost no echo reaches the mic, so you hear only the source: close, clear and dry. This is our reference sound.",
  },
  {
    id: "liveroom",
    src: audioPath(DIR, "liveroom"),
    image: imagePath(DIR, "liveroom"),
    tab: "Treated studio",
    title: "Treated studio room",
    short: "studio",
    body: "A bigger room with some absorption and some diffusion. You hear a little natural space around the sound, but it stays clear. Good for drums and acoustic instruments.",
  },
  {
    id: "bedroom",
    src: audioPath(DIR, "bedroom"),
    image: imagePath(DIR, "bedroom"),
    tab: "Bedroom",
    title: "Untreated bedroom",
    short: "bedroom",
    body: "Bare walls close to the mic bounce sound back almost instantly. The echo is short, but it colours the tone, making it sound “boxy”. Some bass notes also boom more than others.",
  },
  {
    id: "bathroom",
    src: audioPath(DIR, "bathroom"),
    image: imagePath(DIR, "bathroom"),
    tab: "Bathroom",
    title: "Tiled bathroom",
    short: "bathroom",
    body: "Tiles and glass reflect almost everything. The sound rings for over a second, turns bright and harsh, and words start to blur into each other.",
  },
  {
    id: "hall",
    src: audioPath(DIR, "hall"),
    image: imagePath(DIR, "hall"),
    tab: "Large hall",
    title: "Large hall",
    short: "hall",
    body: "A long, smooth echo makes the source sound far away, even though the mic was just as close. Lovely for orchestras and choirs, but muddy for speech.",
  },
];

export const KEPT_SAME = "source, microphone, mic distance, recording level, no effects.";
