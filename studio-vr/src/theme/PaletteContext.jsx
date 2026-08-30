import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useTheme } from "./ThemeContext";
import { PALETTES, DEFAULT_PALETTE_ID, getPalette, hexToRgbTriplet } from "./palettes";

// Drives the app-wide "brand accent" CSS variables (--brand-accent,
// --brand-accent-2, --brand-glow, --brand-accent-ink, and their *-rgb
// triplets for building translucent colors) from the single palette table
// in palettes.js. Every page/component CSS file reads those variables
// instead of hardcoding the green - see the comment at the top of
// palettes.js.
//
// TEMPORARY: palette switcher - this whole palette-switching feature (this
// file, palettes.js, PaletteSwitcher.jsx, and the <PaletteSwitcher /> drop-ins
// in Header.jsx / LandingPage.jsx / PaymentPage.jsx) exists so different
// color palettes can be test-driven live in the nav bar. Once a final
// palette is chosen, this can collapse back down to a single hardcoded
// palette (or stay, if the switcher turns out to be worth keeping) - search
// the repo for "TEMPORARY: palette switcher" to find every piece.
const STORAGE_KEY = "svr-palette";
const PaletteContext = createContext(null);

function getInitialPalette() {
  if (typeof window === "undefined") return DEFAULT_PALETTE_ID;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && PALETTES.some((p) => p.id === stored)) return stored;
  return DEFAULT_PALETTE_ID;
}

export function PaletteProvider({ children }) {
  const { theme } = useTheme();
  const [paletteId, setPaletteId] = useState(getInitialPalette);

  useEffect(() => {
    const palette = getPalette(paletteId);
    const variant = theme === "light" ? palette.light : palette.dark;
    const root = document.documentElement;

    root.setAttribute("data-palette", paletteId);
    root.style.setProperty("--brand-accent", variant.accent);
    root.style.setProperty("--brand-accent-rgb", hexToRgbTriplet(variant.accent));
    root.style.setProperty("--brand-accent-2", variant.accent2);
    root.style.setProperty("--brand-accent-2-rgb", hexToRgbTriplet(variant.accent2));
    root.style.setProperty("--brand-glow", variant.glow);
    root.style.setProperty("--brand-glow-rgb", hexToRgbTriplet(variant.glow));
    root.style.setProperty("--brand-accent-ink", variant.ink);
    root.style.setProperty("--brand-accent-ink-rgb", hexToRgbTriplet(variant.ink));

    window.localStorage.setItem(STORAGE_KEY, paletteId);
  }, [paletteId, theme]);

  const value = useMemo(
    () => ({ paletteId, setPaletteId, palettes: PALETTES }),
    [paletteId]
  );

  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

export function usePalette() {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error("usePalette must be used within a PaletteProvider");
  return ctx;
}
