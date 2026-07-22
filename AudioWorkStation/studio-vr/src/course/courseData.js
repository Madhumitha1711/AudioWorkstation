// Course content for the "Start Course" screen, organized per VR hotspot
// (topic). Each ready topic has: narrated video lessons, a knowledge-check
// assessment, and a hands-on interactive practice section. Only "Speakers"
// and "DAW Workstation" are fully built out for now — the rest are stubbed
// as locked/"coming soon" and will be filled in with real course content.
//
// assessment.questions[] entries may optionally carry an `audioClips` array
// — [{ id, label, url }, ...] — for ear-training-style questions where the
// student has to listen before answering (e.g. a "Before"/"After" pair, or
// two takes with different compression settings). AssessmentSection renders
// these as toggle-able play buttons above the answer options; leave the
// array off (or empty) for ordinary text-only questions. This mirrors
// `course.question.audioClips` (shared.audio-asset, S3-backed) in the
// studio-cms Strapi schema.

export const TOPICS = [
  {
    id: "speaker",
    room: "Control Room",
    title: "Speakers",
    intro:
      "Studio monitors are the lens you mix through — everything you learn here is about trusting what you hear.",
    ready: true,
    // Real photogrammetry scan of the room's actual speaker — rendered as a
    // rotatable 3D preview on this topic's lessons (see GearModelViewer).
    // `kind` is the procedural-placeholder fallback if the scan is missing.
    model: { kind: "speaker", url: "/model/speaker.glb" },
    lessons: [
      {
        id: "monitor-types",
        title: "Why Studio Monitors Aren't Like Home Speakers",
        duration: "4 min",
        paragraphs: [
          "Consumer speakers are voiced to sound exciting — most boost the bass and add a little sparkle to the top end because that's what sells them in a showroom. Studio monitors do the opposite on purpose: they're built for the flattest, most uncolored frequency response the manufacturer can manage. If a monitor is already flattering a mix, you have no way of knowing whether the mix will translate to a car stereo, a phone speaker, or a club system.",
          "That's the whole job of a monitor — to tell the truth about what's on the recording, even when the truth is a boomy low end or a harsh vocal. Engineers learn to trust a specific pair of monitors over months of mixing on them, building a mental model of how a good mix should sound in that room, on that gear.",
          "Monitors are generally grouped by how far you sit from them. Nearfield monitors are designed to be used at close range — usually three to five feet — which minimizes how much of what you hear is direct sound from the speaker versus reflected sound bouncing off the room. That makes nearfields far more forgiving of an untreated or awkwardly shaped room, which is why they're the default choice in almost every project studio.",
          "Midfield and far-field monitors sit further back, often soffit-mounted into the front wall of a purpose-built control room. They use larger drivers, move more air, and can reveal low-frequency detail nearfields simply can't — but they demand a properly treated room to sound accurate, which is why you'll mostly find them in professional mixing and mastering suites rather than bedroom setups.",
        ],
      },
      {
        id: "ported-vs-sealed",
        title: "Ported vs. Sealed Cabinet Design",
        duration: "3 min",
        paragraphs: [
          "Look closely at the speaker in the control room and you'll notice slots on either side of the tweeter — those are bass reflex ports. A sealed cabinet is exactly what it sounds like: a fully closed box where the woofer's rear-firing energy is trapped and absorbed. A ported cabinet instead vents that rear energy through a tuned port, using the cabinet itself as a resonant chamber that reinforces low frequencies the woofer couldn't produce efficiently on its own.",
          "The trade-off is predictable once you know what to listen for. Sealed designs tend to have tighter, more controlled bass with a gentler low-frequency roll-off, and they're more forgiving about placement near a back wall because there's no port output to interact with room boundaries. Ported designs get louder, deeper bass out of a smaller cabinet — but push them hard enough and you'll hear \"chuffing,\" a turbulent noise as air rushes through the port at high excursion.",
          "Neither design is objectively better; they're different engineering compromises. A lot of professional nearfields are ported because studios want extended bass response without needing a subwoofer, while some mastering engineers prefer sealed monitors specifically for the tighter, more predictable low end.",
        ],
      },
      {
        id: "crossovers",
        title: "Two-Way vs. Three-Way Crossover Design",
        duration: "3 min",
        paragraphs: [
          "A crossover splits the incoming signal by frequency and sends each band to the driver built to reproduce it — a tweeter can't move enough air to handle bass, and a woofer can't reproduce clean highs, so the crossover keeps each driver working in its comfort zone.",
          "A two-way monitor, like the one in this room, has a single crossover point: everything below it goes to the woofer, everything above goes to the tweeter. It's a simpler circuit with fewer places for phase issues to creep in, which is part of why two-way designs dominate compact nearfields.",
          "A three-way monitor adds a dedicated midrange driver between the woofer and tweeter, with two crossover points instead of one. That extra driver takes pressure off the woofer in the critical vocal range and can produce a smoother, more detailed midrange — at the cost of a more complex crossover network that has to be engineered carefully to avoid audible seams between drivers.",
          "You'll also see the terms passive and active crossover. A passive crossover is a network of capacitors and inductors sitting between a single amplifier and the drivers. An active (or bi-amped) design uses a separate amplifier per driver with the crossover happening before amplification — generally cleaner and more controlled, which is why most modern powered studio monitors are active.",
        ],
      },
      {
        id: "placement",
        title: "Choosing and Placing Monitors in Your Room",
        duration: "3 min",
        paragraphs: [
          "Even the best monitor sounds wrong in the wrong spot. The standard starting point is an equilateral triangle: the two monitors and your head form three equal sides, with each tweeter angled in and roughly at ear height when seated at the mix position.",
          "Room interaction matters as much as the monitor itself. Bass builds up near walls and especially in corners, so a monitor pushed flush against a back wall will read louder in the low end than the same monitor pulled a couple of feet into the room. The first reflection points — where sound bounces off the side walls, ceiling, and desk before reaching your ears — are worth treating with absorption, since those early reflections are what most smear stereo imaging and tonal accuracy.",
          "Finally, match the monitor to the room, not just your budget. A large midfield monitor in a small, untreated bedroom will excite room modes and boundary reinforcement so aggressively that you'll end up mixing around problems the room created rather than problems in your mix. In small or moderately treated rooms, a well-placed nearfield monitor will almost always give you a more trustworthy picture than an oversized monitor fighting the space.",
        ],
      },
    ],
    assessment: {
      id: "speaker-assessment",
      title: "Knowledge Check",
      questions: [
        {
          id: "q1",
          prompt: "Why are studio monitors intentionally voiced differently from consumer speakers?",
          options: [
            "They're built for the flattest, most accurate response so a mix translates elsewhere",
            "They're designed to boost bass and treble to sound exciting",
            "They use cheaper components than consumer speakers",
            "They're always physically larger",
          ],
          correctIndex: 0,
          explanation:
            "Consumer speakers are voiced to sound exciting in a showroom. Monitors aim for the flattest response possible so what you hear is the truth about the recording.",
        },
        {
          id: "q2",
          prompt: "Nearfield monitors are placed close to the listener mainly because it...",
          options: [
            "Requires less amplifier power",
            "Minimizes how much of what you hear is reflected room sound, making them forgiving in untreated rooms",
            "Is the only way to hear bass frequencies",
            "Makes the tweeter last longer",
          ],
          correctIndex: 1,
          explanation:
            "Close listening distance minimizes the room's influence versus direct sound from the speaker, which is why nearfields are the default in untreated project studios.",
        },
        {
          id: "q3",
          prompt: "What's the key trade-off between a ported and a sealed cabinet?",
          options: [
            "There is no real difference between the two",
            "Sealed cabinets are always louder",
            "Ported gives deeper, louder bass from a smaller box but can \"chuff\" when pushed hard; sealed is tighter and more controlled",
            "Ported cabinets can't be used near a back wall",
          ],
          correctIndex: 2,
          explanation:
            "Ported designs vent rear energy through a tuned port for more extended bass, at the cost of possible port noise (chuffing). Sealed designs trade some extension for tighter, more predictable low end.",
        },
        {
          id: "q4",
          prompt: "In a two-way monitor, the crossover...",
          options: [
            "Sends the full signal to both the woofer and tweeter",
            "Splits the signal at one point, so bass goes to the woofer and highs go to the tweeter",
            "Is only found in three-way designs",
            "Eliminates the need for a tweeter",
          ],
          correctIndex: 1,
          explanation:
            "A two-way design has a single crossover point — everything below it drives the woofer, everything above drives the tweeter — which is simpler than a three-way's two crossover points.",
        },
        {
          id: "q5",
          prompt: "Why is the classic \"equilateral triangle\" setup recommended for monitor placement?",
          options: [
            "It's just a studio tradition with no acoustic basis",
            "It only matters for midfield monitors",
            "It reduces how many monitors you need",
            "Equal distances between both monitors and your head keep the stereo image and tonal balance consistent",
          ],
          correctIndex: 3,
          explanation:
            "With monitors and your head forming equal sides of a triangle, angled in toward the listener, you get a balanced, centered stereo image.",
        },
      ],
    },
    interactive: { id: "speaker-interactive", title: "Try It Yourself", kind: "speaker-lab" },
  },

  {
    id: "mixing-console",
    room: "Control Room",
    title: "Mixing Console",
    intro:
      "The console is where every signal in the room converges — understanding its layout means understanding the entire signal path.",
    ready: false,
  },

  {
    id: "daw-screens",
    room: "Control Room",
    title: "DAW Workstation",
    intro:
      "The dual displays run the software brain of the studio — where takes get edited, arranged, and shaped after they're captured.",
    ready: true,
    lessons: [
      {
        id: "what-is-a-daw",
        title: "What a DAW Actually Does",
        duration: "3 min",
        paragraphs: [
          "A Digital Audio Workstation is the software that records, edits, arranges, processes, and mixes audio once it's been converted to digital form. It's the modern equivalent of a multitrack tape machine, a mixing console, and an entire rack of outboard effects, all represented as tracks, faders, and plugins on screen.",
          "Pro Tools, Logic, Ableton Live, and others all do the same core job with different workflows and strengths — Pro Tools remains the standard for professional recording and post-production, Logic is common in music production on Mac, and Ableton is built around loop-based and electronic workflows. Most studios pair the DAW with analog hardware, like the console and outboard rack in this room, using each for what it does best.",
        ],
      },
      {
        id: "recall",
        title: "Recall: The DAW's Killer Feature",
        duration: "3 min",
        paragraphs: [
          "Recall is the ability to return a mix, months later, to the exact state it was in when you left it — every fader position, every EQ setting, every plugin parameter. A DAW does this automatically because the entire mix is just data in a session file; open the file and everything is exactly where you left it.",
          "An all-analog console can't do this natively. Every knob and fader position is a physical setting with no memory, so recalling an old mix meant hand-writing down settings on paper and hoping you (or a very patient assistant) could set every one of them back by hand. This is the single biggest reason DAWs became indispensable even in studios that still love analog gear for tracking and summing — the workflow flexibility of instant recall is hard to give up.",
        ],
      },
      {
        id: "editing-workflows",
        title: "Editing Techniques: Comping & Non-Destructive Workflows",
        duration: "4 min",
        paragraphs: [
          "Comping is the process of recording multiple takes of the same performance and then assembling a single, ideal take by selecting the best phrase, line, or note from each pass. A DAW makes this fast by laying every take on its own lane, letting an editor punch between them and crossfade seamlessly at the edit points.",
          "This is only practical because DAW editing is non-destructive — cutting, moving, or deleting a region doesn't touch the original recorded audio file on disk, it just changes what the DAW plays back and where. That means an editor can experiment freely, undo endlessly, and always get back to the original take, something that was far riskier when editing meant physically cutting tape.",
          "The same philosophy extends to processing: plugin effects are typically applied non-destructively as well, calculated in real time during playback rather than permanently altering the audio file, versus sending a signal through a piece of outboard hardware, which is a one-way, destructive print unless it's re-recorded to a fresh track.",
        ],
      },
    ],
    assessment: {
      id: "daw-assessment",
      title: "Knowledge Check",
      questions: [
        {
          id: "q1",
          prompt: "What is \"recall\" in a DAW, and why does it matter compared to an analog console?",
          options: [
            "It's a way to record audio faster",
            "It's the instant ability to return a session to an exact prior state, since the whole mix is just data — an analog console has no memory and must be reset by hand",
            "It's a type of plugin used for mastering",
            "It only applies to MIDI tracks, not audio",
          ],
          correctIndex: 1,
          explanation:
            "Because a session is just data, opening the file returns every fader, EQ, and plugin setting exactly where you left it — something a physical console can't do on its own.",
        },
        {
          id: "q2",
          prompt: "Comping refers to...",
          options: [
            "Compressing audio to reduce its dynamic range",
            "Converting an analog signal to digital",
            "Assembling one ideal take by picking the best phrase or line from several recorded takes",
            "A specific type of EQ curve",
          ],
          correctIndex: 2,
          explanation:
            "Comping means laying multiple takes on separate lanes and combining the best parts of each into a single composite performance.",
        },
        {
          id: "q3",
          prompt: "Why is DAW editing described as \"non-destructive\"?",
          options: [
            "It's technically impossible to make an editing mistake",
            "It never uses any disk space",
            "Cutting, moving, or deleting a region only changes playback/arrangement — the original audio file on disk is untouched",
            "It only works with uncompressed WAV files",
          ],
          correctIndex: 2,
          explanation:
            "The DAW just changes what plays back and when — you can always get back to the original recorded take, unlike physically cutting tape.",
        },
        {
          id: "q4",
          prompt: "A DAW is essentially the modern equivalent of which combination of older studio gear?",
          options: [
            "Only a mixing console",
            "A multitrack tape machine, a mixing console, and a rack of outboard effects, combined in software",
            "Just a set of studio monitors",
            "A single guitar amplifier",
          ],
          correctIndex: 1,
          explanation:
            "A DAW records, edits, arranges, processes, and mixes audio — jobs that used to require several separate pieces of hardware.",
        },
        {
          id: "q5",
          prompt: "How does applying a plugin effect in a DAW typically differ from printing through outboard hardware?",
          options: [
            "There's no real difference between the two",
            "Plugins only work on MIDI, not audio",
            "Outboard hardware is always non-destructive too",
            "Plugin processing is non-destructive and calculated in real time, while an outboard hardware pass is a one-way, destructive print unless re-recorded",
          ],
          correctIndex: 3,
          explanation:
            "Plugins can be adjusted or removed at any time since they're computed live during playback; hardware processing is baked into a new recorded pass.",
        },
      ],
    },
    interactive: { id: "daw-interactive", title: "Try It Yourself", kind: "equalizer-lab" },
  },

  {
    id: "patch-bay",
    room: "Control Room",
    title: "Patch Bay",
    intro: "One panel, every connection in the room — the patch bay is what makes a complex studio fast to reconfigure.",
    ready: false,
  },
  {
    id: "preamp-rack",
    room: "Control Room",
    title: "Preamp Rack",
    intro:
      "Before anything reaches the console, it passes through a preamp — the first, and one of the most character-defining, stages in the chain.",
    ready: false,
  },
  {
    id: "diffuser-panel",
    room: "Control Room",
    title: "Acoustic Diffuser",
    intro: "Not every acoustic problem should be absorbed away — diffusion is what keeps a treated room sounding alive.",
    ready: false,
  },
  {
    id: "lf-emitter",
    room: "Control Room",
    title: "Low Frequency Emitter",
    intro: "Bass is the hardest thing in a room to get right — this is why it often gets its own dedicated driver.",
    ready: false,
  },
  {
    id: "sound-card",
    room: "Control Room",
    title: "Sound Card",
    intro:
      "The audio interface is the bridge between the analog and digital worlds — and its quality sets a hard ceiling on everything recorded through it.",
    ready: false,
  },
];

// Flattens every ready topic's lessons + assessment + interactive step into
// one ordered list so the course can support linear "Previous / Next"
// navigation across the whole curriculum, not just within a topic.
export function buildStepList(topics) {
  const steps = [];
  topics.forEach((topic) => {
    if (!topic.ready) return;
    topic.lessons.forEach((lesson) => {
      steps.push({ kind: "lesson", topicId: topic.id, id: lesson.id, data: lesson });
    });
    if (topic.interactive) {
      steps.push({
        kind: "interactive",
        topicId: topic.id,
        id: topic.interactive.id,
        data: topic.interactive,
      });
    }
    if (topic.assessment) {
      steps.push({
        kind: "assessment",
        topicId: topic.id,
        id: topic.assessment.id,
        data: topic.assessment,
      });
    }
  });
  return steps;
}

// First step belonging to a given topic, or null if the topic doesn't
// exist / isn't ready yet (no steps were built for it).
export function firstStepIdForTopic(steps, topicId) {
  const step = steps.find((s) => s.topicId === topicId);
  return step ? step.id : null;
}
