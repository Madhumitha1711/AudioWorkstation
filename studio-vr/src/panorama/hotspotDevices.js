// Shared data/helpers for the studio hotspots device list, used by both
// StudioHotspotsPanel.jsx (the always-on left-docked nav rail) and
// StudioPowerUpChallenge.jsx (the optional power-up minigame ported from
// design/studio-hotspots-panel.html). Keeping icons/ordering/list-building
// in one place means the two stay visually and behaviorally consistent
// instead of drifting apart as separate copies.

// SIGNAL_ORDER mirrors the 7-device chain from the original design (patch
// bay -> ... -> speaker). LF Emitter isn't part of that original mock but is
// a real hotspot in roomsData.js, so it's slotted in just before the
// speakers (both are transducers that should power on last). Any future
// hotspot not listed here still shows up, appended at the end, instead of
// silently disappearing from the panel.
export const SIGNAL_ORDER = [
  "patch-bay",
  "preamp-rack",
  "sound-card",
  "daw-screens",
  "mixing-console",
  "diffuser-panel",
  "lf-emitter",
  "speaker",
];

export const ICONS = {
  "patch-bay": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="6" width="18" height="12" rx="1"/><circle cx="7" cy="10" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="17" cy="10" r="1"/><circle cx="7" cy="14" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="17" cy="14" r="1"/></svg>`,
  "preamp-rack": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="8" cy="9" r="1.8"/><circle cx="16" cy="9" r="1.8"/><line x1="6" y1="15" x2="18" y2="15"/><line x1="6" y1="18" x2="18" y2="18"/></svg>`,
  "sound-card": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="1"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="2" x2="9" y2="4"/><line x1="15" y1="2" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="22"/><line x1="15" y1="20" x2="15" y2="22"/><line x1="2" y1="9" x2="4" y2="9"/><line x1="2" y1="15" x2="4" y2="15"/><line x1="20" y1="9" x2="22" y2="9"/><line x1="20" y1="15" x2="22" y2="15"/></svg>`,
  "daw-screens": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="12" rx="1"/><path d="M6 10l2 -3 2 5 2 -6 2 4 2 -2"/><line x1="9" y1="19" x2="15" y2="19"/><line x1="12" y1="16" x2="12" y2="19"/></svg>`,
  "mixing-console": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="4" x2="6" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/><rect x="4" y="8" width="4" height="3"/><rect x="10" y="13" width="4" height="3"/><rect x="16" y="6" width="4" height="3"/></svg>`,
  "diffuser-panel": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="9"/><line x1="15" y1="9" x2="15" y2="15"/><line x1="9" y1="15" x2="9" y2="21"/></svg>`,
  "lf-emitter": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="1.5"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/></svg>`,
  speaker: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="2" width="14" height="20" rx="1.5"/><circle cx="12" cy="8" r="2.5"/><circle cx="12" cy="16" r="4"/></svg>`,
};

export const WARN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l9 16H3z"/><line x1="12" y1="10" x2="12" y2="14"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg>`;

// Builds the ordered device list for a room: known signal-chain hotspots
// first (per SIGNAL_ORDER), then anything else the room defines, so the
// panel never silently drops a real hotspot just because it's new.
export function buildDeviceList(room) {
  if (!room) return [];
  const byId = new Map([
    ...(room.markers || []).map((m) => [m.id, { ...m, kind: "gear" }]),
    // `secondaryEntry` markers (see roomsData.js) are extra in-scene click
    // points onto a device that already has a primary entry here — e.g. a
    // second DAW hotspot at desk height alongside the one by the monitors.
    // They stay out of this list so the panel/power-up game never shows the
    // same real device twice.
    ...(room.interactiveMarkers || [])
      .filter((m) => !m.secondaryEntry)
      .map((m) => [m.id, { ...m, kind: "interactive" }]),
  ]);

  const ordered = [];
  SIGNAL_ORDER.forEach((key) => {
    if (byId.has(key)) {
      ordered.push(byId.get(key));
      byId.delete(key);
    }
  });
  // Anything left over (not part of the known chain) is appended in
  // whatever order roomsData.js defined it.
  byId.forEach((device) => ordered.push(device));
  return ordered;
}

// Describes a device's dependency in the signal chain, given its canonical
// (non-shuffled) position in the device list. Used both for the always-on
// panel's "req" line and the challenge's hint text.
export function describeRequirement(devices, canonicalIndex) {
  if (canonicalIndex === 0) return "No dependency · powers first";
  const prevTitle = devices[canonicalIndex - 1]?.title;
  if (canonicalIndex === devices.length - 1) {
    return `Requires ${prevTitle} · powers last`;
  }
  return `Requires ${prevTitle}`;
}

// Small on/tripped/off status light shown on every device row. Shared here
// so both panels agree on the same three labels/colors.
export const POWER_LED_LABEL = { on: "On", error: "Tripped", off: "Off" };
