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
  main.jsx  App.jsx  index.css   # entry, all routes (App.jsx), global tokens
  api/            # HTTP client + auth / discussions / payments endpoints
  store/          # Redux: sessionSlice (student/paid), checkoutSlice, controlRoomSlice
  theme/          # ThemeContext (light/dark), PaletteContext + palettes, toggles,
                  # fonts.js (canvasFont() — global font tokens for canvas text)
  audio/          # app-wide audio infrastructure (no React UI)
    spatialAudioEngine.js  # singleton Web Audio wrapper: HRTF binaural panning
                            # tied to camera look direction, ambient room bed,
                            # studio-speaker bus, master mute vs.
                            # binaural toggle (two independent, non-interacting
                            # controls — see the comments at the top of the file)
    wavRender.js            # render an AudioBuffer to a downloadable WAV
    effects/                # *Engine.js — Faust param addresses/defaults/meter
                            # helpers per effect; shared by gear-studio panels
                            # AND the DAW insert chain. ballistics.js = shared
                            # level/GR meter smoothing
    faust/faustTypes.js     # Faust UI-metadata helpers + compileFaustWasm()
                            # (compileStreaming with a buffered fallback)
  components/     # UI shared by 2+ features only
    Header/                 # app header
    controls/               # Knob, Fader
    Tabs/                   # THE standard tabs: Tabs, TabPanel, useTabTransition
                            # (see "Tabs standard" below)
  features/       # one folder per product area; a feature's page, CSS and
                  # private components live together
    landing/                # LandingPage
    auth/                   # Login/Signup/ForgotPassword pages, AuthPage.css,
                            # components/ (GoogleAuthButton, StudioDoor, RequireAuth,
                            # AuthFrame/AuthField, DoorAuthPage, useDoorAuth)
    payment/                # PaymentPage, PaymentCompletePage
    discussion/             # DiscussionPage
    course/                 # CoursePage + course content
      data/                   # courseData.js (TOPICS), useCourseTopics.js,
                              # sectionExtras.js (Resources/Practice per section kind)
      components/             # generic course UI: AssessmentSection, SectionBlocks,
                              # VideoPlayer, InteractiveSection, SectionExtras
      interactives/           # every course lab, by chapter — see its README.md
    tour/                   # the 360° studio tour
      PanoramaTour.jsx        # photo-sphere-viewer setup, hotspot markers, room nav
      data/                   # roomsData.js (rooms, doorways, hotspot yaw/pitch,
                              # narration, ambience), hotspotDevices.js
      components/             # WelcomeVideoDialog, StudioHotspotsPanel, HotspotPrecheck
      help/                   # QuickHelpPanel + helpHover
      hotspot-labs/<Lab>/     # per-gear hotspot labs; shared/ = hardwareTokens.css,
                              # speakerListeningLab.css (base), LabShell (header/
                              # tabs/footer frame), listeningLabShared (AhaBox,
                              # SegControl, PlayBar, LineIcon), useLoopPlayer.js
                              # (useLoopPlayer, useRepeatPlayer). PanoramaTour maps
                              # gear id → lab via its GEAR_LAB table
      daw/                    # DAW workstation screen opened from the tour
        DawWorkstationScreen.jsx  # state/audio controller
        components/ engine/ lib/  # presentational pieces (TrackRacks wraps
                                  # Insert/SendRack per track) / audio-graph +
                                  # offline render / constants, format, track
                                  # helpers, useDismiss (outside-click/Esc close)
    gear-studio/            # effect editor panels — Compressor, DeEsser, Delay,
                            # Limiter, NoiseGate, Reverb (*EditorPanel, used by the
                            # DAW plugin popup) + Equalizer (full lab, also a course
                            # lab) and chapters.css; each drives a real Faust patch.
                            # shared/panelUtils.js (hiDpi, drawLevelScope,
                            # transferFrame, knob math) + shared/PanelControls.jsx
                            # (KnobGrid, MiniSlider, KnobNumberInput)
  dev-tools/      # /panorama-test, /splat-test, /model-test, /audio-test utility pages
                  # (TesterShell = shared upload panel/overlay layout)

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
  loading logic lives in `src/audio/faust/` and is bundled normally while the
  wasm/json assets stay static. `features/gear-studio/*.jsx` and the DAW
  (`features/tour/daw/`) both drive the *same* underlying patches (e.g.
  `public/faust/compressor`) through the shared `audio/effects/*Engine.js`
  modules, so param addresses stay in one place if a `.dsp` patch changes.
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
- **Hotspot data is data-only**: `features/tour/data/roomsData.js` defines rooms,
  doorway links, and gear-hotspot yaw/pitch/audio/description — no component
  logic. To add a new tour stop, add a room object here (see the in-file
  comment for how to capture yaw/pitch using the app's own "P" placement
  mode) rather than hardcoding coordinates in `PanoramaTour.jsx`.
