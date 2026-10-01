// "Active Speaker" — content for ActiveSpeakerLab.
//
// Single screen, no tabs: intro + how an active speaker works (including
// why soffit-mounted mains keep their amps in a separate rack), then each
// example as an image + description card, then key points. Spec figures
// are the manufacturers' published numbers (Genelec 8340A / 1234A,
// Neumann KH 120 II, Yamaha HS8, Kali Audio LP-6 V2).
//
// `wide: true` makes a card span the full row — used for the soffit-mounted
// main monitor, which is a different class of system from the nearfields.
//
// Photos aren't added yet — drop them in at public/active-speaker/<id>.jpg
// and they appear automatically; until then each card shows a placeholder.

export const activeSpeakerImagePath = (id) => `/active-speaker/${id}.jpg`;

export const ACTIVE_SPEAKER = {
  lead: "An active (powered) speaker has its amplifiers built in. Plug a line-level signal from your interface or console straight in: no separate power amp, no speaker cable, no matching to work out. The manufacturer has already matched every amp to its driver.",

  basics: [
    {
      label: "What's inside",
      text: "The line-level input goes to a crossover first, which splits the signal into low and high bands. Each band then gets its own amplifier driving its own driver: two amps in a two-way speaker (bi-amped), three in a three-way (tri-amped). Modern designs do the crossover in DSP and add limiters that protect the drivers from overload.",
    },
    {
      label: "Signal chain",
      text: "Interface / console line out → balanced line cable (XLR or TRS) → active speaker. Each speaker also needs its own mains power cable. Some models take a digital input (AES/EBU or S/PDIF) and convert inside the cabinet.",
    },
    {
      label: "Room controls",
      text: "Because the amps and crossover are in the box, the speaker can correct for where it sits. Simple models offer switches (bass cut for a wall or desk, treble trim). DSP models such as Genelec (GLM) and Neumann (MA 1) measure the room with a microphone and set the correction automatically.",
    },
    {
      label: "Soffit-mounted mains",
      text: "Large main monitors built into the front wall (soffit or flush mounted) are mostly active systems too, but their amplifiers are taken out of the cabinet and placed in a separate rack. Sealed inside a wall cavity, a kilowatt or more of amplification has nowhere to dump its heat; in a ventilated rack it stays cool and can be serviced without pulling the speaker out of the wall. The amp rack connects to the drivers with heavy speaker cable.",
    },
  ],

  examples: [
    {
      id: "genelec-8340a",
      title: "Genelec 8340A",
      lead: "A compact DSP nearfield that calibrates itself to the room.",
      facts: [
        {
          label: "Speaker",
          text: "Two-way, 6.5\" woofer, 0.75\" metal-dome tweeter in a Directivity Control Waveguide. 38 Hz–22 kHz (−6 dB), 118 dB SPL max.",
        },
        {
          label: "Built-in amps",
          text: "150 W + 150 W Class D, one per driver, with the crossover and protection in DSP.",
        },
        {
          label: "Room tools",
          text: "Genelec Loudspeaker Manager (GLM) software and a measurement mic set level, delay and EQ for each speaker automatically.",
        },
      ],
    },
    {
      id: "neumann-kh120-ii",
      title: "Neumann KH 120 II",
      lead: "A small reference monitor with a DSP crossover and automatic alignment.",
      facts: [
        {
          label: "Speaker",
          text: "Two-way, 5.25\" woofer, 1\" tweeter. 41 Hz–21.4 kHz (±6 dB), 116.8 dB SPL max.",
        },
        {
          label: "Built-in amps",
          text: "145 W woofer + 100 W tweeter, Class D. Analog XLR input plus S/PDIF digital in and out.",
        },
        {
          label: "Room tools",
          text: "Neumann MA 1 measures the listening position and aligns each monitor to the room.",
        },
      ],
    },
    {
      id: "yamaha-hs8",
      title: "Yamaha HS8",
      lead: "A popular, no-frills active nearfield with simple analog room switches.",
      facts: [
        {
          label: "Speaker",
          text: "Two-way bass reflex, 8\" woofer, 1\" dome tweeter. 38 Hz–30 kHz.",
        },
        {
          label: "Built-in amps",
          text: "75 W LF + 45 W HF bi-amp system (120 W total). XLR and TRS inputs.",
        },
        {
          label: "Room tools",
          text: "Analog switches only: ROOM CONTROL cuts bass when the speaker sits near a wall, HIGH TRIM adjusts the treble.",
        },
      ],
    },
    {
      id: "kali-lp6-v2",
      title: "Kali Audio LP-6 V2",
      lead: "An affordable nearfield built around placement presets.",
      facts: [
        {
          label: "Speaker",
          text: "Two-way, 6.5\" woofer, 1\" soft-dome tweeter in a 3-D imaging waveguide. 45 Hz–21 kHz (±3 dB).",
        },
        {
          label: "Built-in amps",
          text: "40 W woofer + 40 W tweeter, one amp per driver.",
        },
        {
          label: "Room tools",
          text: "Boundary EQ switches with six placement presets (free space, near a wall, on a desk, on a console meter bridge and more) plus ±2 dB LF and HF trims.",
        },
      ],
    },
    {
      id: "genelec-1234a-soffit",
      title: "Genelec 1234A: soffit-mounted main, amps in the rack",
      wide: true,
      lead: "A three-way main monitor built into the front wall, with its amplifiers in a separate 3U rack unit.",
      facts: [
        {
          label: "Speaker",
          text: "Three-way, 2 × 12\" woofers, 5\" midrange, 1\" tweeter. 29 Hz–21 kHz (−6 dB), 125 dB SPL max.",
        },
        {
          label: "Rack amplifier",
          text: "Tri-amped, all Class D: 2 × 750 W bass, 400 W midrange, 250 W treble, in a 3U rack unit. 4-pole Speakon cables (10 m supplied) carry speaker-level signal to the cabinet; RJ45 cables carry GLM control.",
        },
        {
          label: "Why the amps live in the rack",
          text: "The cabinet is sealed into the wall with no airflow around it. Over 2 kW of amplification sits in a ventilated rack instead, where heat can escape and a technician can reach it without removing the speaker.",
        },
      ],
    },
  ],

  points: [
    "An **active speaker** has its **amplifiers built in**. Feed it a balanced **line-level** signal and mains power.",
    "Inside: **crossover → one amp per driver** (bi-amped or tri-amped), usually with DSP and driver protection.",
    "No amp to match: the manufacturer has already **matched each amp to its driver**.",
    "**Room controls** range from simple switches (Yamaha HS8, Kali LP-6 V2) to automatic calibration (Genelec GLM, Neumann MA 1).",
    "**Soffit-mounted mains** are usually active too, but their **amps sit in a separate rack** for heat management and service access.",
  ],
};
