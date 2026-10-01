// "Amplification / Amplifier" lab — content + the recording it plays.
//
// The lab never generates audio: it only amplifies the recording at
// `sample.src`. That file isn't produced yet — drop it in at this path
// (ideally a quiet, mic-level take so there is something to bring up) and
// the lab picks it up automatically. Play/Stop is always shown; until the
// file exists, pressing Play just reports "No sample loaded".

export const AMPLIFICATION = {
  title: "Amplification & the Amplifier",
  lead: "Enhancing a signal to its correct level so it can be used further in the process is called amplification. The device that does it is called an amplifier.",

  sample: {
    src: "/amplification/amplification-sample.wav",
    label: "Raw mic signal",
  },

  // Gain control range (dB). 0 dB = unity (no change). +60 dB is about the
  // most a typical mic preamp offers.
  gain: { min: 0, max: 60, step: 0.5, initial: 0 },

  sections: [
    {
      label: "What amplification does",
      text: "An amplifier makes a bigger copy of the signal it is given. The shape of the waveform stays the same, so the words, notes and tone stay the same. Only the size (the amplitude) changes. In the spectrum above, every frequency rises by the same amount when you add gain.",
    },
    {
      label: "Gain is measured in decibels",
      text: "The amount of amplification is called gain, written in dB. +6 dB roughly doubles the signal voltage, +20 dB multiplies it by 10, +40 dB by 100 and +60 dB by 1,000. The ×N readout next to the gain shows this multiplier as you move the control.",
    },
    {
      label: "Why studio signals need it",
      text: "Signals in the studio arrive at very different strengths. A microphone puts out only a few thousandths of a volt (mic level, roughly −60 to −40 dBu). A guitar pickup is stronger (instrument level). Consoles, interfaces and outboard gear expect line level, about +4 dBu (≈1.2 V). Each signal has to be brought up to that working level before the rest of the chain can use it.",
    },
    {
      label: "Gain staging and headroom",
      text: "The aim is not \"as loud as possible\" but \"the correct level\". Too little gain leaves the signal close to the noise floor. Too much pushes it past the top of the scale (0 dBFS in a digital system), where the peaks are cut off. Leaving some space below that ceiling (headroom) lets louder moments pass cleanly.",
    },
    {
      label: "Clipping and noise",
      text: "An amplifier can't make a signal bigger than its power supply or converter allows. Past that point it clips, flattening the waveform's peaks. You hear harsh distortion, and new harmonics appear in the spectrum that were never in the original. Gain also raises everything that came in with the signal, including hiss and hum, so a clean source matters.",
    },
  ],

  points: [
    "**Amplification** brings a signal up to the correct level for the next stage. The **amplifier** is the device that does it.",
    "Gain changes the **size** of the signal, not its **shape**. The whole spectrum moves up together.",
    "Gain is measured in **dB**: +6 dB ≈ 2×, +20 dB = 10×, +60 dB = 1,000× the voltage.",
    "A mic signal must be raised by roughly **40–60 dB** to reach **line level**.",
    "Too little gain leaves the signal in the **noise**. Too much makes it **clip** and distort.",
    "Good **gain staging** aims for a healthy level with **headroom** left before 0 dBFS.",
  ],
};
