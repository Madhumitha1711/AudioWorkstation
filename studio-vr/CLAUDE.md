# CLAUDE.md

Guidance for Claude Code (or any agent) working in this repository.

## What this is

**Studio VR** — a browser-based VR/360° recording-studio tour that teaches audio
engineering. A student walks through a photorealistic panorama of a real
studio, clicks hotspots on the gear (speakers, mixing console, EQ, compressor,
etc.), and gets narrated lessons plus live, real-DSP interactive labs — all
running client-side with genuine Web Audio processing (not simulated/fake
knobs), including real Faust-compiled WASM DSP and HRTF binaural spatial
audio.

Single-page React app: landing → payment → login/signup → course (video
lessons + assessments + interactive labs) → 360° studio tour with clickable
gear hotspots → discussion board.

## Stack

- **React 19** + **Vite 8** (`@vitejs/plugin-react`), plain JSX (no TS, despite
  `@types/react` being present for editor intellisense only).
- **Redux Toolkit** (`@reduxjs/toolkit` + `react-redux`) for global state —
  currently just `session` (student name / paid flag) and `checkout` (email /
  name for purchase).
- **react-router-dom v7** for routing (`BrowserRouter`, all routes in
  `src/App.jsx`).
- **@photo-sphere-viewer/core** + `virtual-tour-plugin` + `markers-plugin` for
  the 360° panorama tour.
- **@grame/faustwasm** to load and run Faust-compiled DSP patches
  (`dsp-module.wasm` + `dsp-meta.json`, exported from the Faust IDE) as
  `AudioWorkletNode`s — this is the real signal processing behind every
  "gear" lab (compressor, EQ, de-esser, delay, limiter, noise gate, reverb).
- **three.js** + `@mkkellogg/gaussian-splats-3d` for 3D gear model / splat
  viewers (`GearModelViewer`, `GaussianSplatTester`).
- **oxlint** for linting (`npm run lint`). No test runner is configured.

## Commands

```
npm run dev       # vite dev server
npm run build     # production build
npm run preview   # preview a production build
npm run lint      # oxlint
```

There is no test suite in this repo currently.

## Critical gotcha: do not enable minification

`vite.config.js` sets `build: { minify: false }` **on purpose** — read the
comment there before touching it. `@grame/faustwasm` builds its
`AudioWorkletProcessor` at runtime by `.toString()`-ing its own classes and
re-evaluating that source inside the AudioWorklet global scope. Minification
renames the identifiers those classes reference internally, which breaks the
worklet with `ReferenceError: z is not defined` — but only in the minified
prod build, never in `vite dev`. If you re-enable minification, the Faust
DSPs (every interactive gear lab) will silently fail in production.

## Directory layout

```
src/
  App.jsx            # all routes live here
  main.jsx           # Redux Provider + ThemeProvider + BrowserRouter
  store/              # Redux: session.js (student/paid), checkoutSlice.js (email/name)
  theme/               # light/dark ThemeContext, persisted to localStorage
  components/          # shared UI: Header, Fader, Knob, FaustPanel, StudioDoor
  pages/                # LandingPage, LoginPage, SignupPage, PaymentPage,
                        # CoursePage, DiscussionPage
  panorama/             # the 360° tour itself
    PanoramaTour.jsx     # photo-sphere-viewer setup, hotspot markers, room nav
    roomsData.js          # data-only: rooms, doorway links, hotspot yaw/pitch,
                           # narration audio paths, per-room ambience
    EqCompressorHotspot.jsx  # live EQ+Compressor channel-strip hotspot panel,
                              # reuses the same Faust patches as the course chapters
    GearModelViewer / GaussianSplatTester / ObjectModelTester / PanoramaImageTester
                           # 3D/testing utility views (also reachable via
                           # /model-test, /splat-test, /panorama-test routes)
  chapters/             # full-featured, standalone "gear studio" lessons —
                        # Compressor.jsx, Equalizer.jsx, DeEsser.jsx, Delay.jsx,
                        # Limiter.jsx, NoiseGate.jsx, Reverb.jsx, Saturator.jsx,
                        # MixingConsole.jsx — each drives a real Faust WASM patch
  course/               # course content + interactive labs
    courseData.js         # TOPICS: lessons/paragraphs/assessments per hotspot
                           # (currently only "Speakers" and "DAW Workstation"
                           # are fully built; others are stubbed "coming soon")
    AssessmentSection.jsx
    interactive/           # hands-on labs (SweetSpotLab, DawCompingLab, SpeakerLab)
  audio/
    spatialAudioEngine.js  # singleton Web Audio wrapper: HRTF binaural panning
                            # tied to camera look direction, ambient room bed,
                            # hotspot narration playback, master mute vs.
                            # binaural toggle (two independent, non-interacting
                            # controls — see the comments at the top of the file)
    wavRender.js            # render an AudioBuffer to a downloadable WAV
  faust/
    useFaustDsp.js          # hook: fetch dsp-meta.json + compile dsp-module.wasm
                             # into a mono AudioWorkletNode
    faustTypes.js            # Faust UI-metadata types/helpers + compileFaustWasm()
                              # (WebAssembly.compileStreaming with a buffered
                              # fallback for hosts that don't send the right
                              # Content-Type for .wasm)

public/
  faust/<patch>/dsp-module.wasm + dsp-meta.json   # exported straight from the
                                                    # Faust IDE, one folder per
                                                    # DSP patch (compressor,
                                                    # deesser, delay, Gate,
                                                    # limiter, noiseGate, ParamEQ,
                                                    # reverb)
  audio/                 # recorded hotspot narration clips
  model/                  # photogrammetry-scanned gear (speaker.glb)
  paranoma*.png            # the studio panorama photo(s)

design/                  # static HTML/CSS mockups (source of truth for visual
                          # design before a screen is built as a real React
                          # component) — e.g. eq-compressor-hotspot-ui.html,
                          # sweet-spot-lab-ui.html, landing-mockup.html
```

