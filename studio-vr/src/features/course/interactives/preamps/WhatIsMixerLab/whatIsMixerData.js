export const mixerImagePath = (id) => `/mixer/${id}.jpg`;

export const MIXER_CONCEPT = {
  image: "mixer",
  lead: "A mixer (mixing console, desk or board) takes many audio signals in, lets you shape and balance each one on its own channel, and combines them into a small number of outputs: the stereo mix, the headphone mixes, the feed to the recorder.",
  facts: [
    {
      label: "What a mixer does",
      text: "Four jobs, on every channel: bring the signal up to a working level (gain), shape its tone (EQ and dynamics), set how loud it is in the mix and where it sits left to right (fader and pan), and decide where it goes (routing to the main mix, sub-groups, aux sends and outputs).",
    },
    {
      label: "Why one strip per source",
      text: "Every input gets its own identical channel strip, so each source can be treated separately before anything is combined. Once signals are summed onto a bus you can no longer change one without changing all of them, which is why the order of the stages matters.",
    },
  ],
  analogySubhead: "Think of a restaurant kitchen",
  analogyHint: "Flip each card to see its studio equivalent.",
  analogy: [
    {
      id: "kitchen-ingredients",
      studioImage: "studio-ingredients",
      from: "Ingredients",
      to: "Inputs",
      text: "Vegetables, spices, rice and stock arrive at the kitchen door, each in its own crate. Microphones, guitars, keyboards and playback arrive at the mixer the same way, each on its own input.",
    },
    {
      id: "kitchen-prep",
      studioImage: "studio-prep",
      from: "Prep station",
      to: "Channel strip",
      text: "Every ingredient is washed, trimmed and seasoned on its own board before it goes near the pot. Every input gets its own channel strip with gain, EQ and dynamics so it is ready before it is combined.",
    },
    {
      id: "kitchen-recipe",
      studioImage: "studio-recipe",
      from: "Quantities",
      to: "Faders & pan",
      text: "Too much chilli and you taste nothing else; too little salt and the dish is flat. Faders set how much of each source goes into the mix, and pan sets where on the plate it sits, left to right.",
    },
    {
      id: "kitchen-pot",
      studioImage: "studio-pot",
      from: "The pot",
      to: "Mix bus",
      text: "Everything goes into one pot and becomes a single dish. The mix bus is that pot: every channel is summed into it, and from then on it is one signal, the mix.",
    },
    {
      id: "kitchen-pass",
      studioImage: "studio-pass",
      from: "Tasting & serving",
      to: "Aux & outputs",
      text: "The head chef tastes a spoonful, the waiter takes plates to the tables. Aux sends give the singer a headphone mix or feed the reverb, and the master output serves the finished mix to the speakers and recorder.",
    },
  ],
  points: [
    "A mixer **combines many inputs** into a few outputs: main mix, monitor mixes, recorder feeds.",
    "Every input gets its own **channel strip**: gain, EQ, dynamics, pan, fader, routing.",
    "Sources are treated **separately first**, then **summed** on a bus.",
    "Kitchen: **ingredients = inputs**, **prep station = channel strip**, **quantities = faders**, **pot = mix bus**, **serving = outputs**.",
  ],
};
