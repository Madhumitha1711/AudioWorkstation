export const ALPHA = {
  m: { 250: 0.003, 500: 0.0035, 1000: 0.004, 2000: 0.007, 3000: 0.0115, 4000: 0.016, 6000: 0.018, 8000: 0.022 },
  f: { 250: 0.003, 500: 0.0035, 1000: 0.004, 2000: 0.006, 3000: 0.0075, 4000: 0.009, 6000: 0.012, 8000: 0.015 },
};
ALPHA.x = Object.fromEntries(Object.keys(ALPHA.m).map((k) => [k, (ALPHA.m[k] + ALPHA.f[k]) / 2]));

export const FREQS = [250, 500, 1000, 2000, 3000, 4000, 6000, 8000];
export const median = (f, age, sex) => (age <= 18 ? 0 : ALPHA[sex][f] * (age - 18) ** 2);

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

function notch(thr) {
  const peak = Math.max(...[3000, 4000, 6000].map((f) => thr[f] ?? -99));
  const low = Math.min(thr[1000] ?? 99, thr[2000] ?? 99);
  return thr[8000] != null && peak - low >= 10 && peak - thr[8000] >= 10;
}

export const pta = (t) => {
  const v = [500, 1000, 2000, 4000].map((f) => t[f]).filter((x) => x != null);
  return v.reduce((a, b) => a + b, 0) / v.length;
};

export const zoneFor = (d) => (d <= -3 ? 0 : d <= 5 ? 1 : d <= 10 ? 2 : 3);
export const ZONES = [
  { tone: "green", label: "Younger", range: "3+ yrs below", title: "Your ears are younger than you", text: "Your hearing is better than most people your age. Keep protecting it — it's a real advantage when mixing." },
  { tone: "blue", label: "In step", range: "within ±3–5", title: "Your ears match your age", text: "Your hearing is typical for your age. Small differences of a few years are normal from test to test." },
  { tone: "amber", label: "Ahead", range: "5–10 yrs older", title: "Your ears are ahead of your age", text: "Your hearing has aged faster than average, mostly in the high pitches. Protect it and retest in 3 months." },
  { tone: "red", label: "Get checked", range: "10+ yrs older", title: "Worth a proper hearing test", text: "Your hearing is well behind people your age. Book a check with an audiologist to find out why." },
];

export const SEX_LABEL = { m: "men", f: "women", x: "everyone" };

export const SWEEP = { lo: 8000, hi: 20000, dur: 14 };
export const sweepFreqAt = (t) => SWEEP.lo * (SWEEP.hi / SWEEP.lo) ** Math.min(t / SWEEP.dur, 1);
export const SWEEP_TICKS = ["8k", "10k", "12k", "14k", "16k", "18k", "20k"];
export const THR_FREQS = [1000, 2000, 4000, 6000, 8000];
export const levelGain = (L) => 0.25 * 10 ** ((L - 70) / 20);

export const SCALE_AGES = [20, 30, 40, 50, 60, 70, 80];
export const TRY_TONES = [8000, 10000, 12000, 14000, 15000, 16000, 17000, 18000, 19000];

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
  }
  return next;
}

export function updateHistoryEntry(date, patch) {
  const next = loadHistory().map((h) => (h.date === date ? { ...h, ...patch } : h));
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
  }
  return next;
}

const AGE_MIN = 18;
const AGE_MAX = 90;
export function parseAge(str) {
  const v = String(str).trim();
  if (!/^\d{1,3}$/.test(v)) return null;
  const a = Number(v);
  return a >= AGE_MIN && a <= AGE_MAX ? a : null;
}

export function computeResults(r) {
  const { sex } = r;
  const ears = { R: earAge(r.thr.R, r.ceil.R, sex), L: earAge(r.thr.L, r.ceil.L, sex) };
  const hear = Math.min(ears.R.age, ears.L.age);
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
