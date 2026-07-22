import { useRef, useEffect, useCallback } from 'react';
// ── Shared vertical fader/slider ─────────────────────────────────────────────
// Drag-to-adjust vertical slider. Thumb tracks the cursor 1:1 within the
// track, the way a physical channel fader behaves (top = max, bottom = min).
export function Fader({ spec, value, onChange, disabled = false, target, height = 90 }) {
    const accent = spec.accent ?? 'var(--amber)';
    const trackRef = useRef(null);
    const draggingRef = useRef(false);

    const valueFromClientY = useCallback((clientY) => {
        const el = trackRef.current;
        if (!el)
            return value;
        const rect = el.getBoundingClientRect();
        const pct = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
        const raw = spec.min + pct * (spec.max - spec.min);
        const snapped = Math.round(raw / spec.step) * spec.step;
        return Math.min(spec.max, Math.max(spec.min, snapped));
    }, [spec, value]);
    const onDown = useCallback((e) => {
        if (disabled)
            return;
        e.preventDefault();
        draggingRef.current = true;
        onChange(valueFromClientY(e.clientY));
    }, [disabled, onChange, valueFromClientY]);
    useEffect(() => {
        if (disabled)
            return;
        const onMove = (e) => {
            if (!draggingRef.current)
                return;
            onChange(valueFromClientY(e.clientY));
        };
        const onUp = () => { draggingRef.current = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [disabled, onChange, valueFromClientY]);
    const pct = (value - spec.min) / (spec.max - spec.min);
    const targetPct = target !== undefined ? (target - spec.min) / (spec.max - spec.min) : null;
    return (<div className="knob-wrap" style={disabled ? { opacity: 0.35, pointerEvents: 'none' } : {}}>
        <div ref={trackRef} className="channel-fader-track" style={{ height, cursor: disabled ? 'not-allowed' : 'ns-resize' }} onMouseDown={onDown}>
            {targetPct !== null && (<div style={{
                position: 'absolute',
                left: 0, right: 0,
                top: `${(1 - targetPct) * 100}%`,
                height: 2,
                background: 'var(--amber)',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
            }} />)}
            <div className="channel-fader-thumb" style={{
                top: `${(1 - pct) * 100}%`,
                transform: 'translate(-50%, -50%)',
                borderColor: disabled ? undefined : accent,
            }} />
        </div>
        <div className="knob-name" style={disabled ? { color: 'var(--text-faint)' } : {}}>{spec.label}</div>
        <div className="knob-val" style={{ color: disabled ? 'var(--text-faint)' : accent }}>
            {spec.fmt(value)}
        </div>
    </div>);
}
