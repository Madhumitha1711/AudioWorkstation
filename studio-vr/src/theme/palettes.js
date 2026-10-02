export const PALETTES = [
  {
    id: "spotify",
    name: "Spotify Green",
    swatch: "#1DB954",
    dark: { accent: "#7dffb8", accent2: "#17c76a", glow: "#22ff82", ink: "#04160a" },
    light: { accent: "#047857", accent2: "#10b981", glow: "#059669", ink: "#04160a" },
  },
  {
    id: "stripe",
    name: "Stripe Purple",
    swatch: "#635BFF",
    dark: { accent: "#b3aaff", accent2: "#635bff", glow: "#8c7dff", ink: "#ffffff" },
    light: { accent: "#4f46e5", accent2: "#635bff", glow: "#7c6cff", ink: "#ffffff" },
  },
  {
    id: "airbnb",
    name: "Airbnb Coral",
    swatch: "#FF385C",
    dark: { accent: "#ff9fb0", accent2: "#ff385c", glow: "#ff5a75", ink: "#ffffff" },
    light: { accent: "#e31c5f", accent2: "#ff385c", glow: "#ff5a75", ink: "#ffffff" },
  },
  {
    id: "slack",
    name: "Slack Aubergine",
    swatch: "#4A154B",
    dark: { accent: "#d9a8e0", accent2: "#4a154b", glow: "#8e2f90", ink: "#ffffff" },
    light: { accent: "#8e2f90", accent2: "#4a154b", glow: "#6c2170", ink: "#ffffff" },
  },
  {
    id: "netflix",
    name: "Netflix Red",
    swatch: "#E50914",
    dark: { accent: "#ff5a5a", accent2: "#e50914", glow: "#ff2b2b", ink: "#ffffff" },
    light: { accent: "#b20710", accent2: "#e50914", glow: "#ff1e1e", ink: "#ffffff" },
  },
  {
    id: "apple",
    name: "Apple Blue",
    swatch: "#0071E3",
    dark: { accent: "#7dc4ff", accent2: "#0071e3", glow: "#409cff", ink: "#ffffff" },
    light: { accent: "#0066cc", accent2: "#0071e3", glow: "#3395ff", ink: "#ffffff" },
  },
];

export const DEFAULT_PALETTE_ID = "spotify";

export function getPalette(id) {
  return PALETTES.find((p) => p.id === id) || PALETTES.find((p) => p.id === DEFAULT_PALETTE_ID);
}

export function hexToRgbTriplet(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
