# Course interactives

Hands-on labs embedded in course lessons. Everything lab-specific lives
here; the generic course UI that *hosts* a lab lives in `../components/`.

```
interactives/
  registry.js            # `kind` string -> lab component (the only file
                         # InteractiveSection imports from this folder)
  shared/                # cross-chapter lab infrastructure
    labs.css             #   base .lab / .sound-lab-* chrome
    useLabAudio.js       #   per-lab AudioContext lifecycle hook
    useClipAudio.js      #   recorded-clip playback (one <audio> per clip, A/B at
                         #   the same position, "coming soon" when a file is missing)
    GroupedBriefing/     #   category tabs → item tabs → image + description + key points,
                         #   prev/next pager (data-driven) — Ch.2 StudioComponentsLab, Ch.8
                         #   ConnectorsLab + CablesLab, Ch.10 MixerTypesLab. ONE header level
                         #   only: never put a family label row (Control Room / Recording
                         #   Room, Analog / Digital) over the tabs — split each family into
                         #   its own lab + `kind` instead.
    BriefingTabs/        #   image-over-description tabs + facts + key points + pager —
                         #   StudioRoomsLab, StudioTypesLab
    ListenTabs/          #   ListenTabs (standard tabs; image | Listen card, text
                         #   below) + ClipPlayer — acoustics labs, MicTypeLab,
                         #   MicPolarPatternLab
    soundLabShared.js    #   oscilloscope drawing, palettes, freq/note math
    useInteractOnce.js   #   useInteractOnce(onInteract) → fire-once callback;
                         #   useInteractOnView(ref, onInteract, threshold)
    LabParts.jsx         #   LabImage (img + "coming soon" placeholder), Facts (dl list),
                         #   ExampleCard (FlipCard: image + title / lead + facts)
    ExampleLab/          #   ExampleLab (one screen: lead, facts, example flip cards) and
                         #   TopicTabsLab (tabs of the same) — ActiveSpeakerLab,
                         #   AmpPassiveSpeakerLab, SubwooferLab, PreampChannelStripLab,
                         #   AnalogDigitalConnectionsLab are thin data wrappers around these
    AnalogyConceptLab/   #   hero image + facts + "think of a …" flip-card analogy —
                         #   WhatIsMixerLab, WhatIsInterfaceLab are thin data wrappers
  foundations/           # Foundations briefings (Ch.2 "The Studio", Ch.3 "Types of Studios")
    StudioComponentsLab/ #   "Key Elements of the Recording Space" — two labs, 8 components each:
                         #   control-room-components-lab / recording-room-components-lab,
                         #   Electronic / Non-electronic tabs → component tabs → detail
    StudioRoomsLab/      #   studio-rooms-lab: Recording Room / Control Room, tabbed (Ch.2)
    StudioTypesLab/      #   studio-types-lab: 6 studio types, tabbed (Ch.3)
                         #   (StudioRoomsLab + StudioTypesLab layout: ../shared/BriefingTabs)
  listening/             # Ch.4 "Listening Skills, Hearing Health, and Critical Listening"
    CriticalListeningLab/ #  critical-listening-lab: "Spot the problem" ear training —
                         #   Beginner (1 problem) / Intermediate / Pro (several) tabs,
                         #   pick from the problem list, clean take plays when solved
    HearingAgeLab/       #  hearing-age-lab: "How old are your ears?" headphone screen ->
                         #   Hearing Age (ISO 7029 fit), audiogram, the-scale explainer
  acoustics/             # Ch.5 "Studio Acoustics and Room Treatment"
    shared/              #   AcousticsUI.jsx (SetupBar, RoomTabs), acousticsLabs.css
    StudioAcousticsLab/  #   studio-acoustics-lab: same source in 5 rooms (tabs)
    RoomTreatmentLab/    #   room-treatment-lab: bare -> fully treated + over-foamed
                         #   experiment (tabs). Both use shared RoomTabs: image |
                         #   player side by side, description below
                         #   Recordings: public/audio/{studio-acoustics,room-treatment}/<id>.wav
  wiring/                # Ch.8 "Connectors, Cables, and Studio Wiring"
                         #   (layout: ../shared/GroupedBriefing)
    ConnectorsLab/       #   two labs, 14 connectors: analog-connectors-lab (Mic & Line,
                         #   Patching & Multicore, Speaker) / digital-connectors-lab
                         #   (Digital Audio, Control & Computer). Photos: public/connectors/<id>.jpg
    CablesLab/           #   two labs, 10 cables: analog-cables-lab (Mic & Instrument, Line
                         #   Level, Speaker) / digital-cables-lab (Digital Audio, Control).
                         #   Photos: public/cables/<id>.jpg
    CableMatchLab/       #   cable-match-lab: match 10 cables to sockets on a hardware rear
                         #   panel (drag plug or tap cable → socket); status strip of red /
                         #   green lights (not connected / connected), hints, "Show me" after
                         #   3 misses. No audio. Mockup: design/cable-connector-sound-quiz.html
    AnalogDigitalConnectionsLab/ # analog-digital-connections-lab: "Analog & Digital Connections" —
                         #   primer only (basics the Connectors/Cables labs build on). 4 tabs
                         #   (TopicTabsLab): Analog vs digital / Signal levels / Balanced &
                         #   unbalanced / Digital connections; key points. Photos: public/analog-digital-connections/<id>.jpg
  preamps/               # Ch.10 "Preamps, Channel Strips, Mixers, and Input Routing"
    WhyAmplificationLab/ #   why-amplification-lab: "Why Amplification?" — one row per example
                         #   (talking, TV, headlights, AC, studio): its own clip/picture beside
                         #   the paragraph, no subheadings, + key points.
                         #   Media: public/why-amplification/{talking,tv}.mp4, {headlights,ac,studio}.jpg
    AmplificationLab/    #   amplification-lab: "Amplification & the Amplifier" — gain control
                         #   (0…+60 dB, Original/Amplified A/B) on a provided recording, IN/OUT
                         #   peak meters with clip LED, live input vs output spectrum; description
                         #   + key points below. No synthetic audio.
                         #   Recording: public/amplification/amplification-sample.wav
    AmpPassiveSpeakerLab/ #  amp-passive-speaker-lab: "Amplifier + Passive Speaker" — one screen, no
                         #   tabs: how it works, then NS10 + Amp / CLA-10 + CLA-200 as image +
                         #   description cards side by side, key points below.
                         #   Photos: public/amp-passive-speaker/<id>.jpg
    ActiveSpeakerLab/    #   active-speaker-lab: "Active Speaker" — one screen, no tabs (same
                         #   layout as AmpPassiveSpeakerLab): what's inside, signal chain, room
                         #   controls, soffit-mounted mains (amps in a separate rack for heat),
                         #   then examples: Genelec 8340A, Neumann KH 120 II, Yamaha HS8, Kali
                         #   LP-6 V2 cards + full-width Genelec 1234A soffit card; key points.
                         #   Photos: public/active-speaker/<id>.jpg
    SubwooferLab/        #   subwoofer-lab: "Subwoofer" — 4 tabs (standard Tabs + TabPager), same
                         #   card look as ActiveSpeakerLab: Subwoofer (top image; why a separate
                         #   box, sealed vs ported, controls, placement) / Subwoofer + LFE (the
                         #   .1 channel, +10 dB, bass management) / Pro audio (Genelec
                         #   7360A, Neumann KH 750 DSP, Yamaha HS8S, Genelec 7382A) /
                         #   Home theatre (SVS SB-1000 Pro, KEF KC62, Klipsch R-120SW,
                         #   5.1 → 7.1.4 layout card; 4 photo cards as 2 + 2, no top image);
                         #   key points per tab. Photos: public/subwoofer/<id>.jpg (top image:
                         #   subwoofer.jpg, first tab only)
    PreampChannelStripLab/ # preamp-channel-strip-lab: "Preamps / Channel Strips" (Outboard Gear) —
                         #   4 tabs, SubwooferLab look: Mic preamp (gain, phantom, pad, clean vs
                         #   coloured, rack / 500-series, patching into a line input) / Channel strip
                         #   (stage order, tracking vs mixing, committing) / Classic preamps (Neve
                         #   1073, API 512c, UA 2-610, Grace m101) / Channel strips (Avalon VT-737sp,
                         #   UA 6176, RND Shelford, 500-series lunchbox; 2 + 2 grid); key points.
                         #   Photos: public/outboard-preamps/<id>.jpg
    WhatIsMixerLab/      #   what-is-mixer-lab: "What Is a Mixer?" — one screen, no tabs (like
                         #   ActiveSpeakerLab): hero image, what a mixer does, kitchen analogy
                         #   rows (kitchen/studio FlipCard beside paragraph) joined by curvy arrows,
                         #   key points. Photos: public/mixer/<id>.jpg (mixer.jpg, kitchen-*.jpg)
    MixerTypesLab/       #   mixer-types-lab: "How Do You Categorise Mixers?" — GroupedBriefing
                         #   layout (as ConnectorsLab): category tabs Architecture (Analog /
                         #   Digital / Hybrid) / Application (Live / Studio / Broadcast /
                         #   Project studio) / Circuit design (Split / Inline) → type tabs.
                         #   Photos: public/mixer-types/<id>.jpg
  interfaces/            # Ch.11 "Audio Interfaces, Converters, I/O, and MIDI"
    WhatIsInterfaceLab/  #   what-is-interface-lab: "What Is an Interface?" — one screen, no tabs
                         #   (WhatIsMixerLab layout): hero image, what an interface does, why not
                         #   the computer's jack, what makes a good one; translator analogy rows
                         #   (translator/studio FlipCard beside paragraph: two languages → speak
                         #   up → A/D → D/A → gestures = MIDI) joined by curvy arrows; key points.
                         #   Photos: public/audio-interface/<id>.jpg (audio-interface.jpg,
                         #   translator-*.jpg, studio-*.jpg)
  computers/             # Ch.12 "Computers, Power, and Studio Configuration" (Computer & DAW)
    LifeBeforeDawLab/    #   life-before-daw-lab: "Life Before the DAW" — 4 tabs (standard Tabs +
                         #   TabPager, SubwooferLab look): Recording (multitrack tape, bouncing,
                         #   SMPTE sync to picture) / Editing (razor & splicing block, mag film) /
                         #   Processing (outboard, chambers & plates, recall sheets) / Routing
                         #   (patchbay, buses & sends, hand mixdown, two-track master). Each: hero
                         #   image, facts, four "then → now" FlipCards (2 + 2), key points.
                         #   Photos: public/life-before-daw/<id>.jpg
  sound/                 # Ch.1 "What Is Sound?"
    FrequencyLab/ AmplitudeLab/ WavelengthLab/ PhaseLab/ HarmonicsLab/ TimbreLab/
  speakers/
    SpeakerLab/          # SpeakerLab -> SweetSpotLab (+ SweetSpotLab.css)
  microphones/           # Ch.6 "Microphones: Types, Characteristics & Selection"
    shared/              #   micLabShared.js, micLabs.css, MicPortrait, MicPolarDiagram
    MicTypeLab/ MicPolarPatternLab/
    MicSelectionLab/     #   mic-selection-lab: "Pick the mic for the job" — 4 questions as
                         #   Accordion steps (picking opens the next) -> scored pick as
                         #   FlipCards: best pick full width (front: mic + specs + fit; back:
                         #   why + trade-off), other four 2 + 2 (front: rank + fit; back: why
                         #   not); A/B player, "How is the pick made?" reveal, key points
                         #   (micSelectionData.js)
  mic-techniques/        # Ch.7 "Microphone Techniques and Stereo Recording"
    shared/MicLab/       #   shared by the two guide labs below: MicGuideFrame (tabs + 3D stage +
                         #   listen card + description), MicStage3D (three.js 3D room
                         #   + public/3D assets/ models, driven by a `view` prop; floor
                         #   hotspots), MicLabControls (Choices with fit dots, Toggles,
                         #   Slider, Note), micLab.css (tokens, layout), micLabData.js
                         #   (sources, stereo pairs, ensembles, layers, spot targets)
    MicTechniqueGuideLab/ #  mic-technique-guide-lab: refresher — Mono / Stereo / Ensemble,
                         #   one choice per tab, mic fixed at the standard position.
                         #   Recordings: public/audio/mic-techniques/<clipId>.wav
    MicPlacementGuideLab/ #  mic-placement-guide-lab: interactive 3D placement — Close /
                         #   Spot / Distant-Room (floor hotspots), Stereo (XY, ORTF, AB, MS,
                         #   Blumlein, Overheads, Decca Tree, Outriggers), Multi Miking
                         #   (snare, kick, amp). Recordings: public/audio/mic-placement/<clipId>.wav
```

