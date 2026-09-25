// Hearing-age model + fixed data for HearingAgeLab (ported from
// design/hearing-health-age.html). Plain module, no React.
//
// THE HEARING AGE SCALE (analogous to "metabolic age" vs calendar age)
// Hearing age = the age whose population-median hearing best matches yours.
// Two signals are blended per ear:
//   a) Audiogram fit (70%): ISO 7029 gives the median threshold shift from
//      an otologically normal 18-year-old as a function of age, frequency
//      and sex. We use the parabolic ISO 7029:2000 form
//        ΔH = α_f · (age − 18)²
//      and brute-force the age that minimises squared error against the
//      measured thresholds (1–8 kHz). ISO 7029:2017 refines these values
//      with polynomial surfaces — swap ALPHA for the licensed 2017 tables
//      if this ever needs to be more than a teaching screen.
//   b) High-frequency ceiling (30%): the highest tone the student can hear,
//      mapped to age with a piecewise table (extended-high-frequency
//      audiometry shows the ceiling falls steadily from ~30 years on).
// Overall hearing age = the better ear (how the WHO grades hearing), with
// a separate flag when the ears differ a lot.
//
// Everything is uncalibrated: levels are relative "dB", not dB HL. Real
// dB HL would need per-headphone RETSPL calibration offsets.

/* ISO 7029:2000 median coefficients (dB per year² past 18).
   'x' (everyone) is the mean of men and women. */
export const ALPHA = {
  m: { 250: 0.003, 500: 0.0035, 1000: 0.004, 2000: 0.007, 3000: 0.0115, 4000: 0.016, 6000: 0.018, 8000: 0.022 },
  f: { 250: 0.003, 500: 0.0035, 1000: 0.004, 2000: 0.006, 3000: 0.0075, 4000: 0.009, 6000: 0.012, 8000: 0.015 },
};
ALPHA.x = Object.fromEntries(Object.keys(ALPHA.m).map((k) => [k, (ALPHA.m[k] + ALPHA.f[k]) / 2]));

export const FREQS = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000];
export const median = (f, age, sex) => (age <= 18 ? 0 : ALPHA[sex][f] * (age - 18) ** 2);

/* Top audible frequency vs age — rough, consumer-grade guide consistent
   with EHF audiometry (everyone <30 hears 16 kHz; 18 kHz gone by the 60s). */
const CEIL = [[12, 20000], [18, 18500], [25, 17000], [30, 16000], [40, 14500], [50, 12500], [60, 10500], [70, 9000], [85, 7500]];
export function ceilForAge(a) {
  for (let i = 1; i < CEIL.length; i++) {
    const [a0, f0] = CEIL[i - 1];
    const [a1, f1] = CEIL[i];
    if (a <= a1) return f0 + ((f1 - f0) * (a - a0)) / (a1 - a0);
  }
  return CEIL.at(-1)[1];
}
export function ageForCeil(f) {
  if (f >= CEIL[0][1]) return CEIL[0][0];
  for (let i = 1; i < CEIL.length; i++) {
    const [a0, f0] = CEIL[i - 1];
    const [a1, f1] = CEIL[i];
    if (f >= f1) return a0 + ((a1 - a0) * (f0 - f)) / (f0 - f1);
  }
  return CEIL.at(-1)[0];
}

/* Fit: brute-force the age (18–90, ¼-year steps) minimising squared error
   at 1–8 kHz. Negative thresholds are clamped to 0 — the model has no
   notion of "better than a median 18-year-old". */
function fitAge(thr, sex) {
  const fs = [1000, 2000, 3000, 4000, 6000, 8000].filter((f) => thr[f] != null);
  let best = 18;
  let err = Infinity;
  for (let y = 18; y <= 90; y += 0.25) {
    let e = 0;
    fs.forEach((f) => {
      e += (Math.max(thr[f], 0) - median(f, y, sex)) ** 2;
    });
    if (e < err) {
      err = e;
      best = y;
    }
  }
  return best;
}
export function earAge(thr, ceil, sex) {
  const fit = fitAge(thr, sex);
  const ceilAge = ageForCeil(ceil);
  return { fit, ceilAge, age: Math.round(0.7 * fit + 0.3 * ceilAge) };
}

/* Noise notch: a dip at 3–6 kHz that recovers at 8 kHz — the classic
   signature of loud-sound exposure rather than ageing. */
export function notch(thr) {
  const peak = Math.max(...[3000, 4000, 6000].map((f) => thr[f] ?? -99));
  const low = Math.min(thr[1000] ?? 99, thr[2000] ?? 99);
  return thr[8000] != null && peak - low >= 10 && peak - thr[8000] >= 10;
}

/* Pure-tone average over 0.5/1/2/4 kHz (the WHO grading frequencies). */
export const pta = (t) => {
  const v = [500, 1000, 2000, 4000].map((f) => t[f]).filter((x) => x != null);
  return v.reduce((a, b) => a + b, 0) / v.length;
};

/* Result zones: delta = hearing age − calendar age. `tone` is the lab's
   semantic color key (--hha-<tone>). */
