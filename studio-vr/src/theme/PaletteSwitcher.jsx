import { usePalette } from "./PaletteContext";
import "./PaletteSwitcher.css";

export function PaletteSwitcher({ className = "" }) {
  const { paletteId, setPaletteId, palettes } = usePalette();
  const current = palettes.find((p) => p.id === paletteId) || palettes[0];

  return (
    <label className={`svr-palette-switcher ${className}`.trim()} title="Test a different color palette (temporary)">
      <span className="svr-palette-swatch" style={{ background: current.swatch }} aria-hidden="true" />
      <select
        value={paletteId}
        onChange={(e) => setPaletteId(e.target.value)}
        aria-label="Preview color palette"
      >
        {palettes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
