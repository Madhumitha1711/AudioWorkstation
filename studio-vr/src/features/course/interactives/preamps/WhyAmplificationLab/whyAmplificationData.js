// "Why Amplification?" — each everyday example (conversation, TV, headlights,
// room AC, the studio) is paired with its own picture or short clip so the
// student can connect the idea of gain to something they've already seen.
//
// media.type is "video" or "image". Drop the file at public<media.src> and it
// appears automatically; until then that row shows a placeholder frame with
// the expected path. `label` is never shown as a heading — it's only used as
// the media's alt / aria-label and on the placeholder.

export const WHY_AMPLIFICATION = {
  title: "Why Amplification?",
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
      media: { type: "image", src: "/why-amplification/headlights.jpg" },
      text: "High beam lets you see further, like adding gain. But in fog it also lights up every droplet: amplification boosts the noise along with the signal, and too much dazzles the next driver.",
    },
    {
      id: "ac",
      label: "AC temperature in a room",
      media: { type: "image", src: "/why-amplification/ac.jpg" },
      text: "A tiny thermostat signal controls a powerful compressor. An amplifier works the same way: a small input controls a large source of power from the supply, and holding a steady target level is what gain staging is about.",
    },
    {
      id: "studio",
      label: "Mic preamp in the studio",
      media: { type: "image", src: "/why-amplification/studio.jpg" },
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
