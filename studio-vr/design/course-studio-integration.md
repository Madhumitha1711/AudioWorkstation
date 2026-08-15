# Integrating the 25-chapter design into the real Course/Studio chrome

Good news from reading the actual code: there's no new surface to invent. `Header.jsx` already has three persistent tabs — **Course** (`CoursePage.jsx`), **Studio** (`PanoramaTour.jsx`), **Discussion** — and `CoursePage.jsx` is *already* a full syllabus sidebar + lesson reader, independent of the VR view. The redesign is regrouping and deepening what's there, not bolting on a new panel.

## Correction: Studio is the landing surface, not Course

`LoginPage.jsx` already does `navigate("/studio")` the moment the door-unlock sequence finishes — students land in the VR control room, not the course sidebar. There's also already a full first-visit `OnboardingTour` (`tour/OnboardingTour.jsx` + `tourSteps.js`) that walks a new student through *power up the rig → try Game mode → select a hotspot → optional lab → "Start the course"* entirely inside the Studio view, only handing off to `/course` at the very end when they're ready to read. So the below is reframed around that: **Studio stays the front door and the primary "what's next" surface; Course is the syllabus/notebook you get sent to, and come back to, not the place you start.**

Practically, that changes where the 8 briefing chapters (no physical hotspot) live. They don't get demoted to "only visible in the Course tab's sidebar" — they need a way to surface *inside* Studio too, since that's where students actually are:

- The left-docked panel (`StudioHotspotsPanel.jsx`) becomes the ordered list for the *whole curriculum*, not just the room's gear. Briefing chapters get rows in that same list — a book icon instead of a numbered circle, no "walk the camera over" behavior since there's nothing to walk to — sitting at their real curriculum position (Foundations chapters 1–4 at the very top, before Patch Bay; the capstone chapters near the bottom, after Speakers/DAW).
- Clicking a briefing row opens the same familiar card style as a gear hotspot (title, "what you'll learn," a primary button) — it just deep-links into `/course` at that chapter instead of animating the camera anywhere first.
- `tourSteps.js` gains a phase *before* "power up the rig": walk the very first-time visitor through the Foundations rows (What Is Sound → The Studio → Types of Studios → Listening Skills) as short orientation reads, still inside Studio, before they ever touch a piece of gear. Everything after that is the existing power-up/hotspot flow, unchanged.
- Course tab keeps the Module→Chapter→Step sidebar described below, but its framing flips: its bottom CTA becomes "← Back to the studio" (wayfinding home) rather than "Launch VR studio →" (an invitation to go somewhere new) — it's where a student jumps around non-linearly or reviews, not where they start.

## What's actually in each surface today

**`/course` (CoursePage.jsx)** — a two-level sidebar: a flat list of `TOPICS`, each expandable into its lesson/quiz/lab steps. Section labels just say "Control Room" / "Recording Room" — there's no module concept yet. Clicking a step opens it in the main pane with lesson video, article, 3D model, prev/next, "Mark as complete," and a bottom CTA — *"Want to see it in place? → Launch VR studio."* This CTA already assumes every topic has a physical hotspot to go find (`Step into the 360° control room and find the {topic} hotspot yourself`), which breaks for briefing-style chapters like "What Is Sound."

**`/studio` (PanoramaTour.jsx + StudioHotspotsPanel.jsx)** — the panorama, with numbered badges (1–8, plain device order) on each hotspot and a left-docked glass panel listing devices in signal order. Clicking a hotspot opens a gear-info card whose "Start course" button does `navigate("/course", { state: { topicId } })` — `CoursePage` reads that `topicId` on mount and jumps straight to the matching topic's first step (`firstStepIdForTopic`). This link already exists and works; it just needs to carry a chapter id instead of a topic id.

**`src/chapters/*.jsx`** — this is the other thing worth knowing: there's already a *second*, unrelated "chapters" folder — full plugin-editor teaching UIs (Equalizer, Compressor, Gate, DeEsser, Delay, Reverb, Saturator, Limiter) that live inside the DAW's insert rack (`daw/InsertRack.jsx`, `daw/PluginEditorPopup.jsx`), reached by walking to the `daw-desk` interactive marker, not the `daw-screens` info hotspot. That's not a naming collision to worry about — it's the DAW hotspot's *actual content* for seven of the new briefs.

