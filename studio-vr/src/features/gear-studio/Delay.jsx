import { useRef, useState, useEffect, useCallback } from 'react';
import { Knob } from '../../components/controls/Knob';
import { BPM, syncDivisionMs, METER_FLOOR_DB } from '../../audio/effects/delayEngine';
import { drawLevelScope } from './shared/panelUtils';
import { levelBallistic } from '../../audio/effects/ballistics';
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB = -72;
const SCOPE_MAX_DB = 6;
function drawDelayScope(canvas, history, nowT, active) {
    drawLevelScope(canvas, history, nowT, {
        windowS: SCOPE_WINDOW_S, minDb: SCOPE_MIN_DB, maxDb: SCOPE_MAX_DB,
        idleText: active ? null : 'HIT PLAY TO SEE THE ECHOES RING OUT',
        fill: '#2DD4BF', inColor: '#F5A623', inAlpha: 0.55, outColor: '#2DD4BF', timeLabels: true,
    });
}
const SYNC_DIVISIONS = ['1/4', '1/8', '1/8.', '1/16T', 'FREE'];
const fmtHz = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${Math.round(v)}Hz`;
const KNOB_SPECS = {
    delayTimeMs: { label: 'DELAY TIME', min: 1, max: 2000, step: 1, fmt: (v) => v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`, accent: 'var(--teal)' },
    feedback: { label: 'FEEDBACK', min: 0, max: 95, step: 1, fmt: (v) => `${Math.round(v)}%`, accent: 'var(--teal)' },
    analog: { label: 'ANALOG', min: 0, max: 10, step: 1, fmt: (v) => `${Math.round(v)}`, accent: 'var(--teal)' },
    modDepth: { label: 'DEPTH', min: 0, max: 100, step: 1, fmt: (v) => `${Math.round(v)}%`, accent: 'var(--teal)' },
    modRate: { label: 'RATE', min: 0.05, max: 8, step: 0.01, fmt: (v) => `${v.toFixed(2)} Hz`, accent: 'var(--teal)' },
    hipass: { label: 'HIPASS', min: 20, max: 5000, step: 1, fmt: fmtHz, accent: 'var(--teal)' },
    lopass: { label: 'LOPASS', min: 200, max: 18000, step: 1, fmt: fmtHz, accent: 'var(--teal)' },
    dryWet: { label: 'DRY/WET', min: 0, max: 100, step: 1, fmt: (v) => `${Math.round(v)}%`, accent: 'var(--teal)' },
    output: { label: 'OUTPUT', min: -24, max: 12, step: 0.1, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`, accent: 'var(--teal)' },
};
const TAP_DISPLAY_H = 140;
const TAP_BASELINE_OFFSET = 24;
const TAP_MAX_BAR_H = TAP_DISPLAY_H - TAP_BASELINE_OFFSET - 14;
function computeTaps(delayMs, feedbackPct, pingPong, analog) {
    const feedbackFrac = feedbackPct / 100;
    const satAtten = 1 - Math.min(0.4, (analog / 10) * 0.3);
    const windowMs = Math.min(2000, Math.max(600, delayMs * 6));
    const taps = [];
    for (let n = 0; n * delayMs <= windowMs && n <= 24; n++) {
        const t = n * delayMs;
        const amp = n === 0 ? 1 : Math.pow(feedbackFrac * satAtten, n);
        if (n > 0 && amp < 0.03)
            break;
        const isRight = pingPong && n % 2 === 1;
        taps.push({
            leftPct: (t / windowMs) * 100,
            heightPx: Math.max(3, TAP_MAX_BAR_H * amp),
            label: n === 0 ? 'DRY' : `${Math.round(t)}ms`,
            color: n === 0 ? 'var(--amber)' : (isRight ? 'var(--blue)' : 'var(--teal)'),
            opacity: n === 0 ? 1 : Math.max(0.22, 1 - n * 0.07),
        });
    }
    return taps;
}
const VU_SEGMENTS = 5;
function vuSegmentFills(peakLinear) {
    const db = peakLinear > 1e-6 ? 20 * Math.log10(peakLinear) : -60;
    const norm = Math.max(0, Math.min(1, (db + 60) / 60));
    return Array.from({ length: VU_SEGMENTS }, (_, i) => {
        const segFloor = i / VU_SEGMENTS, segCeil = (i + 1) / VU_SEGMENTS;
        return Math.max(0, Math.min(1, (norm - segFloor) / (segCeil - segFloor))) * 100;
    });
}
function vuSegmentClass(i) {
    if (i < 3)
        return 'green';
    if (i === 3)
        return 'amber';
    return 'red';
}
export function DelayEditorPanel({ params, setParams, sync, setSync, link, setLink, isPlaying, getInputPeak, getOutputPeak, getNow, onTestEcho = null, engineBadge = null, }) {
    const [vuFills, setVuFills] = useState(() => vuSegmentFills(0));
    const scopeRef = useRef(null);
    const scopeHistoryRef = useRef([]);
    const meterClockRef = useRef(null);
    const smoothedInputDbRef = useRef(METER_FLOOR_DB);
    const smoothedOutputDbRef = useRef(METER_FLOOR_DB);
    const animRef = useRef(0);
    useEffect(() => {
        if (isPlaying)
            return;
        if (scopeRef.current)
            drawDelayScope(scopeRef.current, [], 0, false);
    }, [isPlaying]);
    const applySync = useCallback((div) => {
        setSync(div);
        const ms = syncDivisionMs(div, BPM);
        if (ms !== null)
            setParams(p => ({ ...p, delayTimeMs: Math.min(2000, Math.max(1, ms)) }));
    }, [setParams]);
    const setHipass = useCallback((v) => {
        setParams(p => {
            if (!link || p.hipass <= 0)
                return { ...p, hipass: v };
            const ratio = v / p.hipass;
            return { ...p, hipass: v, lopass: Math.min(18000, Math.max(200, p.lopass * ratio)) };
        });
    }, [link, setParams]);
    const setLopass = useCallback((v) => {
        setParams(p => {
            if (!link || p.lopass <= 0)
                return { ...p, lopass: v };
            const ratio = v / p.lopass;
            return { ...p, lopass: v, hipass: Math.min(5000, Math.max(20, p.hipass * ratio)) };
        });
    }, [link, setParams]);
    useEffect(() => {
        if (!isPlaying) {
            cancelAnimationFrame(animRef.current);
            scopeHistoryRef.current = [];
            meterClockRef.current = null;
            setVuFills(vuSegmentFills(0));
            return;
        }
        const tick = () => {
            const now = getNow?.() ?? performance.now() / 1000;
            const dt = meterClockRef.current !== null ? Math.max(0, Math.min(0.2, now - meterClockRef.current)) : 0;
            meterClockRef.current = now;
            const inPeak = getInputPeak?.();
            if (inPeak !== null && inPeak !== undefined) {
                const rawInputDb = inPeak > 1e-6 ? 20 * Math.log10(inPeak) : METER_FLOOR_DB;
                smoothedInputDbRef.current = levelBallistic(smoothedInputDbRef.current, rawInputDb, dt);
            }
            const outPeak = getOutputPeak?.();
            if (outPeak !== null && outPeak !== undefined) {
                setVuFills(vuSegmentFills(outPeak));
                const rawOutputDb = outPeak > 1e-6 ? 20 * Math.log10(outPeak) : METER_FLOOR_DB;
                smoothedOutputDbRef.current = levelBallistic(smoothedOutputDbRef.current, rawOutputDb, dt);
            }
            const history = scopeHistoryRef.current;
            history.push({ t: now, inputDb: smoothedInputDbRef.current, outputDb: smoothedOutputDbRef.current });
            const cutoff = now - SCOPE_WINDOW_S - 0.5;
            while (history.length > 0 && history[0].t < cutoff)
                history.shift();
            if (scopeRef.current)
                drawDelayScope(scopeRef.current, history, now, true);
            animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, getInputPeak, getOutputPeak, getNow]);
    const taps = computeTaps(params.delayTimeMs, params.feedback, params.pingPong, params.analog);
    return (<div className="hdelay-body">
      <div className="hdelay-left">
        <div className="canvas-label">DELAY TAPS — TIME DOMAIN</div>
        <div className="tap-display">
          <div className="tap-grid"/>
          <div className="tap-baseline"/>
          {taps.map((tap, i) => (<div key={i} className="tap-bar" style={{ left: `${tap.leftPct}%`, height: tap.heightPx, background: tap.color, opacity: tap.opacity, boxShadow: `0 0 6px ${tap.color}` }}/>))}
          {taps.map((tap, i) => (<div key={`l${i}`} className="tap-bar-label" style={{ left: `${tap.leftPct}%` }}>{tap.label}</div>))}
        </div>

        <div className="canvas-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <span>
            LIVE DELAY ECHO SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
              · real dry input vs wet output over time — the tap chart above is illustrative, this is the actual audio
            </span>
          </span>
          {onTestEcho && (<button className="toggle-btn" style={{ fontSize: '0.6rem', padding: '0.25rem 0.6rem', whiteSpace: 'nowrap' }} onClick={onTestEcho} disabled={!isPlaying} title="Fire one isolated hit and mute the loop so the repeats ring out cleanly">
              ⚡ PING ECHO
            </button>)}
        </div>
        <div className="hdelay-scope-display">
          <canvas ref={scopeRef} width={760} height={150} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
        </div>
        <div className="legend-row" style={{ marginBottom: '1rem' }}>
          <div className="legend-item"><span className="legend-line" style={{ background: '#F5A623' }}/>DRY INPUT</div>
          <div className="legend-item"><span className="legend-line" style={{ background: '#2DD4BF' }}/>WET OUTPUT (ECHOES)</div>
        </div>

        <div className="canvas-label">SYNC DIVISION</div>
        <div className="delay-sync-row">
          {SYNC_DIVISIONS.map(div => (<div key={div} className={`sync-btn${sync === div ? ' active' : ''}`} onClick={() => applySync(div)}>
              {div}
            </div>))}
        </div>

        <div className="canvas-label">CHARACTER</div>
        <div className="comp-toggles" style={{ marginBottom: '1rem' }}>
          <button className={`toggle-btn${params.pingPong ? ' on' : ''}`} style={params.pingPong ? { background: 'var(--teal-dim)', borderColor: 'var(--teal)', color: 'var(--teal)' } : {}} onClick={() => setParams(p => ({ ...p, pingPong: !p.pingPong }))}>
            PING PONG
          </button>
        </div>

        <div className="hdelay-knob-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <Knob spec={KNOB_SPECS.delayTimeMs} value={params.delayTimeMs} disabled={sync !== 'FREE'} onChange={v => setParams(p => ({ ...p, delayTimeMs: v }))}/>
          <Knob spec={KNOB_SPECS.feedback} value={params.feedback} onChange={v => setParams(p => ({ ...p, feedback: v }))}/>
          <Knob spec={KNOB_SPECS.analog} value={params.analog} onChange={v => setParams(p => ({ ...p, analog: v }))}/>
        </div>
      </div>

      <div className="hdelay-right">
        <div className="subsection-label">MODULATION</div>
        <div className="hdelay-knob-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginBottom: '1.25rem' }}>
          <Knob spec={KNOB_SPECS.modDepth} value={params.modDepth} onChange={v => setParams(p => ({ ...p, modDepth: v }))}/>
          <Knob spec={KNOB_SPECS.modRate} value={params.modRate} onChange={v => setParams(p => ({ ...p, modRate: v }))}/>
        </div>

        <div className="subsection-label">FILTERS — SHAPING THE REPEATS</div>
        <div className="hdelay-knob-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.25rem' }}>
          <Knob spec={KNOB_SPECS.hipass} value={params.hipass} onChange={setHipass}/>
          <Knob spec={KNOB_SPECS.lopass} value={params.lopass} onChange={setLopass}/>
          <div className="knob-wrap" style={{ justifyContent: 'center' }}>
            <button className={`toggle-btn${link ? ' on' : ''}`} style={{ marginTop: '0.6rem', ...(link ? { background: 'var(--teal-dim)', borderColor: 'var(--teal)', color: 'var(--teal)' } : {}) }} onClick={() => setLink(l => !l)} title="When on, HIPASS and LOPASS sweep together, keeping the same ratio between them">
              LINK
            </button>
          </div>
        </div>

        <div className="subsection-label">OUTPUT</div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          <div className="hdelay-knob-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', flex: 1 }}>
            <Knob spec={KNOB_SPECS.dryWet} value={params.dryWet} onChange={v => setParams(p => ({ ...p, dryWet: v }))}/>
            <Knob spec={KNOB_SPECS.output} value={params.output} onChange={v => setParams(p => ({ ...p, output: v }))}/>
          </div>
          <div className="meter-block" style={{ width: 70 }}>
            <div className="meter-label">LEVEL</div>
            <div className="vu-meter">
              {vuFills.map((h, i) => (<div key={i} className={`vu-bar ${vuSegmentClass(i)}`} style={{ height: `${h}%` }}/>))}
            </div>
          </div>
        </div>

        {engineBadge}

        <div className="concept-callout" style={{ background: 'var(--teal-dim)', borderColor: 'rgba(45,212,191,0.2)', marginTop: '1rem' }}>
          <strong style={{ color: 'var(--teal)' }}>Concept check:</strong> Slow LFO modulation on the delay line adds
          subtle pitch drift to repeats — the classic "tape wobble" that keeps echoes from sounding sterile. Filtering
          repeats darker with each pass mimics natural high-frequency air absorption.
        </div>
      </div>
    </div>);
}
