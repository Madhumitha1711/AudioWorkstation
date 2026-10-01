// Content for "cable-match-lab" (Ch.8 "Connectors, Cables, and Studio
// Wiring") — ported from design/cable-connector-sound-quiz.html.
//
// `correct` lists every socket that is a right answer (the first one is the
// one "Show me" highlights). Connectors are reusable: XLR takes mic AND AES,
// RCA takes unbalanced line AND S/PDIF coax. `fact` / `hint` / MISTAKES are
// authored HTML (only <strong>/<em>) rendered with dangerouslySetInnerHTML.
// `ch` is the short label under the cable's status light.

export const CABLES = [
  { id: "mic", name: "Microphone cable", use: "Vocal mic → preamp", ch: "MIC", correct: ["xlr"],
    fact: "<strong>XLR</strong>, 3-pin, locking and balanced. A mic puts out a tiny signal, so the balanced pair cancels hum over long runs, and the latch stops it being pulled out mid-take.",
    hint: "A mic signal is tiny and often runs a long way. Look for a <strong>locking, 3-pin, balanced</strong> connector." },
  { id: "instrument", name: "Instrument cable", use: "Guitar → DI box / amp", ch: "INST", correct: ["ts"],
    fact: "<strong>¼\" TS</strong> (tip-sleeve). A guitar pickup is unbalanced: one conductor plus the shield. Keep the run short, under about 6 m, because unbalanced cable picks up noise.",
    hint: "A pickup puts out a single unbalanced signal. You need a ¼\" plug with <strong>one</strong> insulating band, not two." },
  { id: "balLine", name: "Balanced line-level cable", use: "Synth line out → interface", ch: "BAL", correct: ["trs", "xlr"],
    fact: "<strong>¼\" TRS</strong>: tip = hot, ring = cold, sleeve = shield. It's the standard for balanced line-level gear, and XLR carries balanced line level too.",
    hint: "Balanced means two signal conductors plus a shield. That's three contacts on a <strong>¼\" plug</strong>." },
  { id: "unbalLine", name: "Unbalanced line-level cable", use: "Keyboard / phone → mixer", ch: "UNBAL", correct: ["rca", "ts"],
    fact: "<strong>RCA</strong> (phono), the single-pin plug on consumer and semi-pro gear. A ¼\" TS carries unbalanced line level too.",
    hint: "Consumer gear sends unbalanced line level on a <strong>single-pin phono</strong> plug." },
  { id: "speaker", name: "Speaker cable", use: "Bass amp → speaker cab", ch: "SPKR", correct: ["speakon", "banana"],
    fact: "<strong>Speakon</strong>: twist-lock, heavy contacts, built for amplifier <em>current</em> rather than a delicate signal. Banana plugs into binding posts work too.",
    hint: "This carries amplifier power. It needs thick conductors and a connector rated for current, and it doesn't need shielding." },
  { id: "digital", name: "Digital audio cable", use: "Drum machine → computer", ch: "USB", correct: ["usb"],
    fact: "<strong>USB</strong>. Audio travels as data packets between a device and a computer. It's the same plug family as your keyboard or drive.",
    hint: "It's plain computer data, so think of the plug a printer or audio interface uses to reach your laptop." },
  { id: "midi", name: "MIDI cable", use: "Controller → synth module", ch: "MIDI", correct: ["din"],
    fact: "<strong>5-pin DIN</strong>. MIDI never carries sound. It sends <em>instructions</em> like note on/off, velocity and CC, and the synth turns them into audio.",
    hint: "MIDI carries notes, not audio. It uses a round connector with <strong>five</strong> pins in an arc." },
  { id: "coax", name: "Coaxial cable (digital)", use: "CD / sampler S/PDIF → interface", ch: "COAX", correct: ["rca", "bnc"],
    fact: "<strong>RCA</strong>, but on 75 Ω coax. That's S/PDIF: the same plug as analog line, carrying two channels of digital audio. BNC is the locking pro version.",
    hint: "The plug looks exactly like an analog consumer plug, but the cable inside is <strong>75 Ω coax</strong>." },
  { id: "aes", name: "AES cable (AES3 / AES/EBU)", use: "Digital console → converter", ch: "AES", correct: ["xlr"],
    fact: "<strong>XLR</strong>, on 110 Ω twisted pair. AES3 is pro balanced digital audio in the same shell as a mic cable, carrying a completely different signal.",
    hint: "Pro digital audio borrowed the <strong>mic connector's shell</strong>. Only the cable impedance, 110 Ω, is different." },
  { id: "adat", name: "ADAT optical (lightpipe)", use: "8-ch preamp → interface", ch: "ADAT", correct: ["toslink"],
    fact: "<strong>TOSLINK</strong>. It carries up to 8 channels of digital audio as pulses of light in a plastic fibre, with no metal contacts at all.",
    hint: "There are no metal pins. The signal travels as <strong>light</strong>." },
];

