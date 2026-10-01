// Canvas / WebGL text can't use CSS custom properties directly, so this
// reads the app's global font tokens (--font-sans / --font-mono, defined
// once in src/index.css :root) and builds `ctx.font` strings from them.
// Never hard-code a family name in a ctx.font string — use canvasFont().
//
//   ctx.font = canvasFont(10, { mono: true });          // "400 10px 'Space Grotesk', …"
//   ctx.font = canvasFont(40, { weight: 600, mono: true });

const FALLBACK = {
  sans: "Inter, system-ui, sans-serif",
  mono: "'Space Grotesk', 'Inter', system-ui, sans-serif",
};
const cache = {};

export function fontFamily(kind = "sans") {
  if (cache[kind]) return cache[kind];
  let v = "";
  if (typeof document !== "undefined") {
    v = getComputedStyle(document.documentElement)
      .getPropertyValue(kind === "mono" ? "--font-mono" : "--font-sans")
      .trim();
  }
  // Only cache a real value — before index.css has applied we fall back
  // without caching so the next call picks up the token.
  if (v) cache[kind] = v;
  return v || FALLBACK[kind];
}

export function canvasFont(px, { weight = 400, mono = false } = {}) {
  return `${weight} ${px}px ${fontFamily(mono ? "mono" : "sans")}`;
}
