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
// This is the BASE set, keyed by id — PanoramaTour hands this array to
// OnboardingTour as the per-visit sequence unchanged (see tourStepsForCard
// there), since every step below applies to every visitor the same way.
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
    id: "select-hotspot",
    title: "Select a hotspot",
    body: "Click any device directly in the control room to walk the camera over to it and open its info panel. That's how you'll get around the control room and learn what each piece of gear does.",
    mandatory: true,
    pendingHint: "Click a device in the control room scene to continue.",
    doneHint: "Hotspot selected.",
  },
  // This step always lands on the Speakers hotspot (hotspot #1 — see
  // "select-hotspot" above), which offers its own "Listening Lab" here
  // instead of the ordinary "Test your knowledge" quiz every other hotspot
  // shows (see PanoramaTour.jsx's gear-panel body and
  // SpeakerListeningLab.jsx) — the copy below reflects that, even though
  // the step id stays "test-knowledge" so the rest of the tour's wiring
  // (glow targeting, etc.) doesn't need to change.
  {
    id: "test-knowledge",
    title: "Try the Listening Lab",
    body: "Try the \"Listening Lab\" for three quick, optional ear-training experiments before diving into the lesson.",
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
