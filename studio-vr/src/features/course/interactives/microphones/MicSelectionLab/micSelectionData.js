// Data + scoring for MicSelectionLab ("Pick the mic for the job") — ported
// from design/mic-selection-lab.html. The five mic families are the same
// ids as MIC_TYPES in ../shared/micLabShared.js (labels/portraits come from
// there); this file only adds what selection needs: per-family attributes,
// per-source fit, reason copy and the scoring function.
//
// SCORING — score = source fit + loudness term + room term + goal term.
// Every term is (attribute − 3) × weight, attributes 1–5 per family (ATTR),
// and terms are kept per factor so the UI can explain *why* a mic won
// ("Why this mic") and what sank the others ("Why not the others").
// Source fit 0 = not practical (e.g. a contact mic on a vocal) → forced to
// the bottom of the ranking with a "not practical" reason.

/** Level handling, detail, room rejection, durability, warmth, smooth top, isolation, punch (1–5). */
export const ATTR = {
  dynamic: { spl: 5, detail: 2, room: 4, durable: 5, warmth: 3, smooth: 3, iso: 3, punch: 5 },
  "condenser-fet": { spl: 3, detail: 5, room: 1, durable: 2, warmth: 2, smooth: 2, iso: 2, punch: 2 },
  "condenser-tube": { spl: 3, detail: 4, room: 1, durable: 1, warmth: 5, smooth: 4, iso: 2, punch: 3 },
  ribbon: { spl: 3, detail: 4, room: 1, durable: 1, warmth: 4, smooth: 5, iso: 1, punch: 3 },
  contact: { spl: 5, detail: 1, room: 5, durable: 4, warmth: 1, smooth: 1, iso: 5, punch: 2 },
};

/** Spec chips + well-known models shown on the "Best pick" card. */
export const MIC_INFO = {
  dynamic: {
    sub: "Moving-coil · usually cardioid",
    specs: [["Power", "none"], ["Max SPL", "very high"], ["Pattern", "cardioid / super"], ["Build", "rugged"]],
    examples: "Shure SM57 / SM7B, Electro-Voice RE20, Sennheiser MD 421",
  },
  "condenser-fet": {
    sub: "Capacitor capsule · 48 V phantom",
    specs: [["Power", "48 V phantom"], ["Max SPL", "moderate–high"], ["Pattern", "cardioid / multi"], ["Build", "handle with care"]],
    examples: "Neumann U 87 Ai, AKG C414 (large-diaphragm); Neumann KM 184, Rode NT5 (small-diaphragm)",
  },
  "condenser-tube": {
    sub: "Capacitor capsule · tube + own PSU",
    specs: [["Power", "external PSU"], ["Warm-up", "~10–15 min"], ["Pattern", "cardioid / multi"], ["Build", "fragile"]],
    examples: "Neumann U 47, AKG C12, Telefunken ELA M 251 (and their modern reissues)",
  },
  ribbon: {
    sub: "Aluminium ribbon · figure-8",
    specs: [["Power", "none (passive)"], ["Pattern", "figure-8"], ["Top end", "smooth roll-off"], ["Build", "fragile ribbon"]],
    examples: "Royer R-121, Coles 4038, AEA R84",
  },
  contact: {
    sub: "Piezo · senses vibration, not air",
    specs: [["Power", "needs DI / preamp"], ["Isolation", "near total"], ["Tone", "coloured"], ["Build", "tough"]],
    examples: "Piezo pickups and clip-on contact transducers",
  },
};

