// Content for "mixer-types-lab" ("How Do You Categorise Mixers?", Ch.10).
// Shape consumed by ../../shared/GroupedBriefing (the ConnectorsLab /
// CablesLab layout): family label (row 1) → category tabs (row 1) →
// mixer-type tabs (row 2) → image + description + key points.
//
//   Architecture   → Analog / Digital / Hybrid
//   Application    → Live / Studio / Broadcast / Project studio
//   Circuit design → Split / Inline
//
// All three categories sit under one family label ("Mixer types"), so the
// label spans the whole tab row. `points` are the short takeaways shown in
// the global KeyPoints list.
//
// Photos aren't added yet — drop them in at public/mixer-types/<id>.jpg and
// they appear automatically; until then the frame shows the item's icon
// and the expected path.

export const mixerTypesImagePath = (id) => `/mixer-types/${id}.jpg`;

const FAMILY = "Mixer types";

export const SECTIONS = [
  {
    n: "01",
    family: FAMILY,
    type: "Architecture",
    short: "Architecture",
    tone: "amber",
    items: [
      {
        id: "analog",
        name: "Analog",
        lead: "The audio stays a continuous voltage from input to output, and every knob is a real circuit acting on it.",
        body: [
          "**How it works:** preamp, EQ, sends, pan and fader are electronic circuits in the signal path. What you see on the surface is the whole desk: **one knob, one job**.",
          "**Strengths:** immediate and hands-on, **zero latency**, and the sound of its preamps, EQ and summing is part of the appeal.",
          "**Trade-offs:** **no built-in recall**, so settings must be written down or photographed. Effects and dynamics often need outboard gear, and more channels means a physically bigger desk.",
          "**Examples:** SSL 4000 G, Neve 88RS, API 1608-II; compact desks such as the Mackie 1604VLZ4, Allen & Heath ZED and Soundcraft Signature.",
        ],
        points: [
          "The audio stays a **voltage** the whole way through.",
          "**One knob per job**, zero latency.",
          "**No recall**: settings must be noted by hand.",
        ],
      },
      {
        id: "digital",
        name: "Digital",
        lead: "The signal is converted to numbers right after the preamp, and DSP does the EQ, dynamics, effects and routing.",
        body: [
          "**How it works:** A/D conversion at the input, processing inside **DSP**, D/A at the outputs. The surface controls the DSP, so a few physical faders can be paged through many channels in **layers**.",
          "**Strengths:** **scenes and total recall**, EQ, compression and effects on every channel, compact for its channel count, remote control from a tablet, and networked **stage boxes** (Dante, MADI) instead of heavy multicore cables.",
          "**Trade-offs:** menus and layers to learn, a small conversion **latency** (a few milliseconds at most), and the sound depends on the converters and DSP.",
          "**Examples:** Yamaha CL5, Allen & Heath dLive, DiGiCo Quantum, Behringer X32, Midas M32.",
        ],
        points: [
          "Converted to **numbers**; **DSP** does the processing.",
          "**Scenes and recall**, effects on every channel.",
          "Faders work in **layers**; small conversion latency.",
        ],
      },
      {
        id: "hybrid",
        name: "Hybrid",
        lead: "An analog audio path with digital control on top: the sound of an analog console with some of the convenience of a digital one.",
        body: [
          "**How it works:** the audio stays **analog** through the preamps, EQ and summing. **Digitally controlled** circuits store and recall settings and automate faders, and the surface often doubles as a **DAW controller**.",
          "**Strengths:** analog character with **recall and automation**, and one surface for both the console and the DAW. Built for studios that mix partly in the box and partly through the desk.",
          "**Examples:** SSL AWS 948 δelta, SSL Duality δelta, Neve Genesys Black. Also common: a small analog **summing mixer** fed from a DAW and interface.",
        ],
        points: [
          "**Analog audio path** + **digital control**.",
          "Adds **recall, automation** and **DAW control**.",
          "Ask: where is the signal converted, and can settings be recalled?",
        ],
      },
    ],
  },
  {
    n: "02",
    family: FAMILY,
    type: "Application",
    short: "Application",
    tone: "green",
    items: [
      {
        id: "live",
        name: "Live",
        lead: "Front-of-house (FOH) and monitor consoles for concerts, theatre, churches and events.",
        body: [
          "**Built for:** many inputs, many aux and matrix outputs for wedges and **in-ear monitor mixes**, **scene recall** per song or cue, and gear that survives touring.",
          "**Signal chain:** stage box on stage → network cable (Dante, MADI, AES50) → console at FOH → PA. A **monitor console** at the side of the stage builds the performers' mixes.",
          "**Examples:** Yamaha RIVAGE PM, DiGiCo SD12, Allen & Heath dLive, Midas HD96.",
        ],
        points: [
          "**FOH** mixes for the audience; **monitors** mix for the performers.",
          "Many **monitor mixes** and **scene recall** per song.",
          "**Stage boxes** over a network replace the multicore.",
        ],
      },
      {
        id: "studio",
        name: "Studio",
        lead: "Recording and mixing consoles in the control room of a commercial studio.",
        body: [
          "**Built for:** **tracking** (sending mics to the recorder while building headphone mixes) and **mixing** (balancing the recorded tracks). High-quality preamps, EQ and summing, **automation**, and integration with the DAW.",
          "**Signal chain:** live room mics → console preamps → DAW inputs; DAW outputs → console monitor / mix path → mix bus → control room monitors.",
          "**Examples:** SSL 4000 G, SSL 9000 J, Neve 88RS, API Legacy AXS. **DAW-control surfaces** like the Avid S6 for in-the-box rooms.",
        ],
        points: [
          "Two jobs: **tracking** and **mixing**.",
          "Top-quality **preamps, EQ and summing**, plus **automation**.",
          "Tight **DAW integration**.",
        ],
      },
      {
        id: "broadcast",
        name: "Broadcast",
        lead: "On-air consoles for radio and TV, where the mix is going out live and can't stop.",
        body: [
          "**Built for:** **mix-minus (N-1)** feeds so remote callers and reporters hear everything except themselves, **talkback** and IFB to presenters, automatic mixing for panel shows, and **loudness** metering to EBU R128 / ATSC A/85.",
          "**Reliability:** **redundant** power supplies and processing, hot-swappable cards, and IP audio networks (AES67, SMPTE ST 2110) across the building.",
          "**Examples:** Calrec Argo, Lawo mc²56, SSL System T, Wheatstone LXE.",
        ],
        points: [
          "**Mix-minus** so remote guests don't hear themselves.",
          "**Loudness** standards: EBU R128 / ATSC A/85.",
          "**Redundancy** everywhere: it can't go off air.",
        ],
      },
      {
        id: "project-studio",
        name: "Project studio",
        lead: "Home and small studios, podcasts and content creators, where one person does everything.",
        body: [
          "**Built for:** a few mic and line inputs, a **USB audio interface** built in, simple headphone and monitor outputs, and often onboard effects. Most of the mixing happens in the **DAW**.",
          "**Signal chain:** mic / instrument → small mixer (or interface) → USB → DAW → mixer's monitor out → speakers and headphones.",
          "**Examples:** TASCAM Model 12, Yamaha MG10XU, Mackie ProFX12v3+, RØDECaster Pro II (podcasting).",
        ],
        points: [
          "**Compact**, few inputs, one operator.",
          "**USB interface** built in.",
          "Most of the mixing happens in the **DAW**.",
        ],
      },
    ],
  },
  {
    n: "03",
    family: FAMILY,
    type: "Circuit design",
    short: "Circuit",
    tone: "blue",
    items: [
      {
        id: "split",
        name: "Split",
        lead: "Separate input channels and a separate monitor section, usually on the right of the desk.",
        body: [
          "While recording, every track needs two signal paths: the **channel path** (mic → recorder) and the **monitor path** (recorder → control-room speakers). A split console puts them in **separate sections**.",
          "**How it works:** input channels take the mics and route them to the recorder. The tape / DAW returns come back on their own **monitor channels** in a dedicated section, where you build the control-room mix.",
          "**Strengths:** easy to understand: each strip does one job, and the routing is visible on the surface. **Trade-offs:** needs a lot more surface (and cost) for the same track count.",
          "**Examples:** classic split desks such as the Trident Series 80 and Neve 8078. Live consoles work the same way in principle.",
        ],
        points: [
          "Channel path and monitor path in **separate sections**.",
          "**Simple** to follow: one job per strip.",
          "Needs a **bigger desk** for the same track count.",
        ],
      },
      {
        id: "inline",
        name: "Inline",
        lead: "Each channel strip carries both paths: the channel path to the recorder and the monitor path back from it.",
        body: [
          "**How it works:** one strip per track holds the mic input **and** that track's return. Usually the **large fader** controls one path and the **small fader** (or monitor pot) the other, and a **FLIP** switch swaps them, so EQ and dynamics can move to whichever path needs them.",
          "**Strengths:** **compact** for its track count, and at mixdown the monitor paths become **extra inputs**, so a 48-channel inline desk can take close to 96 inputs.",
          "**Trade-offs:** harder to learn: you have to know which path each control is on.",
          "**Examples:** SSL 4000 E/G and 9000 J, Neve VR, Soundcraft Ghost, Audient ASP8024-HE.",
        ],
        points: [
          "**Both paths in one strip**: large fader + small fader.",
          "**FLIP** swaps the two paths.",
          "**Compact**; monitor paths become **extra inputs** at mixdown.",
        ],
      },
    ],
  },
];

