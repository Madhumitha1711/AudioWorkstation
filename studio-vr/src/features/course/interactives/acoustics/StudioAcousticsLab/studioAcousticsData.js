// Content for StudioAcousticsLab — copy is verbatim from
// design/studio-acoustics-rooms.html.
//
// AUDIO: each room plays the recording at `src`. Put the files at
//   public/audio/studio-acoustics/<room-id>.wav
// (booth, liveroom, bedroom, bathroom, hall) — or point `src` anywhere
// else. Level-match the files so no room wins just by being louder. Until a
// file exists, its card shows an "Audio coming soon" placeholder.
import { audioPath } from "../shared/useRoomAudio";

const DIR = "studio-acoustics";

export const ROOMS = [
  {
    id: "booth",
    src: audioPath(DIR, "booth"),
    tag: "01 · Dead",
    title: "Vocal booth",
    short: "booth",
    body: "A small room covered in absorbing foam. Almost no echo reaches the mic, so you hear only the source: close, clear and dry. This is our reference sound.",
  },
  {
    id: "liveroom",
    src: audioPath(DIR, "liveroom"),
    tag: "02 · Balanced",
    title: "Treated studio room",
    short: "studio",
    body: "A bigger room with some absorption and some diffusion. You hear a little natural space around the sound, but it stays clear. Good for drums and acoustic instruments.",
  },
  {
    id: "bedroom",
    src: audioPath(DIR, "bedroom"),
    tag: "03 · Boxy",
    title: "Untreated bedroom",
    short: "bedroom",
    body: "Bare walls close to the mic bounce sound back almost instantly. The echo is short, but it colours the tone, making it sound “boxy”. Some bass notes also boom more than others.",
  },
  {
    id: "bathroom",
    src: audioPath(DIR, "bathroom"),
    tag: "04 · Harsh",
    title: "Tiled bathroom",
    short: "bathroom",
    body: "Tiles and glass reflect almost everything. The sound rings for over a second, turns bright and harsh, and words start to blur into each other.",
  },
  {
    id: "hall",
    src: audioPath(DIR, "hall"),
    tag: "05 · Spacious",
    title: "Large hall",
    short: "hall",
    body: "A long, smooth echo makes the source sound far away, even though the mic was just as close. Lovely for orchestras and choirs, but muddy for speech.",
  },
];

export const KEPT_SAME = "source, microphone, mic distance, recording level, no effects.";

export const WHY = [
  ["The mic records the room too.", "It can't separate the source from the echoes, so both end up in the recording."],
  [
    "You can add echo later, but you can't remove it.",
    "A dry recording can be given any reverb in the mix. A recording made in a bathroom stays a bathroom recording.",
  ],
  ["Echo affects clarity.", "Too much of it blurs words and notes together and pushes the sound further back."],
  ["Takes need to match.", "Recording in a controlled room means a retake tomorrow will sound the same as today's."],
];

export const TAKEAWAY = "before reaching for EQ or plugins, get the room right. The room shapes the sound before anything else does.";
