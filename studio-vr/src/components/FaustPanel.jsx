import { useCallback, useState } from 'react';
import { Knob } from './Knob';
import { isFaustGroup, faustMetaValue } from '../faust/faustTypes';
// ── Generic Faust UI renderer ────────────────────────────────────────────────
// Recursively renders any Faust dsp-meta.json `ui` tree using the app's
// existing Knob component for continuous controls, and simple buttons for
// momentary buttons / checkboxes. Nothing here is specific to any one DSP —
// point it at a different Faust patch's meta.ui and it just works, which is
// the point: every future chapter's Faust patch reuses this same panel.
function fmtForUnit(unit, step) {
    const decimals = step < 1 ? Math.max(0, Math.ceil(-Math.log10(step))) : 0;
    return (v) => `${v.toFixed(decimals)}${unit ? ' ' + unit : ''}`;
}
export function FaustPanel({ items, node, onParamChange }) {
    // Controlled values keyed by Faust address, seeded lazily from each
    // control's `init` the first time it's read.
    const [values, setValues] = useState({});
    const getValue = useCallback((address, init) => (values[address] !== undefined ? values[address] : init), [values]);
    const setValue = useCallback((address, v) => {
        setValues(prev => ({ ...prev, [address]: v }));
        node?.setParamValue(address, v);
        onParamChange?.(address, v);
    }, [node, onParamChange]);
    const triggerDown = useCallback((address) => node?.setParamValue(address, 1), [node]);
    const triggerUp = useCallback((address) => node?.setParamValue(address, 0), [node]);
    const toggle = useCallback((address, current) => {
        const next = current > 0 ? 0 : 1;
        setValues(prev => ({ ...prev, [address]: next }));
        node?.setParamValue(address, next);
        onParamChange?.(address, next);
    }, [node, onParamChange]);
    function renderItem(item, key) {
        if (isFaustGroup(item)) {
            return (<div key={key} className="faust-group">
          <div className="faust-group-title">{item.label}</div>
          <div className={`faust-group-body faust-group-${item.type}`}>
            {item.items.map((child, i) => renderItem(child, `${key}-${i}`))}
          </div>
        </div>);
        }
        switch (item.type) {
            case 'hslider':
            case 'vslider':
            case 'nentry': {
                const min = item.min ?? 0;
                const max = item.max ?? 1;
                const step = item.step ?? 0.01;
                const init = item.init ?? min;
                const unit = faustMetaValue(item.meta, 'unit');
                const spec = { label: item.label, min, max, step, fmt: fmtForUnit(unit, step) };
                return (<Knob key={item.address} spec={spec} value={getValue(item.address, init)} onChange={v => setValue(item.address, v)} size={56}/>);
            }
            case 'button':
                return (<button key={item.address} className="faust-trigger-btn" onMouseDown={() => triggerDown(item.address)} onMouseUp={() => triggerUp(item.address)} onMouseLeave={() => triggerUp(item.address)}>
            {item.label}
          </button>);
            case 'checkbox': {
                const current = getValue(item.address, item.init ?? 0);
                return (<button key={item.address} className={`faust-toggle-btn${current > 0 ? ' on' : ''}`} onClick={() => toggle(item.address, current)}>
            {item.label}
          </button>);
            }
            default:
                // hbargraph/vbargraph are DSP outputs (meters), not inputs — skipped for now.
                return null;
        }
    }
    return <div className="faust-panel">{items.map((item, i) => renderItem(item, `p${i}`))}</div>;
}