// 24×24 stroke icons (shown on the item tabs and in the photo placeholder).
export const ICONS = {
  analog:
    '<path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0"/><path d="M21 12h1"/>',
  digital:
    '<path d="M2 16h3V8h3v8h3V8h3v8h3V8h3v8h2"/>',
  hybrid:
    '<path d="M2 12c1.5-5 3-5 4.5 0S9.5 17 11 12"/><path d="M13 16V8h3v8h3V8h3"/>',
  live:
    '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v4M8 22h8"/>',
  studio:
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9v6M10 9v6M14 9v6M18 9v6"/><circle cx="6" cy="12" r="1"/><circle cx="10" cy="13" r="1"/><circle cx="14" cy="11" r="1"/><circle cx="18" cy="12" r="1"/>',
  broadcast:
    '<circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.5 18.5a9 9 0 0 1 0-13M18.5 5.5a9 9 0 0 1 0 13"/>',
  "project-studio":
    '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/><path d="M7 12V8M11 12V9M15 12v-2"/>',
  split:
    '<rect x="2" y="4" width="12" height="16" rx="1.5"/><rect x="16" y="4" width="6" height="16" rx="1.5"/><path d="M5 8v8M8 8v8M11 8v8M19 8v8"/>',
  inline:
    '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M7 8v8M12 8v8M17 8v8"/><path d="M5.5 11h3M10.5 14h3M15.5 11h3"/>',
};