export const zoneFor = (d) => (d <= -3 ? 0 : d <= 5 ? 1 : d <= 10 ? 2 : 3);
export const ZONES = [
  { tone: "green", label: "Younger", range: "3+ yrs below", title: "Your ears are younger than you", text: "Your hearing is better than most people your age. Keep protecting it — it's a real advantage when mixing." },
  { tone: "blue", label: "In step", range: "within ±3–5", title: "Your ears match your age", text: "Your hearing is typical for your age. Small differences of a few years are normal from test to test." },
  { tone: "amber", label: "Ahead", range: "5–10 yrs older", title: "Your ears are ahead of your age", text: "Your hearing has aged faster than average, mostly in the high pitches. Protect it and retest in 3 months." },
  { tone: "red", label: "Get checked", range: "10+ yrs older", title: "Worth a proper hearing test", text: "Your hearing is well behind people your age. Book a check with an audiologist to find out why." },
];

export const SEX_LABEL = { m: "men", f: "women", x: "everyone" };

/* Test parameters. */
export const SWEEP = { lo: 8000, hi: 20000, dur: 14 }; // Part 1: log sweep 8→20 kHz over 14 s
export const sweepFreqAt = (t) => SWEEP.lo * (SWEEP.hi / SWEEP.lo) ** Math.min(t / SWEEP.dur, 1);
export const SWEEP_TICKS = ["8k", "10k", "12k", "14k", "16k", "18k", "20k"];
export const THR_FREQS = [1000, 2000, 4000, 6000, 8000]; // Part 2, per ear (right first)
/* Relative level (0–90 "dB") → linear gain. 70 dB ≈ 0.25 peak, so the
   loudest staircase step stays well under full scale. */
export const levelGain = (L) => 0.25 * 10 ** ((L - 70) / 20);

/* Scale tab. */
export const SCALE_AGES = [20, 30, 40, 50, 60, 70, 80];
export const TRY_TONES = [8000, 10000, 12000, 14000, 15000, 16000, 17000, 18000, 19000];

/* ------------------------------------------------------------------
   Saved history — real past results, so "Hearing age over time" shows
   the student's own trend instead of the mockup's illustrative bars.
   Per-browser only (same localStorage pattern as ThemeContext's
   svr-theme); every access is guarded because storage can be blocked.
------------------------------------------------------------------ */
const HISTORY_KEY = "svr-hearing-age-history";
export function loadHistory() {
  try {
    const v = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function saveHistoryEntry(entry) {
  const next = [...loadHistory(), entry].slice(-8);
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — history just won't persist */
  }
  return next;
}

/* A result's calendar age / comparison group can be corrected after the
   test (they don't change the measurements, only what they're compared
   with) — keep the saved trend entry for that test in step. */
export function updateHistoryEntry(date, patch) {
  const next = loadHistory().map((h) => (h.date === date ? { ...h, ...patch } : h));
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}

/* Calendar age from the setup field: whole years 18–90, else null. No
   silent clamping — a clamped age (e.g. 16 → 18) is exactly the "my
   calendar age doesn't match what I entered" bug. */
export const AGE_MIN = 18;
export const AGE_MAX = 90;
export function parseAge(str) {
  const v = String(str).trim();
  if (!/^\d{1,3}$/.test(v)) return null;
  const a = Number(v);
  return a >= AGE_MIN && a <= AGE_MAX ? a : null;
}

/* Everything the Results tab shows, derived from one result object. */
export function computeResults(r) {
  const { sex } = r;
  const ears = { R: earAge(r.thr.R, r.ceil.R, sex), L: earAge(r.thr.L, r.ceil.L, sex) };
  const hear = Math.min(ears.R.age, ears.L.age); // better ear
  const delta = hear - r.age;
  const zone = zoneFor(delta);
  const asym = Math.abs(pta(r.thr.R) - pta(r.thr.L));

  const insights = [];
  const nR = notch(r.thr.R);
  const nL = notch(r.thr.L);
  if (nR || nL) {
    insights.push({
      tone: "amber",
      icon: "notch",
      title: `Noise dip at 4 kHz (${nR && nL ? "both ears" : nR ? "right ear" : "left ear"})`,
      text: "A dip around 4 kHz that recovers at 8 kHz is the classic sign of loud-sound exposure — gigs, clubs or loud monitoring — rather than normal ageing.",
    });
  }
  const worst = [2000, 3000, 4000, 6000, 8000]
    .map((f) => ({ f, d: Math.max(r.thr.R[f] ?? 0, r.thr.L[f] ?? 0) - median(f, r.age, sex) }))
    .sort((a, b) => b.d - a.d)[0];
  if (worst.d > 5) {
    insights.push({
      tone: "blue",
      icon: "search",
      title: `Biggest gap: ${worst.f / 1000} kHz`,
      text: `You hear ${worst.f / 1000} kHz about ${Math.round(worst.d)} dB worse than is typical at ${r.age}. That's the range of cymbal shimmer, "s" sounds and vocal presence — double-check it on a spectrum analyser when mixing.`,
    });
  }
  if (asym >= 15) {
    insights.push({
      tone: "red",
      icon: "alert",
      title: "Your ears differ a lot",
      text: `Your right and left ears differ by ${asym.toFixed(0)} dB on average. That's worth checking with a doctor, whatever your hearing age.`,
    });
  } else {
    insights.push({
      tone: "green",
      icon: "check",
      title: "Ears are balanced",
      text: `Left and right are within ${Math.max(1, asym).toFixed(0)} dB of each other, so your stereo image should be reliable.`,
    });
  }

  return { ears, hear, delta, zone, asym, insights };
}

export const fmtAge = (a) => (a <= 18 ? "≤18" : String(a));
export function whoGrade(p) {
  if (p < 20) return "Normal";
  if (p < 35) return "Mild";
  return "See audiologist";
}
