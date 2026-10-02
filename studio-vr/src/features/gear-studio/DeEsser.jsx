import { useRef, useEffect } from 'react';
import { METER_FLOOR_DB } from '../../audio/effects/deEsserEngine';
import { canvasFont } from "../../theme/fonts";
import { hiDpi, drawLevelScope } from './shared/panelUtils';
import { KnobGrid } from './shared/PanelControls';
import { clamp, butterHighpassDB, butterLowpassDB } from '../../audio/effects/equalizerEngine';
import { levelBallistic as ballistic, grReadoutSmooth as smoothGr } from '../../audio/effects/ballistics';
const levelBallistic = (p, t, dt) => ballistic(p, t, dt, 0.01, 0.15);
const grReadoutSmooth = (p, t, dt) => smoothGr(p, t, dt, 0.05);
const KNOBS = [
    { key: 'freq', label: 'FREQ', min: 1000, max: 20000, step: 1, fmt: v => v >= 1000 ? `${(v / 1000).toFixed(2)}k` : `${Math.round(v)} Hz` },
    { key: 'thresh', label: 'THRESH', min: -60, max: 0, step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
    { key: 'range', label: 'RANGE', min: -30, max: 0, step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
];
const TYPE_OPTIONS = [
    { value: 0, label: 'High-Pass/Shelf' },
    { value: 1, label: 'Band-Pass' },
];
const FMIN = 500, FMAX = 20000;
const fToFrac = (f) => Math.log10(f / FMIN) / Math.log10(FMAX / FMIN);
const fracToF = (t) => FMIN * Math.pow(FMAX / FMIN, t);
const ATTEN_MIN = -36, ATTEN_MAX = 0;
function drawDeesserCurve(canvas, params, liveAttenDb, active) {
    const hd = hiDpi(canvas);
    if (!hd)
        return;
    const { ctx, W, H } = hd;
    const toX = (f) => fToFrac(f) * W;
    const toY = (db) => ((ATTEN_MAX - clamp(db, ATTEN_MIN, ATTEN_MAX)) / (ATTEN_MAX - ATTEN_MIN)) * H;
    ctx.fillStyle = '#0D0D0F';
    ctx.fillRect(0, 0, W, H);
    const freqLines = [[1000, '1K'], [2000, '2K'], [4000, '4K'], [8000, '8K'], [16000, '16K']];
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (const [f] of freqLines) {
        const x = toX(f);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
    }
    for (const db of [0, -12, -24, -36]) {
        const y = toY(db);
        ctx.strokeStyle = db === 0 ? '#2E2E3D' : 'rgba(255,255,255,0.05)';
        ctx.lineWidth = db === 0 ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }
    ctx.fillStyle = '#6A6A7A';
    ctx.font = canvasFont(9, { mono: true });
    for (const [f, l] of freqLines)
        ctx.fillText(l, toX(f) - 8, H - 3);
    for (const db of [0, -12, -24, -36])
        ctx.fillText(`${Math.abs(db)}`, 3, toY(db) - 2);
    const order = params.type === 1 ? 3 : 1;
    const N = 160;
    const greenPts = [];
    const redPts = [];
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const f = fracToF(t);
        greenPts.push({ x: t * W, y: toY(butterHighpassDB(f, params.freq, order)) });
        redPts.push({ x: t * W, y: toY(butterLowpassDB(f, params.freq, order)) });
    }
    const y0 = toY(0);
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#00FF87';
    ctx.beginPath();
    ctx.moveTo(greenPts[0].x, y0);
    for (const p of greenPts)
        ctx.lineTo(p.x, p.y);
    ctx.lineTo(greenPts[greenPts.length - 1].x, y0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#FF4D6A';
    ctx.beginPath();
    ctx.moveTo(redPts[0].x, y0);
    for (const p of redPts)
        ctx.lineTo(p.x, p.y);
    ctx.lineTo(redPts[redPts.length - 1].x, y0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#FF4D6A';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(redPts[0].x, redPts[0].y);
    for (const p of redPts.slice(1))
        ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.strokeStyle = '#00FF87';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(greenPts[0].x, greenPts[0].y);
    for (const p of greenPts.slice(1))
        ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.strokeStyle = '#3D3D52';
    ctx.setLineDash([2, 3]);
    const fx = toX(params.freq);
    ctx.beginPath();
    ctx.moveTo(fx, 0);
    ctx.lineTo(fx, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#8A8A9A';
    ctx.font = canvasFont(10, { mono: true });
    ctx.fillText('FREQ', fx + 3, H - 15);
    const ay = toY(liveAttenDb);
    ctx.strokeStyle = 'rgba(245,166,35,0.75)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(0, ay);
    ctx.lineTo(W, ay);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = active ? '#F5A623' : 'rgba(245,166,35,0.4)';
    ctx.font = canvasFont(10, { mono: true });
    ctx.fillText(`Attenuation: ${liveAttenDb.toFixed(1)} dB`, 6, Math.max(11, ay - 4));
}
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB = -60;
const SCOPE_MAX_DB = 6;
function drawDeesserScope(canvas, history, nowT, thresholdDb, showThreshold) {
    drawLevelScope(canvas, history, nowT, {
        minDb: SCOPE_MIN_DB, maxDb: SCOPE_MAX_DB, zeroLine: null,
        lines: showThreshold ? [{ db: thresholdDb, stroke: 'rgba(138,138,154,0.55)', labelColor: 'rgba(138,138,154,0.85)', label: 'THRESH', dx: 42 }] : [],
        fill: '#F5A623', outColor: '#4D9EFF',
    });
}
export function DeEsserEditorPanel({ params, setParams, bypass, isPlaying, getInputDb, getGainReductionDb, getNow, onAttenuationChange, }) {
    const curveRef = useRef(null);
    const scopeRef = useRef(null);
    const scopeHistoryRef = useRef([]);
    const smoothedInputDbRef = useRef(METER_FLOOR_DB);
    const smoothedAttenDbRef = useRef(0);
    const meterClockRef = useRef(null);
    const animRef = useRef(0);
    const paramsRef = useRef(params);
    const bypassRef = useRef(bypass);
    useEffect(() => { paramsRef.current = params; }, [params]);
    useEffect(() => { bypassRef.current = bypass; }, [bypass]);
    useEffect(() => {
        if (!isPlaying && curveRef.current) {
            drawDeesserCurve(curveRef.current, params, 0, false);
        }
    }, [params, isPlaying]);
    useEffect(() => {
        if (!isPlaying) {
            cancelAnimationFrame(animRef.current);
            scopeHistoryRef.current = [];
            smoothedAttenDbRef.current = 0;
            onAttenuationChange?.(0);
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
            const inputDb = getInputDb?.();
            if (inputDb !== null && inputDb !== undefined) {
                smoothedInputDbRef.current = levelBallistic(smoothedInputDbRef.current, inputDb, dt);
            }
            if (!bypassRef.current) {
                smoothedAttenDbRef.current = grReadoutSmooth(smoothedAttenDbRef.current, getGainReductionDb?.() ?? 0, dt);
            }
            else {
                smoothedAttenDbRef.current = 0;
            }
            onAttenuationChange?.(smoothedAttenDbRef.current);
            const outputDb = smoothedInputDbRef.current + smoothedAttenDbRef.current;
            const history = scopeHistoryRef.current;
            history.push({ t: now, inputDb: smoothedInputDbRef.current, outputDb });
            const cutoff = now - SCOPE_WINDOW_S - 0.5;
            while (history.length > 0 && history[0].t < cutoff)
                history.shift();
            if (scopeRef.current) {
                drawDeesserScope(scopeRef.current, history, now, paramsRef.current.thresh, !bypassRef.current);
            }
            if (curveRef.current) {
                drawDeesserCurve(curveRef.current, paramsRef.current, smoothedAttenDbRef.current, !bypassRef.current);
            }
            animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, getInputDb, getGainReductionDb, getNow]);
    return (<div className="comp-body">
      <div className="comp-controls">
        <div className="canvas-label" style={{ marginBottom: '1rem' }}>
          DE-ESSER PARAMETERS · DRAG KNOBS VERTICALLY
        </div>

        <KnobGrid knobs={KNOBS} values={params} color="var(--blue)" onChange={(k, v) => setParams(p => ({ ...p, [k]: v }))}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.5rem' }}>
          <label htmlFor="deesser-type" style={{
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
            Type
          </label>
          <select id="deesser-type" value={params.type} onChange={e => setParams(p => ({ ...p, type: Number(e.target.value) }))} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '3px',
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            padding: '0.3rem 0.5rem',
            outline: 'none',
            cursor: 'pointer',
        }}>
            {TYPE_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
          </select>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <div className="concept-callout" style={{ background: 'var(--blue-dim)', borderColor: 'rgba(77,158,255,0.2)' }}>
            <strong style={{ color: 'var(--blue)' }}>Concept: </strong>
            Freq sets where the signal splits into a low band and a sibilant high band; Thresh decides
            when the high band starts getting compressed; Range caps the hardest cut it can ever take.
            Type decides how sharply the split happens — <strong style={{ color: 'var(--blue)' }}>High-Pass/Shelf</strong> is
            gentle, <strong style={{ color: 'var(--blue)' }}>Band-Pass</strong> carves a steeper, more surgical band out
            around Freq.
          </div>
        </div>
      </div>

      <div className="comp-visual">
        <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>
          SPLIT-BAND RESPONSE — FREQUENCY vs ATTENUATION
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
            · green = sibilant band, red = low band, shaped by FREQ &amp; TYPE — live scope below shows THRESH/RANGE in motion
          </span>
        </div>
        <div className="transfer-graph">
          <canvas ref={curveRef} width={400} height={200} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
        </div>

        <div className="canvas-label" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
          LIVE DE-ESSER SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
            · real input/output level over time — watch the output dip on every "s" burst
          </span>
        </div>
        <div className="scope-graph">
          <canvas ref={scopeRef} width={400} height={150} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
        </div>
        <div className="legend-row" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
          <div className="legend-item"><span className="legend-line" style={{ background: '#00FF87' }}/>INPUT</div>
          <div className="legend-item"><span className="legend-line" style={{ background: '#4D9EFF' }}/>OUTPUT</div>
          <div className="legend-item"><span className="legend-line" style={{ background: '#F5A623' }}/>ATTENUATION</div>
        </div>
      </div>
    </div>);
}
