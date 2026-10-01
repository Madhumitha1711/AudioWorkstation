// "Subwoofer" — content for SubwooferLab.
//
// Four tabs, in teaching order:
//   1. Subwoofer        — what a sub is, why it's a separate box, sealed vs
//                         ported, controls and placement.
//   2. Subwoofer + LFE  — the speaker vs the ".1" channel: LFE, +10 dB
//                         in-band gain, bass management.
//   3. Pro audio        — studio subs: Genelec 7360A, Neumann KH 750 DSP,
//                         Yamaha HS8S, Genelec 7382A (2 + 2 grid).
//   4. Home theatre     — consumer subs driven by an AV receiver: SVS
//                         SB-1000 Pro, KEF KC62, Klipsch R-120SW and a
//                         5.1 / 7.1.4 layout card (2 + 2 grid).
//
// Each tab: optional top image (`image` id → public/subwoofer/<id>.jpg;
// Subwoofer and Subwoofer + LFE), lead, labelled facts, optional example FlipCards
// (photo on the front; { id, title, wide?, lead, facts }), key points.
// Spec figures are the manufacturers' published numbers.
//
// Photos aren't added yet — drop them in at public/subwoofer/<id>.jpg and
// they appear automatically; until then each shows a placeholder.

export const subwooferImagePath = (id) => `/subwoofer/${id}.jpg`;

