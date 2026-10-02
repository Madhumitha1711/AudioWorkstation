// Primer for Ch.8: only the basic ideas the Connectors and Cables labs build on.
// Per-connector and per-cable detail lives in ConnectorsLab / CablesLab;
// conversion, network audio and sync detail belong to later chapters.
export const connectionImagePath = (id) => `/analog-digital-connections/${id}.jpg`;

export const CONNECTION_TABS = [
  {
    id: "analog-digital",
    tab: "Analog vs digital",
    image: "analog-vs-digital",
    lead: "Every connection in the studio is either analog or digital. Knowing which one you are dealing with tells you what the cable carries and what can go wrong with it.",
    facts: [
      {
        label: "Analog",
        text: "Carries the sound itself as a changing voltage, a copy of the sound wave. Any noise the cable picks up becomes part of the sound.",
      },
      {
        label: "Digital",
        text: "Carries the sound as a stream of numbers (ones and zeros) plus timing information. It either arrives perfectly or fails with clicks and dropouts; it doesn't slowly get noisier.",
      },
      {
        label: "Where they meet",
        text: "Microphones and speakers are analog; the computer is digital. The audio interface sits between them and converts one into the other.",
      },
    ],
    points: [
      "**Analog** carries a **voltage**, a copy of the sound wave.",
      "**Digital** carries **numbers** and timing: it **works or glitches**.",
      "The **audio interface** converts between the two.",
    ],
  },
  {
    id: "levels",
    tab: "Signal levels",
    image: "signal-levels",
    lead: "Analog signals travel at very different strengths, called levels. Each level has its own inputs, and many connectors and cables are made for one level only.",
    facts: [
      { label: "Mic level", text: "The weakest signal. It always goes into a mic preamp first to be boosted." },
      { label: "Instrument level", text: "From guitar and bass pickups. It needs an instrument (Hi-Z) input or a DI box." },
      {
        label: "Line level",
        text: "The working level between interfaces, consoles, outboard gear and powered monitors. Pro gear uses +4 dBu; consumer gear uses the quieter −10 dBV.",
      },
      {
        label: "Speaker level",
        text: "The powerful output of an amplifier to a passive speaker. It only travels on speaker cable and must never go into a mic or line input.",
      },
    ],
    points: [
      "Four levels: **mic, instrument, line and speaker**.",
      "Line level: **+4 dBu** for pro gear, **−10 dBV** for consumer gear.",
      "**Speaker level** stays on **speaker cable**.",
    ],
  },
  {
    id: "balanced",
    tab: "Balanced & unbalanced",
    image: "balanced-unbalanced",
    lead: "Analog cables pick up hum and noise along the way. A balanced connection cancels that noise; an unbalanced one doesn't.",
    facts: [
      {
        label: "Unbalanced",
        text: "One signal wire plus a shield. Noise adds straight to the signal, so keep these runs short.",
      },
      {
        label: "Balanced",
        text: "Two signal wires (hot and cold) plus a shield. The input cancels noise picked up on the way, so balanced cables can run a long way.",
      },
      {
        label: "Both ends count",
        text: "A connection is only balanced if both the output and the input are balanced. Some plugs look almost identical, so check what the socket supports.",
      },
    ],
    points: [
      "**Unbalanced** = signal + shield: keep it **short**.",
      "**Balanced** = **hot + cold + shield**: noise **cancels**, runs can be **long**.",
      "**Both ends** must be balanced.",
    ],
  },
  {
    id: "digital",
    tab: "Digital connections",
    image: "digital-connections",
    lead: "Digital connections differ in how many channels they carry, and they all need the right cable and one shared clock.",
    facts: [
      {
        label: "Channels",
        text: "Some digital links carry 2 channels (stereo) and some carry 8 or more on a single cable.",
      },
      {
        label: "The right cable",
        text: "Digital signals need a cable built to a specific impedance. A cable that merely fits the plug can cause clicks and dropouts.",
      },
      {
        label: "One clock",
        text: "Connected digital devices must sample in step. One device is the clock master and the others follow it.",
      },
      {
        label: "Data, not sound",
        text: "Some connections carry no audio at all: MIDI carries notes and control messages, and USB links gear to the computer.",
      },
    ],
    points: [
      "Digital links carry **2 or more channels** on one cable.",
      "Use the **correct digital cable**, not just one that fits.",
      "One device is the **clock master**.",
      "**MIDI** and **USB** carry **data and control**, not just sound.",
    ],
  },
];
