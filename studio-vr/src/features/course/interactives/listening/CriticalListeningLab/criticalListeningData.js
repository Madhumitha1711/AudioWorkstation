const DIR = "/audio/critical-listening";
const pair = (base) => ({ clean: `${base}-clean.wav`, problem: `${base}-problem.wav` });

export const CATS = ["Frequency", "Dynamics", "Distortion", "Noise", "Stereo & phase", "Space & time"];

export const PROBLEMS = [
  {
    id: "muffled", name: "Muffled / dull", cat: "Frequency", lvl: 0, short: "Top end is missing",
    what: "High frequencies have been rolled off, so the mix loses air and detail.",
    listen: "Hi-hats and snare lose their sparkle; everything sounds like it is behind a blanket or in the next room.",
    cause: "Mic pointed away from the source, a dark mic or preamp, a blanket or foam over the source, or a low-pass filter left on.",
    fix: "Fix at the source first (mic position, brighter mic). In the mix, a gentle high-shelf boost above ~8 kHz.",
  },
  {
    id: "thin", name: "Thin / no low end", cat: "Frequency", lvl: 0, short: "Bass and body are gone",
    what: "Low frequencies have been cut, so the mix has no weight or warmth.",
    listen: "The kick loses its thump and the bass line almost disappears. It sounds small, like a phone speaker.",
    cause: "High-pass filter set too high, a small mic too far from the source, or monitoring on speakers that cannot reproduce bass.",
    fix: "Lower or bypass the high-pass filter. Check lows on headphones or a sub, and move the mic closer to use proximity effect.",
  },
  {
    id: "muddy", name: "Muddy low-mids", cat: "Frequency", lvl: 1, short: "Too much 200–400 Hz",
    what: "Too much energy in the low-mids makes instruments blur into each other.",
    listen: "The mix feels thick and cloudy. The bass and pad smear together and nothing sounds defined.",
    cause: "Many instruments stacked in the same range, small untreated rooms, or close-mic proximity boost.",
    fix: "Cut 200–400 Hz on the tracks that do not need it (pads, guitars). Sweep a narrow boost to find the ugly spot, then cut it.",
  },
  {
    id: "harsh", name: "Harsh upper-mids", cat: "Frequency", lvl: 1, short: "Too much 2–5 kHz",
    what: "A boost in the upper-mids, where our ears are most sensitive, makes the mix aggressive and tiring.",
    listen: "The snare and lead feel sharp and “in your face”. Listening gets uncomfortable quickly.",
    cause: "Bright mics on bright sources, over-EQ'd guitars and vocals, or monitoring too quietly and over-compensating.",
    fix: "Cut 2–5 kHz a few dB with a medium-Q bell or a dynamic EQ. Turn the monitors up briefly to check.",
  },
  {
    id: "boomy", name: "Boomy bass", cat: "Frequency", lvl: 1, short: "Too much sub / low bass",
    what: "Excess energy in the lowest octaves makes the low end loose and overpowering.",
    listen: "The kick and bass swell and boom. The low end sounds bloated and pushes everything else back.",
    cause: "Room modes in an untreated room, speakers against a wall, or too much low-shelf boost.",
    fix: "Low-shelf cut around 60–120 Hz, high-pass instruments that do not need sub, and treat the room with bass traps.",
  },
  {
    id: "squash", name: "Over-compression", cat: "Dynamics", lvl: 1, short: "Pumping, flat, lifeless",
    what: "Too much compression removes the difference between loud and soft, and the level breathes with the kick.",
    listen: "The pad and hats duck and swell after every kick (pumping). Drums lose punch and everything is equally loud.",
    cause: "Very low threshold, high ratio and fast release on a bus or master, or a limiter pushed too hard for loudness.",
    fix: "Raise the threshold, lower the ratio, use a slower attack so transients get through, and set the release to the tempo.",
  },
  {
    id: "clip", name: "Clipping distortion", cat: "Distortion", lvl: 0, short: "Peaks are chopped off",
    what: "The signal went over the maximum level, so the tops of the waveform were cut flat. That adds harsh new harmonics.",
    listen: "A crunchy, fuzzy edge on every kick and snare hit, and a gritty buzz on the loud notes.",
    cause: "Input gain too hot at the preamp or converter, or a plugin or master bus pushed past 0 dBFS.",
    fix: "You cannot fully undo clipping. Lower the gain and record again, and leave 6–12 dB of headroom when tracking.",
  },
  {
    id: "dropout", name: "Clicks & dropouts", cat: "Distortion", lvl: 0, short: "Tiny gaps and clicks",
    what: "Very short gaps in the audio, usually caused by the computer not keeping up.",
    listen: "Random ticks and tiny silences that do not follow the beat.",
    cause: "Audio buffer size set too low, CPU overload, a bad clock or sample-rate mismatch, or a faulty cable.",
    fix: "Increase the buffer size, freeze heavy tracks, and check clocking and cables. Repair the damaged take or record it again.",
  },
  {
    id: "hum", name: "Mains hum", cat: "Noise", lvl: 0, short: "Steady low buzz",
    what: "A steady tone at the mains frequency (50 Hz in India and Europe, 60 Hz in the US) and its harmonics.",
    listen: "A constant low drone or buzz under the music. It does not change with the notes, and you can hear it between hits.",
    cause: "Ground loops between devices, unbalanced cables near power cables, or a faulty guitar or DI.",
    fix: "Use balanced cables, keep one ground path (ground-lift on a DI), and move signal cables away from power. Notch filters are a last resort.",
  },
  {
    id: "hiss", name: "Hiss / high noise floor", cat: "Noise", lvl: 0, short: "Constant “shhh”",
    what: "Broadband noise sitting under the signal, most audible in the highs.",
    listen: "A steady “shhh” like tape hiss or air. It is easiest to hear in the quiet moments between notes.",
    cause: "Gain staged too low and boosted later, noisy preamps, cheap cables, or stacking many noisy tracks.",
    fix: "Record at a healthy level (peaks around −12 to −6 dBFS), use quieter gear, and use a gate or denoiser on quiet parts.",
  },
  {
    id: "imbalance", name: "Left/right imbalance", cat: "Stereo & phase", lvl: 0, short: "Mix leans to one side",
    what: "One channel is louder than the other, so the stereo image leans to one side.",
    listen: "The kick, bass and lead should sit in the center, but they drift toward one ear. Watch the L/R meters.",
    cause: "A pan or balance knob knocked, one speaker louder than the other, or a bad cable on one side.",
    fix: "Recenter the balance, check speaker levels with pink noise and an SPL meter, and swap cables to find the faulty side.",
  },
  {
    id: "comb", name: "Comb filtering", cat: "Stereo & phase", lvl: 2, short: "Hollow, phasey tone",
    what: "The signal was mixed with a slightly delayed copy of itself, which cancels some frequencies and boosts others.",
    listen: "A hollow, “through a tube” or slightly flanged tone, especially on the hats and pad.",
    cause: "Two mics on one source at different distances, a mic picking up a reflection from a desk or wall, or a doubled track slightly out of time.",
    fix: "Use the 3:1 rule for mic spacing, time-align the tracks, check polarity, or remove one of the mics.",
  },
  {
    id: "polarity", name: "Polarity flip (one side)", cat: "Stereo & phase", lvl: 2, short: "Wide, empty center",
    what: "One channel's waveform is upside down, so anything panned center cancels out, most of all in the bass.",
    listen: "On headphones it feels oddly wide and uncomfortable, the center is empty, and the bass gets weak. Played in mono, it almost disappears.",
    cause: "A miswired XLR cable (pins 2 and 3 swapped), a polarity switch left on, or a plugin inverting one side.",
    fix: "Find the faulty cable or setting and flip that channel's polarity back. Always check your mix in mono.",
  },
  {
    id: "reverb", name: "Too much reverb", cat: "Space & time", lvl: 0, short: "Washed out, distant",
    what: "Too much room or reverb pushes everything far away and blurs the attacks.",
    listen: "A long wash hangs after every hit. Drums lose their punch and the lead sounds far away.",
    cause: "Recording in a big, live, untreated room, or too much reverb send in the mix.",
    fix: "Record in a drier space. In the mix, lower the send, shorten the decay, and high-pass the reverb return.",
  },
  {
    id: "echo", name: "Slapback echo", cat: "Space & time", lvl: 0, short: "Distinct repeats",
    what: "A clear, separate repeat of the sound a short time after the original.",
    listen: "Each snare hit and lead note has a quick “ta-ta” double, like clapping in a stairwell.",
    cause: "Reflections off a far wall in a hard room, a delay left on a bus, or monitors bleeding into a mic.",
    fix: "Treat the reflecting surfaces or move the mic. In the mix, bypass or lower the delay and its feedback.",
  },
];