## The concrete plan

**1. Data model** — replace `TOPICS` with `CHAPTERS`, 25 entries numbered 1–25, each carrying `module` (one of the 7 groupings) and an optional `hotspot: { roomId, markerId }`. `buildStepList` walks all 25 in curriculum order instead of array order — Prev/Next now spans the whole course, not just the two "ready" topics.

**2. `CoursePage.jsx` sidebar gains a third level** — Module → Chapter → Step, instead of today's flat Topic → Step. Each chapter row shows its number (matching its in-scene badge, when it has one) and a small location chip: **📍 Control Room · Patch Bay** for anchored chapters, **📖 Briefing** for the 8 that aren't tied to any object (What Is Sound, The Studio, Types of Studios, Listening Skills, Computers & Power, Mastering, Tool Selection, Real-World Projects). The bottom "Launch VR studio" CTA becomes conditional on `chapter.hotspot` existing — briefing chapters either drop it or swap the copy to something that doesn't promise a hotspot that isn't there.

**3. In-scene badges become chapter numbers, not device order** — `hotspotDevices.js`'s `buildDeviceList()` gains a chapter lookup so both the numbered badges in the panorama and the left-docked device rail show real chapter numbers. Where one hotspot anchors more than one chapter (Patch Bay covers both "Connectors & Cables" and "Signal Flow," the DAW covers seven), the badge shows a small count and the gear-info panel becomes a short chapter picker instead of a single "Start course" button.

**4. The DAW hotspot is the one genuine special case** — seven chapters (Digital Audio Basics, Recording Fundamentals, Editing/Comping, MIDI & Virtual Instruments, Mixing Fundamentals, Signal Processing, Noise Reduction) route through it, because that content already exists as the insert-rack plugin editors in `src/chapters/*.jsx`. Rather than force all seven into one flat "Start course" jump, the DAW hotspot's info panel should open its own nested mini-list — which is a smaller version of the same Module→Chapter pattern proposed for the sidebar, so the UI vocabulary stays consistent instead of introducing a third navigation idiom.

**5. The one real content gap** — the Recording Room's `markers: []` is empty today. Chapters 6–7 (Microphones, Mic Technique) need an actual hotspot placed there before they can be "in-room" rather than "briefing." Until then, they can ship as briefing chapters and get upgraded later without changing their chapter numbers or IDs.

## Hotspot → chapter map (grounded in the real marker ids in `roomsData.js`)

| Hotspot (`markerId`) | Chapters it opens |
|---|---|
| `diffuser-panel` | 5 — Studio Acoustics & Room Treatment |
| `mic-booth` *(new, Recording Room)* | 6, 7 — Microphones; Mic Technique & Stereo Recording |
| `patch-bay` | 8, 9 — Connectors/Cables; Signal Flow/Gain Staging |
| `preamp-rack` | 10 — Preamps/Channel Strips/Mixers (primary) |
| `sound-card` | 11 — Interfaces/Converters/I-O/MIDI |
| `speaker` + `lf-emitter` | 13, 14 — Monitoring; Monitor Placement |
| `mixing-console` | 10 (secondary), 15 — Mixer Outputs/Aux/Cue Mixes |
| `daw-screens` / `daw-desk` | 16–22 — Digital Audio Basics through Noise Reduction (nested list, backed by `chapters/*.jsx`) |
| *(none — briefing)* | 1, 2, 3, 4, 12, 23, 24, 25 |

A mockup reflecting the real visual system — `--bg #050507`, the mint/green `--accent`/`--accent2` gradient, system-ui type, and the actual glass `--hsp-*` tokens from `studioHotspotsPanel.css` — is attached as `course-studio-integration.html`, showing both the redesigned Course-tab sidebar and the Studio-tab panel with chapter-numbered badges side by side.
