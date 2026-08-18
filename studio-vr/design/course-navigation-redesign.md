# Studio VR — Course Navigation Redesign
### From "8 hotspots = 8 topics" to a 25-chapter curriculum

## The problem in one line

The current course model is **1:1 hotspot-to-topic**: `TOPICS` in `courseData.js` is keyed by gear id, and a student's only door into any lesson is clicking that exact piece of gear in the panorama. That worked when the course *was* the room — eight objects, eight topics. The new 25-chapter syllabus is a real curriculum with its own pedagogical order (sound theory → the studio → acoustics → mics → signal chain → monitoring → the digital domain → mixing/processing → mastering → real-world practice), and most of those chapters either span *several* hotspots, or don't correspond to a physical object at all ("What Is Sound?", "Listening Skills", "Tool Selection"). Forcing 25 chapters through 8 clickable objects in two rooms will either strand two-thirds of the syllabus with no entry point, or bury unrelated chapters inside one gear's info panel where nobody will find them.

## What already exists (worth knowing before redesigning)

The codebase already has more built than the hotspot model exposes — it's just scattered:

| Where | What it is | Maps to |
|---|---|---|
| `course/courseData.js` → `TOPICS` | Full lesson/quiz content, 2 of 8 "ready" | Speakers, DAW |
| `panorama/labs/*.jsx` | Interactive gear labs (Patchbay, Preamp, SoundCard, MixingConsole, Diffuser, LfEmitter, SpeakerListening) | 7 gear-anchored chapters |
| `course/interactive/SweetSpotLab.jsx`, `DawCompingLab.jsx` | Standalone interactive exercises | Monitor placement, Editing/comping |
| `chapters/*.jsx` (Equalizer, Compressor, Gate, DeEsser, Delay, Reverb, Saturator, Limiter, MixingConsole) | Full plugin-editor teaching UIs, live inside the DAW insert rack | Mixing fundamentals, signal processing, noise reduction |
| `course/AssessmentSection.jsx` | Reusable 5-question quiz engine | Every chapter |
| Recording Room (`roomsData.js`) | Panorama exists, **zero markers placed yet** | Mics, mic technique — currently a gap |

So this isn't a from-scratch build — it's an information-architecture problem. Most of the *content* for ~16 of the 25 briefs already exists somewhere in the app; it just isn't addressable as "chapter 14."

## Recommended approach: syllabus-first, hotspots-as-shortcuts

Stop treating the panorama as the only index. Add a **Course Map** — a persistent, always-reachable overlay (opened from the Header, same weight as the existing left-docked `StudioHotspotsPanel`) that lists all 25 chapters in curriculum order, grouped into modules. This becomes the primary way students move through the course. Hotspots don't go away — they become *contextual shortcuts*: walk up to the patch bay and it still opens straight into its chapter, but you're no longer required to find the right piece of gear to reach a chapter that's actually about theory.

Every chapter gets one of two "homes":

- **In-room chapters** — anchored to a real hotspot (existing or new). Walking up to the object *or* tapping it in the Course Map opens the same content. Badge in-scene shows the chapter number instead of a generic device index.
- **Briefing chapters** — no physical anchor (sound theory, studio types, listening skills, tool selection, real-world workflow, mastering until a mastering suite exists). These open directly from the Course Map as a reading/video panel — no VR walk required. Optionally, give them a light spatial home too: a "briefing" moment triggered the first time a student walks through the StudioDoor or crosses into a new room, so the two intro chapters ("What Is Sound," "The Studio") still feel situated rather than bolted on as a plain menu.

### Proposed module grouping (7 modules, 25 chapters)

