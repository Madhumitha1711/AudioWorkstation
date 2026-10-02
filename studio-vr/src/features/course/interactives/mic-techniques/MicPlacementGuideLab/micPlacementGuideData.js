import { ENSEMBLES, SOURCES, SPOT_TARGETS, pairsFor } from "../shared/MicLab/micLabData";

export { ENSEMBLES, SPOT_TARGETS, pairsFor };

const clipPath = (id) => `/audio/mic-placement/${id}.wav`;

export const TABS = [
  {
    id: "close",
    tab: "Close",
    title: "Close Miking",
    hint: "Pick a source, then click a spot on the floor (or a button) to move the mic.",
    body: [
      "**Close miking** puts the mic within about **5–30 cm** of the source. The direct sound is much louder than the room, so you get a **dry, detailed, intimate** sound and very little **bleed** from other instruments.",
      "Closer means more bass from the **proximity effect** and louder breaths, plosives and finger noise. Angling the mic **off-axis** softens the top end and the pops without moving it further away.",
    ],
    points: [
      "5–30 cm: dry, detailed, little room or bleed.",
      "Closer = more bass (proximity effect) and more noise.",
      "Off-axis softens harshness and plosives.",
    ],
  },
  {
    id: "spot",
    tab: "Spot",
    title: "Spot Miking",
    hint: "Pick an ensemble, then click a player on the floor (or a button) to put the spot mic on them.",
    body: [
      "**Spot miking** adds a mic close to **one instrument or section within a group** that is already captured by a **main pair**. It lifts a soloist or a quiet section without changing the whole balance.",
      "Blend the spot **low**, under the main pair, and pan it to where that player sits. The spot is closer than the main pair, so its sound arrives earlier — **delay it about 3 ms per metre** of extra distance so the two line up.",
    ],
    points: [
      "A spot mic highlights one player within the group.",
      "Blend it low under the main pair; pan to match.",
      "Delay spots ~3 ms per metre to line up with the main pair.",
    ],
  },
  {
    id: "distant",
    tab: "Distant / Room",
    title: "Distant / Room Miking",
    hint: "Pick a source, then click a spot on the floor (or a button) to move the mic back into the room.",
    body: [
      "**Distant miking** places the mic far enough away that it hears the **room** as well as the source — **space, depth and a natural blend**.",
      "Around **1–2 m** the direct sound and the room's reflections are about equal (the **critical distance**). Further back, and especially in a **room corner**, the mic hears mostly reverb — great blended under close mics, washy on its own. It only works in a **good-sounding room**.",
    ],
    points: [
      "Distant miking captures the source plus the space.",
      "Further back = more room, less detail.",
      "Corner mics are mostly reverb — blend them under close mics.",
    ],
  },
  {
    id: "stereo",
    tab: "Stereo",
    title: "Stereo Miking",
    hint: "Pick a source, then try each stereo technique — see how the mics are spaced and angled, and where each one listens.",
    body: [
      "**Coincident** pairs (**XY, Blumlein, MS**) put the capsules together, so the image comes from level differences only and stays solid in mono. **ORTF** spaces them 17 cm apart for more width. **AB** spaces omnis wide apart for the airiest image — check it in mono.",
      "**Overheads** are a pair above the drum kit for its stereo picture. Large groups use a **Decca Tree** — three omnis in a T — often widened with a pair of **outriggers** at the edges.",
    ],
    points: [
      "Coincident (XY, Blumlein, MS) = mono-safe.",
      "ORTF and AB add width through spacing.",
      "Overheads for drums; Decca Tree + outriggers for big groups.",
    ],
  },
  {
    id: "multi",
    tab: "Multi",
    title: "Multi Miking",
    hint: "Pick a source, then switch each mic on and off to hear what it adds.",
    body: [
      "**Multi miking** puts two or more mics on **one source**, each catching a different part of its sound, then blends them: the **top and bottom** of a snare, **inside and outside** a kick drum, a guitar amp **on-axis, off-axis and in the room**.",
      "The mics are at different distances and often face different ways, so **phase** matters: flip the polarity of a mic facing the other way (snare bottom) and time-align distant mics (kick out, amp room) so the sound adds up instead of thinning out.",
    ],
    points: [
      "Several mics on one source, each a different colour of its sound.",
      "Snare top/bottom · kick in/out · amp on/off-axis + room.",
      "Check phase: flip opposite-facing mics, align distant ones.",
    ],
  },
];

