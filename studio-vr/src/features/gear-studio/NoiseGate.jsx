import { useRef, useEffect } from 'react';
import { METER_FLOOR_DB } from '../../audio/effects/gateEngine';
import { drawLevelScope, transferFrame } from './shared/panelUtils';
import { KnobGrid, MiniSlider } from './shared/PanelControls';
import { levelBallistic } from '../../audio/effects/ballistics';
const KNOBS = [
    { key: 'gateOpen', label: 'GATE OPEN', min: -80, max: 0, step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
    { key: 'gateClose', label: 'GATE CLOSE', min: -80, max: 0, step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
    { key: 'attack', label: 'ATTACK', min: 0.1, max: 100, step: 0.1, fmt: v => `${v.toFixed(1)} ms` },
    { key: 'hold', label: 'HOLD', min: 0, max: 500, step: 1, fmt: v => `${Math.round(v)} ms` },
    { key: 'release', label: 'RELEASE', min: 1, max: 1000, step: 1, fmt: v => `${Math.round(v)} ms` },
    { key: 'floor', label: 'FLOOR', min: -96, max: 0, step: 1, fmt: v => `${Math.round(v)} dB` },
];
function applyGate(inputDb, p) {
    const { gateOpen, floor } = p;
    const gateClose = Math.min(p.gateClose, p.gateOpen);
    if (inputDb >= gateOpen)
        return inputDb;
    if (inputDb <= gateClose)
        return inputDb + floor;
    const span = Math.max(0.01, gateOpen - gateClose);
    const frac = Math.max(0, Math.min(1, (inputDb - gateClose) / span));
    return inputDb + floor * (1 - frac);
}
function drawTransfer(canvas, params) {
    const f = transferFrame(canvas, { inMin: -80, inMax: 0, xStep: 10 });
    if (!f)
        return;
    const { ctx, H, toX, toY } = f;
    const openX = toX(params.gateOpen);
    const closeX = toX(Math.min(params.gateClose, params.gateOpen));
    f.marker(openX, 'OPEN');
    f.marker(closeX, 'CLOSE', 12);
    ctx.fillStyle = 'rgba(0,255,135,0.05)';
    ctx.fillRect(Math.min(closeX, openX), 0, Math.abs(openX - closeX), H);
    f.curve(db => applyGate(db, params), 'rgb(0,255,135)', 'rgba(0,255,135,0.08)');
    f.hLine(toY(params.floor), 'rgba(255,77,106,0.4)', [2, 2]);
    f.axisLabels();
}
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB = -66;
const SCOPE_MAX_DB = 12;
function drawGateScope(canvas, history, nowT, gateOpenDb, gateCloseDb, showThresholds) {
    const style = { stroke: 'rgba(245,166,35,0.55)', labelColor: 'rgba(245,166,35,0.8)' };
    drawLevelScope(canvas, history, nowT, {
        minDb: SCOPE_MIN_DB, maxDb: SCOPE_MAX_DB,
        lines: showThresholds ? [
            { ...style, db: gateOpenDb, label: 'OPEN', dx: 32 },
            { ...style, db: Math.min(gateCloseDb, gateOpenDb), label: 'CLOSE', dx: 36, dy: 9 },
        ] : [],
        fill: '#FF4D6A', fillAlpha: 0.22, outColor: '#4D9EFF',
    });
}
export function GateEditorPanel({ params, setParams, sidechain, setSidechain, bypass, isPlaying, getLevels, getNow, onOpenChange, sidechainSourceRow = null, }) {
    const transferRef = useRef(null);
    const scopeRef = useRef(null);
    const scopeHistoryRef = useRef([]);
    const smoothedInputDbRef = useRef(METER_FLOOR_DB);
    const smoothedOutputDbRef = useRef(METER_FLOOR_DB);
    const meterClockRef = useRef(null);
    const isOpenRef = useRef(true);
    const holdUntilRef = useRef(0);
    const animRef = useRef(0);
    const paramsRef = useRef(params);
    const bypassRef = useRef(bypass);
    useEffect(() => { paramsRef.current = params; }, [params]);
    useEffect(() => { bypassRef.current = bypass; }, [bypass]);
    useEffect(() => {
        if (transferRef.current) {
            const displayParams = bypass ? { ...params, gateOpen: -96, gateClose: -96 } : params;
            drawTransfer(transferRef.current, displayParams);
        }
    }, [params, bypass]);
    useEffect(() => {
        if (!isPlaying) {
            cancelAnimationFrame(animRef.current);
            scopeHistoryRef.current = [];
            isOpenRef.current = true;
            onOpenChange?.(true);
            if (scopeRef.current) {
                const c = scopeRef.current.getContext('2d');
                c.fillStyle = '#0D0D0F';
                c.fillRect(0, 0, scopeRef.current.width, scopeRef.current.height);
            }
            return;
        }
        const tick = () => {
            const now = getNow?.() ?? performance.now() / 1000;
            const dt = meterClockRef.current !== null ? Math.max(0, Math.min(0.2, now - meterClockRef.current)) : 0;
            meterClockRef.current = now;
            const levels = getLevels?.();
            if (levels) {
                smoothedInputDbRef.current = levelBallistic(smoothedInputDbRef.current, levels.inputDb, dt);
                smoothedOutputDbRef.current = levelBallistic(smoothedOutputDbRef.current, levels.outputDb, dt);
                const detectDb = levels.detectDb ?? levels.inputDb;
                if (!bypassRef.current) {
                    const p = paramsRef.current;
                    if (detectDb >= p.gateOpen) {
                        isOpenRef.current = true;
                        holdUntilRef.current = now + p.hold / 1000;
                    }
                    else if (now >= holdUntilRef.current && detectDb <= Math.min(p.gateClose, p.gateOpen)) {
                        isOpenRef.current = false;
                    }
                    onOpenChange?.(isOpenRef.current);
                }
                else {
                    isOpenRef.current = true;
                    onOpenChange?.(true);
                }
                const history = scopeHistoryRef.current;
                history.push({ t: now, inputDb: smoothedInputDbRef.current, outputDb: smoothedOutputDbRef.current });
                const cutoff = now - SCOPE_WINDOW_S - 0.5;
                while (history.length > 0 && history[0].t < cutoff)
                    history.shift();
                if (scopeRef.current) {
                    const p = paramsRef.current;
                    drawGateScope(scopeRef.current, history, now, p.gateOpen, p.gateClose, !bypassRef.current);
                }
            }
            animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, getLevels, getNow]);
    return (<div className="comp-body">
      <div className="comp-controls">
        <div className="canvas-label" style={{ marginBottom: '1rem' }}>
          GATE PARAMETERS · DRAG KNOBS VERTICALLY
        </div>
        <KnobGrid knobs={KNOBS} values={params} color="var(--green)" onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}/>

        <div className="canvas-label" style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          SIDECHAIN
        </div>
        {sidechainSourceRow}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
          <button className={`toggle-btn${sidechain.external ? ' on' : ''}`} onClick={() => setSidechain(s => ({ ...s, external: !s.external }))} title="Detect off the sidechain input instead of the gate's own linked L/R audio">
            EXTERNAL SC
          </button>
          <button className={`toggle-btn${sidechain.listen ? ' on' : ''}`} onClick={() => setSidechain(s => ({ ...s, listen: !s.listen }))} title="Audition the detector signal itself, in place of the gated output">
            SC LISTEN
          </button>
        </div>
        <MiniSlider label="SC HPF" value={sidechain.hpf} min={20} max={2000} step={1} fmt={v => `${v.toFixed(0)} Hz`} onChange={v => setSidechain(s => ({ ...s, hpf: v }))} accent="var(--green)"/>

        <div style={{ marginTop: '1rem' }}>
          <div className="concept-callout" style={{ background: 'var(--green-dim)', borderColor: 'rgba(0,255,135,0.2)' }}>
            <strong style={{ color: 'var(--green)' }}>Concept: </strong>
            Gate Close sits {(params.gateOpen - params.gateClose).toFixed(1)} dB below Gate Open — that gap is the
            hysteresis band, and it's what stops the gate from chattering open/closed right at the threshold.
            {' '}Toggle <strong style={{ color: 'var(--green)' }}>BYPASS</strong> while playing to A/B.
          </div>
        </div>
      </div>

      <div className="comp-visual">
        <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>
          TRANSFER FUNCTION — INPUT vs OUTPUT
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
            · shaped by GATE OPEN / GATE CLOSE / FLOOR only — attack, hold &amp; release are time-domain, see scope below
          </span>
        </div>
        <div className="transfer-graph">
          <canvas ref={transferRef} width={400} height={200} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
        </div>

        <div className="canvas-label" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
          LIVE GATE SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
            · real input/output level over time — watch ATTACK snap the gate open &amp; HOLD/RELEASE let it close
          </span>
        </div>
        <div className="scope-graph">
          <canvas ref={scopeRef} width={400} height={150} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
        </div>
        <div className="legend-row" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
          <div className="legend-item"><span className="legend-line" style={{ background: '#00FF87' }}/>INPUT</div>
          <div className="legend-item"><span className="legend-line" style={{ background: '#4D9EFF' }}/>OUTPUT</div>
          <div className="legend-item"><span className="legend-line" style={{ background: '#FF4D6A' }}/>GATE REDUCTION</div>
        </div>
      </div>
    </div>);
}