export const SUBWOOFER_TABS = [
  {
    id: "subwoofer",
    tab: "Subwoofer",
    image: "subwoofer",
    lead: "A subwoofer is a speaker that only plays the lowest notes, roughly 20 to 120 Hz: kick drum weight, bass guitar fundamentals, organ pedals, explosions. It takes over where the main speakers run out of size and power.",
    facts: [
      {
        label: "Why a separate box",
        text: "Deep bass needs a lot of air moved: a big driver (8\" to 18\"), long cone travel, a large cabinet and plenty of amplifier power. Building that into every main speaker is expensive and bulky. Giving the job to one dedicated box also takes the heavy bass load off the mains, so they play cleaner in the midrange. Almost all subwoofers are active, with the amplifier and filters built in.",
      },
      {
        label: "Why one sub can sit off-centre",
        text: "Below about 80 Hz the wavelength is over 4 m, longer than the distance between your ears, so the ear can't tell where the bass is coming from. One subwoofer can serve both left and right speakers from anywhere along the front wall. Keep the crossover at 80–100 Hz or below: set it higher and the sub plays notes you can locate, and the bass appears to come from the box.",
      },
      {
        label: "Sealed vs ported",
        text: "The same trade-off as the main speakers. A sealed sub gives tight, controlled bass with a gentle roll-off at the bottom. A ported sub gets more output from the same driver around its tuning frequency, then falls away steeply below it, and can chuff when pushed hard.",
      },
      {
        label: "Controls",
        text: "Level (to match the mains), a low-pass crossover (where the sub stops), phase or polarity (so the sub and mains push air together at the crossover, not against each other) and often a high-pass output that takes the deep bass out of the main speakers.",
      },
      {
        label: "Placement",
        text: "In a small room, standing waves (room modes) shape the bass more than the sub does. A corner gives the most output but also the boomiest response. The classic trick is the subwoofer crawl: put the sub at your listening seat, play bass-heavy music, crawl around the floor where the sub could go, and place it where the bass sounds most even.",
      },
    ],
    points: [
      "A **subwoofer** only plays the lowest range, about **20–120 Hz**, and is almost always **active** (amp built in).",
      "Low bass is **hard to localise**, so **one sub** can sit off-centre, if the **crossover stays at 80–100 Hz** or lower.",
      "**Sealed** = tight, gentle roll-off. **Ported** = more output, steep roll-off, can chuff.",
      "Set **level, crossover and phase** so the sub and mains join seamlessly.",
      "In small rooms, **placement and room modes** matter more than the sub itself. Try the **subwoofer crawl**.",
    ],
  },
  {
    id: "lfe",
    tab: "Subwoofer + LFE",
    image: "subwoofer-lfe",
    lead: "\"Subwoofer\" is a speaker. \"LFE\" is a channel. The .1 in 5.1 or 7.1.4 is the Low-Frequency Effects channel: a separate bass-only track for extra impact. In a surround system the subwoofer plays the LFE channel and the bass from all the other speakers.",
    facts: [
      {
        label: "What the LFE channel is",
        text: "A discrete channel in Dolby Digital, DTS and Dolby Atmos mixes that carries nothing above 120 Hz. It is called \".1\" because it uses only about a tenth of the full audio bandwidth. The mixer uses it for effects that need more weight than the main channels can give: explosions, engine rumble, thunder, the big drop.",
      },
      {
        label: "+10 dB in-band gain",
        text: "LFE is played back 10 dB louder than a main channel at the same digital level. That gives the effects extra headroom without clipping the main channels. Every playback chain must apply this gain: AV receivers do it automatically, and studio subs apply it on their dedicated LFE input.",
      },
      {
        label: "Bass management",
        text: "The processor (AV receiver, monitor controller or the subwoofer itself) high-passes every main channel at the crossover (80 Hz is the THX standard), and sends the bass below that to the sub, summed with the LFE channel. So the sub plays two things: bass redirected from the main speakers, and the LFE channel.",
      },
      {
        label: "Don't rely on the .1",
        text: "LFE is optional on playback. A stereo downmix, headphones or a TV may drop it entirely, so anything musically important (bass line, kick) belongs in the main channels. LFE is for extra impact only.",
      },
      {
        label: "In the studio",
        text: "A stereo music room uses the sub for bass management only: 2.1, no LFE. A 5.1 or Atmos mixing room sends the DAW's LFE output to the sub's dedicated LFE input and runs the main channels through its bass management. Calibration sets each main channel to the same reference level and the LFE 10 dB higher in-band.",
      },
    ],
    points: [
      "**Subwoofer = speaker. LFE = channel** (the **.1** in 5.1 / 7.1.4).",
      "LFE carries only **up to 120 Hz** and plays back with **+10 dB in-band gain**.",
      "**Bass management** high-passes the mains (usually **80 Hz**) and sends their bass to the sub, **summed with LFE**.",
      "Keep musically important bass in the **main channels**. LFE can be dropped on downmix.",
      "Stereo rooms run **2.1 (no LFE)**. Surround rooms feed the DAW's LFE to the sub's **LFE input**.",
    ],
  },
  {
    id: "pro",
    tab: "Pro audio",
    lead: "Studio subwoofers are built for accuracy, not impact: flat response, low distortion and controlled decay, so the engineer hears exactly what is in the mix. They are designed to blend with a specific family of studio monitors.",
    facts: [
      {
        label: "What makes them different",
        text: "Balanced XLR inputs (often AES digital too), bass management with outputs that feed the main monitors, a dedicated LFE input for surround work, and room calibration: Genelec GLM or Neumann MA 1 measure the room and set level, delay, phase and EQ for the sub and the mains together.",
      },
      {
        label: "Signal chain",
        text: "Interface / monitor controller outs → sub inputs → sub's high-passed outputs → main monitors. In surround, the DAW's LFE bus → sub's LFE input.",
      },
    ],
    subhead: "Examples",
    examples: [
      {
        id: "genelec-7360a",
        title: "Genelec 7360A",
        lead: "A 10\" studio sub with 7.1 bass management and GLM calibration.",
        facts: [
          { label: "Subwoofer", text: "10\" driver in a Laminar Spiral Enclosure (port). 19–150 Hz (−6 dB), ±3 dB 19–100 Hz. 300 W Class D, ≥114 dB SPL peak." },
          { label: "Bass management", text: "Up to 7.1: 7 analog XLR inputs and outputs, one XLR LFE input/output, AES/EBU in and out." },
          { label: "Room tools", text: "GLM sets level, delay, crossover phase and EQ for the sub and Genelec monitors together." },
        ],
      },
      {
        id: "neumann-kh750-dsp",
        title: "Neumann KH 750 DSP",
        lead: "A sealed 10\" sub designed to partner the KH 120 II and KH 150.",
        facts: [
          { label: "Subwoofer", text: "10\" driver, closed (sealed) 48 L cabinet. Down to 18 Hz (±3 dB). 256 W amplifier, 105 dB SPL max." },
          { label: "Bass management", text: "2.1 with a 4th-order (24 dB/oct) crossover: 80 Hz, or 60–100 Hz in software; phase in 45° steps. 2 × XLR in/out plus AES3 / S/PDIF digital." },
          { label: "Room tools", text: "Neumann MA 1 aligns the sub and monitors at the listening position." },
        ],
      },
      {
        id: "yamaha-hs8s",
        title: "Yamaha HS8S",
        lead: "An 8\" partner for the HS series with simple analog controls.",
        facts: [
          { label: "Subwoofer", text: "8\" driver, 150 W amplifier. 22–160 Hz (−10 dB)." },
          { label: "Bass management", text: "2.1, analog: HIGH CUT (sub low-pass, 80–120 Hz), LOW CUT (high-pass for the monitors, 80–120 Hz) with an on/off switch, PHASE normal/reverse." },
          { label: "Connections", text: "2 × XLR and 2 × TRS in, XLR L/R outputs to the monitors and an EXT SUB output." },
        ],
      },
      {
        id: "genelec-7382a",
        title: "Genelec 7382A: large-room and film-mix sub",
        lead: "Three 15\" drivers for main rooms, film mixing stages and mastering suites, where the sub must reach the very bottom of the audible range at cinema levels.",
        facts: [
          { label: "Subwoofer", text: "3 × 15\" drivers. 15–100 Hz (−6 dB). 2500 W Class D, ≥133 dB SPL peak." },
          { label: "Connections", text: "Two main XLR inputs plus one XLR LFE input, two XLR outputs, AES/EBU in and out, GLM network." },
          { label: "Why so big", text: "A film mix has to translate to cinemas, so the mixing room must reproduce the LFE channel down to the lowest notes at full reference level. Several 7382As can be run as one array under GLM." },
        ],
      },
    ],
    points: [
      "Studio subs aim for **accuracy**: flat, low distortion, matched to a **monitor family**.",
      "Expect **balanced XLR**, **bass management outputs** to the mains and a dedicated **LFE input**.",
      "**Room calibration** (Genelec GLM, Neumann MA 1) aligns sub and mains as one system.",
      "Bigger rooms and **film mixing** need subs like the **7382A** to reach 15 Hz at reference level.",
    ],
  },
  {
    id: "home",
    tab: "Home theatre",
    lead: "In a home theatre the subwoofer is part of a system run by an AV receiver (AVR). The receiver decodes the film's 5.1, 7.1 or Atmos soundtrack, does the bass management and sends the subwoofer one signal: the redirected bass plus the LFE channel.",
    facts: [
      {
        label: "Where it connects",
        text: "AVR \"SUBWOOFER PRE OUT\" → single RCA cable → sub's LFE or line input. Set the sub's own low-pass to its maximum or LFE/bypass so only the receiver's crossover filters the signal; two filters stacked cause a dip and a phase shift at the crossover.",
      },
      {
        label: "Setup",
        text: "Set the main speakers to \"Small\" and the crossover to 80 Hz (the THX default) so the sub does the deep bass. Then run the receiver's room correction (Audyssey, Dirac Live, YPAO, Anthem ARC) with its microphone: it sets each speaker's distance (delay), level and EQ, including the sub.",
      },
      {
        label: "How they differ from studio subs",
        text: "Unbalanced RCA and speaker-level inputs instead of XLR, app control instead of rear-panel trims, wireless options, and furniture-friendly cabinets. Many are voiced for impact at the price, rather than ruler-flat response.",
      },
    ],
    subhead: "Examples",
    examples: [
      {
        id: "svs-sb1000-pro",
        title: "SVS SB-1000 Pro",
        lead: "A compact sealed 12\" sub with full DSP control from a phone app.",
        facts: [
          { label: "Subwoofer", text: "12\" driver, sealed cabinet. 20–270 Hz (±3 dB). 325 W RMS (820 W+ peak)." },
          { label: "Inputs", text: "RCA stereo / LFE line in and out, speaker-level inputs, optional wireless adapter." },
          { label: "Tuning", text: "Bluetooth app: low-pass, phase, polarity, room-gain compensation, 3-band parametric EQ and presets." },
        ],
      },
      {
        id: "kef-kc62",
        title: "KEF KC62",
        lead: "A tiny sealed sub with two opposed 6.5\" drivers that cancel cabinet vibration.",
        facts: [
          { label: "Subwoofer", text: "2 × 6.5\" force-cancelling drivers (Uni-Core), aluminium cabinet about 25 cm a side. 11–200 Hz (±3 dB). 2 × 500 W Class D, 105 dB SPL max." },
          { label: "Inputs", text: "RCA line / LFE and speaker-level inputs, line outputs with a high-pass filter for the mains." },
          { label: "Room tools", text: "Five placement EQ presets: free space, wall, corner, cabinet and apartment." },
        ],
      },
      {
        id: "klipsch-r120sw",
        title: "Klipsch R-120SW",
        lead: "A popular entry-level ported 12\" sub for a first home theatre.",
        facts: [
          { label: "Subwoofer", text: "12\" spun-copper IMG woofer, bass-reflex (ported) cabinet. 29–120 Hz (±3 dB). 200 W continuous, 400 W peak." },
          { label: "Inputs", text: "Line-level / LFE RCA jacks: one cable from the receiver's sub out." },
          { label: "Controls", text: "Gain, low-pass crossover and phase knobs on the back panel." },
        ],
      },
      {
        id: "home-theatre-layout",
        title: "Home theatre layout: 5.1 to 7.1.4",
        lead: "Where the subwoofer fits in a typical home theatre, and why bigger rooms use two.",
        facts: [
          { label: "5.1", text: "Left, centre, right at the front, two surrounds beside or just behind the seats, plus one subwoofer. The AVR sends the bass from all five speakers and the LFE to the sub." },
          { label: "7.1.4 (Dolby Atmos)", text: "Adds two rear surrounds (7) and four overhead or up-firing height speakers (.4). Still one LFE channel: the \".1\" can feed one sub or several." },
          { label: "Two subs", text: "Two subwoofers in different spots (for example front corners or front and back walls) excite the room modes differently and even out the bass across more seats. Most AVRs have two sub outputs and calibrate them together." },
        ],
      },
    ],
    points: [
      "In a home theatre the **AV receiver** does the decoding, **bass management** and **LFE**.",
      "One **RCA** from the AVR's **sub pre-out** to the sub's **LFE input**; set the sub's own low-pass to **max / bypass**.",
      "Speakers on **Small**, crossover **80 Hz**, then run **room correction** (Audyssey, Dirac, YPAO, ARC).",
      "Consumer subs use **RCA / speaker-level inputs** and **apps**, and are voiced for **impact**.",
      "**Two subs** smooth the bass across more seats than one.",
    ],
  },
];