export const PORTS = [
  { id: "xlr", name: "XLR", sub: "3-pin · locking · balanced" },
  { id: "toslink", name: "TOSLINK", sub: "optical · light" },
  { id: "ts", name: "¼\" TS", sub: "tip-sleeve · unbalanced" },
  { id: "speakon", name: "Speakon", sub: "twist-lock · high current" },
  { id: "rca", name: "RCA", sub: "phono · single pin" },
  { id: "din", name: "5-pin DIN", sub: "MIDI · data only" },
  { id: "trs", name: "¼\" TRS", sub: "tip-ring-sleeve · balanced" },
  { id: "bnc", name: "BNC", sub: "bayonet · 75 Ω" },
  { id: "usb", name: "USB", sub: "type-B / C · data" },
  { id: "banana", name: "Banana", sub: "binding post · amp out" },
];

/* Specific mistake messages ("cable>port") override the cable's generic hint. */
export const MISTAKES = {
  "speaker>ts": "That's an <strong>instrument</strong> cable connection. Its thin, shielded conductors can't handle amplifier current, so they overheat and can damage the amp. Speakers need heavy-gauge cable.",
  "speaker>trs": "A ¼\" jack for a speaker? Some old amps used one, but a ¼\" plug can short the amp output while you're inserting it. Use a connector made for current.",
  "speaker>xlr": "An XLR carries signal, not power. Speaker cable needs a connector rated for amplifier current.",
  "instrument>trs": "TRS is balanced (tip + ring + sleeve). A guitar pickup only has one signal conductor, so it needs the simpler ¼\" plug.",
  "mic>trs": "It's balanced, so you're close. But mics standardise on the <strong>locking</strong> 3-pin connector so they can't be yanked out.",
  "midi>usb": "USB-MIDI exists, but the classic <strong>MIDI cable</strong> uses its own round connector.",
  "adat>rca": "That's coaxial S/PDIF, which carries 2 channels on copper. ADAT carries 8 channels on light.",
  "coax>toslink": "TOSLINK can carry S/PDIF too, but as light. This cable is <strong>coaxial</strong> copper.",
  "aes>rca": "RCA is the consumer digital version (S/PDIF). AES3 is the pro, balanced one.",
  "digital>toslink": "Close. That's digital, but optical. This one connects to a <strong>computer</strong>.",
};

/* Socket-face glyphs (viewBox 0 0 40 40), themed via the --cml-well-*
   vars in CableMatchLab.css. <text> picks up var(--font-sans) from CableMatchLab.css. */
const dinPins = [-90, -135, -45, 180, 0]
  .map((a) => {
    const r = (a * Math.PI) / 180;
    return `<circle cx="${(20 + 7.5 * Math.cos(r)).toFixed(1)}" cy="${(19 + 7.5 * Math.sin(r)).toFixed(1)}" r="1.7" style="fill:var(--cml-well-hole)" stroke="currentColor" stroke-width=".9"/>`;
  })
  .join("");