/** Sources: fit 0–5 per mic (0 = not practical), default loudness, one-line note per mic. */
export const SEL_SOURCES = [
  {
    id: "lead-vocal", label: "Lead vocal", level: "medium",
    fit: { dynamic: 3, "condenser-fet": 5, "condenser-tube": 5, ribbon: 3, contact: 0 },
    note: {
      dynamic: "Forgiving on a loud or untrained singer and hides mouth noise.",
      "condenser-fet": "Captures every breath, consonant and vibrato — the modern studio vocal sound.",
      "condenser-tube": "The classic flattering vocal mic: detail plus a warm, silky top end.",
      ribbon: "Smooths sibilance and harsh top end on a bright voice.",
    },
  },
  {
    id: "podcast", label: "Podcast / voiceover", level: "quiet",
    fit: { dynamic: 5, "condenser-fet": 4, "condenser-tube": 3, ribbon: 2, contact: 0 },
    note: {
      dynamic: "Close-talk broadcast sound with a full low end and little room.",
      "condenser-fet": "Clear, crisp voice with lots of detail — if the room is quiet.",
      "condenser-tube": "Rich, warm “announcer” voice in a treated booth.",
      ribbon: "Dark, vintage radio tone.",
    },
  },
  {
    id: "acoustic", label: "Acoustic guitar", level: "quiet",
    fit: { dynamic: 2, "condenser-fet": 5, "condenser-tube": 3, ribbon: 4, contact: 2 },
    note: {
      dynamic: "Usable, but the string shimmer and pick detail get dulled.",
      "condenser-fet": "A small-diaphragm pencil condenser catches pick attack and string shimmer accurately.",
      "condenser-tube": "Big, warm solo guitar tone.",
      ribbon: "Warm, natural body without harsh string squeak.",
      contact: "Captures the body’s resonance directly, with no spill.",
    },
  },
  {
    id: "guitar-amp", label: "Electric guitar amp", level: "loud",
    fit: { dynamic: 5, "condenser-fet": 2, "condenser-tube": 1, ribbon: 5, contact: 0 },
    note: {
      dynamic: "The studio standard on a speaker cone: handles the level and gives a punchy midrange.",
      "condenser-fet": "Works from a distance for room tone, but is easily overloaded up close.",
      "condenser-tube": "Rarely used close on a loud cab.",
      ribbon: "Its natural high-frequency roll-off tames fizzy distortion without EQ.",
    },
  },
  {
    id: "kick-snare", label: "Kick / snare", level: "very-loud",
    fit: { dynamic: 5, "condenser-fet": 3, "condenser-tube": 0, ribbon: 1, contact: 2 },
    note: {
      dynamic: "Built for close, hard-hitting drums — no distortion, no damage.",
      "condenser-fet": "Adds snap and air on a snare if it has a pad and high SPL rating.",
      ribbon: "Occasionally used for a vintage kick, but a hard hit can damage the ribbon.",
      contact: "A drum trigger-style pickup: isolated, good for layering or sampling.",
    },
  },
  {
    id: "overheads", label: "Drum overheads", level: "loud",
    fit: { dynamic: 1, "condenser-fet": 5, "condenser-tube": 3, ribbon: 4, contact: 0 },
    note: {
      dynamic: "Lacks the high-end detail to capture cymbals well.",
      "condenser-fet": "A matched small-diaphragm pair gives accurate cymbals and a stable stereo image.",
      "condenser-tube": "A lush, vintage-sounding kit picture.",
      ribbon: "A ribbon pair softens harsh cymbals, giving a classic, darker kit sound.",
    },
  },
  {
    id: "brass-strings", label: "Brass / strings", level: "medium",
    fit: { dynamic: 3, "condenser-fet": 4, "condenser-tube": 3, ribbon: 5, contact: 1 },
    note: {
      dynamic: "Handles a loud trumpet close up, but loses some of the air.",
      "condenser-fet": "Detailed and airy, especially for strings at a distance.",
      "condenser-tube": "Rich, warm orchestral colour.",
      ribbon: "The classic brass and strings mic: smooth top end with no harsh edge.",
      contact: "A pickup on a violin or cello body works live, but sounds less natural.",
    },
  },
];

export const LEVELS = [
  { id: "quiet", label: "Quiet" },
  { id: "medium", label: "Medium" },
  { id: "loud", label: "Loud" },
  { id: "very-loud", label: "Very loud" },
];
export const ROOMS = [
  { id: "treated", label: "Treated studio" },
  { id: "untreated", label: "Untreated room" },
  { id: "stage", label: "Live stage" },
  { id: "noisy", label: "Noisy location" },
];
export const GOALS = [
  { id: "natural", label: "Natural & detailed" },
  { id: "warm", label: "Warm & vintage" },
  { id: "smooth", label: "Smooth, tame harshness" },
  { id: "punchy", label: "Punchy & upfront" },
];

/** Reason copy per factor — pos = why this mic, neg = why not. */
export const COPY = {
  spl: {
    pos: "Handles high sound pressure without distorting — it won’t clip or get damaged by this level.",
    neg: "Loud sources can overload it (or, for a ribbon, damage it).",
  },
  detail: {
    pos: "Its light diaphragm picks up fast transients and quiet detail.",
    neg: "Its heavier diaphragm rounds off quiet detail and transients.",
  },
  room: {
    pos: "Its lower sensitivity and tight pattern keep reflections and background noise out of the take.",
    neg: "It picks up the room as clearly as the source, so reflections and noise end up in the take.",
  },
  durable: {
    pos: "Rugged enough to survive knocks, drops and spill on stage.",
    neg: "Too fragile and too prone to handling noise for a stage.",
  },
  warmth: {
    pos: "Adds gentle harmonic colour, the “warm, vintage” sound.",
    neg: "Too clean or too thin to give a warm, vintage colour.",
  },
  smooth: {
    pos: "Its soft, rolled-off top end smooths harsh highs without EQ.",
    neg: "Its bright, detailed top end can make harshness worse.",
  },
  iso: {
    pos: "Senses the source directly, so bleed and ambient noise almost disappear.",
    neg: "It picks up everything around it, so other instruments and noise bleed in.",
  },
  punch: {
    pos: "Its natural midrange presence and close-up proximity effect sound punchy and upfront.",
    neg: "It sounds more open and distant than punchy.",
  },
};