export const PROBLEM_BY_ID = Object.fromEntries(PROBLEMS.map((p) => [p.id, p]));

const MIXES = {
  intermediate: [
    { id: "muddy-hiss", problems: ["muddy", "hiss"] },
    { id: "harsh-hum", problems: ["harsh", "hum"] },
    { id: "boomy-clip", problems: ["boomy", "clip"] },
    { id: "squash-reverb", problems: ["squash", "reverb"] },
    { id: "thin-echo", problems: ["thin", "echo"] },
    { id: "muffled-imbalance", problems: ["muffled", "imbalance"] },
  ],
  pro: [
    { id: "comb-squash-hiss", problems: ["comb", "squash", "hiss"] },
    { id: "polarity-muddy-dropout", problems: ["polarity", "muddy", "dropout"] },
    { id: "harsh-clip-reverb", problems: ["harsh", "clip", "reverb"] },
    { id: "boomy-imbalance-echo", problems: ["boomy", "imbalance", "echo"] },
    { id: "muffled-hum-squash", problems: ["muffled", "hum", "squash"] },
    { id: "comb-thin-dropout", problems: ["comb", "thin", "dropout"] },
  ],
};

export const LEVELS = {
  beginner: {
    label: "Beginner",
    blurb: "One problem in each clip.",
    clips: PROBLEMS.filter((p) => p.lvl === 0).map((p) => ({ id: p.id, problems: [p.id], clips: pair(`${DIR}/${p.id}`) })),
  },
  intermediate: {
    label: "Intermediate",
    blurb: "Two problems in each clip.",
    clips: MIXES.intermediate.map((m) => ({ clips: pair(`${DIR}/mix/${m.id}`), ...m })),
  },
  pro: {
    label: "Pro",
    blurb: "Three problems in each clip.",
    clips: MIXES.pro.map((m) => ({ clips: pair(`${DIR}/mix/${m.id}`), ...m })),
  },
};

export function shuffledClips(level) {
  const a = LEVELS[level].clips.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
