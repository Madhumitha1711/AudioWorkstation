export const lifeBeforeDawImagePath = (id) => `/life-before-daw/${id}.jpg`;

export const LIFE_BEFORE_DAW_TABS = [
  {
    id: "recording",
    tab: "Recording",
    lead: "Before the DAW, sound was recorded as magnetism on tape. A multitrack tape machine, the size of a fridge, ran 2-inch tape past a row of heads, one narrow strip of tape per track. Every take, overdub and mix lived on that reel.",
    facts: [
      {
        label: "How it worked",
        text: "The record head turned the incoming voltage into a pattern of magnetism on the moving tape; the playback head turned it back. The 1970s–80s studio standard was 24 tracks on 2-inch tape at 30 or 15 inches per second. A reel held only about 16 minutes at 30 ips (about 33 at 15 ips), and tape was expensive, so studios reused it.",
      },
      {
        label: "Running out of tracks",
        text: "When the tracks ran out, engineers bounced: mixed several tracks down onto one free track to make room. The Beatles built Sgt. Pepper's on 4-track machines this way. Every bounce added a generation of hiss and distortion, and the balance inside a bounce could never be changed again.",
      },
      {
        label: "Noise and maintenance",
        text: "Tape adds hiss, so studios used noise-reduction systems (Dolby A, later Dolby SR, or dbx). Machines had to be cleaned, demagnetised and aligned to a test tape regularly, and every playback slowly wore the tape.",
      },
      {
        label: "Sound for picture (AV)",
        text: "For film and TV, the audio machine had to stay locked to the video machine. SMPTE timecode was recorded on a spare track of each, and a synchroniser made the audio machine chase the picture. Rewinding meant waiting for two machines to catch up with each other.",
      },
    ],
    pairs: [
      {
        id: "then-24-track",
        then: "24 tracks on 2\" tape",
        now: "Hundreds of tracks",
        thenText: "The number of tracks was fixed by the width of the tape and the heads: 4, 8, 16 or 24. Big sessions locked two machines together for 48.",
        nowText: "Tracks are files on a drive. The limit is your computer's CPU, disk speed and the DAW's own track count, usually hundreds.",
      },
      {
        id: "then-punch-in",
        then: "Punch-in erases",
        now: "Every take kept",
        thenText: "Fixing a line meant dropping into record over the old take at the right moment. Punch in too early or out too late and the good part was gone for good.",
        nowText: "Punching in records a new file; the old take stays in a playlist or take lane. Nothing is erased, and you can go back to any take.",
      },
      {
        id: "then-bounce",
        then: "Bouncing to free tracks",
        now: "No need to bounce",
        thenText: "Mixing four tracks down to one freed three more, but added hiss and fixed the balance of those four tracks forever.",
        nowText: "With plenty of tracks there's no need to bounce; when you do, the copy is a digital file with no generation loss.",
      },
      {
        id: "then-timecode",
        then: "Timecode & synchroniser",
        now: "Video track in the session",
        thenText: "Audio tape and video tape each carried SMPTE timecode, and a synchroniser chased the two machines into lock, often after several seconds of rewinding.",
        nowText: "The picture is just another track in the session. Jump anywhere and sound and picture are instantly in sync.",
      },
    ],
    points: [
      "Recording meant **magnetism on tape**: typically **24 tracks on 2-inch tape**, about **16 minutes per reel** at 30 ips.",
      "Running out of tracks meant **bouncing**, which added **noise** and **locked the balance**.",
      "A **punch-in erased** the old take.",
      "Sound for picture needed **SMPTE timecode** and a **synchroniser** to lock tape to video.",
    ],
  },
  {
    id: "editing",
    tab: "Editing",
    lead: "Editing tape meant cutting it. To remove a bad bar or join the best halves of two takes, the engineer found the spot by ear, marked the tape with a grease pencil, cut it with a razor blade and joined the pieces with splicing tape.",
    facts: [
      {
        label: "How it worked",
        text: "Rocking the reels back and forth by hand moved the tape slowly past the playback head until the edit point (often the start of a drum hit) could be heard. The engineer marked it, laid the tape in a splicing block and cut along the angled groove; a 45° cut spreads the join over a few milliseconds so it doesn't click.",
      },
      {
        label: "Every cut is on every track",
        text: "A cut through a 24-track tape cuts all 24 tracks at once. You couldn't shorten just the guitar solo or move one vocal line. Editing single parts meant copying them to another machine (or, later, a sampler) and flying them back in by hand, in time.",
      },
      {
        label: "Comping before comp lanes",
        text: "To build a best vocal from several takes, the engineer played each take into a spare track and punched in on the best phrase from each, in real time, one pass after another. If the result wasn't right, it was done again.",
      },
      {
        label: "Editing for picture (AV)",
        text: "Film sound was edited on sprocketed magnetic film (mag) on a Moviola or a flatbed Steenbeck, cut and spliced like the picture itself. Sync marks and the sprocket holes kept sound and picture aligned, frame by frame.",
      },
    ],
    pairs: [
      {
        id: "then-razor",
        then: "Razor blade & splicing block",
        now: "Cut, trim & crossfade",
        thenText: "Find the edit point by rocking the reels, mark it with a grease pencil, cut at an angle, join with splicing tape.",
        nowText: "Zoom into the waveform, split the clip, drag its edges and add a crossfade. The audio file on disk is never touched.",
      },
      {
        id: "then-all-tracks",
        then: "One cut, every track",
        now: "Edit one track alone",
        thenText: "A cut through multitrack tape affected every instrument at once, so single parts couldn't be moved or shortened.",
        nowText: "Each track's clips are independent: nudge one snare hit, move a vocal line or tighten the bass without touching anything else.",
      },
      {
        id: "then-comp-bounce",
        then: "Comping by bouncing",
        now: "Comp lanes",
        thenText: "The best phrase from each take was punched in, in real time, onto a spare track. Every change meant doing it again.",
        nowText: "All takes sit in lanes under the track. Click the best phrase in each and the DAW builds the comp, with crossfades.",
      },
      {
        id: "then-offcuts",
        then: "Undo = find the offcut",
        now: "Unlimited undo",
        thenText: "Changing your mind meant finding the right piece of tape on the floor or the edit bench and splicing it back in.",
        nowText: "Undo history and non-destructive editing let you try ideas and step back to any earlier state.",
      },
    ],
    points: [
      "Tape was edited **physically**: grease pencil, **razor blade**, splicing block, splicing tape.",
      "A cut through multitrack tape cut **every track at once**.",
      "**Comping** meant punching the best phrases onto a spare track, **in real time**.",
      "Film sound was cut on **mag film** on a **Moviola** or **Steenbeck**, kept in sync by sprockets.",
    ],
  },
  {
    id: "processing",
    tab: "Processing",
    lead: "Every effect was a physical box. EQ, compression, reverb and delay each came from dedicated hardware in a rack beside the console, or, for reverb, from an entire room. If the studio owned one compressor, one track at a time could use it.",
    facts: [
      {
        label: "One box per job",
        text: "Classic units such as the Pultec EQP-1A equaliser, the Teletronix LA-2A and UREI 1176 compressors were each one channel (or two) of one effect. To use it on several tracks, you printed the effect onto tape, committing to it, and then re-patched the box for the next track.",
      },
      {
        label: "Reverb was a room",
        text: "Studios built echo chambers: hard-walled rooms with a speaker and a microphone in them. Plate reverbs such as the EMT 140, a large steel sheet in a heavy frame, were the compact alternative. Delay came from tape: the gap between a tape machine's record and playback heads gave slapback echo, and units like the Echoplex and Roland Space Echo used tape loops.",
      },
      {
        label: "Recall on paper",
        text: "Every knob had to be written down on a recall sheet (or photographed) to recreate a mix later. Even SSL's Total Recall system, from the early 1980s, only showed where the knobs had been; an assistant still reset every one by hand.",
      },
    ],
    pairs: [
      {
        id: "then-one-compressor",
        then: "One LA-2A, one track",
        now: "A compressor on every track",
        thenText: "A hardware compressor could treat one signal at a time. More tracks meant more boxes or printing the effect to tape.",
        nowText: "Put as many instances of a plug-in on as many tracks as your computer can run, each with its own settings.",
      },
      {
        id: "then-echo-chamber",
        then: "Echo chamber & plate",
        now: "Reverb plug-in",
        thenText: "A dedicated room or a steel plate the size of a door, with its own sound and no way to change the space.",
        nowText: "Algorithmic and convolution reverbs, including models of famous chambers and plates, change room size with a knob.",
      },
      {
        id: "then-printing",
        then: "Printing effects to tape",
        now: "Change it any time",
        thenText: "Recording the effect onto tape freed the box for the next job, but the effect was now permanent.",
        nowText: "Plug-ins process in real time and stay editable until you choose to render (bounce) them.",
      },
      {
        id: "then-recall-sheet",
        then: "Recall sheets",
        now: "Saved with the session",
        thenText: "Every setting written down by hand and reset by hand, knob by knob, for every recall.",
        nowText: "Every plug-in setting is stored in the session file. Open it next year and everything is exactly where you left it.",
      },
    ],
    points: [
      "Every effect was **dedicated hardware**: **one box, one job**, a few channels at most.",
      "Reverb came from **echo chambers** and **plates**; delay from **tape**.",
      "To reuse a box you **printed** the effect to tape, which made it **permanent**.",
      "**Recall** meant writing every setting down and resetting it **by hand**.",
    ],
  },
  {
    id: "routing",
    tab: "Routing",
    lead: "Getting a signal from one place to another meant a physical path: a cable, a console bus or a patch cord in the patchbay. The console and patchbay were the studio's routing system, and the mix itself was a live performance on the faders.",
    facts: [
      {
        label: "The patchbay",
        text: "Every input and output in the studio (mic lines, tape machine ins and outs, console inserts, outboard gear) was wired to rows of sockets on a patchbay. The usual connections were normalled (connected behind the panel); plugging in a short patch cord broke that path and sent the signal somewhere else. You'll find one in this studio's control room.",
      },
      {
        label: "Buses and sends",
        text: "The console's buses carried signals to the tape machine's inputs, to sub-groups and to the stereo mix. Aux sends fed the headphone mixes and the outboard effects, and the effect came back on a return channel. The number of buses and sends was fixed by the console you owned.",
      },
      {
        label: "The mix was a performance",
        text: "Before console automation, fader moves were done by hand during the mixdown, often by several people at once, each responsible for a few faders. Get one move wrong and the whole pass started again. Moving-fader (Neve NECAM) and VCA automation (SSL) arrived in the late 1970s, only on top consoles.",
      },
      {
        label: "Mixing down to two-track",
        text: "The finished mix was recorded onto a separate two-track machine on ¼\" or ½\" tape, the master. A perfect mix could also be built by splicing together the best sections of several mix passes.",
      },
    ],
    pairs: [
      {
        id: "then-patch-cords",
        then: "Patch cords",
        now: "Software routing",
        thenText: "Re-route a signal by moving cables on the patchbay, and keep track of it all on a sheet of paper.",
        nowText: "Choose any input, output, bus or send from a menu. Routing is saved with the session.",
      },
      {
        id: "then-aux-rack",
        then: "Aux sends to the rack",
        now: "Sends to plug-ins",
        thenText: "A fixed number of aux sends fed the outboard effects, which came back on spare channels or returns.",
        nowText: "Create as many sends and effect (aux) tracks as you need.",
      },
      {
        id: "then-hands-on-faders",
        then: "Many hands on the faders",
        now: "Automation",
        thenText: "Every fader ride during the mix was performed live, often by several people. One mistake meant starting over.",
        nowText: "Write volume, pan and plug-in moves as automation lanes, then edit any single move without redoing the rest.",
      },
      {
        id: "then-two-track",
        then: "Mix to ¼\" two-track",
        now: "Bounce / export",
        thenText: "The mix was recorded in real time onto a separate two-track master tape, then copied for cutting records.",
        nowText: "Export the mix as a file (WAV, MP3, stems), often faster than real time.",
      },
    ],
    points: [
      "Signals were routed **physically**: cables, **patchbay** and **console buses**.",
      "The number of **buses and sends** was fixed by the **console**.",
      "A mix was a **live performance** on the faders until **console automation** arrived.",
      "The final mix went to a **two-track master tape**; today it's a **bounce / export**.",
      "A **DAW** brings **recording, editing, processing and routing** into one computer.",
    ],
  },
];