export const FACTOR_TAG = {
  fit: "Source", spl: "Loudness", detail: "Detail", room: "Room", durable: "Practical",
  warmth: "Character", smooth: "Character", iso: "Isolation", punch: "Character",
};

/** "Why choose one mic over another?" — the six factors behind every pick. */
export const FACTORS = [
  {
    tag: "Loudness", title: "Can it take the level?",
    body: [["A kick drum or cranked amp can hit 130 dB+ at the grille. "], ["Dynamics", true], [" barely notice; sensitive "], ["condensers", true], [" may need a pad, and a "], ["ribbon", true], [" can be damaged by a blast of air."]],
  },
  {
    tag: "Detail", title: "How much detail do you need?",
    body: [["A lighter diaphragm follows air pressure faster. That’s why "], ["condensers", true], [" win on breath, finger noise, cymbal shimmer and acoustic transients, and dynamics sound a little rounder."]],
  },
  {
    tag: "Room", title: "Do you want the room in it?",
    body: [["A sensitive mic hears the room as clearly as the source. In an "], ["untreated room or on stage", true], [", a less sensitive, tight-pattern mic gives a cleaner take. In a "], ["treated studio", true], [", that sensitivity becomes an asset."]],
  },
  {
    tag: "Pattern", title: "Where should it not listen?",
    body: [["Cardioid", true], [" rejects the back (monitors, other players). "], ["Figure-8", true], [" rejects the sides and hears front and back. "], ["Omni", true], [" hears everything, sounds most natural and has no proximity effect."]],
  },
  {
    tag: "Character", title: "What colour do you want?",
    body: [["Neutral and detailed ("], ["FET condenser", true], ["), warm and flattering ("], ["tube", true], ["), smooth and dark ("], ["ribbon", true], ["), punchy midrange ("], ["dynamic", true], ["). Pick the mic whose colour moves the source toward the sound you want."]],
  },
  {
    tag: "Practical", title: "Will it work on the day?",
    body: [["Power (48 V phantom, tube PSU), fragility, size, handling noise and cost. A "], ["budget dynamic", true], [" that survives a stage beats an "], ["expensive tube mic", true], [" that can’t go on one."]],
  },
];

export const TAKEAWAY =
  "start from the source and the room, not the price tag. Choose the mic that solves your biggest problem first (level, spill or harshness), then choose for character.";

/** public/audio/mic-selection/<mic>-<source>.mp3 — placeholder until recorded. */
export const selectionAudioPath = (micId, sourceId) => `/audio/mic-selection/${micId}-${sourceId}.mp3`;

export const sourceById = (id) => SEL_SOURCES.find((s) => s.id === id) ?? SEL_SOURCES[0];

/**
 * Score one mic family for the current answers. Returns the total plus
 * per-factor contributions ({ key, v }) so the UI can explain the result.
 */
export function scoreMic(micId, { source, level, room, goal }) {
  const a = ATTR[micId];
  const fit = sourceById(source).fit[micId] ?? 0;
  const merged = { fit: (fit - 3) * 2.2 };
  const add = (key, w) => {
    if (w) merged[key] = (merged[key] || 0) + (a[key] - 3) * w;
  };

  // loudness
  add("spl", { quiet: 0, medium: 0.4, loud: 1.2, "very-loud": 2 }[level]);
  if (level === "quiet") add("detail", 1);

  // room
  if (room === "treated") add("detail", 0.5);
  if (room === "untreated") add("room", 1.8);
  if (room === "stage") {
    add("room", 1.2);
    add("durable", 1.2);
  }
  if (room === "noisy") {
    add("room", 2);
    add("iso", 2);
  }

  // goal
  if (goal === "natural") add("detail", 1.1);
  if (goal === "warm") add("warmth", 1.4);
  if (goal === "smooth") add("smooth", 1.4);
  if (goal === "punchy") add("punch", 1.2);

  let total = Object.values(merged).reduce((t, v) => t + v, 0);
  if (fit === 0) total -= 20; // not practical for this source
  return { id: micId, total, fit, parts: Object.entries(merged).map(([key, v]) => ({ key, v })) };
}

/** Map a raw score onto a 0–100 fit meter (fixed range so bars compare across answers). */
export const fitPercent = (total) => Math.max(4, Math.min(100, Math.round(((total + 14) / 28) * 100)));
