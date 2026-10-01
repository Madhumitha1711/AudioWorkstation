// "Preamps / Channel Strips" (Outboard Gear) — content for PreampChannelStripLab.
//
// Four tabs, in teaching order:
//   1. Mic preamp       — what an outboard mic preamp does, its controls,
//                         clean vs coloured, rack and 500-series formats,
//                         and how it patches into an interface.
//   2. Channel strip    — preamp + EQ + dynamics in one box: stage order,
//                         tracking vs mixing use, committing to tape.
//   3. Classic preamps  — Neve 1073, API 512c, Universal Audio 2-610,
//                         Grace Design m101 (2 + 2 grid).
//   4. Channel strips   — Avalon VT-737sp, Universal Audio 6176, Rupert Neve
//                         Designs Shelford Channel, 500-series "build your
//                         own strip" (2 + 2 grid).
//
// Each tab: optional top image (`image` id → public/outboard-preamps/<id>.jpg;
// Mic preamp and Channel strip), lead, labelled facts, optional example
// FlipCards (photo on the front; { id, title, wide?, lead, facts }), key points.
// Spec figures are the manufacturers' published numbers.
//
// Photos aren't added yet — drop them in at public/outboard-preamps/<id>.jpg
// and they appear automatically; until then each shows a placeholder.

export const preampStripImagePath = (id) => `/outboard-preamps/${id}.jpg`;

