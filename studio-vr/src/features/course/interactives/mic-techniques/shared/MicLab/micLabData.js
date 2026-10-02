export const TIERS = {
  best: "Best choice",
  good: "Good fit",
  ok: "Works",
  poor: "Not ideal",
};

export const SOURCES = [
  { id: "voice", label: "Voice" },
  { id: "guitar", label: "Guitar" },
  { id: "drums", label: "Drums" },
  { id: "solo", label: "Solo Instrument", short: "Solo" },
  { id: "ensemble", label: "Ensemble" },
];

export const PAIRS = [
  {
    id: "xy",
    label: "XY",
    blurb: "Two cardioids, capsules together, 90° apart. Level differences only — solid and fully mono-safe, but narrower.",
  },
  {
    id: "ortf",
    label: "ORTF",
    blurb: "Two cardioids 17 cm apart, angled 110°. Level + small time differences — wider than XY, still fairly mono-safe.",
  },
  {
    id: "ab",
    label: "AB (Spaced)",
    short: "AB",
    blurb: "Two omnis spaced apart. Time differences give the widest, airiest image — but check for phase problems in mono.",
  },
  {
    id: "ms",
    label: "Mid-Side",
    short: "MS",
    blurb: "A forward Mid mic plus a sideways figure-8. Turn the Side level up or down to set the width after recording — perfect in mono.",
  },
  {
    id: "blumlein",
    label: "Blumlein",
    blurb: "Two figure-8s crossed at 90°. Very natural image with lots of room from the rear lobes — needs a good-sounding space.",
  },
  {
    id: "overhead",
    label: "Overheads",
    for: ["drums"],
    blurb: "A spaced pair high above the front of the kit, angled down at the cymbals — the kit's stereo picture. Keep both mics the same distance from the snare.",
  },
  {
    id: "decca",
    label: "Decca Tree",
    short: "Decca",
    for: ["ensemble"],
    blurb: "Three omnis in a T: left and right wide apart, the centre mic a little forward. A big, stable main array for large groups.",
  },
  {
    id: "outrigger",
    label: "Outriggers",
    for: ["ensemble"],
    blurb: "A wide pair of omnis out at the edges of the group, added to the Decca Tree to widen the image and catch the outer players.",
  },
];

export const pairsFor = (source) => PAIRS.filter((p) => !p.for || p.for.includes(source));

export const LAYERS = {
  close: { label: "Close mics", blurb: "A mic on every instrument" },
  main: { label: "Main pair", blurb: "The whole group in stereo" },
  spots: { label: "Spot mics", blurb: "Detail on sections or soloists" },
  room: { label: "Room mics", blurb: "The hall's reverb and size" },
};

export const ENSEMBLES = [
  {
    id: "band",
    label: "Live Band",
    layers: ["close", "main", "room"],
    best: ["close", "room"],
    note: "Bands are loud and amplified, so close mics on each source give control; a room pair adds the live vibe.",
  },
  {
    id: "chamber",
    label: "Chamber Group",
    short: "Chamber",
    layers: ["main", "spots", "room"],
    best: ["main"],
    note: "Small acoustic groups balance themselves — one good main pair, raised in front, does most of the work.",
  },
  {
    id: "choir",
    label: "Choir",
    layers: ["main", "spots", "room"],
    best: ["main", "spots", "room"],
    note: "A high main pair for the blend, section spots to adjust the balance, and room mics for the hall.",
  },
];

export const SPOT_TARGETS = {
  band: [
    { id: "vocal", label: "Vocal" },
    { id: "drums", label: "Drums" },
    { id: "guitar", label: "Guitar" },
    { id: "bass", label: "Bass" },
    { id: "keys", label: "Keys" },
  ],
  chamber: [
    { id: "vln1", label: "Violin I" },
    { id: "vln2", label: "Violin II" },
    { id: "viola", label: "Viola" },
    { id: "cello", label: "Cello" },
  ],
  choir: [
    { id: "s", label: "Sopranos" },
    { id: "a", label: "Altos" },
    { id: "t", label: "Tenors" },
    { id: "b", label: "Basses" },
  ],
};
