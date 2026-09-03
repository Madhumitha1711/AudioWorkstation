// Shared data for the "Microphones: Types, Characteristics & Selection"
// chapter's interactive labs (MicTypeLab, MicPolarPatternLab,
// MicSelectionLab) — ported from
// design/mic-types-chapter.html (chapter 6, courseData.js TOPICS[id=
// "mic-stand"], module "capture-signal-path"). Factored out because the
// Type lab needs the same five-transducer data set, and the Polar
// Pattern lab needs the same pattern/position math the mockup used for
// its lobe plot and dB readout.
//
// AUDIO — every "listen" panel below plays a short clip through a native
// <audio> element at a fixed path under /public/audio/mic-types/. Real
// recordings haven't been captured yet, so every path here is a
// placeholder (same convention as the mockup's own AUDIO_FILES comment) —
// drop matching files under public/audio/mic-types/ and playback starts
// working immediately, no code changes required. Each lab shows a small
// "clip pending" note whenever a path 404s instead of failing silently.

import { COLORS } from "./soundLabShared";

export const CYAN = "#54d6e0"; // polar-pattern lobe accent; not part of soundLabShared's COLORS since only this lab uses it

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

// Five transducer families (the brief's dynamic/condenser/ribbon split,
// expanded the same way the mockup expanded it: FET vs. tube condensers
// behave differently enough — power supply, warm-up, price, character — to
// teach separately, and a contact/piezo mic is the one family with no
// air-pressure capsule at all).
export const MIC_TYPES = [
  {
    id: "dynamic",
    label: "Dynamic",
    icon: "🎙️",
    shape: "dynamic",
    accent: COLORS.amber,
    paragraphs: [
      "A dynamic capsule works like a tiny loudspeaker running in reverse: sound pressure moves a diaphragm, the diaphragm drags a coil of wire through a magnetic field, and that movement induces a small voltage directly — no electronics, no external power.",
      "There's more mass in a moving coil than in a condenser's featherlight diaphragm, so a dynamic can't track the fastest transients quite as accurately — but that same mass makes it nearly indestructible and unbothered by high sound pressure levels.",
    ],
    specs: [
      ["Transducer", "Moving-coil"],
      ["Power", "None needed"],
      ["Max SPL", "Very high"],
      ["Durability", "Excellent"],
    ],
    bestFor: ["Live vocals", "Guitar cabs", "Snare / kick", "Loud, close sources"],
    charBars: [
      ["Sensitivity", 35, "2/5"],
      ["Transient detail", 40, "2/5"],
      ["Handling noise rej.", 90, "5/5"],
      ["Max SPL headroom", 95, "5/5"],
    ],
  },
  {
    id: "condenser-fet",
    label: "Condenser (FET)",
    icon: "⚡",
    shape: "condenser",
    accent: COLORS.green,
    paragraphs: [
      "A condenser capsule is a capacitor: a charged diaphragm sits a hair's width from a fixed metal backplate, and sound pressure changes the gap between them, generating a tiny signal. A built-in field-effect transistor (FET) buffers that signal right at the capsule — which is why condensers need 48V phantom power to charge the capsule and run that electronics.",
      "The diaphragm is thousands of times lighter than a dynamic's coil assembly, so it tracks air pressure far more accurately — faster transients, more high-frequency extension, more low-level detail. That sensitivity also means FET condensers pick up handling noise and room noise more readily, so they usually live on a shockmount in a treated room.",
    ],
    specs: [
      ["Transducer", "Capacitor + FET"],
      ["Power", "48V phantom"],
      ["Max SPL", "Moderate–High"],
      ["Durability", "Handle with care"],
    ],
    bestFor: ["Studio vocals", "Acoustic instruments", "Overheads", "Voiceover"],
    charBars: [
      ["Sensitivity", 90, "5/5"],
      ["Transient detail", 95, "5/5"],
      ["Handling noise rej.", 30, "2/5"],
      ["Max SPL headroom", 55, "3/5"],
    ],
  },
  {
    id: "condenser-tube",
    label: "Condenser (Tube)",
    icon: "🔥",
    shape: "tube",
    accent: COLORS.amber,
    paragraphs: [
      "A tube condenser uses the same capacitor capsule as a FET condenser — the difference is entirely in what buffers the signal. A small vacuum tube replaces the FET, so the mic needs its own dedicated power supply (a proprietary multi-pin cable, not standard 48V phantom) to heat the tube's filament and run its plate voltage.",
      'Tubes distort more gracefully than solid-state electronics — mostly even-order harmonics the ear reads as "warm" or "rich" rather than harsh. That subtle coloration, plus hand-built tube electronics, is why tube condensers sit at the premium end of most mic lockers.',
    ],
    specs: [
      ["Transducer", "Capacitor + Tube"],
      ["Power", "External PSU"],
      ["Character", "Warm saturation"],
      ["Durability", "Fragile, needs warm-up"],
    ],
    bestFor: ["Premium lead vocals", "Characterful acoustic sources", "Mastering-grade capture"],
    charBars: [
      ["Sensitivity", 85, "4/5"],
      ["Harmonic warmth", 95, "5/5"],
      ["Handling noise rej.", 30, "2/5"],
      ["Max SPL headroom", 50, "3/5"],
    ],
  },
  {
    id: "ribbon",
    label: "Ribbon",
    icon: "🎗️",
    shape: "ribbon",
    accent: COLORS.green,
    paragraphs: [
      "A ribbon mic suspends an extremely thin, corrugated strip of aluminum foil between the poles of a strong magnet. Air flowing past the ribbon makes it vibrate directly in that field, with essentially no diaphragm mass to slow it down — a design that naturally produces a figure-8 (bidirectional) pattern: equally open front and back, dead on the sides.",
      "The classic ribbon sound is a smooth, naturally rolled-off top end and an effortlessly accurate transient response — many engineers reach for a ribbon specifically to tame a harsh amp or bright brass section. That same delicate foil is the trade-off: a strong gust of air, a close plosive, or stray phantom power on an older passive design can stretch or tear it outright.",
    ],
    specs: [
      ["Transducer", "Ribbon in magnet"],
      ["Power", "None (passive) / 48V (active)"],
      ["Pattern", "Figure-8"],
      ["Durability", "Fragile"],
    ],
    bestFor: ["Brass & strings", "Taming harsh amps", "Figure-8 duo capture"],
    charBars: [
      ["Sensitivity", 60, "3/5"],
      ["High-freq. smoothness", 95, "5/5"],
      ["Handling noise rej.", 55, "3/5"],
      ["Max SPL headroom", 65, "3/5"],
    ],
  },
  {
    id: "contact",
    label: "Contact Mic",
    icon: "📟",
    shape: "contact",
    accent: COLORS.amber,
    paragraphs: [
      "Every type above senses sound traveling through air. A contact mic (usually a piezoelectric transducer) doesn't listen to air at all — it's taped, clamped, or stuck directly to a vibrating surface and senses structure-borne vibration straight through that contact, which makes it almost deaf to airborne room noise and bleed.",
      "The trade-off is tone: a piezo element has a naturally uneven, often thin or slightly harsh frequency response compared to a well-designed air mic, and its high output impedance usually needs a DI box or dedicated preamp to sound its best. What you trade for that coloration is near-total isolation from a noisy room.",
    ],
    specs: [
      ["Transducer", "Piezoelectric"],
      ["Senses", "Structure-borne vibration"],
      ["Isolation", "Excellent"],
      ["Tone", "Colored, needs DI/preamp"],
    ],
    bestFor: ["Noisy environments", "Foley / sound design", "Instrument body resonance"],
    charBars: [
      ["Ambient noise rejection", 98, "5/5"],
      ["Tonal accuracy", 35, "2/5"],
      ["Handling noise rej.", 20, "1/5"],
      ["Setup simplicity", 60, "3/5"],
    ],
    extraHint:
      "Vocal/amp/overhead clips here are illustrative — a contact mic is normally clamped to the instrument body itself rather than aimed at a source from a distance.",
  },
];

