// ═══════════════════════════════════════════════════════════════════════════
// DAW Workstation — small inline SVG icon components
// ═══════════════════════════════════════════════════════════════════════════
// Plugin icons (used by InsertRack chips/picker) and track-type icons (used
// by the tracklist/mixer swatches and the New Track dialog's icon picker).

const PLUGIN_ICON_PATHS = {
  gate: [{ d: "M4 4v16M20 4v16M4 12h6M14 12h6", cap: "round" }],
  deess: [
    { d: "M6 17c3 0 3-10 6-10s3 10 6 10", cap: "round", join: "round" },
    { d: "M3 21L21 3", cap: "round" },
  ],
  eq: [{ d: "M3 12h4l2-6 3 15 3-11 2 8 2-6h2", cap: "round", join: "round" }],
  comp: [
    { d: "M2 17c4 0 4-11 8-11s4 11 8 11 4-6 4-6", cap: "round", join: "round" },
    { d: "M2 7h20", opacity: 0.4 },
  ],
  limiter: [
    { d: "M3 16c3 0 4-9 7-9s2 9 5 9 3-5 6-5", cap: "round" },
    { d: "M3 7h18", opacity: 0.4 },
  ],
  delay: [{ circle: [6, 12, 3] }, { circle: [13, 12, 2.4], opacity: 0.7 }, { circle: [19, 12, 1.8], opacity: 0.45 }],
  reverb: [
    { d: "M4 12a3 3 0 0 1 3-3M4 12a6 6 0 0 1 6-6M4 12a9 9 0 0 1 9-9", cap: "round" },
    { circle: [4, 12, 1.4], fill: true },
  ],
};

export function PluginIcon({ pkey }) {
  const parts = PLUGIN_ICON_PATHS[pkey] || [];
  return (
    <svg className="plugin-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      {parts.map((p, i) =>
        p.circle ? (
          <circle
            key={i}
            cx={p.circle[0]}
            cy={p.circle[1]}
            r={p.circle[2]}
            opacity={p.opacity}
            fill={p.fill ? "currentColor" : "none"}
            stroke={p.fill ? "none" : "currentColor"}
          />
        ) : (
          <path key={i} d={p.d} strokeLinecap={p.cap} strokeLinejoin={p.join} opacity={p.opacity} />
        ),
      )}
    </svg>
  );
}

const TRACK_ICON_PATHS = {
  audio: [{ d: "M3 12h3l2.5-7 3 14 3-11 2 7h4.5", cap: "round", join: "round" }],
  vocal: [
    { d: "M12 3a3 3 0 0 1 3 3v6a3 3 0 1 1-6 0V6a3 3 0 0 1 3-3Z", join: "round" },
    { d: "M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6", cap: "round", join: "round" },
  ],
  guitar: [
    { circle: [8, 16, 4.2] },
    { d: "M11 13 18 6M18 6l2.5-.5L20 8l-2 0M14 9l1.5 1.5M16 7l1.5 1.5", cap: "round", join: "round" },
  ],
  keys: [{ d: "M3 6h18v12H3zM7 6v7.5M11 6v7.5M15 6v7.5M19 6v7.5", cap: "round" }],
  drum: [
    { d: "M4 8a8 3 0 1 0 16 0 8 3 0 1 0-16 0Z" },
    { d: "M4 8v7a8 3 0 0 0 16 0V8", cap: "round" },
  ],
  bass: [
    { circle: [7, 17, 3.4] },
    { d: "M9.5 14.5 17 7M17 7l3-1M17 7l1 3M14 5l1.5 1.5", cap: "round", join: "round" },
  ],
  aux: [
    { d: "M4 5h16v6H4zM4 13h16v6H4z", join: "round" },
    { circle: [8, 8, 1.3] },
    { circle: [8, 16, 1.3] },
  ],
};

export function TrackIcon({ ikey }) {
  const parts = TRACK_ICON_PATHS[ikey] || TRACK_ICON_PATHS.audio;
  return (
    <svg className="track-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      {parts.map((p, i) =>
        p.circle ? (
          <circle key={i} cx={p.circle[0]} cy={p.circle[1]} r={p.circle[2]} opacity={p.opacity} />
        ) : (
          <path key={i} d={p.d} strokeLinecap={p.cap} strokeLinejoin={p.join} opacity={p.opacity} />
        ),
      )}
    </svg>
  );
}

export const TRACK_ICON_KEYS = Object.keys(TRACK_ICON_PATHS);
