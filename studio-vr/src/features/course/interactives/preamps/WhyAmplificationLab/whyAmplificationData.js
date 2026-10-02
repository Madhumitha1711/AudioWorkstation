export const WHY_AMPLIFICATION = {
  title: "Why Amplification?",
  question: "What do you think happened?",
  lead: "Most signals start out too small to be useful. Amplification makes a bigger copy of a weak signal so it can reach the listener, drive a speaker or feed the next piece of gear.",
  examples: [
    {
      id: "talking",
      label: "Human talking to human",
      media: { type: "video", src: "/why-amplification/talking.mp4" },
      text: "A voice gets weaker with distance and is soon covered by background noise. A microphone and PA system make a bigger copy of the voice so it reaches the back of the room.",
    },
    {
      id: "tv",
      label: "Human watching TV",
      media: { type: "video", src: "/why-amplification/tv.mp4" },
      text: "The volume knob is a gain control. It changes how loud the sound is, not what is being said. Turn it up too far and the small speakers start to distort.",
    },
    {
      id: "headlights",
      label: "Driving a car with headlights",
      media: { type: "video", src: "/why-amplification/headlights.mp4" },
      text: "High beam lets you see further, like adding gain. But in fog it also lights up every droplet: amplification boosts the noise along with the signal, and too much dazzles the next driver.",
    },
    {
      id: "ac",
      label: "AC temperature in a room",
      media: { type: "video", src: "/why-amplification/ac.mp4" },
      text: "A tiny thermostat signal controls a powerful compressor. An amplifier works the same way: a small input controls a large source of power from the supply, and holding a steady target level is what gain staging is about.",
    },
    {
      id: "studio",
      label: "Mic preamp in the studio",
      media: { type: "video", src: "/why-amplification/studio.mp4" },
      text: "A microphone's output is tiny, often around a thousandth of a volt. A mic preamp adds about 40–60 dB of gain to bring it up to line level, strong enough for the console, interface and recorder to work with.",
    },
  ],
  points: [
    "Most signals start **too weak** to use. A microphone's output is tiny.",
    "Amplification makes a **bigger copy** of the signal; it doesn't change what the signal says.",
    "Gain boosts the **noise along with the signal**, so start with a clean source.",
    "Too much gain causes **distortion** and overloads the next stage.",
    "An amplifier takes its energy from the **power supply**. The input only controls it.",
  ],
};