export function micTypeById(id) {
  return MIC_TYPES.find((t) => t.id === id) ?? MIC_TYPES[0];
}

// Polar patterns — gain(deg) follows the textbook polar equation for each
// pattern (deg measured clockwise from on-axis/front), same as the
// mockup, so the plotted lobe and the dB readout come from the same
// formula instead of a hand-drawn approximation.
export const POLAR_PATTERNS = {
  omni: {
    label: "Omnidirectional",
    gain: () => 1,
    blurb:
      "Picks up equally from every direction. No proximity effect and the most natural, uncolored response of any pattern — used for room ambience, some vocal booths, and boundary-mounted placements.",
  },
  cardioid: {
    label: "Cardioid",
    gain: (deg) => (1 + Math.cos((deg * Math.PI) / 180)) / 2,
    blurb:
      "Heart-shaped: most sensitive to the front, rejects the rear, picks up some sound from the sides. The all-purpose default — good gain-before-feedback and strong isolation from what's behind the mic.",
  },
  bidirectional: {
    label: "Figure-8",
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

// Lobe outline plotted from the same gain formula as the dB readout (not
// hand-drawn) by sampling r(deg) all the way around and connecting the
// points — gives cardioid its true cusp at 180° and figure-8 its pinched,
// fully-round lobes at 90°/270°, matching a textbook polar plot.
export function polarLobePoints(pattern, cx, cy, maxR, steps = 96) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const deg = (i * 360) / steps;
    const r = maxR * Math.max(0, polarGainOf(pattern, deg));
    const rad = (deg * Math.PI) / 180;
    pts.push([(cx + r * Math.sin(rad)).toFixed(1), (cy - r * Math.cos(rad)).toFixed(1)]);
  }
  return pts;
}

