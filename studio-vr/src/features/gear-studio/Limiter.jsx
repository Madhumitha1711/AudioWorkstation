import { useRef, useEffect } from 'react';
import { KNOBS, applyLimiter, METER_FLOOR_DB, levelBallistic, grReadoutSmooth } from '../../audio/effects/limiterEngine';
import { drawLevelScope, transferFrame } from './shared/panelUtils';
import { KnobGrid } from './shared/PanelControls';
function drawTransfer(canvas, params) {
    const f = transferFrame(canvas, { inMin: -30, inMax: 6, xStep: 6 });
    if (!f)
        return;
    const { ctx, W, toX, toY } = f;
    f.hLine(toY(0), 'rgba(255,77,106,0.25)', [2, 2]);
    f.vLine(toX(0), 'rgba(255,77,106,0.25)', [2, 2]);
    f.marker(toX(params.threshold), 'THRESH');
    const cy = toY(params.ceiling);
    f.hLine(cy, 'rgba(245,166,35,0.55)', [2, 2]);
    ctx.fillStyle = '#F5A623';
    ctx.fillText('CEILING', W - 56, cy - 4);
    f.curve(db => applyLimiter(db, params), '#F5A623', 'rgba(245,166,35,0.08)');
    f.axisLabels();
}
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB = -66;
const SCOPE_MAX_DB = 12;
function drawLimiterScope(canvas, history, nowT, thresholdDb, ceilingDb, showThresholds) {
    drawLevelScope(canvas, history, nowT, {
        minDb: SCOPE_MIN_DB, maxDb: SCOPE_MAX_DB, zeroLine: { stroke: 'rgba(255,77,106,0.25)', dash: [2, 2] },
        lines: showThresholds ? [
            { db: thresholdDb, stroke: 'rgba(138,138,154,0.55)', labelColor: 'rgba(138,138,154,0.85)', label: 'THRESH', dx: 42 },
            { db: ceilingDb, stroke: 'rgba(245,166,35,0.55)', dash: [2, 2], labelColor: 'rgba(245,166,35,0.85)', label: 'CEILING', dx: 46, dy: 9 },
        ] : [],
        fill: '#F5A623', outColor: '#4D9EFF',
    });
}
export function LimiterEditorPanel({ params, setParams, bypass, isPlaying, getLevels, getNow, onGainReductionChange, }) {
    const transferRef = useRef(null);
    const scopeRef = useRef(null);
    const scopeHistoryRef = useRef([]);
    const smoothedInputDbRef = useRef(METER_FLOOR_DB);
    const smoothedOutputDbRef = useRef(METER_FLOOR_DB);
    const smoothedGrDbRef = useRef(0);
    const meterClockRef = useRef(null);
    const bypassRef = useRef(bypass);
    const paramsRef = useRef(params);
    useEffect(() => { bypassRef.current = bypass; }, [bypass]);
    useEffect(() => { paramsRef.current = params; }, [params]);
    useEffect(() => {
        if (transferRef.current) {
            const displayParams = bypass ? { ...params, threshold: 6, ceiling: 6 } : params;
            drawTransfer(transferRef.current, displayParams);
        }
    }, [params, bypass]);
    useEffect(() => {
        if (!isPlaying) {
            scopeHistoryRef.current = [];
            smoothedInputDbRef.current = METER_FLOOR_DB;
            smoothedOutputDbRef.current = METER_FLOOR_DB;
            smoothedGrDbRef.current = 0;
            meterClockRef.current = null;
            onGainReductionChange?.(0);
            if (scopeRef.current) {
                const c = scopeRef.current.getContext('2d');
                c.fillStyle = '#0D0D0F';
                c.fillRect(0, 0, scopeRef.current.width, scopeRef.current.height);
            }
            return;
        }
        let raf = 0;
        const animate = () => {
            const now = getNow?.() ?? performance.now() / 1000;
            const dt = meterClockRef.current !== null ? Math.max(0, Math.min(0.2, now - meterClockRef.current)) : 0;
            meterClockRef.current = now;
            const levels = getLevels?.();
            if (levels) {
                smoothedInputDbRef.current = levelBallistic(smoothedInputDbRef.current, levels.inputDb, dt);
                smoothedOutputDbRef.current = levelBallistic(smoothedOutputDbRef.current, levels.outputDb, dt);
                if (!bypassRef.current) {
                    smoothedGrDbRef.current = grReadoutSmooth(smoothedGrDbRef.current, levels.gainReductionDb ?? 0, dt);
                }
                else {
                    smoothedGrDbRef.current = 0;
                }
                onGainReductionChange?.(smoothedGrDbRef.current);
                const history = scopeHistoryRef.current;
                history.push({ t: now, inputDb: smoothedInputDbRef.current, outputDb: smoothedOutputDbRef.current });
                const cutoff = now - SCOPE_WINDOW_S - 0.5;
                while (history.length > 0 && history[0].t < cutoff)
                    history.shift();
                if (scopeRef.current) {
                    const p = paramsRef.current;
                    drawLimiterScope(scopeRef.current, history, now, p.threshold, p.ceiling, !bypassRef.current);
                }
            }
            raf = requestAnimationFrame(animate);
        };
        raf = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, getLevels, getNow]);
    return (<div className="comp-body">
      <div className="comp-controls">
        <div className="canvas-label" style={{ marginBottom: '1rem' }}>
          LIMITER PARAMETERS · DRAG KNOBS VERTICALLY
        </div>

        <KnobGrid knobs={KNOBS} values={params} color="var(--amber)" onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}/>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button className={`toggle-btn${params.linkLR ? ' on' : ''}`} style={params.linkLR ? { borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-dim)' } : {}} onClick={() => setParams(p => ({ ...p, linkLR: !p.linkLR }))} title="Tie stereo gain reduction together so a loud transient in one channel doesn't shift the image">
            {params.linkLR ? '⛓ LINK L/R: ON' : 'LINK L/R: OFF'}
          </button>
          <button className={`toggle-btn${params.autoRelease ? ' on' : ''}`} style={params.autoRelease ? { borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-dim)' } : {}} onClick={() => setParams(p => ({ ...p, autoRelease: !p.autoRelease }))} title="Let the limiter pick its own program-dependent release instead of the fixed Release knob">
            {params.autoRelease ? '⚙ AUTO RELEASE: ON' : 'AUTO RELEASE: OFF'}
          </button>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <div className="concept-callout" style={{ background: 'var(--amber-dim)', borderColor: 'rgba(245,166,35,0.2)' }}>
            <strong style={{ color: 'var(--amber)' }}>Concept: </strong>
            Threshold decides where limiting <em>starts</em>; Ceiling decides the hardest limit the output can ever
            <em> reach</em> — no sample leaves this patch louder than {params.ceiling.toFixed(1)} dB, no matter how
            hot the input gets. Toggle <strong style={{ color: 'var(--amber)' }}>BYPASS</strong> while playing to
            hear the accent hit poke past 0 dBFS.
          </div>
        </div>
      </div>

      <div className="comp-visual">
        <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>
          TRANSFER FUNCTION — INPUT vs OUTPUT
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
            · shaped by THRESHOLD / CEILING only — release &amp; auto release are time-domain, see scope below
          </span>
        </div>
        <div className="transfer-graph">
          <canvas ref={transferRef} width={400} height={200} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
        </div>

        <div className="canvas-label" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
          LIVE LIMITER SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
            · real input/output level over time — watch the output snap flat at CEILING &amp; RELEASE let go after
          </span>
        </div>
        <div className="scope-graph">
          <canvas ref={scopeRef} width={400} height={150} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
        </div>
        <div className="legend-row" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
          <div className="legend-item"><span className="legend-line" style={{ background: '#00FF87' }}/>INPUT</div>
          <div className="legend-item"><span className="legend-line" style={{ background: '#4D9EFF' }}/>OUTPUT</div>
          <div className="legend-item"><span className="legend-line" style={{ background: '#F5A623' }}/>GAIN REDUCTION</div>
        </div>
      </div>
    </div>);
}
