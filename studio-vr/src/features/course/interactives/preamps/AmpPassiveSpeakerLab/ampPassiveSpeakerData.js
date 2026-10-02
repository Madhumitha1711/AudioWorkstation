export const ampPassiveImagePath = (id) => `/amp-passive-speaker/${id}.jpg`;

export const AMP_PASSIVE = {
  lead: "A passive speaker has no amplifier inside. Line level from your interface or console is far too weak to move a woofer, so a separate power amplifier sits in between and supplies the power the drivers need.",

  basics: [
    {
      label: "Signal chain",
      text: "Interface / console line out → balanced line cable → power amplifier → speaker cable → passive speaker. The amp turns a line-level signal (about 1 V) into a speaker-level signal of tens of volts and several amps of current.",
    },
    {
      label: "Matching the pair",
      text: "Match impedance first: an 8 Ω speaker wants an amp rated into 8 Ω. Then match power: a common rule is an amp rated around 1.5–2× the speaker's continuous (program) rating. Too little power is the real danger, because a clipping amp sends harsh distortion that can burn out a tweeter.",
    },
    {
      label: "Hook-up",
      text: "Amp to speaker uses heavy two-conductor speaker cable (binding posts, banana plugs or Speakon), never instrument cable. Keep + to + (red) and − to − (black) on both speakers. Switch the amp on last and off first, with its level down.",
    },
  ],

  examples: [
    {
      id: "ns10-amp",
      title: "Yamaha NS10 + Power Amp",
      lead: "The most famous passive nearfield in recording history, always driven by a separate power amp.",
      facts: [
        {
          label: "Speaker",
          text: "Two-way, sealed cabinet, 180 mm paper woofer, 35 mm soft-dome tweeter. 8 Ω, 60 W program / 120 W max, 60 Hz–20 kHz (NS-10M Studio, 1987–2001).",
        },
        {
          label: "Amplifier",
          text: "Yamaha never built one in, so every studio chose its own. Classic choices include the Bryston 4B and Yamaha's P-series power amps.",
        },
        {
          label: "Why it works",
          text: "A clean, powerful amp keeps the NS10's tight bass and forward 2 kHz midrange honest. Engineers learned that a mix that sounded good on NS10s translated almost everywhere.",
        },
      ],
    },
    {
      id: "cla10-cla200",
      title: "Avantone CLA-10 + CLA-200",
      lead: "A modern passive take on the NS10, with the power amp designed to drive it.",
      facts: [
        {
          label: "Speaker",
          text: "CLA-10: two-way, sealed, 18 cm woofer, 3.5 cm dome tweeter, 2 kHz crossover. 8 Ω, 60 W program / 120 W peak, 60 Hz–20 kHz, binding posts on the back.",
        },
        {
          label: "Amplifier",
          text: "CLA-200: two-channel Class AB, 200 W per channel into 8 Ω (300 W into 4 Ω). Convection cooled with no fan noise, and large VU meters.",
        },
        {
          label: "Why it works",
          text: "200 W into a 60 W speaker is headroom, not loudness. The amp never runs out of power on drum transients, so it never clips. Sensible level settings protect the speaker.",
        },
      ],
    },
  ],

  points: [
    "A **passive speaker** has no built-in amp. It needs an external **power amplifier**.",
    "Chain: **line out → power amp → speaker cable → speaker**.",
    "Match **impedance** (Ω) first, then **power** (W): roughly **1.5–2×** the speaker's program rating.",
    "An **underpowered amp that clips** is more dangerous to tweeters than a big amp used sensibly.",
    "**NS10 + power amp** and **CLA-10 + CLA-200** are classic passive pairings: 8 Ω speakers with clean, high-headroom amps.",
  ],
};
