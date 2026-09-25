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
    soundLabShared.js    #   oscilloscope drawing, palettes, freq/note math
  foundations/           # Foundations briefings (Ch.2 "The Studio", Ch.3 "Types of Studios")
    StudioComponentsLab/ #   studio-components-lab: 16-component browser
    StudioTypesLab/      #   studio-types-lab: 6 studio types, tabbed (Ch.3)
  sound/                 # Ch.1 "What Is Sound?"
    FrequencyLab/ AmplitudeLab/ WavelengthLab/ PhaseLab/ HarmonicsLab/ TimbreLab/
  speakers/
    SpeakerLab/          # SpeakerLab -> SweetSpotLab (+ SweetSpotLab.css)
  microphones/           # Ch.6 "Microphones: Types, Characteristics & Selection"
    shared/              #   micLabShared.js, micLabs.css, MicPortrait, MicPolarDiagram
    MicTypeLab/ MicTypeCompareLab/ MicPolarPatternLab/ MicPolarCompareLab/
    MicPlacementLab/     #   embed frame + MikingRoom/ (3D room, three.js)
  mic-techniques/        # Ch.7 "Microphone Techniques and Stereo Recording"
    MicTechniqueLab/     #   embed frame + MicTechniqueRoom/ (3D room, three.js)
  daw/
    DawCompingLab/       # not yet registered in registry.js
```

## Conventions

- **One folder per lab**, named after the component, with an `index.js`
  that re-exports the default. Import a lab by its folder
  (`./sound/FrequencyLab`), never by its inner file.
- A lab's private pieces (its CSS, sub-components, 3D scenes, data) live
  **inside that lab's folder**. MikingRoom and MicTechniqueRoom are nested
  under the lab that frames them for this reason.
- Code shared by several labs in **one chapter** goes in
  `<chapter>/shared/`. Code shared **across chapters** goes in
  `interactives/shared/`.
- Labs receive `{ onInteract }` from InteractiveSection and call it when
  the student has meaningfully engaged (marks the step done).

## Adding a lab

1. Create `<chapter>/<NewLab>/NewLab.jsx` (+ `NewLab.css` if needed) and
   `index.js` containing `export { default } from "./NewLab";`.
2. Import it in `registry.js` and add a `"new-lab": NewLab` entry.
3. Reference that `kind` from studio-cms or `../data/courseData.js`.
