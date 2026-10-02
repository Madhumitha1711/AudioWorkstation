export const connectionImagePath = (id) => `/analog-digital-connections/${id}.jpg`;

export const CONNECTION_TABS = [
  {
    id: "levels",
    tab: "Signal levels",
    image: "signal-levels",
    lead: "An analog connection carries sound as a changing voltage. Different gear sends that voltage at very different strengths, called signal levels. Before you plug two things together, check that the output's level matches what the input expects.",
    facts: [
      {
        label: "Mic level",
        text: "The weakest signal in the studio: roughly −60 to −40 dBu, a few thousandths of a volt. It always goes into a mic preamp first, which adds 30–70 dB of gain to bring it up to line level.",
      },
      {
        label: "Instrument level",
        text: "Guitar and bass pickups put out a little more than a mic, but from a high impedance (Hi-Z) source. They need an input with a very high load, around 1 MΩ: an instrument (Hi-Z) input on the interface, or a DI box. Plugged into a normal line input they sound thin and dull.",
      },
      {
        label: "Line level",
        text: "The working level between interfaces, consoles, outboard gear and powered monitors. Pro gear runs at +4 dBu (about 1.23 V). Consumer gear (hi-fi, DJ mixers, some keyboards) runs at −10 dBV (about 0.32 V), roughly 12 dB lower. Many interfaces have a +4 / −10 switch on their line inputs and outputs.",
      },
      {
        label: "Speaker level",
        text: "What comes out of a power amplifier to drive a passive speaker: tens of volts and real current. It only travels on speaker cable (Speakon or banana) and must never be plugged into a line or mic input, which it can damage.",
      },
      {
        label: "Impedance matching",
        text: "Pro audio uses bridging: a low-impedance output feeds an input at least ten times higher, so almost all of the voltage arrives. A mic of about 150–600 Ω feeds a preamp of about 1.5–3 kΩ; a line output of about 100 Ω feeds a line input of 10 kΩ or more.",
      },
    ],
    points: [
      "Analog audio is a **voltage**; the four levels are **mic, instrument, line and speaker**.",
      "**Mic level (−60 to −40 dBu)** always goes through a **preamp** first.",
      "Guitars and basses need a **Hi-Z input** or a **DI box**.",
      "Pro line level is **+4 dBu**, consumer is **−10 dBV**: about **12 dB** apart.",
      "**Speaker level** stays on **speaker cable**. Never into a line or mic input.",
    ],
  },
  {
    id: "balanced",
    tab: "Balanced & unbalanced",
    image: "balanced-unbalanced",
    lead: "Every analog cable picks up some hum and noise along the way. A balanced connection is designed to cancel it; an unbalanced one isn't. Knowing which one you have explains most hum and buzz problems in a studio.",
    facts: [
      {
        label: "Unbalanced",
        text: "Two conductors: one signal wire (hot) and a shield that is also the ground. Any noise the cable picks up is added straight to the signal. Fine for short runs of a few metres. Connectors: TS, RCA and 3.5 mm.",
      },
      {
        label: "Balanced",
        text: "Three conductors: hot, cold and a ground shield. The same signal is sent on hot and cold, with cold flipped upside down. The input flips cold back and adds the two: the signal doubles, while noise that hit both wires equally cancels out. This is called common-mode rejection, and it lets balanced lines run 100 m or more. Connectors: XLR (pin 1 ground, pin 2 hot, pin 3 cold) and TRS (tip hot, ring cold, sleeve ground).",
      },
      {
        label: "Mixing the two",
        text: "A connection is only balanced if both the output and the input are balanced. A balanced output into an unbalanced input works, but you lose the noise rejection, and on some outputs the level drops by about 6 dB. A TRS jack looks the same as a TS jack, so check the socket label, not just the plug.",
      },
      {
        label: "Ground loops",
        text: "When two pieces of gear are grounded through different paths (separate power sockets plus the cable shield), a small current flows around the loop and you hear a steady 50 or 60 Hz hum. Fixes: use balanced connections, power connected gear from the same outlet or power distributor, use the ground-lift switch on a DI box, or add an isolation transformer. Never remove the safety earth from a mains plug.",
      },
      {
        label: "DI box",
        text: "A DI (direct injection) box turns an unbalanced, high-impedance instrument or line signal into a balanced, mic-level signal on an XLR, so it can travel a long way to a preamp. Most have a pad and a ground-lift switch.",
      },
    ],
    points: [
      "**Unbalanced** = signal + shield. Noise adds to the signal. Keep runs **short**.",
      "**Balanced** = **hot + cold + shield**. Noise **cancels** at the input, so runs can be **100 m+**.",
      "**Both ends** must be balanced; check the **socket**, a TRS and TS plug look alike.",
      "A steady **50/60 Hz hum** is usually a **ground loop**. Never lift the **safety earth**.",
      "A **DI box** turns unbalanced Hi-Z or line signals into **balanced mic level**.",
    ],
  },
  {
    id: "conversion",
    tab: "Analog ↔ digital",
    image: "ad-da-conversion",
    lead: "Microphones and speakers are analog. Computers are digital. Converters are the border crossing: an A/D converter turns voltage into numbers on the way in, and a D/A converter turns numbers back into voltage on the way out. Every audio interface is a set of converters.",
    facts: [
      {
        label: "A/D conversion",
        text: "The converter measures the voltage many thousands of times a second (the sample rate) and stores each measurement as a number (the bit depth). 44.1 or 48 kHz captures everything up to about 20 kHz, the top of human hearing. 24 bits gives far more dynamic range than any microphone or room can use.",
      },
      {
        label: "D/A conversion",
        text: "The reverse: the numbers are turned back into a smooth voltage and sent to the monitor outputs and headphones. The D/A converter in your interface is part of what you hear every time you listen back.",
      },
      {
        label: "dBu meets dBFS",
        text: "Analog levels are measured in dBu; digital levels in dBFS, where 0 dBFS is the largest number the system can store. Converters are lined up so a +4 dBu tone reads about −18 to −20 dBFS, leaving headroom for peaks. Above 0 dBFS the signal hard-clips, which sounds much harsher than analog overload.",
      },
      {
        label: "Convert once",
        text: "Each A/D or D/A pass adds a little noise and a little latency. Once a signal is digital, keep it digital between digital devices (AES, ADAT, MADI) instead of converting back to analog and in again.",
      },
      {
        label: "Latency",
        text: "Conversion itself takes well under a millisecond, but the computer's buffer adds more. Small buffers (64–128 samples) keep monitoring latency low for recording; larger buffers give the computer more time for plugins when mixing.",
      },
    ],
    points: [
      "**A/D** turns voltage into numbers; **D/A** turns them back. An **interface** is a set of converters.",
      "**Sample rate** (44.1 / 48 kHz and up) sets the frequency range; **bit depth** (24-bit) sets the dynamic range.",
      "Analog is measured in **dBu**, digital in **dBFS**; **0 dBFS** is the ceiling, and digital clipping is **harsh**.",
      "Line-up: **+4 dBu ≈ −18 to −20 dBFS**, leaving headroom.",
      "**Convert once**: between digital devices, stay **digital**.",
    ],
  },
  {
    id: "digital",
    tab: "Digital formats",
    lead: "A digital connection carries numbers, not a voltage that is the sound. The signal either arrives perfectly or fails audibly with clicks and dropouts; it doesn't slowly get noisier. The formats differ in how many channels they carry, how far they reach and which connector they use.",
    facts: [
      {
        label: "Use the right cable",
        text: "Digital audio runs at radio frequencies, so cable impedance matters. Coaxial S/PDIF needs 75 Ω cable and AES3 needs 110 Ω cable. An ordinary RCA or mic cable may work over a short run, but over longer distances it causes errors and dropouts.",
      },
    ],
    subhead: "Formats",
    examples: [
      {
        id: "spdif",
        title: "S/PDIF",
        lead: "The consumer two-channel digital link, found on interfaces, hi-fi gear and CD players.",
        facts: [
          { label: "Channels", text: "2 (stereo), typically up to 24-bit / 96 kHz." },
          { label: "Connector", text: "RCA on 75 Ω coax, or TOSLINK optical." },
          { label: "Use", text: "Connecting an external converter, a digital effects unit or a hi-fi system to an interface." },
        ],
      },
      {
        id: "aes3",
        title: "AES3 (AES/EBU)",
        lead: "The professional two-channel digital link, built for long runs in studios and broadcast.",
        facts: [
          { label: "Channels", text: "2, up to 24-bit / 192 kHz." },
          { label: "Connector", text: "XLR on balanced 110 Ω cable, about 100 m; 8 channels on one D-Sub 25 multicore." },
          { label: "Use", text: "Mastering converters, digital consoles, outboard reverbs and broadcast routing." },
        ],
      },
      {
        id: "adat",
        title: "ADAT Lightpipe",
        lead: "Eight channels down one optical cable: the usual way to add more inputs to an interface.",
        facts: [
          { label: "Channels", text: "8 at 44.1 / 48 kHz; 4 at 88.2 / 96 kHz (S/MUX)." },
          { label: "Connector", text: "TOSLINK optical, up to about 10 m." },
          { label: "Use", text: "An 8-channel preamp with ADAT out feeds the interface's ADAT in: 8 extra mic inputs." },
        ],
      },
      {
        id: "madi",
        title: "MADI (AES10)",
        lead: "A high channel-count link for large consoles, broadcast trucks and live recording.",
        facts: [
          { label: "Channels", text: "Up to 64 at 48 kHz; 32 at 96 kHz." },
          { label: "Connector", text: "75 Ω coax on BNC (about 100 m) or optical fibre (up to 2 km)." },
          { label: "Use", text: "Stage boxes, digital consoles and multitrack recording rigs." },
        ],
      },
    ],
    points: [
      "Digital links carry **numbers**: they work **perfectly** or fail with **clicks and dropouts**.",
      "Match the cable: **75 Ω** for coax S/PDIF and MADI, **110 Ω** for AES3.",
      "**S/PDIF** and **AES3** carry **2 channels**; consumer vs professional.",
      "**ADAT** carries **8 channels** on optical: the standard way to add **8 more inputs**.",
      "**MADI** carries up to **64 channels** for large rooms and broadcast.",
    ],
  },
  {
    id: "clock",
    tab: "Clock & sync",
    image: "word-clock",
    lead: "When digital devices are connected, they must all take their samples at exactly the same rate and at the same moments. One device is the clock master; every other device follows it. Get this wrong and the audio clicks, pops or drops out.",
    facts: [
      {
        label: "One master",
        text: "Choose one clock source, usually the main interface or a dedicated master clock. Every other digital device is set to external clock (also called slave or follow) and locks to it. Two devices both set to internal clock will drift apart, giving regular clicks.",
      },
      {
        label: "How clock travels",
        text: "S/PDIF, AES3, ADAT and MADI carry clock inside the audio stream, so a device can lock to its digital input. In bigger setups a separate word clock signal is sent on 75 Ω coax with BNC connectors, from the master to each device.",
      },
      {
        label: "Same sample rate",
        text: "All connected devices must run at the same sample rate. If one runs at 44.1 kHz and another at 48 kHz, audio won't pass, or it plays at the wrong speed and pitch.",
      },
      {
        label: "Jitter",
        text: "Tiny timing errors in the clock are called jitter. At the converters they add distortion and blur the stereo image. A stable master clock and good cables keep it low.",
      },
      {
        label: "Clock vs timecode",
        text: "Word clock keeps the samples in step. Timecode (SMPTE, MIDI Time Code) tells machines where they are in a song or film. A tape machine or video deck synced to a DAW uses both.",
      },
    ],
    points: [
      "Every connected digital device must share **one clock master**; the rest follow on **external clock**.",
      "Clock travels **inside** S/PDIF, AES3, ADAT and MADI, or on a separate **word clock (BNC, 75 Ω)** line.",
      "All devices must run at the **same sample rate**.",
      "Clock problems sound like **clicks, pops and dropouts**; timing errors are **jitter**.",
      "**Word clock** keeps samples in step; **timecode** keeps the position.",
    ],
  },
  {
    id: "computer",
    tab: "Computer & network",
    lead: "The last link in the chain connects the interface to the computer, or connects many devices over a network. These connections carry audio, clock and control together, and the right choice depends on channel count, distance and latency.",
    facts: [
      {
        label: "Bandwidth is rarely the limit",
        text: "Even 32 channels of 24-bit / 48 kHz audio needs only about 37 Mbit/s. What changes between connections is driver quality, latency and how far the cable can run.",
      },
    ],
    subhead: "Connections",
    examples: [
      {
        id: "usb",
        title: "USB",
        lead: "The most common interface connection, from 2-channel desktop boxes to rack interfaces.",
        facts: [
          { label: "Bandwidth", text: "USB 2.0 (480 Mbit/s) is plenty for most interfaces; USB-C is just the connector shape." },
          { label: "Distance", text: "About 5 m per cable." },
          { label: "Note", text: "Class-compliant interfaces work without installing a driver, including on iPads." },
        ],
      },
      {
        id: "thunderbolt",
        title: "Thunderbolt",
        lead: "A direct PCIe link to the computer for high channel counts and the lowest latency.",
        facts: [
          { label: "Bandwidth", text: "Up to 40 Gbit/s (Thunderbolt 3 / 4) on a USB-C connector." },
          { label: "Distance", text: "About 2 m passive; longer with active or optical cables." },
          { label: "Use", text: "Large interfaces and DSP-powered systems that run plugins on the interface." },
        ],
      },
      {
        id: "dante",
        title: "Dante",
        lead: "Audio over a standard computer network: hundreds of channels on one Ethernet cable.",
        facts: [
          { label: "Channels", text: "Up to 512 × 512 per device at 48 kHz on gigabit Ethernet." },
          { label: "Cable", text: "Cat5e or Cat6, up to 100 m between switches." },
          { label: "Note", text: "Clock is shared over the network (PTP), and routing is done in software instead of a patchbay." },
        ],
      },
      {
        id: "avb",
        title: "AVB / AES67",
        lead: "Open audio-over-network standards, so gear from different makers can share audio on one network.",
        facts: [
          { label: "AVB / Milan", text: "Needs AVB-capable switches that reserve bandwidth for audio." },
          { label: "AES67", text: "A common format that lets Dante, Ravenna and other systems exchange audio." },
          { label: "Use", text: "Large studios, live sound and broadcast facilities spread across rooms." },
        ],
      },
    ],
    points: [
      "**USB 2.0** is enough for most interfaces; **class-compliant** gear needs **no driver**.",
      "**Thunderbolt** gives **high channel counts** and the **lowest latency**.",
      "**Dante** carries **hundreds of channels** over **standard Ethernet**, with clock built in.",
      "**AVB** and **AES67** are **open standards** for mixing brands on one network.",
      "Choose by **channel count, distance and latency**, not raw bandwidth.",
    ],
  },
];