1. **Foundations** — What Is Sound?, The Studio (Recording Room & Control Room), Types of Studios & Workspaces, Listening Skills & Hearing Health *(all briefing)*
2. **Room & Acoustics** — Studio Acoustics & Room Treatment *(→ Diffuser + LF Emitter hotspots)*
3. **Capture & Signal Path** — Microphones (Types/Selection/Placement), Mic Techniques & Stereo Recording *(→ new Recording Room mic hotspots — currently the one real gap)*, Connectors/Cables/Wiring *(→ Patch Bay)*, Signal Flow/Levels/Gain Staging *(→ Patch Bay → Preamp walkthrough)*, Preamps/Channel Strips/Mixers/Input Routing *(→ Preamp Rack + Mixing Console)*, Interfaces/Converters/I-O/MIDI *(→ Sound Card)*, Computers/Power/Studio Config *(briefing, or anchor to the DAW desk)*
4. **Monitoring** — Monitoring: Speakers/Headphones/Amps/Subs *(→ Speaker + LF Emitter)*, Monitor Placement & Speaker Configs *(→ Speaker, reuses SweetSpotLab)*, Mixer Outputs/Aux/Cue Mixes/Routing *(→ Mixing Console)*
5. **The Digital Domain** — Digital Audio Basics & DAWs *(→ DAW screens, already "ready")*, Recording Fundamentals *(→ DAW desk)*, Editing/Comping/Timing/Arrangement *(→ DawCompingLab)*, MIDI/Virtual Instruments/Production Basics *(→ DAW desk — needs new content)*
6. **Mixing & Processing** — Mixing Fundamentals (Balance/Pan/EQ/Comp/Reverb/Delay/Automation) *(→ chapters/Equalizer, Compressor, Reverb, Delay)*, Signal Processing & Creative Effects *(→ chapters/Saturator, DeEsser)*, Noise Reduction/Restoration/Troubleshooting *(→ chapters/NoiseGate)*
7. **Finishing & Professional Practice** — Mastering Essentials, Tool Selection, Real-World Projects & Workflow *(all briefing/capstone — no gear built yet)*

This mapping means only **Module 3's mic techniques** genuinely need new hotspots placed (the Recording Room's `markers: []` is empty today) — everything else either already has a home or is honestly a briefing-style chapter that was never going to live on a single object anyway.

## Data model change

Replace the gear-keyed `TOPICS` with a `CHAPTERS` array, numbered 1–25, each entry carrying an optional `hotspot` pointer instead of *being* keyed by one:

```js
{
  number: 8,
  id: "connectors-cables",
  module: "capture-signal-path",
  title: "Connectors, Cables, and Studio Wiring",
  brief: "Understand XLR, TRS, TS, RCA, MIDI, USB, speaker cables...",
  hotspot: { roomId: "studio-room", markerId: "patch-bay" }, // or null for briefing chapters
  ready: true,
  lessons: [...], assessment: {...}, interactive: {...}
}
```

`buildStepList()` still works almost unchanged — it just walks `CHAPTERS` in number order instead of `TOPICS` in array order, so linear Prev/Next across the *entire* 25-chapter course keeps working, including for chapters with no hotspot. `roomsData.js` markers stay the source of truth for *where* a hotspot sits in the panorama, but now reference a chapter number instead of owning the course content directly — `hotspotDevices.js`'s `buildDeviceList()` gains a chapter-number lookup so the left-docked panel can show "Ch. 8" badges instead of plain device order.

## New/changed UI surfaces

- **Course Map** (new): full syllabus, 7 collapsible modules, search + status filter, per-chapter status pill (Locked / Available / In Progress / Complete) and a location tag — "📍 Control Room · Patch Bay" for in-room chapters, "📖 Briefing" for conceptual ones. Opened from the Header, available from anywhere, not just inside a room.
- **StudioHotspotsPanel** (existing, left rail): keeps its always-on device list but each row now shows a chapter badge and opens straight into that chapter rather than a standalone "topic," so the two surfaces stay in sync.
- **In-scene hotspot badges**: swap the current 1–8 numbering for the real chapter number, so "walking the room" visibly teaches the same order as the syllabus.
- **Locked vs. free-roam toggle**: reuse the exact toggle pattern already in `studio-hotspots-panel.html` (`.mode-switch`) — "Linear" locks chapters until the previous one is complete (recommended default for new students); "Free roam" unlocks the whole map for review, matching how the existing power-up game already offers a game-mode/classic-mode switch.

## Suggested rollout order

1. Ship the `CHAPTERS` data model + Course Map UI against the 16 chapters that already have content somewhere in the app (even if some content still needs light rewriting to fit the new brief wording) — this alone turns a scattered 8-hotspot demo into a real 16/25 course with almost no new lesson writing.
2. Place real mic hotspots in the Recording Room (currently empty) to cover chapters 6–7 — the one true content gap in an otherwise-anchored module.
3. Backfill the 8 briefing-only chapters (Sound theory, Studio types, Listening skills, Computers/Power, Mastering, Tool selection, Real-world projects) as straightforward video/text chapters with no VR dependency — the Course Map can ship and be useful before every one of these exists, since locked/"coming soon" chapters already have precedent in the current `ready: false` stub pattern.

A mockup of the Course Map panel (matching the existing gold/void/JetBrains-Mono visual system from `studio-hotspots-panel.html`) is attached separately as `course-map-panel.html`.
