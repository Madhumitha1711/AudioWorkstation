import { useRef, useEffect, useCallback } from 'react';
import { BAND_IDS, BAND_LABELS, KNOBS, applyCompression, METER_FLOOR_DB, levelBallistic, grReadoutSmooth, GR_METER_MAX_DB } from '../../audio/effects/compressorEngine';
import { drawLevelScope, transferFrame } from './shared/panelUtils';
import { KnobGrid, MiniSlider } from './shared/PanelControls';
function drawTransfer(canvas, params) {
    const f = transferFrame(canvas, { inMin: -60, inMax: 0, outMax: 24, xStep: 10, yStep: 12, yFrom: -60, signedY: true });
    if (!f)
        return;
    const { ctx, H, toX, toY } = f;
    f.marker(toX(params.threshold), 'THRESH');
    const shaped = (db) => applyCompression(db, params) + params.makeup;
    f.curve(shaped, 'rgb(167,139,250)', 'rgba(167,139,250,0.08)');
    const exampleInput = Math.min(-1, params.threshold + 12);
    const px = toX(exampleInput);
    const py = toY(shaped(exampleInput));
    ctx.strokeStyle = 'rgba(167,139,250,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, H);
    ctx.moveTo(0, py);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(167,139,250,0.9)';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    f.axisLabels();
}
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB = -54;
const SCOPE_MAX_DB = 12;
function drawCompressorScope(canvas, history, nowT, thresholdDb, showThreshold) {
    drawLevelScope(canvas, history, nowT, {
        minDb: SCOPE_MIN_DB, maxDb: SCOPE_MAX_DB, gridFrom: -48,
        lines: showThreshold ? [{ db: thresholdDb, stroke: 'rgba(245,166,35,0.55)', labelColor: 'rgba(245,166,35,0.8)', label: 'THRESH', dx: 42 }] : [],
        fill: '#FF4D6A', fillAlpha: 0.22, fillBottom: p => p.inputDb - p.grDb, outColor: '#A78BFA',
    });
}
export function CompressorEditorPanel({
    bands, setBands,
    crossover, setCrossover,
    sidechain, setSidechain,
    outputGainDb, setOutputGainDb,
    selectedBand, setSelectedBand,
    multibandEnabled, setMultibandEnabled,
    bypass,
    isPlaying,
    getLevels,
    getNow,
    sidechainSourceRow = null,
}) {
    const transferRef = useRef(null);
    const scopeRef = useRef(null);
    const scopeHistoryRef = useRef([]);
    const smoothedInputDbRef = useRef(METER_FLOOR_DB);
    const smoothedOutputDbRef = useRef(METER_FLOOR_DB);
    const meterClockRef = useRef(null);
    const smoothedGrRef = useRef({ low: 0, lowMid: 0, highMid: 0, high: 0 });
    const grFillRef = useRef(null);
    const grValueRef = useRef(null);
    const bandGrFillRefs = useRef({});
    const bandsRef = useRef(bands);
    const selectedBandRef = useRef(selectedBand);
    const bypassRef = useRef(bypass);
    useEffect(() => { bandsRef.current = bands; }, [bands]);
    useEffect(() => { selectedBandRef.current = selectedBand; }, [selectedBand]);
    useEffect(() => { bypassRef.current = bypass; }, [bypass]);
    useEffect(() => {
        if (transferRef.current) {
            const band = bands[selectedBand];
            const displayParams = (bypass || band.bypass) ? { ...band, threshold: 0, ratio: 1, makeup: 0 } : band;
            drawTransfer(transferRef.current, displayParams);
        }
    }, [bands, selectedBand, bypass]);
    useEffect(() => {
        if (!isPlaying) {
            scopeHistoryRef.current = [];
            smoothedInputDbRef.current = METER_FLOOR_DB;
            smoothedOutputDbRef.current = METER_FLOOR_DB;
            meterClockRef.current = null;
            smoothedGrRef.current = { low: 0, lowMid: 0, highMid: 0, high: 0 };
            if (grFillRef.current)
                grFillRef.current.style.height = '0%';
            if (grValueRef.current)
                grValueRef.current.textContent = '0.0';
            for (const b of BAND_IDS) {
                const el = bandGrFillRefs.current[b];
                if (el)
                    el.style.width = '0%';
            }
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
                for (const b of BAND_IDS) {
                    const target = bypassRef.current ? 0 : (levels.bandGr?.[b] ?? 0);
                    smoothedGrRef.current[b] = grReadoutSmooth(smoothedGrRef.current[b], target, dt);
                    const fillEl = bandGrFillRefs.current[b];
                    if (fillEl)
                        fillEl.style.width = `${Math.min(100, (smoothedGrRef.current[b] / GR_METER_MAX_DB) * 100)}%`;
                }
                const selectedGrDb = smoothedGrRef.current[selectedBandRef.current];
                if (grFillRef.current)
                    grFillRef.current.style.height = `${Math.min(100, (selectedGrDb / GR_METER_MAX_DB) * 100)}%`;
                if (grValueRef.current)
                    grValueRef.current.textContent = selectedGrDb > 0.05 ? `-${selectedGrDb.toFixed(1)}` : '0.0';
                const history = scopeHistoryRef.current;
                history.push({
                    t: now,
                    inputDb: smoothedInputDbRef.current,
                    outputDb: smoothedOutputDbRef.current,
                    grDb: selectedGrDb,
                });
                const cutoff = now - SCOPE_WINDOW_S - 0.5;
                while (history.length > 0 && history[0].t < cutoff)
                    history.shift();
                if (scopeRef.current) {
                    const selBand = bandsRef.current[selectedBandRef.current];
                    drawCompressorScope(scopeRef.current, history, now, selBand.threshold, !bypassRef.current && !selBand.bypass);
                }
            }
            raf = requestAnimationFrame(animate);
        };
        raf = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, getLevels, getNow]);
    const setSelectedBandParam = useCallback((key, v) => {
        setBands(prev => ({ ...prev, [selectedBand]: { ...prev[selectedBand], [key]: v } }));
    }, [selectedBand, setBands]);
    const toggleBandBypass = useCallback((band) => {
        setBands(prev => ({ ...prev, [band]: { ...prev[band], bypass: !prev[band].bypass } }));
    }, [setBands]);
    const selBand = bands[selectedBand];
    const bandLabel = (b) => (!multibandEnabled && b === 'low') ? 'COMPRESSOR' : BAND_LABELS[b];
    const renderModeSwitch = () => (<div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
      <button onClick={() => setMultibandEnabled(false)} title="One compressor acting on the whole signal" style={{
            flex: 1,
            padding: '0.35rem 0.5rem',
            background: !multibandEnabled ? 'rgba(0,255,135,0.13)' : 'var(--surface)',
            border: `1px solid ${!multibandEnabled ? 'rgba(0,255,135,0.5)' : 'var(--border)'}`,
            borderRadius: '3px',
            color: !multibandEnabled ? 'var(--green)' : 'var(--text-dim)',
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.04em',
            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}>
        SINGLE BAND
      </button>
      <button onClick={() => setMultibandEnabled(true)} title="Split the signal into 4 independent bands (Low / Low-Mid / High-Mid / High), each with its own compressor" style={{
            flex: 1,
            padding: '0.35rem 0.5rem',
            background: multibandEnabled ? 'rgba(0,255,135,0.13)' : 'var(--surface)',
            border: `1px solid ${multibandEnabled ? 'rgba(0,255,135,0.5)' : 'var(--border)'}`,
            borderRadius: '3px',
            color: multibandEnabled ? 'var(--green)' : 'var(--text-dim)',
            fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.04em',
            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}>
        MULTIBAND
      </button>
    </div>);
    const renderBandTabs = () => (<div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
      {(multibandEnabled ? BAND_IDS : ['low']).map(b => {
            const active = b === selectedBand;
            const byp = bands[b].bypass;
            const borderColor = active ? 'rgba(167,139,250,0.5)' : 'var(--border)';
            return (<div key={b} style={{
                    display: 'flex', alignItems: 'stretch', borderRadius: '3px', overflow: 'hidden',
                    border: `1px solid ${borderColor}`, opacity: byp ? 0.7 : 1, transition: 'opacity 0.15s',
                }}>
            <button onClick={() => setSelectedBand(b)} title={`Edit the ${bandLabel(b)} band`} style={{
                    padding: '0.3rem 0.6rem', border: 'none',
                    background: active ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
                    color: active ? 'var(--purple)' : 'var(--text-dim)',
                    fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                    textDecoration: byp ? 'line-through' : 'none',
                }}>
              {bandLabel(b)}
            </button>
            <button onClick={() => toggleBandBypass(b)} title={byp ? `${bandLabel(b)} is bypassed — click to re-enable` : `Bypass the ${bandLabel(b)} band (its audio still passes through, unprocessed)`} style={{
                    padding: '0.3rem 0.45rem', border: 'none', borderLeft: `1px solid ${borderColor}`,
                    background: byp ? 'rgba(255,77,106,0.16)' : 'var(--surface)',
                    color: byp ? '#FF4D6A' : 'var(--text-faint)',
                    fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                    cursor: 'pointer', transition: 'all 0.15s',
                }}>
              ⦸
            </button>
          </div>);
        })}
    </div>);
    return (<div className="comp-body">
      <div className="comp-controls">
        <div className="canvas-label" style={{ marginBottom: '0.5rem' }}>
          MODE
        </div>
        {renderModeSwitch()}

        <div className="canvas-label" style={{ marginBottom: '0.5rem' }}>
          BAND · DRAG KNOBS VERTICALLY
        </div>
        {renderBandTabs()}

        <KnobGrid knobs={KNOBS} values={selBand} color="var(--purple)" onChange={setSelectedBandParam}/>

        <div className="canvas-label" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
          CROSSOVER
        </div>
        {multibandEnabled ? (<>
            <MiniSlider label="Low – Low-Mid" value={crossover.loLowMid} min={20} max={1000} step={1} fmt={v => `${v.toFixed(0)} Hz`} onChange={v => setCrossover(c => ({ ...c, loLowMid: v }))} accent="var(--purple)"/>
            <MiniSlider label="Low-Mid – High-Mid" value={crossover.lowMidHiMid} min={200} max={5000} step={1} fmt={v => `${v.toFixed(0)} Hz`} onChange={v => setCrossover(c => ({ ...c, lowMidHiMid: v }))} accent="var(--purple)"/>
            <MiniSlider label="High-Mid – High" value={crossover.hiMidHigh} min={500} max={20000} step={1} fmt={v => `${v.toFixed(0)} Hz`} onChange={v => setCrossover(c => ({ ...c, hiMidHigh: v }))} accent="var(--purple)"/>
          </>) : (<div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--text-faint)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
            One compressor, whole signal. Turn on <strong style={{ color: 'var(--green)' }}>MULTIBAND</strong> above to split into 4 bands with independent crossover points.
          </div>)}

        <div className="canvas-label" style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          SIDECHAIN
        </div>
        {sidechainSourceRow}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
          <button className={`toggle-btn${sidechain.external ? ' on' : ''}`} onClick={() => setSidechain(s => ({ ...s, external: !s.external }))} title="Detect off the sidechain input (filtered) instead of each band's own raw audio">
            EXTERNAL SC
          </button>
          <button className={`toggle-btn${sidechain.listen ? ' on' : ''}`} onClick={() => setSidechain(s => ({ ...s, listen: !s.listen }))} title="Audition the detector signal itself, in place of the compressed output">
            SC LISTEN
          </button>
        </div>
        <MiniSlider label="SC HPF" value={sidechain.hpf} min={20} max={2000} step={1} fmt={v => `${v.toFixed(0)} Hz`} onChange={v => setSidechain(s => ({ ...s, hpf: v }))} accent="var(--purple)"/>

        <div className="canvas-label" style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          OUTPUT
        </div>
        <MiniSlider label="Gain" value={outputGainDb} min={-24} max={24} step={0.1} fmt={v => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} onChange={setOutputGainDb} accent="var(--purple)"/>

        <div style={{ marginTop: '1rem' }}>
          <div className="concept-callout" style={{ background: 'var(--purple-dim)', borderColor: 'rgba(167,139,250,0.2)' }}>
            <strong style={{ color: 'var(--purple)' }}>Concept: </strong>
            {bandLabel(selectedBand)}{multibandEnabled ? ' band' : ''} at {selBand.ratio.toFixed(0)}:1 —{' '}
            {selBand.ratio > 10 ? 'Limiting territory. Very aggressive.' : selBand.ratio > 6 ? 'Heavy compression. Peak control.' : selBand.ratio > 3 ? 'Classic glue. Musical.' : 'Gentle, transparent.'}
            {' '}
            {multibandEnabled
            ? 'Each band compresses independently — try a fast, tight ratio on one band while leaving another gentle.'
            : 'Acting on the whole signal right now — turn on MULTIBAND above to split it into 4 independently-compressed bands.'}
            {' '}Toggle <strong style={{ color: 'var(--purple)' }}>BYPASS</strong> while playing to A/B.
          </div>
        </div>
      </div>

      <div className="comp-visual">
        <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>
          TRANSFER FUNCTION — {bandLabel(selectedBand)}{multibandEnabled ? ' BAND' : ''}
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
            · shape set by THRESHOLD / RATIO / KNEE, <span style={{ color: 'var(--amber)' }}>MAKEUP GAIN</span> shifts it up (amber) — attack &amp; release are time-domain, see scope below
          </span>
        </div>
        <div className="transfer-row">
          <div className="transfer-graph" style={{ flex: 1 }}>
            <canvas ref={transferRef} width={400} height={200} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
          </div>
          <div className="gr-meter-col">
            <span className="gr-meter-lbl">0dB</span>
            <div className="gr-meter-track-v">
              <div ref={grFillRef} className="gr-meter-fill-v" style={{ height: '0%' }}/>
            </div>
            <span className="gr-meter-val" ref={grValueRef}>0.0</span>
            <span className="gr-meter-unit">GR</span>
          </div>
        </div>

        <div className="canvas-label" style={{ marginTop: '0.75rem', marginBottom: '0.4rem' }}>
          {multibandEnabled ? 'ALL BANDS — GAIN REDUCTION' : 'GAIN REDUCTION'}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
          {(multibandEnabled ? BAND_IDS : ['low']).map(b => (<div key={b} onClick={() => setSelectedBand(b)} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', cursor: 'pointer' }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: '0.5rem', textAlign: 'center', letterSpacing: '0.04em',
                color: b === selectedBand ? 'var(--purple)' : 'var(--text-faint)',
            }}>
                {bandLabel(b)}
              </div>
              <div style={{ height: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div ref={el => { bandGrFillRefs.current[b] = el; }} style={{ height: '100%', width: '0%', background: 'linear-gradient(90deg, #00FF87 0%, #F5A623 65%, #FF4D6A 100%)', transition: 'width 0.1s ease' }}/>
              </div>
            </div>))}
        </div>

        <div className="canvas-label" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
          LIVE COMPRESSION SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
          <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
            · real broadband input/output level over time — red shows the {bandLabel(selectedBand)}{multibandEnabled ? ' band' : ''}'s real gain reduction
          </span>
        </div>
        <div className="scope-graph">
          <canvas ref={scopeRef} width={400} height={150} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
        </div>
        <div className="legend-row" style={{ marginTop: '0.5rem', marginBottom: 0, flexWrap: 'wrap' }}>
          <div className="legend-item"><span className="legend-line" style={{ background: '#00FF87' }}/>INPUT</div>
          <div className="legend-item"><span className="legend-line" style={{ background: '#A78BFA' }}/>OUTPUT</div>
          <div className="legend-item"><span className="legend-line" style={{ background: '#FF4D6A' }}/>{bandLabel(selectedBand)} GAIN REDUCTION</div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--text-faint)', marginTop: '0.35rem', lineHeight: 1.5 }}>
          Red is the real Gain_Reduction the Faust patch reports for this band — it shrinks toward nothing as Threshold rises or Bypass is on.
        </div>
      </div>
    </div>);
}