// Selection scenarios — which type(s)/pattern most engineers reach for
// first on a given source, and why.
export const MIC_SCENARIOS = [
  {
    id: "lead-vocal",
    title: "Lead Vocal (studio)",
    icon: "🎤",
    recs: ["Condenser (FET/Tube)", "Cardioid"],
    why: "A vocal has huge dynamic range and fine detail — breath, sibilance, vibrato — that only a sensitive, low-mass diaphragm captures fully. In a treated room, the condenser's extra handling and room sensitivity stops being a liability.",
  },
  {
    id: "live-vocal",
    title: "Live Vocal (stage)",
    icon: "🔊",
    recs: ["Dynamic", "Cardioid"],
    why: "On a loud stage, durability and rejection matter more than a few dB of extra detail — a dynamic shrugs off handling, monitor spill, and high SPL, and its tighter pattern buys more gain before feedback.",
  },
  {
    id: "guitar-amp",
    title: "Loud Guitar Amp",
    icon: "🎸",
    recs: ["Dynamic", "Ribbon"],
    why: "A cranked amp is loud and harsh up close — a dynamic handles the SPL without strain, while a ribbon's natural top-end roll-off can smooth out fizzy distortion without extra EQ.",
  },
  {
    id: "acoustic-guitar",
    title: "Acoustic Guitar",
    icon: "🪕",
    recs: ["Small-diaphragm Condenser", "Cardioid/Omni"],
    why: "Acoustic instruments live and die on transient detail and even frequency response — exactly what a light, fast condenser diaphragm is built for.",
  },
  {
    id: "drum-overheads",
    title: "Drum Overheads",
    icon: "🥁",
    recs: ["Matched Condenser Pair", "Cardioid/Omni"],
    why: "Overheads need to capture the whole kit's balance and shimmer accurately across a wide stereo image — a matched condenser pair keeps both channels tonally identical.",
  },
  {
    id: "podcast",
    title: "Podcast / Voiceover",
    icon: "🎧",
    recs: ["Dynamic or Condenser", "Cardioid"],
    why: "In an untreated room, a dynamic's tighter pattern and lower room sensitivity often sounds cleaner than a condenser; in a treated booth, a condenser's extra detail wins.",
  },
  {
    id: "noisy-field",
    title: "Noisy Environment / Field",
    icon: "🏗️",
    recs: ["Contact Mic", "Tight Cardioid"],
    why: "When ambient noise can't be controlled, sensing vibration through the source itself (contact mic) beats fighting the room through the air with any air mic.",
  },
  {
    id: "body-resonance",
    title: "Instrument Body / Resonance",
    icon: "📟",
    recs: ["Contact Mic"],
    why: "Clamped directly to a soundboard, cajon shell, or body panel, a contact mic captures resonance no air mic pointed at the same spot ever could.",
  },
];
