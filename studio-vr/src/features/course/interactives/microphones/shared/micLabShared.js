import { COLORS, scopePalette } from "../../shared/soundLabShared";

export function micAccent(type, theme) {
  const key = Object.keys(COLORS).find((k) => COLORS[k] === type.accent);
  return key ? scopePalette(theme).colors[key] : type.accent;
}

export const SOURCES = [
  { id: "vocal", label: "Vocal" },
  { id: "acoustic", label: "Acoustic Gtr" },
  { id: "drum", label: "Drum Overhead" },
  { id: "amp", label: "Guitar Amp" },
];

export function micAudioPath(typeId, sourceId) {
  return `/audio/mic-types/${typeId}-${sourceId}.mp3`;
}

export function polarAudioPath(pattern, angleDeg, sourceId) {
  return `/audio/mic-types/polar-${pattern}-${angleDeg}-${sourceId}.mp3`;
}

export const MIC_TYPES = [
  {
    id: "dynamic",
    points: [
      "A moving coil in a magnet makes the signal, with no power needed.",
      "Tough and handles very loud sources.",
      "Great for live vocals, guitar amps and drums.",
    ],
    label: "Dynamic",
    shape: "dynamic",
    accent: COLORS.amber,
    paragraphs: [
      "A dynamic capsule works like a tiny loudspeaker running in reverse: sound pressure moves a diaphragm, the diaphragm drags a coil of wire through a magnetic field, and that movement induces a small voltage directly — no electronics, no external power.",
      "There's more mass in a moving coil than in a condenser's featherlight diaphragm, so a dynamic can't track the fastest transients quite as accurately — but that same mass makes it nearly indestructible and unbothered by high sound pressure levels.",
    ],
    bestFor: ["Live vocals", "Guitar cabs", "Snare / kick", "Loud, close sources"],
  },
  {
    id: "condenser-fet",
    points: [
      "A charged diaphragm next to a backplate, powered by 48V phantom.",
      "Very detailed, with fast transients and clear highs.",
      "Picks up room noise, so it's best used in a treated room.",
    ],
    label: "Condenser (FET)",
    shape: "condenser",
    accent: COLORS.green,
    paragraphs: [
      "A condenser capsule is a capacitor: a charged diaphragm sits a hair's width from a fixed metal backplate, and sound pressure changes the gap between them, generating a tiny signal. A built-in field-effect transistor (FET) buffers that signal right at the capsule — which is why condensers need 48V phantom power to charge the capsule and run that electronics.",
      "The diaphragm is thousands of times lighter than a dynamic's coil assembly, so it tracks air pressure far more accurately — faster transients, more high-frequency extension, more low-level detail. That sensitivity also means FET condensers pick up handling noise and room noise more readily, so they usually live on a shockmount in a treated room.",
    ],
    bestFor: ["Studio vocals", "Acoustic instruments", "Overheads", "Voiceover"],
  },
  {
    id: "condenser-tube",
    points: [
      "Same capsule as a FET condenser, buffered by a vacuum tube.",
      "Needs its own power supply, not phantom power.",
      "Adds a warm, rich character.",
    ],
    label: "Condenser (Tube)",
    shape: "tube",
    accent: COLORS.amber,
    paragraphs: [
      "A tube condenser uses the same capacitor capsule as a FET condenser — the difference is entirely in what buffers the signal. A small vacuum tube replaces the FET, so the mic needs its own dedicated power supply (a proprietary multi-pin cable, not standard 48V phantom) to heat the tube's filament and run its plate voltage.",
      'Tubes distort more gracefully than solid-state electronics — mostly even-order harmonics the ear reads as "warm" or "rich" rather than harsh. That subtle coloration, plus hand-built tube electronics, is why tube condensers sit at the premium end of most mic lockers.',
    ],
    bestFor: ["Premium lead vocals", "Characterful acoustic sources", "Mastering-grade capture"],
  },
  {
    id: "ribbon",
    points: [
      "A thin metal ribbon vibrates in a magnetic field.",
      "Natural figure-8 pattern and a smooth top end.",
      "Fragile: protect it from wind, plosives and old-style phantom power.",
    ],
    label: "Ribbon",
    shape: "ribbon",
    accent: COLORS.green,
    paragraphs: [
      "A ribbon mic suspends an extremely thin, corrugated strip of aluminum foil between the poles of a strong magnet. Air flowing past the ribbon makes it vibrate directly in that field, with essentially no diaphragm mass to slow it down — a design that naturally produces a figure-8 (bidirectional) pattern: equally open front and back, dead on the sides.",
      "The classic ribbon sound is a smooth, naturally rolled-off top end and an effortlessly accurate transient response — many engineers reach for a ribbon specifically to tame a harsh amp or bright brass section. That same delicate foil is the trade-off: a strong gust of air, a close plosive, or stray phantom power on an older passive design can stretch or tear it outright.",
    ],
    bestFor: ["Brass & strings", "Taming harsh amps", "Figure-8 duo capture"],
  },
  {
    id: "contact",
    points: [
      "Senses vibration through the surface, not the air.",
      "Almost deaf to room noise and bleed.",
      "The tone can be thin, so it often needs a DI or dedicated preamp.",
    ],
    label: "Contact Mic",
    shape: "contact",
    accent: COLORS.amber,
    paragraphs: [
      "Every type above senses sound traveling through air. A contact mic (usually a piezoelectric transducer) doesn't listen to air at all — it's taped, clamped, or stuck directly to a vibrating surface and senses structure-borne vibration straight through that contact, which makes it almost deaf to airborne room noise and bleed.",
      "The trade-off is tone: a piezo element has a naturally uneven, often thin or slightly harsh frequency response compared to a well-designed air mic, and its high output impedance usually needs a DI box or dedicated preamp to sound its best. What you trade for that coloration is near-total isolation from a noisy room.",
    ],
    bestFor: ["Noisy environments", "Foley / sound design", "Instrument body resonance"],
    extraHint:
      "Vocal/amp/overhead clips here are illustrative — a contact mic is normally clamped to the instrument body itself rather than aimed at a source from a distance.",
  },
];

