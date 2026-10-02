export const SECTIONS = [
  {
    n: "01",
    family: "Analog",
    type: "Mic & Instrument",
    short: "Mic/Inst",
    tone: "amber",
    items: [
      {
        id: "mic-cable",
        name: "Microphone Cable",
        lead: "A balanced XLR-to-XLR cable that carries a microphone's tiny signal to the preamp.",
        body: [
          "A mic signal is **very weak**, so any noise the cable picks up gets amplified along with it. Mic cables are **balanced**: two twisted wires carry the same signal, one of them flipped upside down.",
          "At the preamp the two copies are flipped back and combined. The wanted signal gets stronger while any hum picked up on the way **cancels out**. That's why mic cables can run a long way without getting noisy.",
          "The same cable also carries **48V phantom power** to condenser mics. Coil it **over-under** so it doesn't twist and break inside.",
        ],
        points: [
          "XLR to XLR, balanced, with a twisted pair inside.",
          "Noise picked up along the way cancels out at the preamp.",
          "Carries phantom power, and can run up to about 100 m.",
        ],
      },
      {
        id: "instrument-cable",
        name: "Instrument Cable",
        lead: "The TS-to-TS cable that plugs a guitar, bass or keyboard into an amp or DI box.",
        body: [
          "An instrument cable is **unbalanced**: one wire carries the signal and the shield around it is the ground. There's nothing to cancel out noise, so it picks up hum more easily.",
          "Guitar pickups have a **high impedance (Hi-Z)** output. Long cables add **capacitance**, which slowly rolls off the **high frequencies** and makes the guitar sound dull.",
          "For a clean, long run, plug the guitar into a **DI box** first, which converts it to a balanced mic-level signal for an XLR cable.",
        ],
        points: [
          "TS to TS, unbalanced.",
          "Long runs dull the high end of guitar pickups.",
          "For long runs, go through a DI box instead.",
        ],
      },
    ],
  },
  {
    n: "02",
    family: "Analog",
    type: "Line Level",
    short: "Line",
    tone: "green",
    items: [
      {
        id: "balanced-line",
        name: "Balanced Line Cable",
        lead: "A cable for connecting pro gear at line level while rejecting hum.",
        body: [
          "Line level is much **stronger** than mic level. It's the signal that travels between an **interface, console, outboard gear and studio monitors**.",
          "A balanced line cable works just like a mic cable, with **two signal wires plus a shield**, so it rejects hum over long runs. It can have **TRS** or **XLR** plugs at either end.",
          "Both ends must be balanced to get the benefit. If one device is unbalanced, the whole connection becomes unbalanced.",
        ],
        points: [
          "Connects pro gear at +4 dBu line level.",
          "TRS or XLR ends, two signal wires plus a shield.",
          "Both ends must be balanced to reject hum.",
        ],
      },
      {
        id: "unbalanced-line",
        name: "Unbalanced Line Cable",
        lead: "A simple two-conductor cable for consumer and short line-level connections.",
        body: [
          "Unbalanced line cables connect **turntables, DJ mixers, hi-fi gear, keyboards and effects pedals**. They have one signal wire and a shield.",
          "Because there's no noise cancelling, they're more likely to pick up **hum and buzz**, especially near power cables or when two devices are plugged into different power sockets (a **ground loop**).",
          "Keep them **short** and away from power cables. For longer runs, use a DI box or balanced connections.",
        ],
        points: [
          "Used for consumer gear at –10 dBV.",
          "RCA, TS or 3.5 mm ends.",
          "Keep it short and away from power cables.",
        ],
      },
    ],
  },
  {
    n: "03",
    family: "Analog",
    type: "Speaker",
    tone: "purple",
    items: [
      {
        id: "speaker-cable",
        name: "Speaker Cable",
        lead: "Thick, unshielded cable that carries amplified power from an amp to a passive speaker.",
        body: [
          "A power amplifier sends a **strong, high-current** signal to a passive speaker. Speaker cable has **two thick wires** to carry that power without heating up or wasting energy.",
          "It has **no shield**, because the signal is so strong that noise isn't a problem. The **thicker the wire** (lower gauge number), the longer it can run without losing power.",
          "**Never** use an instrument cable to connect a speaker, even if the plugs fit. The thin wire can overheat and damage the amplifier.",
        ],
        points: [
          "Carries amplifier power to passive speakers.",
          "Two thick wires, no shield.",
          "Never use an instrument cable for speakers.",
        ],
      },
    ],
  },
  {
    n: "04",
    family: "Digital",
    type: "Digital Audio",
    short: "Digital",
    tone: "blue",
    items: [
      {
        id: "digital-cable",
        name: "Digital Audio Cable",
        lead: "What makes a digital audio cable different from an analog one.",
        body: [
          "An analog cable carries a copy of the sound wave. A digital cable carries a fast stream of **ones and zeros** plus timing information (**clock**).",
          "Those fast pulses need a cable with the right **impedance**: **110 Ω** for AES/EBU, **75 Ω** for coaxial S/PDIF and word clock. A wrong cable can cause **clicks, dropouts** or no sound at all.",
          "A digital cable either **works or glitches**. It doesn't make the sound \"warmer\" or \"brighter\". There are three main types, covered in the next tabs.",
        ],
        points: [
          "Carries ones and zeros, not a sound wave.",
          "Impedance matters: 110 Ω (AES) or 75 Ω (coax).",
          "A digital cable either works or glitches. It doesn't change the tone.",
        ],
      },
      {
        id: "aes-cable",
        name: "AES/EBU Cable",
        lead: "A 110-ohm cable with XLR plugs that carries two channels of pro digital audio.",
        body: [
          "An AES/EBU cable looks just like a mic cable, but inside it's built to exactly **110 ohms** so fast digital pulses arrive cleanly.",
          "It carries **two channels** (stereo) of digital audio and is **balanced**, so it can run long distances between converters, digital consoles and recorders.",
          "Mark AES cables clearly (many use a **coloured jacket or label**) so they don't get mixed up with mic cables.",
        ],
        points: [
          "110-ohm twisted pair with XLR ends.",
          "Two channels, balanced, up to about 100 m.",
          "Label it so it isn't mixed up with mic cables.",
        ],
      },
      {
        id: "coax-cable",
        name: "Coaxial Digital Cable (S/PDIF)",
        lead: "A 75-ohm coaxial cable with RCA plugs that carries stereo digital audio.",
        body: [
          "**Coaxial** means one centre wire surrounded by insulation and a **metal shield**, all sharing the same centre. This shape keeps the impedance at exactly **75 ohms**.",
          "It carries **S/PDIF**, the consumer version of AES/EBU, with **two channels** of digital audio. It connects CD players, some interfaces and outboard converters.",
          "Use a proper 75 Ω digital cable, not a cheap audio RCA lead. **Word clock** uses the same 75 Ω coax with **BNC** plugs.",
        ],
        points: [
          "75-ohm coaxial cable with RCA or BNC ends.",
          "Carries stereo S/PDIF digital audio.",
          "Use a real digital cable, not a cheap audio RCA lead.",
        ],
      },
      {
        id: "adat-cable",
        name: "ADAT Optical (Lightpipe)",
        lead: "A fibre-optic TOSLINK cable that carries eight channels of digital audio as light.",
        body: [
          "**ADAT Lightpipe** sends **eight channels** of audio through one thin optical cable. It's the easiest way to **add eight more mic inputs** to an interface with an external preamp.",
          "At higher sample rates it carries fewer channels: **4 at 88.2/96 kHz** (a mode called **S/MUX**). One device must be the **clock master** and the other must follow it.",
          "The cable carries **light, not electricity**, so it can't cause hum. Don't **kink or crush** it — a cracked fibre stops the light.",
        ],
        points: [
          "Eight channels through one optical cable.",
          "Four channels at 96 kHz (S/MUX).",
          "Set one device as clock master, and never kink the fibre.",
        ],
      },
    ],
  },
  {
    n: "05",
    family: "Digital",
    type: "Control",
    tone: "amber",
    items: [
      {
        id: "midi-cable",
        name: "MIDI Cable",
        lead: "A 5-pin DIN cable that carries performance data between instruments and computers.",
        body: [
          "A MIDI cable carries **instructions**, not sound: which note to play, how hard, and how knobs and pedals move. The receiving instrument makes the actual sound.",
          "Connect **MIDI OUT → MIDI IN**. To control several devices from one keyboard, **daisy-chain** them using **THRU** ports, or use a MIDI interface with several outputs.",
          "Only **three of the five pins** are used. Keep runs under about **15 metres**. Beyond that, or for many devices, use **USB-MIDI** or a network MIDI system.",
        ],
        points: [
          "5-pin DIN at both ends, carries data not sound.",
          "Connect OUT → IN, and use THRU to chain devices.",
          "Keep runs under about 15 m.",
        ],
      },
    ],
  },
];

