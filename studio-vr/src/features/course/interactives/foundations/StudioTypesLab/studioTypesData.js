export const STUDIO_TYPES = [
  {
    id: "commercial",
    points: [
      "Big, multi-room facilities for professional projects.",
      "Heavy isolation keeps loud sound in and noise out.",
      "Best for full bands, drums and orchestral sessions.",
    ],
    tab: "Commercial",
    title: "Commercial Recording Studios",
    lead: "Large-scale, multi-room facilities designed for professional music production, record labels, and commercial projects.",
    layout:
      "Multiple specialized spaces including a main control room, a spacious live tracking room, isolated vocal/instrument booths, and dedicated machine rooms.",
    build: "Heavy acoustic isolation (floating floors, double-leaf walls) to handle high sound pressure levels without leakage.",
    use: "Capturing full bands, acoustic drum kits, orchestral sections, and high-budget album productions.",
  },
  {
    id: "home-project",
    points: [
      "One room for recording, editing and mixing.",
      "Uses acoustic panels, not structural isolation.",
      "Great for solo artists, songwriters and producers.",
    ],
    tab: "Home & Project",
    title: "Home & Project Studios",
    lead: "Personal workspaces built in residential or private spaces, ranging from bedroom setups to dedicated garage conversions.",
    layout: "Typically a single combined room where the recording, editing, and mixing happen in one space.",
    build: "Basic acoustic treatment (wall panels, bass traps) rather than structural isolation.",
    use: "Solo artists, songwriters, electronic music producers, and indie musicians tracking vocals, guitars, or virtual instruments.",
  },
  {
    id: "mixing-mastering",
    points: [
      "Built for listening, not recording.",
      "Very accurate monitoring and acoustics.",
      "Used to finish mixes and prepare the final master.",
    ],
    tab: "Mixing & Mastering",
    title: "Mixing & Mastering Suites",
    lead: "Specialized control rooms built purely for post-production audio processing rather than live tracking.",
    layout:
      "Single room centered around an ergonomic mix desk and hyper-accurate monitoring environment, often with no live recording booth.",
    build: "Designed for extreme acoustic precision (flat frequency response, Reflection-Free Zones) to reveal subtle audio detail.",
    use: "Fine-tuning mixed audio tracks, balancing frequencies, stereo mastering, and preparing final audio deliverables.",
  },
  {
    id: "voiceover-podcast",
    points: [
      "Small, very quiet rooms made for speech.",
      "Almost no echo, so voices sound clean and close.",
      "Used for podcasts, audiobooks and voice acting.",
    ],
    tab: "Voiceover & Podcast",
    title: "Voiceover & Podcast Studios",
    lead: "Compact, highly insulated spaces engineered specifically for speech clarity and spoken-word media.",
    layout: "Usually consists of an ultra-quiet vocal booth and a streamlined production desk.",
    build: "Heavily deadened acoustic environments with near-zero reverberation to produce clean, intimate voice tracks.",
    use: "Podcasts, audiobooks, dubbing, animated voice acting, video game dialogue, and radio commercials.",
  },
  {
    id: "post-foley",
    points: [
      "Sound for film, TV and games.",
      "Foley pits recreate footsteps and everyday sounds.",
      "Tuned for surround and immersive formats like Dolby Atmos.",
    ],
    tab: "Post & Foley",
    title: "Post-Production & Foley Facilities",
    lead: "Audio-for-picture workspaces built specifically to create, edit, and sync sound effects, film scores, and dialogue for film, television, and gaming.",
    layout:
      "Includes dubbing stages with projection screens, editing suites, and dedicated Foley pits (pits filled with gravel, hardwood, water, dirt, or tile to recreate realistic physical sound effects).",
    build: "Tuned for surround sound or immersive audio standards (like Dolby Atmos) to mirror cinematic environments.",
    use: "Sound design, Automatic Dialogue Replacement (ADR), game audio implementation, and film re-recording mixing.",
  },
  {
    id: "broadcast-streaming",
    points: [
      "Made for live radio, TV and streaming.",
      "Many mics, cameras and switchers on one desk.",
      "Low noise and fast turnaround matter most.",
    ],
    tab: "Broadcast & Streaming",
    title: "Broadcast & Streaming Suites",
    lead: "On-air spaces designed for real-time radio, live television, news production, and high-end digital streaming.",
    layout: "Integrated media desks with multi-mic setups, video cameras, automated switcher panels, and acoustic insulation.",
    build: "Designed for low ambient noise and fast turnaround without requiring deep acoustic isolation for live instruments.",
    use: "Live radio broadcasts, video podcasts, live news feeds, and professional content streaming.",
  },
];

export const studioTypeImagePath = (id) => `/studio-types/${id}.jpg`;
