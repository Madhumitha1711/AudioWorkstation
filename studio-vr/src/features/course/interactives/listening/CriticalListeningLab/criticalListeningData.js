// Problem catalogue for CriticalListeningLab — ported verbatim (content and
// DSP) from design/critical-listening-lab-1.html.
//
// Each problem carries:
//   - lvl     0 = beginner, 1 = intermediate, 2 = pro. A difficulty level
//             draws from every problem at or below its own lvl.
//   - band    [lo, hi] Hz highlighted on the spectrum once the student has
//             answered (null = not a frequency-localised problem).
//   - build(ctx, s, env) — returns { input, output, sources } for the
//             "B" (problem) path. `s` is strength: 1 = beginner (obvious)
//             … .4 = pro (subtle). `sources` are any oscillators/buffer
//             sources the chain owns; the engine starts and stops them in
//             lockstep with the source. `env` = { noise, peak }: a shared
//             2 s stereo white-noise buffer (hiss) and the linear sample
//             peak of the source as it reaches the chain (clip/compression
//             thresholds are set relative to it, so they behave the same on
//             the built-in loop and on an uploaded reference file).
//
// UNITY-GAIN RULE: a chain applies the problem and nothing else. No
// "level-matching" make-up/trim gains — they made clip B louder or quieter
// than A for reasons unrelated to the problem, which confused students.
// The only level change allowed is one that IS the problem's mechanism:
//   - EQ problems boost/cut their band (that's the fault itself). Boosts
//     are capped at +10 dB: together with the engine's fixed headroom
//     (HEADROOM_PEAK in criticalListeningAudio.js) that keeps a boosted
//     band from clipping the output, which would add a second problem;
//   - over-compression gets peak-matched make-up gain (and cancels the
//     compressor node's own automatic make-up), because that make-up is
//     exactly what a real over-compressed master does: quiet parts come up,
//     peaks stay put. Computed from threshold/ratio, not tuned;
//   - L/R imbalance attenuates one side (never boosts the other).
// Clipping is done at unity gain with a ceiling below the source peak, so
// everything under the ceiling passes through untouched.

const G = (c, v) => {
  const g = c.createGain();
  g.gain.value = v;
  return g;
};
const BQ = (c, type, f, q, gain) => {
  const b = c.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  if (q != null) b.Q.value = q;
  if (gain != null) b.gain.value = gain;
  return b;
};
const serial = (...n) => {
  for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]);
  return { input: n[0], output: n[n.length - 1], sources: [] };
};
const lerp = (a, b, t) => a + (b - a) * t;

// Exponentially-decaying stereo noise burst, used as a cheap reverb IR.
function impulse(c, secs) {
  const len = Math.round(c.sampleRate * secs);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return b;
}

export const CATS = ["Frequency", "Dynamics", "Distortion", "Noise", "Stereo & phase", "Space & time"];

// Category -> lab-scoped color token (see CriticalListeningLab.css).
export const CAT_COLOR = {
  Frequency: "--cll-blue",
  Dynamics: "--cll-amber",
  Distortion: "--cll-red",
  Noise: "--cll-teal",
  "Stereo & phase": "--cll-green",
  "Space & time": "--cll-purple",
};