## Architecture notes worth knowing before making changes

- **Faust DSP loading pattern**: `dsp-module.wasm`/`dsp-meta.json` live under
  `public/faust/<patch>/` and are loaded via plain `fetch()`, not ESM import —
  Vite's dev server won't serve public-folder JS through `import()`, so all
  loading logic lives in `src/faust/` and is bundled normally while the
  wasm/json assets stay static. `chapters/*.jsx` and
  `panorama/EqCompressorHotspot.jsx` both drive the *same* underlying patches
  (e.g. `public/faust/compressor`) — the panorama hotspot is a simplified,
  shared-signal-path version of the full chapter lesson, so param addresses
  should stay in sync between them if a `.dsp` patch changes.
- **Spatial audio engine is a singleton module** (`src/audio/spatialAudioEngine.js`),
  not a React hook/context — it holds module-level `let` state (audioCtx,
  gain nodes, etc.) so multiple components can call into the same audio
  graph. Two independent toggles exist and must stay independent: master
  mute (`setMuted`/`isMuted`, drives `outputGain`, silences everything) and
  binaural on/off (`setBinauralEnabled`, crossfades narration/studio-speaker
  output between an HRTF panner path and a plain stereo path — never touches
  `outputGain`). Read the block comment at the top of the file before editing
  routing.
- **Elevation cue**: generic (non-personalized) Web Audio HRTF conveys
  up/down position poorly, so `createElevationShelf()` layers a manual
  high-shelf boost/cut on top of the HRTF panner as a secondary elevation
  cue. Don't remove this thinking it's redundant with the panner.
- **Hotspot data is data-only**: `panorama/roomsData.js` defines rooms,
  doorway links, and gear-hotspot yaw/pitch/audio/description — no component
  logic. To add a new tour stop, add a room object here (see the in-file
  comment for how to capture yaw/pitch using the app's own "P" placement
  mode) rather than hardcoding coordinates in `PanoramaTour.jsx`.
- **Course content gating**: `course/courseData.js` `TOPICS[].ready` controls
  whether a topic is live or shown as "coming soon" — only Speakers and DAW
  Workstation are currently `ready: true`.
- **Design mockups precede implementation**: the `design/` folder holds
  static HTML/CSS references (e.g. `sweet-spot-lab-ui.html`) that real
  components are built to match pixel-for-pixel before being wired up to
  live state/audio — check there first when a visual change is ambiguous.
- **Theme**: `ThemeContext` persists light/dark to `localStorage` under
  `svr-theme` and sets `data-theme` on `<html>`; component CSS should read
  theme via CSS variables keyed off that attribute rather than hardcoding
  colors (see the comment in `SweetSpotLab.jsx` for an example of a past bug
  from hardcoded colors not following the theme).
- **Session vs. checkout state**: `session` slice = who's currently signed in
  and whether they've ever paid (`hasPaid` persists through log-off —
  logging off doesn't revoke purchased access); `checkout` slice = the
  in-progress purchase form. `PRICE` (single lifetime-access price) lives in
  `checkoutSlice.js`; actual card capture is handed off to an external
  payment gateway, not implemented here.
- **Test/dev-only routes**: `/panorama-test`, `/splat-test`, `/model-test`
  are utility pages for testing panorama images, Gaussian splats, and 3D
  models in isolation — not part of the student-facing flow.

## Conventions

- No TypeScript — `.jsx`/`.js` throughout; `@types/react` exists only for
  editor tooling.
- Per-component CSS files (`Component.css` next to `Component.jsx`), not
  CSS-in-JS or Tailwind.
- Heavy use of explanatory block comments above non-obvious logic (audio
  routing, knob curve math, theme/state interactions) — match this style
  when adding similarly non-obvious code, especially anything touching the
  Web Audio graph.
- Lint rules of note (`.oxlintrc.json`): `react/rules-of-hooks` is an error;
  `react/only-export-components` is a warning (constant exports allowed).
