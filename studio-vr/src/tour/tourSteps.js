// Step script for the first-time-visitor onboarding tour (see
// OnboardingTour.jsx, wired up from PanoramaTour.jsx). Kept as plain data so
// the copy can be tweaked without touching component logic, and so
// PanoramaTour can look a step up by `id` (e.g. "is the gear panel's
// 'Test your knowledge' card the one we should be glowing right now?")
// instead of juggling magic step-index numbers everywhere.
//
// `mandatory: true` means the student must actually perform the described
// action before the "Continue" button in the tour card enables — see
// PanoramaTour's `tourCanContinue` for the actual per-step gating logic
// (each id needs its own case there; a step with no matching case defaults
// to "always allowed", so adding a step here isn't enough on its own).
// `mandatory: false` steps always let the student move on with "Next"
// without doing anything — currently just "test-knowledge" below, since the
// quiz itself is meant to stay a genuinely optional detour, not something
// the tour forces every visitor through.
//
// This is the BASE set, keyed by id — PanoramaTour doesn't hand this array
// to OnboardingTour as-is. It builds the actual per-visit sequence from
// these (see tourStepsForCard there), because "select-hotspot" and the
// extra "power-up-sequence" step both depend on the visitor actually
// flipping the "Try Game mode" switch on during the "game-mode" step below —
// and since that step is now mandatory, every visitor does, every time:
//   - "power-up-sequence" (below) gets inserted right after "game-mode" to
//     walk them through bringing the rig back online, since toggling Game
//     mode on powers it back down for a real round. The correct power-on
//     order is only spelled out here (via PanoramaTour's `hint` field) —
//     not on "game-mode" itself — since this is the step that actually asks
//     the visitor to power things back up in order; showing the answer a
//     step early, before the switch is even flipped, would spoil the
//     "work it out yourself" point of Game mode for no reason.
//   - "select-hotspot" narrows from "any device" to specifically hotspot #1,
//     since that's the one the visitor can be sure is still visible/nameable
//     regardless of which order they just powered things up in.
// (tourStepsForCard still reads this off the live `gameModeToggledOn` state
// rather than assuming it — a visitor who somehow reaches "select-hotspot"
// without it set, e.g. a room with no markers, still gets the plain
// unnarrowed copy below instead of a broken hotspot-#1 reference.)
export const TOUR_STEPS = [
  {
    id: "power-up",
    title: "Power up the rig",
    body: "Click \"Power up Control Room\" in the panel on the left to bring the rig online and start the control room. The rest of the control room stays locked until it's powered up.",
    mandatory: true,
    pendingHint: "Click \"Power up Control Room\" in the panel to continue.",
    doneHint: "Rig powered — nice work.",
  },
  {
    id: "game-mode",
    title: "Try Game mode",
    body: "The switch at the top of that same panel flips between Game mode (work out the correct power-on order yourself) and Classic mode (a guided one-click sequence). Flip it on now — it'll power everything back down for a real round.",
    mandatory: true,
    pendingHint: "Flip the Game mode switch on to continue.",
    doneHint: "Game mode on — on to bringing the rig back online.",
  },
  // Always shown right after "game-mode" above, now that flipping it on is
  // itself mandatory — see tourStepsForCard in PanoramaTour.jsx. This is
  // the step that actually carries the correct power-on order hint (see
  // the header comment above for why it isn't shown a step earlier).
  {
    id: "power-up-sequence",
    title: "Bring the rig back online",
    body: "Toggling Game mode on just powered the whole rig back down for a real round. Bring every station back online — click each one in the correct order (shown below), use the panel's own Hint button, or switch back to Classic mode and click \"Power up Control Room\" for an instant, guaranteed power-up. The rest of the control room stays locked again until it's back on.",
    mandatory: true,
    pendingHint: "Power up every device again to continue.",
    doneHint: "Rig powered — nice work.",
  },
  {
    id: "select-hotspot",
    title: "Select a hotspot",
    body: "Click any device directly in the control room to walk the camera over to it and open its info panel. That's how you'll get around the control room and learn what each piece of gear does.",
    mandatory: true,
    pendingHint: "Click a device in the control room scene to continue.",
    doneHint: "Hotspot selected.",
  },
  {
    id: "test-knowledge",
    title: "Test your knowledge",
    body: "Try \"Test your knowledge\" for a quick, optional 5-question quiz before diving into the lesson.",
    mandatory: false,
  },
  {
    id: "start-course",
    title: "Start the course",
    body: "When you're ready, click \"Start course\" to begin the lesson.",
    mandatory: false,
    pendingHint: "",
  },
];