## Conventions

- **One folder per lab**, named after the component, with an `index.js`
  that re-exports the default. Import a lab by its folder
  (`./sound/FrequencyLab`), never by its inner file.
- A lab's private pieces (its CSS, sub-components, 3D scenes, data) live
  **inside that lab's folder**.
- Code shared by several labs in **one chapter** goes in
  `<chapter>/shared/`. Code shared **across chapters** goes in
  `interactives/shared/`.
- Any tab set inside a lab uses the app-wide `Tabs` / `TabPanel` from
  `src/components/Tabs` (see CLAUDE.md "Tabs standard") — never a
  hand-rolled `role="tablist"`.
- Every image/description tab lab ends each panel with the global
  `KeyPoints` list (`points: []` on each item) and puts a `TabPager`
  (prev / next) under the panel — see CLAUDE.md "Key points + Prev/Next".
- Labs receive `{ onInteract }` from InteractiveSection and call it when
  the student has meaningfully engaged (marks the step done) — use
  `useInteractOnce` / `useInteractOnView` from `shared/useInteractOnce.js`.

## Adding a lab

1. Create `<chapter>/<NewLab>/NewLab.jsx` (+ `NewLab.css` if needed) and
   `index.js` containing `export { default } from "./NewLab";`.
2. Import it in `registry.js` and add a `"new-lab": NewLab` entry.
3. Reference that `kind` from studio-cms or `../data/courseData.js`.
