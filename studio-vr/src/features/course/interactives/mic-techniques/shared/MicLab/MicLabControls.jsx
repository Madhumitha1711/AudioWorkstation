import { TIERS } from "./micLabData";
import "./micLab.css";

export function Rich({ text }) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

export function Choices({ label, options, value, onPick, cols = 2, fit }) {
  return (
    <>
      <p className="ltb-choices-label">{label}</p>
      <div className={`ltb-choices ml-cols-${cols}${fit ? " has-legend" : ""}`} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={o.id === value}
            className={`ltb-choice${o.id === value ? " is-on" : ""}`}
            onClick={() => onPick(o.id)}
            title={fit?.[o.id] ? `${TIERS[fit[o.id][0]]}: ${fit[o.id][1]}` : undefined}
          >
            {fit?.[o.id] && <span className={`ml-dot tier-${fit[o.id][0]}`} aria-hidden="true" />}
            {o.short ?? o.label}
          </button>
        ))}
      </div>
      {fit && (
        <p className="ml-legend" aria-hidden="true">
          {Object.entries(TIERS).map(([k, t]) => (
            <span key={k}>
              <span className={`ml-dot tier-${k}`} />
              {t}
            </span>
          ))}
        </p>
      )}
    </>
  );
}

export function Toggles({ label, items, on, onToggle }) {
  return (
    <>
      <p className="ltb-choices-label">{label}</p>
      <div className="ml-toggles">
        {items.map((it) => {
          const isOn = on.includes(it.id);
          return (
            <button
              key={it.id}
              type="button"
              aria-pressed={isOn}
              className={`ml-toggle ml-tone--${it.tone}${isOn ? " is-on" : ""}`}
              onClick={() => onToggle(it.id)}
            >
              <span className="ml-toggle-sw" aria-hidden="true" />
              <span className="ml-toggle-txt">
                <b>{it.label}</b>
                {it.blurb && <small>{it.blurb}</small>}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function Slider({ label, value, onChange, ariaLabel }) {
  return (
    <label className="ml-slider">
      <span>
        {label} <b>{Math.round(value * 100)}%</b>
      </span>
      <input type="range" min="0" max="1" step="0.05" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={ariaLabel} />
    </label>
  );
}

export function Note({ children }) {
  return <p className="ltb-listen-note ml-note">{children}</p>;
}
