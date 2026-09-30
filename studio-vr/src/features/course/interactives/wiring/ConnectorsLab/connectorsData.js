// Content for "connectors-lab" (Ch.8 "Connectors, Cables, and Studio Wiring").
// Shape consumed by ../shared/WiringBriefing — families (row-1 labels) →
// categories (row-1 tabs) → connectors (row-2 tabs) → detail panel.
// `points` are the short takeaways shown in the global KeyPoints list.

export const SECTIONS = [
  {
    n: "01",
    family: "Analog",
    type: "Mic & Line",
    short: "Mic/Line",
    tone: "amber",
    items: [
      {
        id: "xlr",
        name: "XLR",
        lead: "The round, 3-pin locking connector used on almost every studio microphone.",
        body: [
          "An XLR has **three pins**: pin 1 is the ground (shield), pin 2 is **hot (+)** and pin 3 is **cold (−)**. Carrying the signal on two wires is what makes it **balanced**, so it rejects hum even over long cable runs.",
          "It **locks in place** with a small latch — press the button to pull it out. Outputs have **male** pins and inputs have **female** sockets, so the signal always flows from male to female.",
          "XLR also carries **48V phantom power** from the preamp up to condenser microphones.",
        ],
        points: [
          "Three pins: ground, hot (+) and cold (−).",
          "Balanced, so it rejects hum over long cables.",
          "Locks in place, and carries 48V phantom power to condenser mics.",
        ],
      },
      {
        id: "trs",
        name: 'TRS (¼")',
        lead: "A ¼-inch jack plug with three contacts: Tip, Ring and Sleeve.",
        body: [
          "You can spot a TRS plug by its **two black rings**, which split the metal into three parts. Those three contacts can be used in two different ways.",
          "As a **balanced mono** line (tip = hot, ring = cold, sleeve = ground) it connects interfaces to studio monitors and outboard gear. As **unbalanced stereo** (tip = left, ring = right) it drives **headphones**.",
          "A TRS socket often doubles as an XLR input — many preamps use a **combo jack** that takes either plug.",
        ],
        points: [
          "Two black rings = three contacts: Tip, Ring, Sleeve.",
          "Balanced mono for monitors and outboard gear.",
          "Unbalanced stereo for headphones.",
        ],
      },
      {
        id: "ts",
        name: 'TS (¼")',
        lead: "The classic guitar-cable plug: a ¼-inch jack with just Tip and Sleeve.",
        body: [
          "A TS plug has **one black ring**, so it only has two contacts: the **tip** carries the signal and the **sleeve** is the ground.",
          "Because it is **unbalanced**, it picks up hum more easily, so TS cables should be kept **short**.",
          "It looks almost the same as TRS — count the rings! Plugging TS into a balanced TRS input usually works, but you lose the noise protection of a balanced connection.",
        ],
        points: [
          "One black ring = two contacts: Tip and Sleeve.",
          "Unbalanced mono, used for guitars and keyboards.",
          "Keep TS cables short to avoid hum.",
        ],
      },
      {
        id: "rca",
        name: "RCA (Phono)",
        lead: "The small push-on plug found on hi-fi, DJ and consumer gear.",
        body: [
          "RCA plugs have a centre pin surrounded by a metal ring. They carry **one unbalanced channel** each, so stereo needs **two plugs**: red for the right channel and white (or black) for the left.",
          "They are common on **turntables, DJ mixers and home stereo gear**, which work at the quieter **consumer level (–10 dBV)**.",
          "An orange or black RCA socket labelled **S/PDIF** or **Coaxial** carries **digital audio**, not analog — same plug, completely different signal.",
        ],
        points: [
          "One unbalanced channel per plug.",
          "Red = right, white or black = left.",
          "An RCA socket marked S/PDIF or Coaxial carries digital audio.",
        ],
      },
      {
        id: "mini",
        name: "3.5 mm Mini-Jack",
        lead: "The small jack on phones, laptops and consumer headphones.",
        body: [
          "The mini-jack is a smaller version of the ¼-inch plug. A **TRS** mini-jack carries **stereo** to earbuds; a **TRRS** version adds a fourth contact for a headset **microphone**.",
          "In the studio you mainly see it on **consumer headphones** (with a screw-on ¼-inch adapter) and on compact synths that send **MIDI over TRS**.",
          "It is **fragile** and doesn't lock, so it isn't used for important studio connections.",
        ],
        points: [
          "A smaller version of the ¼\" jack.",
          "Used on phones, laptops and consumer headphones.",
          "Fragile and doesn't lock, so it's not used for key studio links.",
        ],
      },
    ],
  },
  {
    n: "02",
    family: "Analog",
    type: "Patching & Multicore",
    short: "Patching",
    tone: "green",
    items: [
      {
        id: "bantam",
        name: "Bantam (TT)",
        lead: "A tiny balanced jack used in professional patch bays.",
        body: [
          "Bantam, also called **TT (Tiny Telephone)**, is a slim TRS plug. It is **balanced**, like a ¼-inch TRS, but about half the size.",
          "Because it's so small, a single rack-space **patch bay** can fit **96 sockets**. Short Bantam **patch cables** let the engineer re-route any signal in seconds.",
          "Don't force a ¼-inch plug into a Bantam socket — the sizes are different and it will damage the socket.",
        ],
        points: [
          "A tiny balanced TRS plug, about half the size of ¼\".",
          "Fits 96 sockets into one rack-space patch bay.",
          "Never force a ¼\" plug into a Bantam socket.",
        ],
      },
      {
        id: "dsub",
        name: "D-Sub (DB25)",
        lead: "A 25-pin connector that carries 8 channels through a single plug.",
        body: [
          "A DB25 is a **D-shaped** connector with **25 pins** and two **screws** that hold it in place. One DB25 carries **eight balanced channels** — that saves a lot of space on the back of an interface.",
          "A **snake** or **breakout cable** splits a DB25 into eight XLR or TRS plugs at the other end.",
          "Watch out for the **wiring standard**: the **Tascam** pinout (analog, most common) and the **Yamaha** or **AES59** pinouts (digital) are not interchangeable, even though the plugs look identical.",
        ],
        points: [
          "One 25-pin plug carries 8 channels.",
          "A breakout snake splits it into 8 XLR or TRS plugs.",
          "Check the pinout: Tascam (analog) and Yamaha/AES59 (digital) don't mix.",
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
        id: "speakon",
        name: "Speakon",
        lead: "A heavy-duty twist-lock connector made for amplifier-to-speaker connections.",
        body: [
          "A **passive** speaker (one without a built-in amp) gets its power from a **power amplifier**. That signal is strong enough to be dangerous to gear, so it uses its own connector: the **Speakon**.",
          "You push it in and **twist to lock**. It has **no exposed metal** contacts and can handle **high current**, which makes it safe and reliable.",
          "Because no line or mic cable fits a Speakon socket, you **can't accidentally plug** amplifier power into a microphone input.",
        ],
        points: [
          "Connects power amps to passive speakers.",
          "Twist-lock, high current, no exposed metal.",
          "No mic or line cable fits it, so it's hard to plug in wrongly.",
        ],
      },
      {
        id: "banana",
        name: "Banana Plug",
        lead: "A single-pin plug that pushes into the speaker terminals of amps and hi-fi speakers.",
        body: [
          "A banana plug has a sprung metal pin that grips inside a **binding post** — the screw-type terminals on the back of amplifiers and passive speakers.",
          "One cable uses **two plugs**: red for **positive (+)** and black for **negative (−)**. Keep the same colours at both ends so the speakers stay **in polarity** (moving in and out together).",
          "Banana plugs are faster and tidier than **bare wire**, and they stop stray strands causing a short circuit.",
        ],
        points: [
          "Plugs into binding posts on amps and speakers.",
          "Red = positive (+), black = negative (−).",
          "Match the colours at both ends to keep speakers in polarity.",
        ],
      },
    ],
  },
  {
    n: "04",
    family: "Digital & Data",
    type: "Digital Audio",
    short: "Digital",
    tone: "blue",
    items: [
      {
        id: "aes",
        name: "AES/EBU (XLR)",
        lead: "A professional digital audio connection that uses the same XLR plug as a microphone.",
        body: [
          "**AES/EBU (AES3)** sends **two channels of digital audio** down a single cable. On the outside it uses a normal **3-pin XLR**, so it looks exactly like an analog mic connection.",
          "Inside, it needs a **110-ohm** digital cable. A mic cable might work over a short distance but can cause **clicks and dropouts** over longer runs.",
          "Always **label** AES connections — plugging digital audio into a mic preamp produces loud, harsh noise.",
        ],
        points: [
          "Two channels of digital audio on one XLR.",
          "Needs a 110-ohm digital cable.",
          "Looks like a mic cable, so always label it.",
        ],
      },
      {
        id: "optical",
        name: "Optical (TOSLINK)",
        lead: "A square plug that sends digital audio as pulses of light.",
        body: [
          "Instead of electricity, optical connectors send audio as **flashes of red light**. You can see the light glowing when a device is on.",
          "The same socket can carry **stereo S/PDIF** or **8-channel ADAT** — check the device settings to choose the format.",
          "Because there's **no electrical connection**, optical links **can't create hum**. Keep the dust caps on unused sockets and never bend the cable sharply.",
        ],
        points: [
          "Sends digital audio as pulses of light.",
          "Carries stereo S/PDIF or 8-channel ADAT.",
          "No electrical connection, so it can't cause hum.",
        ],
      },
      {
        id: "bnc",
        name: "BNC",
        lead: "A small bayonet-lock coaxial connector used mostly for word clock.",
        body: [
          "A BNC connector has a **centre pin** inside a metal shell and locks with a **quarter turn**.",
          "In the studio its main job is **word clock**: one master device sends a timing signal so all digital gear **samples at exactly the same moment**. Without it you get clicks and pops.",
          "Word clock lines often need a **75-ohm terminator** on the last device in the chain.",
        ],
        points: [
          "Bayonet coaxial plug that locks with a quarter turn.",
          "Mainly used for word clock in the studio.",
          "Word clock keeps all digital gear in time.",
        ],
      },
    ],
  },
  {
    n: "05",
    family: "Digital & Data",
    type: "Control & Computer",
    short: "Control",
    tone: "amber",
    items: [
      {
        id: "midi",
        name: "MIDI (5-pin DIN)",
        lead: "The round 5-pin connector that sends musical instructions between instruments.",
        body: [
          "MIDI doesn't carry sound. It carries **messages** such as \"play middle C, this hard, now stop\", plus knob and fader moves.",
          "Devices have **MIDI IN**, **MIDI OUT** and sometimes **THRU** ports. Always connect **OUT → IN**. One cable can carry **16 channels**, each controlling a different instrument.",
          "Many newer devices send MIDI over **USB** or through a small **3.5 mm TRS** jack with an adapter to 5-pin DIN.",
        ],
        points: [
          "Carries notes and control messages, not sound.",
          "Always connect MIDI OUT → MIDI IN.",
          "One cable carries 16 channels.",
        ],
      },
      {
        id: "usb",
        name: "USB",
        lead: "The computer connector that links audio interfaces, controllers and keyboards.",
        body: [
          "USB connects studio gear to the **computer**. The flat **USB-A** usually goes into the computer, the square **USB-B** into the device, and the reversible **USB-C** is replacing both.",
          "One USB cable can carry **many channels of audio**, **MIDI** and even **power** — small interfaces and keyboards can run from the computer alone (**bus-powered**).",
          "Many devices are **class compliant**, which means they work without installing a driver.",
        ],
        points: [
          "Connects studio gear to the computer.",
          "Carries audio, MIDI and power in one cable.",
          "Class-compliant devices work without a driver.",
        ],
      },
    ],
  },
];

// Photos are served from public/ — drop a 16:9 JPG per connector at
// public/connectors/<id>.jpg. Until a file exists the lab shows the
// connector's icon and the expected path.
export const connectorImagePath = (id) => `/connectors/${id}.jpg`;

// 24×24 stroke icon bodies (inner SVG markup), keyed by connector id — used
// in the item tabs and as the image placeholder.
const jack = (rings) =>
  '<rect x="2" y="8" width="7" height="8" rx="1.5"/><path d="M9 10.5h10a1.5 1.5 0 0 1 0 3H9z"/>' +
  rings.map((x) => `<line x1="${x}" y1="10.5" x2="${x}" y2="13.5"/>`).join("");

export const ICONS = {
  xlr:
    '<circle cx="12" cy="12" r="9"/><path d="M10.5 3.2v2h3v-2"/><circle cx="8.5" cy="10.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="10.5" r="1.3" fill="currentColor"/><circle cx="12" cy="16" r="1.3" fill="currentColor"/>',
  trs: jack([14, 17]),
  ts: jack([15.5]),
  rca: '<rect x="2" y="7" width="8" height="10" rx="1.5"/><path d="M10 8.5h5v7h-5"/><line x1="15" y1="12" x2="21" y2="12"/>',
  mini: '<rect x="3" y="9" width="6" height="6" rx="1"/><path d="M9 11h8a1 1 0 0 1 0 2H9z"/><line x1="12.5" y1="11" x2="12.5" y2="13"/><line x1="15" y1="11" x2="15" y2="13"/>',
  bantam:
    '<rect x="2" y="9.5" width="6" height="5" rx="1"/><path d="M8 11.2h12.5a0.8 0.8 0 0 1 0 1.6H8z"/><line x1="14" y1="11.2" x2="14" y2="12.8"/><line x1="17" y1="11.2" x2="17" y2="12.8"/>',
  dsub:
    '<path d="M4 8h16l-1.6 8H5.6z"/><circle cx="2" cy="12" r="1"/><circle cx="22" cy="12" r="1"/><path d="M7 10.8h10M8 13.4h8" stroke-dasharray="0.5 1.8"/>',
  speakon:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5"/>',
  banana:
    '<rect x="2" y="9" width="8" height="6" rx="1.5"/><path d="M10 12h3"/><path d="M13 10.5c3 -1 5 -1 8 1.5c-3 2.5 -5 2.5 -8 1.5z"/>',
  aes: '<circle cx="12" cy="12" r="9"/><path d="M10.5 3.2v2h3v-2"/><rect x="7.5" y="9.5" width="2" height="2"/><rect x="14.5" y="9.5" width="2" height="2"/><rect x="11" y="15" width="2" height="2"/>',
  optical:
    '<rect x="2" y="7" width="10" height="10" rx="2"/><circle cx="7" cy="12" r="1.6" fill="currentColor"/><path d="M14.5 9l6-2M14.5 12h7M14.5 15l6 2"/>',
  bnc: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/><path d="M4 12H2M22 12h-2"/>',
  midi:
    '<circle cx="12" cy="12" r="9"/><path d="M10.5 20.8v-2h3v2"/><circle cx="6.8" cy="12" r="1" fill="currentColor"/><circle cx="8.3" cy="8.3" r="1" fill="currentColor"/><circle cx="12" cy="6.8" r="1" fill="currentColor"/><circle cx="15.7" cy="8.3" r="1" fill="currentColor"/><circle cx="17.2" cy="12" r="1" fill="currentColor"/>',
  usb: '<circle cx="12" cy="20" r="2"/><path d="M12 18V3.5"/><path d="M10 6l2-2.5L14 6"/><path d="M12 15l-5-3V9"/><circle cx="7" cy="8" r="1.3"/><path d="M12 12.5l5-2.5V7.5"/><rect x="15.6" y="5" width="2.8" height="2.8"/>',
};