export const CLOSE_SOURCES = [
  { id: "voice", label: "Vocal / VO" },
  { id: "guitar", label: "Guitar" },
  { id: "solo", label: "Ethnic Instrument", short: "Ethnic" },
];
export const CLOSE_SPOTS = [
  { id: "c5", label: "5 cm", m: 0.05, note: "Very close: maximum detail and bass (proximity effect), but breaths, pops and finger noise are loud." },
  { id: "c15", label: "15 cm", m: 0.15, note: "Close and on-axis: full and present — the usual starting point for vocals and voiceover." },
  { id: "c30", label: "30 cm", m: 0.3, note: "A hand-span back: still close, but more natural, with the whole instrument in the picture." },
  { id: "off", label: "45° off", m: 0.15, off: 45, note: "Same distance, angled 45° off the axis: softer top end and fewer plosives." },
];
export const CLOSE_BEST = { voice: "c15", guitar: "c30", solo: "c30" };

export const DISTANT_SOURCES = SOURCES;
export const DISTANT_SPOTS = [
  { id: "d1", label: "1 m", m: 1, note: "1 m: some room, still fairly direct — near the critical distance in a small room." },
  { id: "d2", label: "2 m", m: 2, note: "2 m: a balanced blend of the source and the room." },
  { id: "d3", label: "3 m", m: 3, note: "3 m: mostly room — big and spacious, less detail." },
  { id: "corner", label: "Room corner", short: "Corner", corner: true, note: "High in a room corner, facing away: almost all reverb — blend it under the close mics." },
];

export const STEREO_SOURCES = SOURCES;

export const MULTI = [
  {
    id: "snare",
    label: "Snare",
    note: "Top: the stick crack and attack. Bottom: the buzz of the wires — flip its polarity, it faces the other way.",
    mics: [
      { id: "top", label: "Top", blurb: "Above the rim, angled at the head", tone: "a" },
      { id: "bottom", label: "Bottom", blurb: "Under the drum, on the wires", tone: "b" },
    ],
  },
  {
    id: "kick",
    label: "Kick",
    note: "In: the beater's click and punch. Out: the low-end boom — it arrives later, so time-align it with the inside mic.",
    mics: [
      { id: "in", label: "In", blurb: "Inside the shell, near the beater", tone: "a" },
      { id: "out", label: "Out", blurb: "Outside the front head", tone: "b" },
    ],
  },
  {
    id: "amp",
    label: "Guitar Amp",
    short: "Amp",
    note: "On-axis: bright and direct. Off-axis: darker and smoother. Room: the amp in the space. Blend to taste and check phase.",
    mics: [
      { id: "on", label: "Close · on-axis", blurb: "A few cm off the grille, aimed at the cone's centre", tone: "a" },
      { id: "off", label: "Close · off-axis", blurb: "To the side, angled across the cone", tone: "b" },
      { id: "room", label: "Room", blurb: "A couple of metres back", tone: "room" },
    ],
  },
];

const subsets = (arr) => arr.reduce((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]).filter((s) => s.length);
export const multiClipId = (target, mics) => `multi-${target}-${[...mics].sort().join("-") || "none"}`;
export const CLIPS = [
  ...CLOSE_SOURCES.flatMap((s) => CLOSE_SPOTS.map((p) => `close-${s.id}-${p.id}`)),
  ...ENSEMBLES.flatMap((e) => SPOT_TARGETS[e.id].map((t) => `spot-${e.id}-${t.id}`)),
  ...DISTANT_SOURCES.flatMap((s) => DISTANT_SPOTS.map((p) => `distant-${s.id}-${p.id}`)),
  ...STEREO_SOURCES.flatMap((s) => pairsFor(s.id).map((p) => `stereo-${s.id}-${p.id}`)),
  ...MULTI.flatMap((m) => subsets(m.mics.map((x) => x.id)).map((on) => multiClipId(m.id, on))),
].map((id) => ({ id, src: clipPath(id) }));
