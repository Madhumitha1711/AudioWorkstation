// Content for the "Studio Components" briefing lab (StudioComponentsLab.jsx).
// Structure and ids from design/studio-components-chapter.html's SECTIONS;
// the copy has been rewritten in plain, beginner-level language (this is
// many students' first look inside a studio) — short sentences, jargon
// avoided or explained on first use. Keep new copy at that level.
//
// Four sections — Control Room / Recording (Live) Room × Electronic /
// Non-electronic — of four components each. Each item:
//   id     — also the icon key (ICONS below) and the image file name
//            (see componentImagePath)
//   name   — display name
//   lead   — one-line definition
//   body   — paragraphs; **double asterisks** mark bold runs (rendered as
//            <strong> by StudioComponentsLab's renderRich, so this file
//            stays plain data with no JSX/HTML strings)
//   points — key points
//
// `tone` picks the section's accent color from the --scl-* tokens in
// StudioComponentsLab.css (amber/green/blue/purple, with separate
// light-theme values), matching the mockup's per-section colors.

export const SECTIONS = [
  {
    n: "01",
    room: "Control Room",
    type: "Electronic",
    tone: "amber",
    items: [
      {
        id: "console",
        name: "Mixing Console",
        lead: "The big desk where all the sounds come together.",
        body: [
          "Every microphone and instrument in the studio is connected to the mixing console. Each one gets its own **channel**, a column of knobs with a **slider (fader)** at the bottom.",
          "The engineer uses these controls to make each sound louder or quieter and to change how it sounds. Together, the channels make one finished **mix**.",
        ],
        points: [
          "One channel = one sound source, like a voice or a drum.",
          "The fader at the bottom controls how loud that sound is.",
          "The console blends everything into one song.",
        ],
      },
      {
        id: "monitors",
        name: "Studio Speakers (Monitors)",
        lead: "Special speakers that let you hear the recording exactly as it is.",
        body: [
          "Home speakers often add extra bass or sparkle to make music sound nicer. Studio speakers, called **monitors**, don't. They play the sound **honestly**, so you can hear any problems.",
          "The two speakers and the listener's head form a **triangle** with equal sides. Sitting in that spot gives the clearest picture of the sound.",
        ],
        points: [
          "Monitors show the real sound, good or bad.",
          "Sit in the triangle with the two speakers.",
          "Point the speakers at your ears.",
        ],
      },
      {
        id: "outboard",
        name: "Outboard Gear",
        lead: "Hardware boxes that change or improve the sound.",
        body: [
          "These are separate boxes that each do one job. Some make a quiet microphone signal **stronger**. Some keep volume **even**. Some change the **tone**, like more bass or more treble.",
          "They are stacked on shelves called **racks**, so they are easy to reach and connect.",
        ],
        points: [
          "Each box does one job to the sound.",
          "Racks hold many boxes in one place.",
          "Many of these jobs can also be done with software.",
        ],
      },
      {
        id: "machine",
        name: "Machine Room",
        lead: "A separate room for the noisy computers and equipment.",
        body: [
          "Computers and some gear have **fans** that make noise. If they sat in the control room, you would hear that noise while listening.",
          "So they are placed in a separate **machine room**. This includes the recording computer and the power equipment that keeps everything running safely.",
        ],
        points: [
          "Less noise means you hear the music more clearly.",
          "The recording computer often lives here.",
          "Good power equipment helps avoid humming sounds.",
        ],
      },
    ],
  },
  {
    n: "02",
    room: "Control Room",
    type: "Non-electronic",
    tone: "green",
    items: [
      {
        id: "panels",
        name: "Acoustic Panels & Bass Traps",
        lead: "Soft panels on the walls that stop sound from bouncing around.",
        body: [
          "Sound bounces off hard walls, like a ball. These **bounces (echoes)** mix with the sound from the speakers and make it harder to hear clearly.",
          "Soft, thick **panels** soak up the bounces. Bigger panels in the corners, called **bass traps**, stop deep sounds from building up and sounding boomy.",
        ],
        points: [
          "Panels soak up sound instead of letting it bounce.",
          "Bass traps go in the corners.",
          "A treated room sounds clearer.",
        ],
      },
      {
        id: "diffusers",
        name: "Diffusers",
        lead: "Bumpy wall panels that spread sound out evenly.",
        body: [
          "Panels soak sound up. **Diffusers** do something different: they **scatter** sound in many directions, like light through frosted glass.",
          "This keeps the room sounding **natural and lively**, without strong echoes. You often see them as wooden blocks of different depths on the back wall.",
        ],
        points: [
          "Panels soak up sound; diffusers spread it out.",
          "A room with only panels can sound too dull.",
          "Diffusers are usually on the back wall or ceiling.",
        ],
      },
      {
        id: "furniture",
        name: "Studio Desk & Chair",
        lead: "Furniture designed so the engineer can work and listen comfortably.",
        body: [
          "A studio desk keeps the controls, screens and keyboard **close at hand**, without blocking the sound from the speakers.",
          "A good chair keeps the engineer's **ears at the right height** between the speakers, even during long sessions.",
        ],
        points: [
          "Nothing should block the sound from speaker to ear.",
          "Everything important is within easy reach.",
          "A squeaky chair can end up on a quiet recording.",
        ],
      },
      {
        id: "window",
        name: "Studio Window",
        lead: "Thick glass between the two rooms so people can see each other.",
        body: [
          "The window lets the engineer and the musicians **see each other**, so they can give signals like \"start\" or \"stop\".",
          "It is made of **two or more thick layers of glass** with air in between. This blocks sound, so the rooms stay quiet from each other.",
        ],
        points: [
          "You can see through it, but sound can't get through.",
          "Several glass layers block the sound.",
          "Hand signals through the glass help during recording.",
        ],
      },
    ],
  },
  {
    n: "03",
    room: "Recording / Live Room",
    type: "Electronic",
    tone: "blue",
    items: [
      {
        id: "mics",
        name: "Microphones",
        lead: "Devices that capture sound and turn it into an electrical signal.",
        body: [
          "A microphone \"hears\" sound in the air and turns it into **electricity** that can be recorded.",
          "There are different kinds. **Dynamic** mics are tough and good for loud sounds like drums. **Condenser** mics pick up fine detail and are popular for singing.",
        ],
        points: [
          "Different mics suit different sounds.",
          "Moving a mic closer makes the sound fuller and deeper.",
          "Where you put the mic matters a lot.",
        ],
      },
      {
        id: "instruments",
        name: "Electric Instruments & Amps",
        lead: "Electric guitars, basses and keyboards, plus the amplifiers that make them loud.",
        body: [
          "An electric guitar is very quiet on its own. It plugs into an **amplifier (amp)**, which makes it loud. A microphone in front of the amp records the sound.",
          "Keyboards and some guitars can also be plugged **straight into** the studio's equipment without an amp.",
        ],
        points: [
          "The amp is a big part of an electric guitar's sound.",
          "Instruments can be recorded with a mic or plugged in directly.",
          "Keyboards are usually plugged in directly.",
        ],
      },
      {
        id: "headphones",
        name: "Headphones for Musicians",
        lead: "Headphones that let musicians hear themselves and the music while they play.",
        body: [
          "While recording, musicians wear **headphones** to hear the song, each other and themselves.",
          "Each musician can often choose **their own mix**, for example \"more of my voice, less drums\". Closed headphones stop the sound from leaking into the microphones.",
        ],
        points: [
          "Musicians hear the music through headphones, not speakers.",
          "Each person can set their own balance.",
          "Hearing yourself well helps you play better.",
        ],
      },
      {
        id: "wallbox",
        name: "Wall Connection Boxes",
        lead: "Sockets in the wall where microphones plug in.",
        body: [
          "Microphone cables plug into **numbered sockets** on the wall of the recording room.",
          "Behind the wall, cables carry each signal to the **control room**. This means no cables running under doors, and the rooms stay sealed and quiet.",
        ],
        points: [
          "Each socket has a number.",
          "Socket 3 goes to channel 3 on the mixing console.",
          "Keeping doors closed keeps the rooms quiet.",
        ],
      },
    ],
  },
  {
    n: "04",
    room: "Recording / Live Room",
    type: "Non-electronic",
    tone: "purple",
    items: [
      {
        id: "floor",
        name: "Floating Floor",
        lead: "A special floor that stops vibrations from traveling through the building.",
        body: [
          "Sound doesn't only travel through the air. It also travels through **floors and walls**, like footsteps you hear from the flat upstairs.",
          "A floating floor rests on **rubber pads**, so it doesn't touch the building directly. Vibrations like footsteps or traffic can't get in or out.",
        ],
        points: [
          "Sound can travel through solid things, not just air.",
          "Rubber pads separate the floor from the building.",
          "This keeps outside noise out of recordings.",
        ],
      },
      {
        id: "stands",
        name: "Mic Stands & Holders",
        lead: "Stands and holders that keep microphones steady and quiet.",
        body: [
          "A **mic stand** holds the microphone exactly where you place it, so it doesn't move while someone is playing.",
          "A **shock mount** holds the mic with elastic bands, so bumps don't turn into rumbling noise. A **pop filter** is a screen in front of the mic that softens puffs of air from words like \"pop\".",
        ],
        points: [
          "A steady mic gives a steady sound.",
          "Elastic holders stop bumps from being heard.",
          "Pop filters help when recording singing or speech.",
        ],
      },
      {
        id: "gobos",
        name: "Movable Sound Walls (Gobos)",
        lead: "Portable walls that help keep instruments' sounds apart.",
        body: [
          "When a band plays in one room, each microphone also picks up the other instruments. This is called **bleed**.",
          "**Gobos** are soft, movable walls placed between players. They reduce bleed, so each instrument can be recorded more **cleanly** while the band still plays together.",
        ],
        points: [
          "Gobos keep sounds more separate.",
          "They can be moved anywhere in the room.",
          "Some have windows so players can still see each other.",
        ],
      },
      {
        id: "acoustic",
        name: "Acoustic Instruments",
        lead: "Instruments that make sound without electricity, like pianos, acoustic guitars and drums.",
        body: [
          "These instruments send sound straight into the air, so they are recorded with **microphones**.",
          "The recording depends on **where you put the mic** and on the **sound of the room**, not just the instrument itself.",
        ],
        points: [
          "Moving the mic a little can change the sound a lot.",
          "The room becomes part of the recording.",
          "Try moving the mic before changing anything else.",
        ],
      },
    ],
  },
];

