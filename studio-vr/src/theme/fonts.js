const FALLBACK = {
  sans: "Inter, system-ui, sans-serif",
  mono: "'Space Grotesk', 'Inter', system-ui, sans-serif",
};
const cache = {};

function fontFamily(kind = "sans") {
  if (cache[kind]) return cache[kind];
  let v = "";
  if (typeof document !== "undefined") {
    v = getComputedStyle(document.documentElement)
      .getPropertyValue(kind === "mono" ? "--font-mono" : "--font-sans")
      .trim();
  }
  if (v) cache[kind] = v;
  return v || FALLBACK[kind];
}

export function canvasFont(px, { weight = 400, mono = false } = {}) {
  return `${weight} ${px}px ${fontFamily(mono ? "mono" : "sans")}`;
}