- **Course content gating**: `features/course/data/courseData.js` `TOPICS[].ready` controls
  whether a topic is live or shown as "coming soon" — only Speakers and DAW
  Workstation are currently `ready: true`.
- **Design mockups precede implementation**: the `design/` folder holds
  static HTML/CSS references (e.g. `sweet-spot-lab-ui.html`) that real
  components are built to match pixel-for-pixel before being wired up to
  live state/audio — check there first when a visual change is ambiguous.
- **Theme**: `ThemeContext` persists light/dark to `localStorage` under
  `svr-theme` and sets `data-theme` on `<html>`; component CSS should read
  theme via CSS variables keyed off that attribute rather than hardcoding
  colors (see the comment in `features/course/interactives/speakers/SpeakerLab/SweetSpotLab.jsx` for an example of a past bug
  from hardcoded colors not following the theme).
- **Session vs. checkout state**: `session` slice = who's currently signed in
  and whether they've ever paid (`hasPaid` persists through log-off —
  logging off doesn't revoke purchased access); `checkout` slice = the
  in-progress purchase form. `PRICE` (single lifetime-access price) lives in
  `checkoutSlice.js`; actual card capture is handed off to an external
  payment gateway, not implemented here.
- **Test/dev-only routes**: `/panorama-test`, `/splat-test`, `/model-test`,
  `/audio-test` are utility pages for testing panorama images, Gaussian splats,
  3D models, and audio sample-rate/bit-depth playback in isolation — not part of the student-facing flow.

## Typography (global — never per file)

- The app uses exactly **two font families**, defined once in `src/index.css`
  `:root`:
  - `--font-sans` — **Inter** — all text: body, headings, UI, labels, tabs.
  - `--font-mono` — **Space Grotesk** (tabular figures) — only numeric readouts, timecodes,
    meter/dB values, code.
- Web fonts are loaded **only** in `index.html` (one Google Fonts `<link>`).
  Never add `@import url(fonts.googleapis…)` or `<link>` font loads in
  component CSS/JSX.
- In CSS use `font-family: var(--font-sans)` / `var(--font-mono)`, or just
  inherit (the root and all form controls already use `--font-sans`). Never
  write a literal family name (`'Inter'`, `'Space Grotesk'`, `monospace`, …)
  and never redefine `--font-*` (or the legacy aliases `--sans`, `--heading`,
  `--display`, `--body`, `--mono`, which still point at the same two tokens)
  inside a feature scope.
- Inline JSX styles use `fontFamily: 'var(--font-mono)'` etc.
- Canvas/WebGL text can't read CSS variables — use
  `canvasFont(px, { weight, mono })` from `src/theme/fonts.js`
  (`ctx.font = canvasFont(10, { mono: true })`), never a hand-written
  `ctx.font` family string.
- **Font sizes** come from the global type scale in `src/index.css`
  (`--fs-3xs` … `--fs-4xl`), which shrinks automatically on phones
  (≤600px). Write `font-size: var(--fs-sm)`, not a literal px value, and
  don't add per-file mobile font-size overrides — retune the scale instead.
  Converted so far: the course page + its components, shared lab CSS,
  Foundations labs and `components/Tabs`; move other features over as
  they're touched.

## Tabs standard (use everywhere)

Every tab set in the app renders through `src/components/Tabs` — never a
hand-rolled `role="tablist"` / button row. It provides the standard motion:
one indicator that **glides** (transform + width) to the active tab, and a
panel that **fades + slides 10px in the direction of travel** while its
**height eases** between panels of different sizes (so content below glides
instead of jumping). Rapid switching continues from the current on-screen
state rather than snapping. Timing is global (`src/index.css`):
`--motion-tab-duration` (480ms), `--motion-panel-duration` (440ms),
`--motion-panel-shift`, `--motion-ease-out`
(`cubic-bezier(0.16, 1, 0.3, 1)`, ease-out-expo). Everything is disabled
under `prefers-reduced-motion`.

