// "What Is an Interface?" — content for WhatIsInterfaceLab.
//
// One screen, no tabs (same shape as WhatIsMixerLab's data): hero image,
// lead, labelled facts, then the translator analogy — one row per step,
// each pairing a translator's job with the interface's job; key points last.
// Each row's picture is a FlipCard: translator scene on the front, studio
// equivalent on the back.
//
// Pictures: public/audio-interface/<id>.jpg (hero: audio-interface.jpg;
// rows: front translator-<step>.jpg, back studio-<step>.jpg via
// `studioImage`). Until a file exists that slot shows a placeholder with
// the expected path.

export const interfaceImagePath = (id) => `/audio-interface/${id}.jpg`;

export const INTERFACE_CONCEPT = {
  image: "audio-interface",
  lead: "An audio interface is the translator between your studio and your computer. Microphones, instruments and speakers work with sound as a changing electrical voltage (analog); a computer only understands numbers (digital). The interface converts one into the other, in both directions, fast enough that you never notice it is there.",
  facts: [
    {
      label: "What an audio interface does",
      text: "It gets sound into and out of the computer. Inputs accept microphones (XLR), guitars (instrument / Hi-Z) and line-level gear; preamps bring weak signals up to a working level; analog-to-digital (A/D) converters turn them into numbers; a USB, Thunderbolt or PCIe connection (or network audio such as Dante) carries those numbers to the DAW; and digital-to-analog (D/A) converters turn the DAW's output back into voltage for your monitors and headphones. Many add MIDI ports and digital I/O (S/PDIF, ADAT, word clock).",
    },
    {
      label: "Why not the computer's own headphone jack",
      text: "A computer's built-in sound card is made for listening, not recording: no XLR inputs, no mic preamps or phantom power, converters sitting next to noisy processors, and drivers with too much delay to play along to. An interface moves the conversion into its own box with clean power and low-latency drivers (Core Audio on Mac, ASIO on Windows).",
    },
    {
      label: "What makes a good one",
      text: "The same things that make a good translator: accuracy and speed. Accuracy is converter quality: sample rate, bit depth, noise floor, dynamic range and a stable clock. Speed is latency: the round trip from input, through the computer and back out, set mostly by the buffer size. Below about 10 ms it feels instant to a performer.",
    },
  ],
  analogySubhead: "Think of a translator",
  analogyHint: "Flip each card to see its studio equivalent.",
  analogy: [
    {
      id: "translator-languages",
      studioImage: "studio-languages",
      translator: "Two languages",
      studio: "Analog & digital",
      text: "A guest who only speaks Japanese and a host who only speaks English can't talk to each other directly. The studio has the same problem: mics, guitars and speakers speak analog, a voltage that rises and falls with the sound wave; the computer speaks digital, a stream of numbers.",
    },
    {
      id: "translator-speak-up",
      studioImage: "studio-speak-up",
      translator: "\"Speak up, please\"",
      studio: "Inputs & preamps",
      text: "A translator can't translate a mumble, so first they make sure they can hear the guest clearly. The interface's inputs take each kind of source on the right socket, and its preamps lift a microphone's tiny signal to a level the converter can measure cleanly (with +48 V phantom power for condenser mics).",
    },
    {
      id: "translator-in",
      studioImage: "studio-in",
      translator: "Translating in",
      studio: "A/D converter",
      text: "The translator listens and writes each sentence down in the host's language. The analog-to-digital converter measures the incoming voltage thousands of times a second (the sample rate, e.g. 48,000 times) and writes every measurement as a number (the bit depth, e.g. 24-bit) that the DAW can record.",
    },
    {
      id: "translator-out",
      studioImage: "studio-out",
      translator: "Translating back",
      studio: "D/A converter",
      text: "When the host replies, the translator turns it back into Japanese so the guest can understand. The digital-to-analog converter turns the DAW's numbers back into a smooth voltage for the studio monitors and the headphone outputs, so you hear what you recorded.",
    },
    {
      id: "translator-gestures",
      studioImage: "studio-gestures",
      translator: "Interpreting gestures",
      studio: "MIDI interface",
      text: "Some interpreters translate gestures, not words. MIDI doesn't carry sound at all: it carries performance instructions (which key, how hard, when it was let go) between keyboards, controllers and the computer. A MIDI interface, or the MIDI ports on an audio interface, passes those instructions to the DAW, which plays them on a virtual instrument.",
    },
  ],
  points: [
    "An **audio interface** translates between the **analog** studio and the **digital** computer, in **both directions**.",
    "**Inputs & preamps** get a clean, strong signal; the **A/D converter** turns it into **numbers** (sample rate × bit depth).",
    "The **D/A converter** turns numbers back into **voltage** for monitors and headphones.",
    "A good interface is like a good translator: **accurate** (converter quality) and **fast** (low latency).",
    "**MIDI** carries **instructions, not sound**: note, velocity, timing.",
  ],
};