export const PROBLEMS = [
  {
    id: "muffled", name: "Muffled / dull", cat: "Frequency", lvl: 0, band: [4000, 20000], short: "Top end is missing",
    what: "High frequencies have been rolled off, so the mix loses air and detail.",
    listen: "Hi-hats and snare lose their sparkle; everything sounds like it is behind a blanket or in the next room.",
    cause: "Mic pointed away from the source, a dark mic or preamp, a blanket or foam over the source, or a low-pass filter left on.",
    fix: "Fix at the source first (mic position, brighter mic). In the mix, a gentle high-shelf boost above ~8 kHz.",
    build: (c, s) => serial(BQ(c, "lowpass", lerp(5500, 1300, s), 0.7)),
  },
  {
    id: "thin", name: "Thin / no low end", cat: "Frequency", lvl: 0, band: [20, 250], short: "Bass and body are gone",
    what: "Low frequencies have been cut, so the mix has no weight or warmth.",
    listen: "The kick loses its thump and the bass line almost disappears. It sounds small, like a phone speaker.",
    cause: "High-pass filter set too high, a small mic too far from the source, or monitoring on speakers that cannot reproduce bass.",
    fix: "Lower or bypass the high-pass filter. Check lows on headphones or a sub, and move the mic closer to use proximity effect.",
    build: (c, s) => serial(BQ(c, "highpass", lerp(110, 420, s), 0.9)),
  },
  {
    id: "muddy", name: "Muddy low-mids", cat: "Frequency", lvl: 1, band: [150, 500], short: "Too much 200–400 Hz",
    what: "Too much energy in the low-mids makes instruments blur into each other.",
    listen: "The mix feels thick and cloudy. The bass and pad smear together and nothing sounds defined.",
    cause: "Many instruments stacked in the same range, small untreated rooms, or close-mic proximity boost.",
    fix: "Cut 200–400 Hz on the tracks that do not need it (pads, guitars). Sweep a narrow boost to find the ugly spot, then cut it.",
    build: (c, s) => serial(BQ(c, "peaking", 300, 1.1, 10 * s)),
  },
  {
    id: "harsh", name: "Harsh upper-mids", cat: "Frequency", lvl: 1, band: [2000, 5500], short: "Too much 2–5 kHz",
    what: "A boost in the upper-mids, where our ears are most sensitive, makes the mix aggressive and tiring.",
    listen: "The snare and lead feel sharp and “in your face”. Listening gets uncomfortable quickly.",
    cause: "Bright mics on bright sources, over-EQ'd guitars and vocals, or monitoring too quietly and over-compensating.",
    fix: "Cut 2–5 kHz a few dB with a medium-Q bell or a dynamic EQ. Turn the monitors up briefly to check.",
    build: (c, s) => serial(BQ(c, "peaking", 3400, 1.3, 10 * s)),
  },
  {
    id: "boomy", name: "Boomy bass", cat: "Frequency", lvl: 1, band: [35, 160], short: "Too much sub / low bass",
    what: "Excess energy in the lowest octaves makes the low end loose and overpowering.",
    listen: "The kick and bass swell and boom. The low end sounds bloated and pushes everything else back.",
    cause: "Room modes in an untreated room, speakers against a wall, or too much low-shelf boost.",
    fix: "Low-shelf cut around 60–120 Hz, high-pass instruments that do not need sub, and treat the room with bass traps.",
    build: (c, s) => serial(BQ(c, "lowshelf", 110, null, 10 * s)),
  },
  {
    id: "squash", name: "Over-compression", cat: "Dynamics", lvl: 1, band: null, short: "Pumping, flat, lifeless",
    what: "Too much compression removes the difference between loud and soft, and the level breathes with the kick.",
    listen: "The pad and hats duck and swell after every kick (pumping). Drums lose punch and everything is equally loud.",
    cause: "Very low threshold, high ratio and fast release on a bus or master, or a limiter pushed too hard for loudness.",
    fix: "Raise the threshold, lower the ratio, use a slower attack so transients get through, and set the release to the tempo.",
    build: (c, s, env) => {
      // Threshold sits a fixed distance below the source peak. The output
      // gain does two things, both computed, not tuned by ear:
      //  1. cancels the automatic make-up gain DynamicsCompressorNode adds
      //     on its own (Chromium/WebKit/Gecko share the kernel:
      //     makeup = (1 / gainAt0dBFS)^0.6, i.e. 0.6 * |thr| * (1 - 1/ratio)
      //     dB with a hard knee), and
      //  2. applies peak-matched make-up instead: the gain reduction a
      //     peak-level signal receives, so peaks land back where they were
      //     in clip A and only the quiet parts come up — the real sound of
      //     an over-compressed master, with no extra loudness jump.
      const peakDb = 20 * Math.log10(env.peak);
      const below = lerp(10, 20, s), ratio = lerp(4, 10, s);
      const thrDb = peakDb - below;
      const k = c.createDynamicsCompressor();
      k.threshold.value = thrDb;
      k.ratio.value = ratio;
      k.knee.value = 0;
      k.attack.value = 0.001;
      k.release.value = 0.16;
      const autoMakeupDb = 0.6 * -thrDb * (1 - 1 / ratio);
      const makeupDb = below * (1 - 1 / ratio) - autoMakeupDb;
      return serial(k, G(c, Math.pow(10, makeupDb / 20)));
    },
  },
  {
    id: "clip", name: "Clipping distortion", cat: "Distortion", lvl: 0, band: [2000, 16000], short: "Peaks are chopped off",
    what: "The signal went over the maximum level, so the tops of the waveform were cut flat. That adds harsh new harmonics.",
    listen: "A crunchy, fuzzy edge on every kick and snare hit, and a gritty buzz on the loud notes.",
    cause: "Input gain too hot at the preamp or converter, or a plugin or master bus pushed past 0 dBFS.",
    fix: "You cannot fully undo clipping. Lower the gain and record again, and leave 6–12 dB of headroom when tracking.",
    build: (c, s, env) => {
      // Unity-gain hard clipper: flat-tops anything above ±ceil, passes
      // everything below it unchanged (curve is the identity inside
      // ±ceil). The ceiling is a fraction of the source peak, so the loud
      // hits get chopped while quiet material is untouched — no drive
      // gain, no trim.
      const ceil = env.peak * lerp(0.6, 0.25, s);
      const sh = c.createWaveShaper();
      const n = 4096, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.max(-ceil, Math.min(ceil, x));
      }
      sh.curve = curve;
      sh.oversample = "none";
      return serial(sh);
    },
  },
  {
    id: "dropout", name: "Clicks & dropouts", cat: "Distortion", lvl: 0, band: null, short: "Tiny gaps and clicks",
    what: "Very short gaps in the audio, usually caused by the computer not keeping up.",
    listen: "Random ticks and tiny silences that do not follow the beat.",
    cause: "Audio buffer size set too low, CPU overload, a bad clock or sample-rate mismatch, or a faulty cable.",
    fix: "Increase the buffer size, freeze heavy tracks, and check clocking and cables. Repair the damaged take or record it again.",
    build: (c, s) => {
      // A looping 1.7 s control buffer of 1s with a few zeroed gaps drives a
      // VCA's gain — 1.7 s against the ~4.3 s music loop means the gaps
      // drift across the beat instead of landing in the same spot each bar.
      const sr = c.sampleRate, len = Math.round(sr * 1.7);
      const cb = c.createBuffer(1, len, sr), d = cb.getChannelData(0);
      d.fill(1);
      const gaps = Math.round(lerp(1, 5, s));
      for (let g = 0; g < gaps; g++) {
        const st = Math.floor(Math.random() * (len - 2000));
        const w = Math.round(sr * lerp(0.004, 0.02, Math.random()));
        for (let i = st; i < st + w; i++) d[i] = 0;
      }
      const ctl = c.createBufferSource();
      ctl.buffer = cb;
      ctl.loop = true;
      const vca = G(c, 0);
      ctl.connect(vca.gain);
      const ch = serial(vca);
      ch.sources.push(ctl);
      return ch;
    },
  },
  {
    id: "hum", name: "Mains hum", cat: "Noise", lvl: 0, band: [40, 200], short: "Steady low buzz",
    what: "A steady tone at the mains frequency (50 Hz in India and Europe, 60 Hz in the US) and its harmonics.",
    listen: "A constant low drone or buzz under the music. It does not change with the notes, and you can hear it between hits.",
    cause: "Ground loops between devices, unbalanced cables near power cables, or a faulty guitar or DI.",
    fix: "Use balanced cables, keep one ground path (ground-lift on a DI), and move signal cables away from power. Notch filters are a last resort.",
    build: (c, s) => {
      const out = G(c, 1), inp = G(c, 1);
      inp.connect(out);
      const ch = { input: inp, output: out, sources: [] };
      [[50, 0.05], [100, 0.03], [150, 0.022], [250, 0.01]].forEach(([f, a]) => {
        const o = c.createOscillator();
        o.frequency.value = f;
        o.connect(G(c, a * lerp(0.3, 1, s))).connect(out);
        ch.sources.push(o);
      });
      return ch;
    },
  },
  {
    id: "hiss", name: "Hiss / high noise floor", cat: "Noise", lvl: 0, band: [4000, 16000], short: "Constant “shhh”",
    what: "Broadband noise sitting under the signal, most audible in the highs.",
    listen: "A steady “shhh” like tape hiss or air. It is easiest to hear in the quiet moments between notes.",
    cause: "Gain staged too low and boosted later, noisy preamps, cheap cables, or stacking many noisy tracks.",
    fix: "Record at a healthy level (peaks around −12 to −6 dBFS), use quieter gear, and use a gate or denoiser on quiet parts.",
    build: (c, s, env) => {
      const out = G(c, 1), inp = G(c, 1);
      inp.connect(out);
      const n = c.createBufferSource();
      n.buffer = env.noise;
      n.loop = true;
      n.connect(BQ(c, "highpass", 2500, 0.7)).connect(G(c, lerp(0.012, 0.06, s))).connect(out);
      return { input: inp, output: out, sources: [n] };
    },
  },
  {
    id: "imbalance", name: "Left/right imbalance", cat: "Stereo & phase", lvl: 0, band: null, short: "Mix leans to one side",
    what: "One channel is louder than the other, so the stereo image leans to one side.",
    listen: "The kick, bass and lead should sit in the center, but they drift toward one ear. Watch the L/R meters.",
    cause: "A pan or balance knob knocked, one speaker louder than the other, or a bad cable on one side.",
    fix: "Recenter the balance, check speaker levels with pink noise and an SPL meter, and swap cables to find the faulty side.",
    build: (c, s) => {
      // Attenuate one channel only (−3 dB pro … −12 dB beginner); the other
      // passes at unity. A StereoPanner would also fold that side into the
      // other and make it louder, which is a second change.
      const sp = c.createChannelSplitter(2), mg = c.createChannelMerger(2);
      const quiet = Math.random() < 0.5 ? 0 : 1;
      const att = G(c, Math.pow(10, -lerp(3, 12, s) / 20));
      sp.connect(att, quiet).connect(mg, 0, quiet);
      sp.connect(mg, 1 - quiet, 1 - quiet);
      return { input: sp, output: mg, sources: [] };
    },
  },
  {
    id: "comb", name: "Comb filtering", cat: "Stereo & phase", lvl: 2, band: [400, 12000], short: "Hollow, phasey tone",
    what: "The signal was mixed with a slightly delayed copy of itself, which cancels some frequencies and boosts others.",
    listen: "A hollow, “through a tube” or slightly flanged tone, especially on the hats and pad.",
    cause: "Two mics on one source at different distances, a mic picking up a reflection from a desk or wall, or a doubled track slightly out of time.",
    fix: "Use the 3:1 rule for mic spacing, time-align the tracks, check polarity, or remove one of the mics.",
    build: (c, s) => {
      // Dry at unity plus a delayed copy — exactly what summing two mics
      // at different distances does.
      const inp = G(c, 1), out = G(c, 1);
      const d = c.createDelay(0.01);
      d.delayTime.value = 0.0011;
      inp.connect(out);
      inp.connect(d).connect(G(c, 0.95 * s)).connect(out);
      return { input: inp, output: out, sources: [] };
    },
  },
  {
    id: "polarity", name: "Polarity flip (one side)", cat: "Stereo & phase", lvl: 2, band: [20, 300], short: "Wide, empty center",
    what: "One channel's waveform is upside down, so anything panned center cancels out, most of all in the bass.",
    listen: "On headphones it feels oddly wide and uncomfortable, the center is empty, and the bass gets weak. Played in mono, it almost disappears.",
    cause: "A miswired XLR cable (pins 2 and 3 swapped), a polarity switch left on, or a plugin inverting one side.",
    fix: "Find the faulty cable or setting and flip that channel's polarity back. Always check your mix in mono.",
    build: (c) => {
      const sp = c.createChannelSplitter(2), mg = c.createChannelMerger(2), inv = G(c, -1);
      sp.connect(mg, 0, 0);
      sp.connect(inv, 1);
      inv.connect(mg, 0, 1);
      return { input: sp, output: mg, sources: [] };
    },
  },
  {
    id: "reverb", name: "Too much reverb", cat: "Space & time", lvl: 0, band: null, short: "Washed out, distant",
    what: "Too much room or reverb pushes everything far away and blurs the attacks.",
    listen: "A long wash hangs after every hit. Drums lose their punch and the lead sounds far away.",
    cause: "Recording in a big, live, untreated room, or too much reverb send in the mix.",
    fix: "Record in a drier space. In the mix, lower the send, shorten the decay, and high-pass the reverb return.",
    build: (c, s) => {
      const inp = G(c, 1), out = G(c, 1), cv = c.createConvolver();
      cv.buffer = impulse(c, 2.8);
      inp.connect(out); // dry stays at unity; only the wet reverb is added
      inp.connect(cv).connect(G(c, lerp(0.25, 0.9, s))).connect(out);
      return { input: inp, output: out, sources: [] };
    },
  },
  {
    id: "echo", name: "Slapback echo", cat: "Space & time", lvl: 0, band: null, short: "Distinct repeats",
    what: "A clear, separate repeat of the sound a short time after the original.",
    listen: "Each snare hit and lead note has a quick “ta-ta” double, like clapping in a stairwell.",
    cause: "Reflections off a far wall in a hard room, a delay left on a bus, or monitors bleeding into a mic.",
    fix: "Treat the reflecting surfaces or move the mic. In the mix, bypass or lower the delay and its feedback.",
    build: (c, s) => {
      const inp = G(c, 1), out = G(c, 1), d = c.createDelay(1), fb = G(c, lerp(0.15, 0.38, s));
      d.delayTime.value = 0.14;
      inp.connect(out);
      inp.connect(d);
      d.connect(fb).connect(d);
      d.connect(G(c, lerp(0.35, 0.7, s))).connect(out);
      return { input: inp, output: out, sources: [] };
    },
  },
];

