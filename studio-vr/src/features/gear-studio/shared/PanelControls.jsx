import { useEffect, useRef, useState } from 'react';
import { specToFrac, specFromFrac, knobRotationForSpec, describeArc } from './panelUtils';

function KnobNumberInput({ value, min, max, step, onChange }) {
  const decimals = step < 1 ? Math.max(0, Math.ceil(-Math.log10(step))) : 0;
  const [local, setLocal] = useState(() => value.toFixed(decimals));
  const focusedRef = useRef(false);
  const clamp = (n) => Math.min(max, Math.max(min, n));
  useEffect(() => {
    if (!focusedRef.current) setLocal(value.toFixed(decimals));
  }, [value, decimals]);
  const commit = (text) => {
    const n = parseFloat(text);
    const clamped = Number.isNaN(n) ? value : clamp(n);
    onChange(clamped);
    setLocal(clamped.toFixed(decimals));
  };
  return (
    <input
      type="number"
      className="knob-num-input"
      value={local}
      min={min}
      max={max}
      step={step}
      onFocus={() => { focusedRef.current = true; }}
      onChange={(e) => {
        setLocal(e.target.value);
        const n = parseFloat(e.target.value);
        if (!Number.isNaN(n)) onChange(clamp(n));
      }}
      onBlur={() => { focusedRef.current = false; commit(local); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
    />
  );
}

const MINI_LABEL = {
  width: 96, fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--text-dim)',
  letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.25,
};

export function MiniSlider({ label, value, min, max, step, fmt, onChange, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
      <span style={MINI_LABEL}>{label}</span>
      <input type="range" className="mini-range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ ['--mini-range-accent']: accent }} />
      <span style={{ width: 58, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: accent }}>{fmt(value)}</span>
    </div>
  );
}

const KNOB_POINTER = {
  position: 'absolute', top: '50%', left: '50%', width: 3, height: 16, background: 'var(--text)',
  borderRadius: 2, transformOrigin: 'bottom center', marginTop: -2,
};

export function KnobGrid({ knobs, values, color, onChange }) {
  const dragRef = useRef(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const frac = Math.min(1, Math.max(0, d.startFrac + (d.startY - e.clientY) / 220));
      const raw = specFromFrac(d.spec, frac);
      onChangeRef.current(d.spec.key, Math.min(d.spec.max, Math.max(d.spec.min, Math.round(raw / d.spec.step) * d.spec.step)));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);
  return (
    <div className="knob-grid">
      {knobs.map((spec) => {
        const val = values[spec.key];
        const rot = knobRotationForSpec(spec, val);
        return (
          <div className="knob-wrap" key={spec.key}>
            <div style={{ position: 'relative', width: 64, height: 64 }}>
              <svg style={{ position: 'absolute', top: 0, left: 0 }} width={64} height={64} viewBox="-32 -32 64 64">
                <path d={describeArc(28, -140, 140)} fill="none" stroke="var(--border)" strokeWidth={3} strokeLinecap="round" />
                <path d={describeArc(28, -140, rot)} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.85} />
              </svg>
              <div
                className="big-knob"
                style={{ position: 'absolute', top: 6, left: 6, width: 52, height: 52, cursor: 'ns-resize', userSelect: 'none' }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  dragRef.current = { spec, startY: e.clientY, startFrac: specToFrac(spec, val) };
                }}
              >
                <div style={{ ...KNOB_POINTER, transform: `translate(-50%, -100%) rotate(${rot}deg)` }} />
              </div>
            </div>
            <div className="knob-name">{spec.label}</div>
            <div className="knob-val">{spec.fmt(val)}</div>
            <KnobNumberInput value={val} min={spec.min} max={spec.max} step={spec.step} onChange={(v) => onChange(spec.key, v)} />
          </div>
        );
      })}
    </div>
  );
}