**Visited weight + count:** tabs the user hasn't opened yet render their
label in **bold**; once opened (including the active one) they drop to the
normal weight. The bar ends with an **"N/M explored"** count (the "explored"
word hides under 600px). Both are built into `Tabs` and on by default
(`markVisited`, `showCount`; turn off per instance only with a reason).
Tracking is internal; pass `visited` (Set/array of ids) only if the parent
must control it. Don't hand-roll per-feature "viewed" markers or counts —
extra bar content goes in `trailing`, rendered after the count.

```jsx
import { Tabs, TabPanel } from "../../components/Tabs";

<Tabs items={[{ id, label, title?, disabled? }]} value={active}
      onChange={(id, index) => setActive(id)} ariaLabel="…" idPrefix="xyz" />
<TabPanel idPrefix="xyz" value={active} index={activeIndex}>…</TabPanel>
```

- **Variants:** `variant="underline"` (default — page/lesson/lab content
  navigation) and `variant="segmented"` + `size="sm"` (compact tool bars:
  DAW, tour gear panels, gear-studio mode switches). `fill` shares the width
  equally. `renderTab(item, { selected, index })` for custom tab content,
  `trailing` for extra content pinned right of the bar (after the count).
- **Panels:** `<TabPanel>` animates without remounting (child state and
  audio survive; add a `key` inside if you *want* a reset). When the panel
  is an existing element (e.g. a scroll container with its own classes),
  call `useTabTransition(ref, activeKey, activeIndex)` on it instead (and
  `useTabHeightTransition(ref, activeKey)` if its height follows content).
  Keep hooks above any early `return null`.
- **Colour = theme primary.** The indicator (underline or segmented pill)
  and the active segmented label use `--brand-accent` — the selected
  palette's primary colour from `src/theme/palettes.js` (PaletteContext),
  light/dark aware. Don't override `--tabs-accent` / `--tabs-thumb-*` with a
  feature colour; tabs must look the same everywhere.
- **Re-skin only via tokens** (typography/neutrals) set on a wrapper or the `className` you pass:
  `--tabs-accent`, `--tabs-text`, `--tabs-text-active`, `--tabs-line`,
  `--tabs-track-bg/-border`, `--tabs-thumb-bg/-border/-text`, `--tabs-font`,
  `--tabs-font-size`, `--tabs-letter-spacing`, `--tabs-transform`. Don't
  restyle `.ui-tabs__*` rules or add your own tab transitions.
- Accessibility is built in (roving tabindex, ←/→/Home/End, aria wiring via
  `idPrefix`). Current users: `BriefingTabs` (StudioRoomsLab,
  StudioTypesLab), MicTechniqueGuideLab, MicPlacementGuideLab, CriticalListeningLab, HearingAgeLab, all tour
  hotspot-labs, DAW Arrange/Mixer + dock scope, Equalizer mode, Discussion
  channels.

### Key points + Prev/Next (every image/description tab lab)

Two companions to `Tabs`, styled from the same tokens so they read as one
system — use them instead of hand-rolled lists or pagers:

- `KeyPoints` (`src/components/KeyPoints`) — `<KeyPoints key={item.id}
  points={item.points} />` at the end of a panel's description. Heading on
  the tab hairline with the 2px accent indicator, accent-dot bullets,
  points ease in with the panel motion (give it `key` so they replay
  on a tab switch). `**bold**` supported; renders nothing when empty.
- `TabPager` (`import { TabPager } from "components/Tabs"`) — Prev / Next
  buttons + "N/M" under the panel. Pass the flat, ordered tab list
  (`[{id,label}]`, flatten nested tab rows) and the **same** `onChange` the
  tabs use, so audio stops / visited marks / onInteract behave identically.
  It's a single compact 30px row (`--pager-h`), identical in every lab —
  never hand-roll a Prev/Next or pad/resize it per lab.
  Inside the course, `CoursePage` provides `StepNavContext`: at the first /
  last tab the pager becomes "← Prev section" / "Next section →" and the
  page hides its own bottom Previous/Next while a pager is mounted — one
  pair of buttons, never two stacked rows.

Both are already built into `ListenTabs`, `BriefingTabs`,
`StudioComponentsLab` and `GroupedBriefing` — a lab using those only needs
`points: []` on each item.

### Flip cards (image + one line → details on the back)