export const GLYPH = {
  xlr: `<circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="20" r="11.5" style="fill:var(--cml-well-face)"/><rect x="17.5" y="3.5" width="5" height="4" rx="1" fill="currentColor"/><circle cx="14.5" cy="17" r="2.4" style="fill:var(--cml-well-hole)" stroke="currentColor" stroke-width="1"/><circle cx="25.5" cy="17" r="2.4" style="fill:var(--cml-well-hole)" stroke="currentColor" stroke-width="1"/><circle cx="20" cy="26" r="2.4" style="fill:var(--cml-well-hole)" stroke="currentColor" stroke-width="1"/>`,
  trs: `<path d="M3 17h14v6H3z" fill="currentColor" opacity=".75"/><path d="M17 17h2v6h-2z" style="fill:var(--cml-well-hole)"/><path d="M19 17h7v6h-7z" fill="currentColor"/><path d="M26 17h2v6h-2z" style="fill:var(--cml-well-hole)"/><path d="M28 17h5l3 3-3 3h-5z" fill="currentColor"/><text x="20" y="33" text-anchor="middle" font-size="6" fill="currentColor" opacity=".7">S  R  T</text>`,
  ts: `<path d="M3 17h19v6H3z" fill="currentColor" opacity=".75"/><path d="M22 17h2v6h-2z" style="fill:var(--cml-well-hole)"/><path d="M24 17h8l3 3-3 3h-8z" fill="currentColor"/><text x="20" y="33" text-anchor="middle" font-size="6" fill="currentColor" opacity=".7">S    T</text>`,
  rca: `<circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="20" cy="20" r="7.5" style="fill:var(--cml-well-face)" stroke="currentColor" stroke-width="1"/><circle cx="20" cy="20" r="2.4" style="fill:var(--cml-well-hole)" stroke="currentColor" stroke-width="1.2"/>`,
  speakon: `<circle cx="20" cy="20" r="15" style="fill:var(--cml-well-face)" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="20" r="6" style="fill:var(--cml-well-hole)" stroke="currentColor" stroke-width="1.2"/><path d="M20 5v4M20 31v4M5 20h4" style="stroke:var(--cml-well-hole)" stroke-width="3"/><path d="M28 9.5a13 13 0 0 1 4.5 7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M33.5 13l-1 4-3.3-2.3" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  banana: `<circle cx="13" cy="20" r="8" fill="#b83a3a" stroke="currentColor" stroke-width="1"/><circle cx="13" cy="20" r="2.4" style="fill:var(--cml-well-hole)"/><circle cx="29" cy="20" r="8" style="fill:var(--cml-well-face)" stroke="currentColor" stroke-width="1"/><circle cx="29" cy="20" r="2.4" style="fill:var(--cml-well-hole)"/>`,
  usb: `<path d="M11 13h18v10l-4 5H15l-4-5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M15 17h10v6l-2 2h-6l-2-2z" fill="currentColor" opacity=".8"/>`,
  din: `<circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="20" r="12" style="fill:var(--cml-well-face)"/><rect x="18" y="31" width="4" height="4" fill="currentColor"/>${dinPins}`,
  bnc: `<circle cx="20" cy="20" r="11" style="fill:var(--cml-well-face)" stroke="currentColor" stroke-width="2.4"/><rect x="5" y="18" width="5" height="4" rx="1" fill="currentColor"/><rect x="30" y="18" width="5" height="4" rx="1" fill="currentColor"/><circle cx="20" cy="20" r="5.5" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="20" cy="20" r="1.6" style="fill:var(--cml-well-hole)" stroke="currentColor" stroke-width="1"/>`,
  toslink: `<path d="M10 12h20v12l-4 4H14l-4-4z" style="fill:var(--cml-well-face)" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="20" cy="20" r="2.8" fill="#ff4a4a"/><circle cx="20" cy="20" r="5.5" fill="#ff4a4a" opacity=".22"/>`,
};
