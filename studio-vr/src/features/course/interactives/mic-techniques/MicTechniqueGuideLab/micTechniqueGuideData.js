import { ENSEMBLES, PAIRS, SOURCES } from "../shared/MicLab/micLabData";

export { SOURCES, ENSEMBLES };

const clipPath = (id) => `/audio/mic-techniques/${id}.wav`;

export const TABS = [
  {
    id: "mono",
    tab: "Mono",
    title: "Mono Recording",
    hint: "Pick a source to see the usual single-mic position for it.",
    body: [
      "**One mic, one channel.** A mono recording has no left–right image of its own — you place it in the stereo field later with the **pan** control. It is focused, punchy and always **mono-compatible**.",
      "The biggest decision is **distance**: close gives detail and little room, further back lets in more of the room. Try every distance and angle in the **Microphone Placement** lab.",
    ],
    points: [
      "One mic → one channel; place it in the mix with pan.",
      "Best for vocals, voiceover, guitar and solo instruments in a mix.",
      "Distance sets the tone: close = dry and bassy, far = roomy.",
    ],
  },
  {
    id: "stereo",
    tab: "Stereo",
    title: "Stereo Recording",
    hint: "Pick a source to see the stereo pair usually used on it.",
    body: [
      "**Two matched mics, two channels.** Differences in **level** and **arrival time** between the mics recreate where each sound sits from left to right.",
      "**Coincident** pairs (XY, Blumlein, Mid-Side) use level differences only, so they stay solid in mono. **ORTF** adds a little spacing for width. **Spaced pairs (AB)** are the widest and airiest but can cause **phase problems** in mono — always check.",
      "Stereo only helps when the source itself is **wide** — a piano, a drum kit, an ensemble. A single voice is a point source and gains little.",
    ],
    points: [
      "A matched pair captures width and position.",
      "Best for wide sources: drums, piano, ensembles.",
      "Coincident = mono-safe; spaced = widest — check in mono.",
    ],
  },
  {
    id: "ensemble",
    tab: "Ensemble",
    title: "Ensemble Recording",
    hint: "Pick an ensemble to see its typical mic setup.",
    body: [
      "**Many players, several layers of mics.** A **main** stereo array captures the group as a whole, **spot** mics add detail to sections or soloists, **room** mics add the hall, and for bands, **close** mics give control over every instrument.",
      "Each layer you add brings detail or space — and more **bleed and phase** risk. Spot mics are closer than the main pair, so they are usually **delayed** to line up with it.",
    ],
    points: [
      "Main pair for the whole picture, spots for detail, room for space.",
      "Bands lean on close mics; acoustic groups on a main pair.",
      "More mics = more bleed and phase to manage.",
    ],
  },
];

export const MONO_FIXED = {
  voice: { m: 0.2, label: "20 cm" },
  guitar: { m: 0.25, label: "25 cm" },
  drums: { m: 1, label: "1 m" },
  solo: { m: 0.6, label: "60 cm" },
  ensemble: { m: 3, label: "3 m" },
};

export const STEREO_FIXED = {
  voice: "xy",
  guitar: "xy",
  drums: "overhead",
  solo: "ortf",
  ensemble: "ab",
};
export const pairById = (id) => PAIRS.find((p) => p.id === id);

export const CLIPS = [
  ...SOURCES.map((s) => `mono-${s.id}`),
  ...SOURCES.map((s) => `stereo-${s.id}`),
  ...ENSEMBLES.map((e) => `ensemble-${e.id}`),
].map((id) => ({ id, src: clipPath(id) }));