export const cableImagePath = (id) => `/cables/${id}.jpg`;

export const ICONS = {
  "mic-cable":
    '<rect x="3" y="2" width="5" height="9" rx="2.5"/><path d="M5.5 11v3c0 4 13 1 13 4"/><circle cx="18.5" cy="19.5" r="2.5"/>',
  "instrument-cable":
    '<rect x="2" y="3" width="4" height="6" rx="1"/><rect x="18" y="15" width="4" height="6" rx="1"/><path d="M4 9v3c0 5 16 0 16 3"/>',
  "balanced-line":
    '<rect x="2" y="9" width="4" height="6" rx="1"/><rect x="18" y="9" width="4" height="6" rx="1"/><path d="M6 11c2 0 2 2 4 2s2-2 4-2 2 2 4 2"/><path d="M6 13c2 0 2-2 4-2s2 2 4 2 2-2 4-2"/>',
  "unbalanced-line":
    '<rect x="2" y="9" width="4" height="6" rx="1"/><rect x="18" y="9" width="4" height="6" rx="1"/><line x1="6" y1="12" x2="18" y2="12"/>',
  "speaker-cable":
    '<rect x="15" y="3" width="7" height="18" rx="1.5"/><circle cx="18.5" cy="14" r="2.5"/><circle cx="18.5" cy="7" r="1"/><path d="M2 10h13M2 14h13" stroke-width="2.4"/>',
  "digital-cable":
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9v6M9 9h2v6H9zM14 9v6M17 9h2v6h-2z"/>',
  "aes-cable":
    '<circle cx="5" cy="12" r="3"/><circle cx="19" cy="12" r="3"/><path d="M8 11c2 0 2 2 4 2s2-2 4-2"/><path d="M8 13c2 0 2-2 4-2s2 2 4 2"/><rect x="11" y="4" width="2" height="2" fill="currentColor"/>',
  "coax-cable":
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6" stroke-dasharray="1.5 1.5"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  "adat-cable":
    '<rect x="2" y="9" width="4" height="6" rx="1"/><rect x="18" y="9" width="4" height="6" rx="1"/><line x1="6" y1="12" x2="18" y2="12"/><path d="M9 6l1.5 3M12 5v3M15 6l-1.5 3" />',
  "midi-cable":
    '<circle cx="5" cy="7" r="3"/><circle cx="19" cy="17" r="3"/><path d="M7 9c3 3 7 3 10 6"/><circle cx="4" cy="7" r="0.6" fill="currentColor"/><circle cx="5" cy="5.8" r="0.6" fill="currentColor"/><circle cx="6" cy="7" r="0.6" fill="currentColor"/>',
};
