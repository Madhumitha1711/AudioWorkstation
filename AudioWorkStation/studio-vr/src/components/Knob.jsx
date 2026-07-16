import { useRef, useEffect, useCallback } from 'react';
// ── Shared rotary knob ───────────────────────────────────────────────────────
// Originally built for Chapter 6 (Reverb Designer); pulled out here so every
// lab uses the same drag-to-adjust dial instead of one-off sliders/faders.
function knobRot(v, min, max) {
    return -140 + ((v - min) / (max - min)) * 280;
}
function polarXY(r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}
function arc(r, start, end) {
    if (Math.abs(end - start) < 0.1)
        end = start + 0.1;
    const s = polarXY(r, start), e = polarXY(r, end);
    const lg = end - start > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${lg} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}
export function Knob({ spec, value, onChange, disabled = false, target, size = 64 }) {
    const rot = knobRot(value, spec.min, spec.max);
    const accent = spec.accent ?? 'var(--teal)';
    const dragRef = useRef(null);
    const onDown = useCallback((e) => {
        if (disabled)
            return;
        e.preventDefault();
        dragRef.current = { startY: e.clientY, startVal: value };
    }, [value, disabled]);
    useEffect(() => {
        if (disabled)
            return;
        const onMove = (e) => {
            const d = dragRef.current;
            if (!d)
                return;
            const sens = (spec.max - spec.min) / 220;
            const raw = d.startVal + (d.startY - e.clientY) * sens;
            const snapped = Math.round(raw / spec.step) * spec.step;
            onChange(Math.min(spec.max, Math.max(spec.min, snapped)));
        };
        const onUp = () => { dragRef.current = null; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [spec, onChange, disabled]);
    const scale = size / 64;
    const bigSize = 52 * scale;
    const offset = (size - bigSize) / 2;
    const radius = 28 * scale;
    const tickW = Math.max(2, 3 * scale);
    const tickH = 16 * scale;
    const targetRot = target !== undefined ? knobRot(target, spec.min, spec.max) : null;
    const targetPt = targetRot !== null
        ? { a: polarXY(radius - 5 * scale, targetRot), b: polarXY(radius + 5 * scale, targetRot) }
        : null;
    return (<div className="knob-wrap" style={disabled ? { opacity: 0.35, pointerEvents: 'none' } : {}}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg style={{ position: 'absolute', top: 0, left: 0 }} width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
          <path d={arc(radius, -140, 140)} fill="none" stroke="#2E2E3D" strokeWidth={3} strokeLinecap="round"/>
          <path d={arc(radius, -140, rot)} fill="none" stroke={accent} strokeWidth={3} strokeLinecap="round" opacity={0.85}/>
          {targetPt && (<line x1={targetPt.a.x} y1={targetPt.a.y} x2={targetPt.b.x} y2={targetPt.b.y} stroke="var(--amber)" strokeWidth={2} strokeLinecap="round"/>)}
        </svg>
        <div className="big-knob" style={{
            position: 'absolute', top: offset, left: offset, width: bigSize, height: bigSize,
            background: disabled
                ? 'radial-gradient(circle at 35% 35%, #222230, var(--console))'
                : 'radial-gradient(circle at 35% 35%, #1F4F49, var(--console))',
            cursor: disabled ? 'not-allowed' : 'ns-resize',
            userSelect: 'none',
        }} onMouseDown={onDown}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            width: tickW, height: tickH,
            background: disabled ? '#4A4A5A' : '#E8E8EC',
            borderRadius: 2,
            transformOrigin: 'bottom center',
            transform: `translate(-50%, -100%) rotate(${rot}deg)`,
            marginTop: -2,
        }}/>
        </div>
      </div>
      <div className="knob-name" style={disabled ? { color: 'var(--text-faint)' } : {}}>{spec.label}</div>
      <div className="knob-val" style={{ color: disabled ? 'var(--text-faint)' : accent }}>
        {spec.fmt(value)}
      </div>
    </div>);
}