`FlipCard` (`src/components/FlipCard`) — a card that turns over in 3D on
click / Enter / Space. Use it for "example" cards where the front is a
photo + a single line and the details live on the back, instead of
hand-rolling a flip.

```jsx
import { FlipCard } from "../../components/FlipCard";
<FlipCard label={ex.title} front={<>…image… <h4>{ex.title}</h4></>} back={<>…facts…</>} />
```

- Both faces share one grid cell → card height = taller face; let a front
  image `flex: 1` to fill. Works inside any CSS grid row.
- Uncontrolled (`defaultFlipped`) or controlled (`flipped` + `onFlip(next)`).
- Built-in: corner flip icon (`hint={false}` to hide), hover tilt (off
  after a click until the pointer leaves, so the turn lands flat), mid-turn
  lift, ease-in-out turn with no overshoot (600ms, starts moving on the first frames — don't go back to a slow ease-in like 0.45,0), focus ring, `inert`/aria-hidden on the hidden face, crossfade under
  `prefers-reduced-motion`. No links/buttons inside faces (the whole card
  is the toggle).
- Perspective is relative to the card's width (`perspective(1200cqw)`,
  card is an inline-size container), so wide and narrow cards all peak at
  the same subtle ~1.04× mid-turn. Don't swap it back to a fixed px
  `perspective` or add a scale to the lift — wide cards balloon. Only
  transform/opacity animate.
- Nothing may sit behind the faces (no ::before shadow/backdrop on
  `.ui-flip`) — it stays flat while the card turns and shows as a ghost
  card. Shadows go on `.ui-flip__face`.
- Re-skin only via tokens on `className`: `--flip-accent`, `--flip-bg`,
  `--flip-border`, `--flip-radius`, `--flip-duration`.
  The depth is set globally — don't override `--flip-depth` per lab
  (the old per-lab 900cqw patches were removed when the default went to
  1200cqw). If a card still looks too big mid-turn, fix the default in
  `FlipCard.css`, keep it in `cqw`, and never lower it or make it px.
- Current users: ActiveSpeakerLab, AmpPassiveSpeakerLab, WhatIsMixerLab,
  MicSelectionLab, LifeBeforeDawLab.

### Accordion (reveal rows / question steps)

`Accordion` + `AccordionItem` (`src/components/Accordion`) — a bordered,
rounded row (round marker, title, optional right-aligned `summary`,
chevron) whose body eases open 0fr → 1fr on the Tabs panel timing. Use it
instead of hand-rolling `<details>` or a show/hide.

```jsx
import { Accordion, AccordionItem } from "../../components/Accordion";
<AccordionItem marker="?" title="How is the pick made?" onOpen={onInteract}>…</AccordionItem>
<Accordion value={openId} onChange={setOpenId}>   {/* single-open group, by id */}
  <AccordionItem id="source" marker="01" title="…" summary={answer}>…</AccordionItem>
</Accordion>
```

- Item is uncontrolled (`defaultOpen`) or controlled (`open` + `onToggle`);
  `onOpen` fires each time it opens. Body stays mounted (`inert` when
  closed), so child state survives. Reduced motion → instant.
- Re-skin only via tokens on `className`: `--acc-accent` (default
  `--brand-accent`), `--acc-well`, `--acc-border`, `--acc-radius`.
- Current users: MicSelectionLab, WhyAmplificationLab.

## Conventions

- No TypeScript — `.jsx`/`.js` throughout; `@types/react` exists only for
  editor tooling.
- Per-component CSS files (`Component.css` next to `Component.jsx`), not
  CSS-in-JS or Tailwind.
- Feature-first layout: code used by one feature lives inside
  `src/features/<feature>/`; move it to `src/components/` or `src/audio/`
  only once a second feature needs it. Components with their own CSS or
  sub-parts get their own folder with an `index.js` re-export.
- Comments only where necessary: a short note for genuinely non-obvious
  constraints (e.g. the minify gotcha in `vite.config.js`, the two
  independent toggles and the elevation cue in `spatialAudioEngine.js`).
  Don't add narrating or section-divider comments.
- Before writing a new helper, check the shared modules (`components/`,
  `audio/effects/ballistics.js`, `gear-studio/shared/`,
  `tour/hotspot-labs/shared/`, `course/interactives/shared/`) — duplicate
  logic should be extracted there rather than copied between files.
- Lint rules of note (`.oxlintrc.json`): `react/rules-of-hooks` is an error;
  `react/only-export-components` is a warning (constant exports allowed).