export const POLAR_PATTERNS = {
  omni: {
    label: "Omnidirectional",
    points: [
      "Picks up equally from every direction.",
      "No proximity effect; the most natural sound.",
      "Great for capturing the room.",
    ],
    gain: () => 1,
    blurb:
      "Picks up equally from every direction. No proximity effect and the most natural, uncolored response of any pattern — used for room ambience, some vocal booths, and boundary-mounted placements.",
  },
  cardioid: {
    label: "Cardioid",
    points: [
      "Most sensitive at the front, rejects the back.",
      "The all-purpose default pattern.",
      "Good at avoiding feedback on stage.",
    ],
    gain: (deg) => (1 + Math.cos((deg * Math.PI) / 180)) / 2,
    blurb:
      "Heart-shaped: most sensitive to the front, rejects the rear, picks up some sound from the sides. The all-purpose default — good gain-before-feedback and strong isolation from what's behind the mic.",
  },
  bidirectional: {
    label: "Figure-8",
    points: [
      "Picks up front and back equally, rejects the sides.",
      "The rear lobe is phase-inverted.",
      "Native to ribbon mics and used in stereo pairs.",
    ],
    gain: (deg) => Math.abs(Math.cos((deg * Math.PI) / 180)),
    blurb:
      "Captures front and rear equally — the rear lobe is phase-inverted — and rejects the sides almost completely. The native pattern of most ribbon mics, and the shape behind X/Y and Blumlein stereo pairs.",
  },
};

export const POLAR_POSITIONS = [
  { angle: 0, name: "Front" },
  { angle: 45, name: "Front-Right" },
  { angle: 90, name: "Right" },
  { angle: 135, name: "Back-Right" },
  { angle: 180, name: "Back" },
  { angle: 225, name: "Back-Left" },
  { angle: 270, name: "Left" },
  { angle: 315, name: "Front-Left" },
];

export function polarGainOf(pattern, deg) {
  return POLAR_PATTERNS[pattern].gain(deg);
}

export function polarDbOf(gain) {
  return 20 * Math.log10(Math.max(gain, 0.001));
}

export function polarTierOf(db) {
  if (db >= -3) return { tier: "full", label: "Full pickup" };
  if (db >= -9) return { tier: "partial", label: "Partial pickup" };
  if (db >= -18) return { tier: "heavy", label: "Heavily attenuated" };
  return { tier: "null", label: "Rejected / null" };
}