export const PREAMP_STRIP_TABS = [
  {
    id: "preamp",
    tab: "Mic preamp",
    image: "mic-preamp",
    lead: "An outboard mic preamp is a box that does one job: it lifts a microphone's tiny signal up to line level, cleanly and with enough headroom, before anything else touches it. It is the first gain stage in the chain, so its quality and character are printed on everything that follows.",
    facts: [
      {
        label: "What it does",
        text: "A microphone puts out mic level, roughly −60 to −40 dBu. Recorders, interfaces and other outboard expect line level, about +4 dBu. The preamp adds the 30–70 dB of gain needed to bridge that gap, while adding as little noise as possible. It also presents the right load (impedance) to the mic and can send it 48 V phantom power.",
      },
      {
        label: "Controls",
        text: "Gain (often a stepped switch plus a fine trim), 48 V phantom power for condenser mics, a pad (−20 dB) for loud sources like kick drums and guitar amps, polarity (Ø) to flip the signal when two mics fight each other, a high-pass filter to remove rumble, and on many units an impedance switch and a front DI input for guitar or bass.",
      },
      {
        label: "Clean vs coloured",
        text: "The preamp built into an audio interface is usually clean and transparent. Outboard preamps are bought for one of two reasons: an even cleaner, more detailed path, or colour. Transformers and valves (tubes) add gentle harmonic saturation and a softer clip, especially when driven, which many engineers hear as warmth, weight and \"glue\".",
      },
      {
        label: "Formats",
        text: "Most outboard preamps come as 19\" rack units (1U or 2U high, one to eight channels) or as 500-series modules: narrow cards that slide into a powered frame called a lunchbox, so you can mix brands in one chassis.",
      },
      {
        label: "How it patches in",
        text: "Mic → outboard preamp → interface LINE input (not the mic input). Going into a line input bypasses the interface's own preamp, so you hear only the outboard one. In a larger room the preamp outputs land on the patchbay so they can be routed to any converter input.",
      },
    ],
    points: [
      "A **mic preamp** lifts **mic level (−60 to −40 dBu)** to **line level (+4 dBu)**: about **30–70 dB of gain**.",
      "Key controls: **gain**, **48 V phantom**, **pad**, **polarity (Ø)**, **high-pass filter**, often **impedance** and a **DI** input.",
      "Interface preamps are **clean**. Outboard preamps add **headroom** and often **colour** from **transformers and tubes**.",
      "Formats: **19\" rack units** or **500-series modules** in a **lunchbox**.",
      "Patch **mic → preamp → interface LINE input** so the interface's own preamp is bypassed.",
    ],
  },
  {
    id: "strip",
    tab: "Channel strip",
    image: "channel-strip",
    lead: "A channel strip is one console channel in a box: a mic preamp, EQ and dynamics (usually a compressor, sometimes a de-esser or gate) wired in series in a single rack unit. It gives one source the full \"console\" treatment without needing a console.",
    facts: [
      {
        label: "Stage order",
        text: "Preamp → high-pass filter → EQ → compressor / de-esser → output level. Many strips let you swap the EQ before or after the compressor: EQ first means the compressor reacts to the shaped sound, compressor first means the EQ shapes an already-levelled sound. Some can feed the EQ into the compressor's sidechain so it reacts more or less to certain frequencies.",
      },
      {
        label: "Where they came from",
        text: "Many famous strips are a single channel lifted out of a classic large-format console (Neve, SSL, API) and given its own power supply and case. Racking a console module lets a small studio own the sound of a big desk one channel at a time.",
      },
      {
        label: "Tracking with a strip",
        text: "The classic use is recording a vocal, bass or acoustic guitar: set the gain, roll off rumble, add a little EQ and catch the loudest peaks with a few dB of compression on the way in. The result is a finished-sounding take that sits in the mix straight away.",
      },
      {
        label: "Committing to the sound",
        text: "Whatever the strip does while tracking is recorded into the file: you can't undo it later the way you can bypass a plugin. Go gently (a few dB of EQ, 3–6 dB of gain reduction), and save heavier processing for the mix.",
      },
      {
        label: "Mixing with a strip",
        text: "Most strips have a line input that skips the preamp. Patched as a hardware insert (DAW send → strip line in → strip out → DAW return), the EQ and compressor can be used on a track during the mix, just like a plugin, but printed in real time.",
      },
    ],
    points: [
      "A **channel strip** = **preamp + EQ + dynamics** in one box: a **console channel in a rack**.",
      "Typical order: **preamp → HPF → EQ → compressor → output**; many let you **swap EQ and compressor**.",
      "Many strips are **console modules** (Neve, SSL, API) given their own case and power.",
      "Tracking through a strip **commits** the sound to the recording. **Go gently.**",
      "The **line input** lets you use the EQ and compressor as a **hardware insert** while mixing.",
    ],
  },
  {
    id: "preamps",
    tab: "Classic preamps",
    lead: "A few preamp designs turn up in almost every serious studio. Each has its own character, and engineers choose between them per source the way they choose microphones.",
    facts: [
      {
        label: "How to choose",
        text: "Transformer-coupled Class A designs (Neve-style) sound thick and smooth; discrete op-amp designs (API-style) sound punchy and forward; tube designs sound round and soft at the top; transformerless designs sound clean and open. Try the same mic through each and listen.",
      },
    ],
    subhead: "Examples",
    examples: [
      {
        id: "neve-1073",
        title: "Neve 1073",
        lead: "The most copied preamp ever made: a Class A console module from the early 1970s.",
        facts: [
          { label: "Design", text: "Discrete Class A transistor circuit, transformer-balanced input and output. Up to 80 dB of mic gain in 5 dB steps." },
          { label: "EQ", text: "High shelf at 12 kHz, a switchable mid band, a low shelf and a high-pass filter, all on stepped switches." },
          { label: "Sound", text: "Thick, warm low-mids and a smooth top. Loved on vocals, bass, kick and guitar amps." },
        ],
      },
      {
        id: "api-512c",
        title: "API 512c",
        lead: "A 500-series preamp with the punchy, forward API console sound.",
        facts: [
          { label: "Design", text: "API 2520 discrete op-amp with an API 2503 output transformer. Up to 65 dB of gain." },
          { label: "Controls", text: "Gain, −20 dB pad, 48 V phantom, polarity, mic/line switch, front instrument DI, LED level meter." },
          { label: "Sound", text: "Fast, punchy and present. A favourite on drums, snare and electric guitar." },
        ],
      },
      {
        id: "ua-2-610",
        title: "Universal Audio 2-610",
        lead: "Two channels of valve (tube) preamp based on Bill Putnam's 610 console modules from the 1960s.",
        facts: [
          { label: "Design", text: "All-tube signal path with input and output transformers. Stepped gain plus an output level knob, so the tubes can be driven harder for more colour." },
          { label: "Controls", text: "500 Ω / 2 kΩ input impedance switch, pad, polarity, 48 V phantom, front DI and simple high and low shelving EQ." },
          { label: "Sound", text: "Round, warm and slightly soft on top. Classic on vocals and bass." },
        ],
      },
      {
        id: "grace-m101",
        title: "Grace Design m101",
        lead: "A single-channel transformerless preamp built to be as clean and detailed as possible.",
        facts: [
          { label: "Design", text: "Transformerless, very low noise and distortion, wide bandwidth." },
          { label: "Controls", text: "Gain, 48 V phantom, a ribbon mode for ribbon mics, high-pass filter and a front Hi-Z instrument input." },
          { label: "Sound", text: "Clear and uncoloured: it shows exactly what the mic hears. Used for acoustic instruments, classical and spoken word." },
        ],
      },
    ],
    points: [
      "**Neve 1073**: transformer Class A, **thick and warm**.",
      "**API 512c**: discrete op-amp, 500-series, **punchy and forward**.",
      "**UA 2-610**: **tube**, round and warm; drive it harder for more colour.",
      "**Grace m101**: **transformerless**, clean and detailed.",
      "Choose a preamp **per source**, the same way you choose a microphone.",
    ],
  },
  {
    id: "strips",
    tab: "Channel strips",
    lead: "Channel strips package a preamp with the EQ and compression it is usually paired with, so one box can take a vocal from the microphone to a finished-sounding track.",
    facts: [
      {
        label: "What to look for",
        text: "A preamp you like on its own, an EQ that can be placed before or after the compressor, a line input for mixing, metering for both level and gain reduction, and the option to use each section separately.",
      },
    ],
    subhead: "Examples",
    examples: [
      {
        id: "avalon-vt737sp",
        title: "Avalon VT-737sp",
        lead: "A Class A tube channel strip that became a standard vocal chain in project and pro studios.",
        facts: [
          { label: "Preamp", text: "Tube preamp with mic, instrument (front DI) and line inputs." },
          { label: "EQ", text: "Four bands: bass and treble shelves plus two sweepable mids. Can be placed before the compressor or used in its sidechain." },
          { label: "Dynamics", text: "Opto compressor with smooth, program-dependent attack and release." },
        ],
      },
      {
        id: "ua-6176",
        title: "Universal Audio 6176",
        lead: "A 610 tube preamp and an 1176LN compressor in one box.",
        facts: [
          { label: "Preamp", text: "610-style tube preamp with gain and level controls, simple shelving EQ and a front DI." },
          { label: "Dynamics", text: "1176LN-style FET compressor: very fast attack, ratio buttons from 4:1 to 20:1." },
          { label: "Flexibility", text: "The two halves can be linked or split and used as separate units." },
        ],
      },
      {
        id: "rnd-shelford",
        title: "Rupert Neve Designs Shelford Channel",
        lead: "A modern transformer channel strip from Rupert Neve's own company.",
        facts: [
          { label: "Preamp", text: "Transformer-coupled mic preamp with Silk, which adds adjustable harmonic texture." },
          { label: "EQ", text: "Inductor-based three-band EQ with high-pass filter, in the style of the classic Neve console EQs." },
          { label: "Dynamics", text: "Diode-bridge compressor with blend control for parallel compression." },
        ],
      },
      {
        id: "lunchbox-strip",
        title: "Build your own strip: 500-series",
        lead: "A 500-series lunchbox lets you assemble a channel strip from modules by different makers, slot by slot.",
        facts: [
          { label: "How it works", text: "The lunchbox frame supplies power and the input/output connectors. Each slot takes one module. Chain the slots on the patchbay or rear panel (some frames link neighbouring slots) to make a strip." },
          { label: "Example chain", text: "API 512c preamp → API 550A EQ → API 527 compressor: an API console channel, one module at a time." },
          { label: "Why studios like it", text: "Small, mix-and-match and easy to expand: swap a Neve-style preamp in for vocals, an API one for drums, without buying a whole new rack unit." },
        ],
      },
    ],
    points: [
      "**Avalon VT-737sp**: tube preamp + **opto compressor** + 4-band EQ.",
      "**UA 6176**: **610 tube preamp** + **1176LN** compressor; use together or split.",
      "**Shelford Channel**: transformer preamp + **inductor EQ** + **diode-bridge** compressor.",
      "A **500-series lunchbox** lets you **build your own strip** from modules by different makers.",
    ],
  },
];
