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
    GroupedBriefing/     #   family labels over category tabs → item tabs → image +
                         #   description + key points, prev/next pager (data-driven;
                         #   StudioComponentsLab layout) — Ch.8 ConnectorsLab + CablesLab
    BriefingTabs/        #   image-over-description tabs + facts + key points + pager —
                         #   StudioRoomsLab, StudioTypesLab
    ListenTabs/          #   ListenTabs (standard tabs; image | Listen card, text
                         #   below) + ClipPlayer — acoustics labs, MicTypeLab,
                         #   MicPolarPatternLab
    soundLabShared.js    #   oscilloscope drawing, palettes, freq/note math
  foundations/           # Foundations briefings (Ch.2 "The Studio", Ch.3 "Types of Studios")
    StudioComponentsLab/ #   studio-components-lab: "Key Elements of the Recording Space" —
                         #   area tabs → component tabs → detail (16 components)
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
    ConnectorsLab/       #   connectors-lab: 14 connectors — Analog (Mic & Line, Patching
                         #   & Multicore, Speaker) / Digital & Data (Digital Audio,
                         #   Control & Computer). Photos: public/connectors/<id>.jpg
    CablesLab/           #   cables-lab: 10 cables — Analog (Mic & Instrument, Line Level,
                         #   Speaker) / Digital (Digital Audio, Control).
                         #   Photos: public/cables/<id>.jpg
  sound/                 # Ch.1 "What Is Sound?"
    FrequencyLab/ AmplitudeLab/ WavelengthLab/ PhaseLab/ HarmonicsLab/ TimbreLab/
  speakers/
    SpeakerLab/          # SpeakerLab -> SweetSpotLab (+ SweetSpotLab.css)
  microphones/           # Ch.6 "Microphones: Types, Characteristics & Selection"
    shared/              #   micLabShared.js, micLabs.css, MicPortrait, MicPolarDiagram
    MicTypeLab/ MicPolarPatternLab/
    MicSelectionLab/     #   mic-selection-lab: "Pick the mic for the job" — 4 questions ->
                         #   scored pick + why / why not (micSelectionData.js)
  mic-techniques/        # Ch.7 "Microphone Techniques and Stereo Recording"
    shared/MicLab/       #   shared by the two guide labs below: MicStage3D (three.js 3D room
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
  daw/
    DawCompingLab/       # not yet registered in registry.js
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
  the student has meaningfully engaged (marks the step done).

## Adding a lab

1. Create `<chapter>/<NewLab>/NewLab.jsx` (+ `NewLab.css` if needed) and
   `index.js` containing `export { default } from "./NewLab";`.
2. Import it in `registry.js` and add a `"new-lab": NewLab` entry.
3. Reference that `kind` from studio-cms or `../data/courseData.js`.