export const PROBLEM_BY_ID = Object.fromEntries(PROBLEMS.map((p) => [p.id, p]));

// max = highest problem lvl included; s = strength passed to build().
export const LEVELS = {
  beginner: { label: "Beginner", max: 0, s: 1 },
  intermediate: { label: "Intermediate", max: 1, s: 0.65 },
  pro: { label: "Pro", max: 2, s: 0.4 },
};

export const SESSION_LEN = 8;

const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Builds a quiz session: `ids` (e.g. "retry missed") or, if omitted,
// SESSION_LEN problems drawn shuffle-bag style from the level's pool (every
// problem appears once before any repeats, never twice in a row). Each
// question gets three distractors; harder levels prefer distractors from
// the same category (muddy vs boomy is a harder call than muddy vs hiss).
export function buildQuestions(level, ids) {
  const L = LEVELS[level];
  const pool = PROBLEMS.filter((p) => p.lvl <= L.max);
  if (!ids) {
    ids = [];
    let bag = [];
    while (ids.length < SESSION_LEN) {
      if (!bag.length) bag = shuffle(pool.map((p) => p.id));
      const n = bag.pop();
      if (n !== ids[ids.length - 1]) ids.push(n);
    }
  }
  return ids.map((id) => {
    const p = PROBLEM_BY_ID[id];
    const others = pool.filter((o) => o.id !== id);
    const same = shuffle(others.filter((o) => o.cat === p.cat));
    const rest = shuffle(others.filter((o) => o.cat !== p.cat));
    const pick = (
      level === "beginner" ? shuffle(others) : [...same.slice(0, level === "pro" ? 2 : 1), ...rest]
    ).slice(0, 3);
    return { id, s: L.s, options: shuffle([id, ...pick.map((o) => o.id)]) };
  });
}