// Flat list (with a back-reference to each item's section) for prev/next
// paging across all 16 components, in section order.
export const ALL_COMPONENTS = SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, section })),
);

// Photos are served from public/ — drop a 16:9 (or 16:10) JPG per item at
// public/studio-components/<id>.jpg. Until a file exists the lab shows a
// labelled icon placeholder with the expected path, same as the mockup.
export const componentImagePath = (id) => `/studio-components/${id}.jpg`;

// 24×24 stroke icon bodies (inner SVG markup), keyed by item id — used in
// the list and as the image placeholder. Same shapes as the mockup.
export const ICONS = {
  console:
    '<rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="9" x2="6" y2="15"/><line x1="10" y1="9" x2="10" y2="15"/><line x1="14" y1="9" x2="14" y2="15"/><line x1="18" y1="9" x2="18" y2="15"/><rect x="4.5" y="12" width="3" height="2" fill="currentColor"/><rect x="8.5" y="10" width="3" height="2" fill="currentColor"/><rect x="12.5" y="13" width="3" height="2" fill="currentColor"/><rect x="16.5" y="11" width="3" height="2" fill="currentColor"/>',
  monitors: '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="7" r="2"/><circle cx="12" cy="15" r="4"/>',
  outboard:
    '<rect x="2" y="4" width="20" height="5" rx="1"/><rect x="2" y="10" width="20" height="5" rx="1"/><rect x="2" y="16" width="20" height="5" rx="1"/><circle cx="7" cy="6.5" r="1"/><circle cx="7" cy="12.5" r="1"/><circle cx="7" cy="18.5" r="1"/>',
  machine: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="9" x2="16" y2="9"/><circle cx="12" cy="16" r="3"/>',
  panels: '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>',
  diffusers:
    '<rect x="3" y="12" width="3" height="9"/><rect x="7" y="6" width="3" height="15"/><rect x="11" y="15" width="3" height="6"/><rect x="15" y="4" width="3" height="17"/><rect x="19" y="10" width="2" height="11"/>',
  furniture: '<path d="M2 10h20l-2 3H4z"/><line x1="5" y1="13" x2="5" y2="21"/><line x1="19" y1="13" x2="19" y2="21"/><rect x="9" y="4" width="6" height="6" rx="1"/>',
  window: '<path d="M3 4l6 1v14l-6 1z"/><path d="M11 5l5 -1v16l-5 -1z"/>',
  mics: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>',
  instruments: '<path d="M14 3l7 7-2 2-2-2-5 5a3.5 3.5 0 1 1-4-4l5-5-2-2z"/>',
  headphones: '<path d="M3 16v-3a9 9 0 0 1 18 0v3"/><rect x="2" y="15" width="5" height="7" rx="2"/><rect x="17" y="15" width="5" height="7" rx="2"/>',
  wallbox: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/>',
  floor: '<rect x="2" y="4" width="20" height="4" rx="1"/><rect x="2" y="16" width="20" height="4" rx="1"/><path d="M5 8v8M12 8v8M19 8v8" stroke-dasharray="2 2"/>',
  stands:
    '<circle cx="17" cy="4" r="2"/><line x1="15.5" y1="5.5" x2="6" y2="12"/><line x1="10" y1="9.5" x2="10" y2="20"/><line x1="10" y1="20" x2="5" y2="22"/><line x1="10" y1="20" x2="15" y2="22"/>',
  gobos: '<path d="M4 20V6l6-2v16z"/><path d="M14 20V4l6 2v14z"/><line x1="2" y1="21" x2="22" y2="21"/>',
  acoustic: '<ellipse cx="12" cy="15" rx="7" ry="6"/><circle cx="12" cy="14" r="2"/><line x1="12" y1="9" x2="12" y2="2"/>',
};
