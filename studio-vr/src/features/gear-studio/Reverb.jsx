import { useRef, useEffect, useCallback } from 'react';
import { Knob } from '../../components/controls/Knob';
import { ROOM_PRESETS, PRESET_FREEVERB, PRESET_ORDER, calcEffectiveRt60, METER_FLOOR_DB } from '../../audio/effects/reverbEngine';
import { canvasFont } from "../../theme/fonts";
import { hiDpi, drawLevelScope } from './shared/panelUtils';
import { levelBallistic } from '../../audio/effects/ballistics';
function drawIR(canvas, preset, fv) {
    const hd = hiDpi(canvas);
    if (!hd)
        return;
    const { ctx, W, H } = hd;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0D0D0F';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
    }
    for (let y = 0; y < H; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
    }
    const bottom = H - 20;
    const effectiveRt60 = calcEffectiveRt60(fv.size, fv.decay);
    const dampExp = 1 + (fv.damping / 100) * 5;
    const barSpacing = Math.max(4, 16 - (fv.diffusion / 100) * 12);
    const barVariance = 1 - (fv.diffusion / 100) * 0.7;
    ctx.strokeStyle = '#F5A623';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, bottom);
    ctx.lineTo(20, 20);
    ctx.stroke();
    const sizeSpread = 0.5 + (fv.size / 100) * 1.0;
    const dampAtten = 1.0 - (fv.damping / 100) * 0.75;
    const visibleCount = Math.max(1, Math.round(preset.earlyCount * (1 - (fv.diffusion / 100) * 0.6)
    ));
    const EARLY_DELAYS_MS = [3, 8, 15, 23, 35, 50, 70];
    const EARLY_AMPS = EARLY_DELAYS_MS.map((_, i) => 0.7 * Math.exp(-i * 0.35));
    const TIME_STOPS = [
        { ms: 0, x: 20 },
        { ms: 50, x: 55 },
        { ms: 200, x: 150 },
        { ms: 500, x: 330 },
        { ms: 1000, x: 480 },
    ];
    function timeToX(ms) {
        for (let i = 0; i < TIME_STOPS.length - 1; i++) {
            const a = TIME_STOPS[i], b = TIME_STOPS[i + 1];
            if (ms <= b.ms)
                return a.x + ((ms - a.ms) / (b.ms - a.ms)) * (b.x - a.x);
        }
        const last = TIME_STOPS[TIME_STOPS.length - 1];
        const prev = TIME_STOPS[TIME_STOPS.length - 2];
        const slope = (last.x - prev.x) / (last.ms - prev.ms);
        return last.x + (ms - last.ms) * slope;
    }
    const directAmpHeight = bottom - 20;
    EARLY_DELAYS_MS.slice(0, visibleCount).forEach((ms, i) => {
        const delayedMs = ms * sizeSpread;
        const x = Math.min(W - 10, timeToX(delayedMs));
        const h = Math.max(2, directAmpHeight * EARLY_AMPS[i] * dampAtten);
        ctx.strokeStyle = `rgba(77,158,255,${0.8 - i * 0.08})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, bottom);
        ctx.lineTo(x, bottom - h);
        ctx.stroke();
    });
    const tailStart = 200;
    const tailEnd = Math.min(W - 10, tailStart + (effectiveRt60 / 5.0) * (W - tailStart - 10));
    ctx.strokeStyle = 'rgba(45,212,191,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tailStart, bottom - 30);
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = tailStart + t * (tailEnd - tailStart);
        const decay = Math.exp(-t * dampExp);
        const y = bottom - Math.max(1, 30 * decay);
        ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = 1.5;
    const barCount = Math.floor((tailEnd - tailStart) / barSpacing);
    for (let i = 0; i < barCount; i++) {
        const t = i / barCount;
        const x = tailStart + t * (tailEnd - tailStart);
        const scatter = barVariance > 0.1 ? 0.5 + Math.random() * barVariance : 1;
        const env = Math.exp(-t * dampExp) * 35 * scatter;
        const y = bottom - Math.max(1, env);
        ctx.strokeStyle = `rgba(45,212,191,${0.55 - t * 0.3})`;
        ctx.beginPath();
        ctx.moveTo(x, bottom);
        ctx.lineTo(x, y);
        ctx.stroke();
    }
    ctx.font = canvasFont(10, { mono: true });
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(245,166,35,0.15)';
    ctx.fillRect(8, 6, 56, 18);
    ctx.fillStyle = '#F5A623';
    ctx.fillText('DIRECT', 10, 8);
    ctx.fillStyle = 'rgba(77,158,255,0.12)';
    ctx.fillRect(68, 6, 142, 18);
    ctx.fillStyle = '#4D9EFF';
    ctx.fillText('EARLY REFLECTIONS', 70, 8);
    ctx.fillStyle = 'rgba(45,212,191,0.12)';
    ctx.fillRect(tailStart - 5, 6, tailEnd - tailStart + 10, 18);
    ctx.fillStyle = '#2DD4BF';
    ctx.fillText('LATE DECAY (TAIL)', tailStart, 8);
    ctx.fillStyle = '#8A8A9A';
    ctx.font = canvasFont(10, { mono: true });
    ctx.textBaseline = 'alphabetic';
    const timeLabels = ['0ms', '50ms', '200ms', '500ms', '1s', `${effectiveRt60.toFixed(1)}s`];
    const labelX = [8, 55, 150, 330, 480, Math.min(W - 30, tailEnd - 5)];
    timeLabels.forEach((lbl, i) => { if (labelX[i] < W - 10)
        ctx.fillText(lbl, labelX[i], H - 4); });
}
const SCOPE_WINDOW_S = 6;
const SCOPE_MIN_DB = -72;
const SCOPE_MAX_DB = 6;
function drawReverbScope(canvas, history, nowT, active) {
    drawLevelScope(canvas, history, nowT, {
        windowS: SCOPE_WINDOW_S, minDb: SCOPE_MIN_DB, maxDb: SCOPE_MAX_DB,
        idleText: active ? null : 'HIT PLAY TO SEE THE TAIL RING OUT',
        fill: '#2DD4BF', inColor: '#F5A623', inAlpha: 0.55, outColor: '#2DD4BF',
    });
}
function DecayBars({ rt60, damping }) {
    const COUNT = 18;
    const dampExp = 1 + (damping / 100) * 5;
    const bars = Array.from({ length: COUNT }, (_, i) => {
        const t = i / (COUNT - 1);
        const env = Math.exp(-t * dampExp * (1.8 / rt60));
        return Math.max(2, Math.round(env * 100));
    });
    return (<div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60, marginBottom: '0.5rem' }}>
      {bars.map((h, i) => (<div key={i} style={{
                flex: 1, height: `${h}%`,
                background: 'var(--teal)',
                borderRadius: '1px 1px 0 0',
                opacity: 0.9,
                transition: 'height 0.4s ease',
            }}/>))}
    </div>);
}
const KNOB_SPECS = {
    preDelay: { label: 'PRE-DELAY', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}ms`, accent: 'var(--teal)' },
    hiShelfFreq: { label: 'HI-SHELF FREQ', min: 20, max: 20000, step: 100, fmt: v => v >= 1000 ? `${(v / 1000).toFixed(1)}kHz` : `${Math.round(v)}Hz`, accent: 'var(--teal)' },
    hiShelfGain: { label: 'HI-SHELF GAIN', min: -24, max: 6, step: 0.1, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`, accent: 'var(--teal)' },
    loShelfFreq: { label: 'LO-SHELF FREQ', min: 20, max: 2000, step: 1, fmt: v => `${Math.round(v)}Hz`, accent: 'var(--teal)' },
    loShelfGain: { label: 'LO-SHELF GAIN', min: -24, max: 6, step: 0.1, fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`, accent: 'var(--teal)' },
    wetDry: { label: 'WET/DRY', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`, accent: 'var(--teal)' },
    size: { label: 'SIZE', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`, accent: 'var(--purple)' },
    decay: { label: 'DECAY', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`, accent: 'var(--purple)' },
    damping: { label: 'DAMPING', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`, accent: 'var(--purple)' },
    diffusion: { label: 'DIFFUSION', min: 0, max: 100, step: 1, fmt: v => `${Math.round(v)}%`, accent: 'var(--purple)' },
};
export function ReverbEditorPanel({ params, setParams, preset, setPreset, isPlaying, getInputPeak, getOutputPeak, getNow, onTestTail = null, engineBadge = null, }) {
    const irRef = useRef(null);
    const scopeRef = useRef(null);
    const scopeHistoryRef = useRef([]);
    const meterClockRef = useRef(null);
    const smoothedInputDbRef = useRef(METER_FLOOR_DB);
    const smoothedOutputDbRef = useRef(METER_FLOOR_DB);
    const animRef = useRef(0);
    const currentPreset = ROOM_PRESETS[preset];
    useEffect(() => {
        if (irRef.current)
            drawIR(irRef.current, currentPreset, {
                size: params.size,
                decay: params.decay,
                damping: params.damping,
                diffusion: params.diffusion,
            });
    }, [currentPreset, params.size, params.decay, params.damping, params.diffusion]);
    useEffect(() => {
        if (isPlaying)
            return;
        if (scopeRef.current)
            drawReverbScope(scopeRef.current, [], 0, false);
    }, [isPlaying]);
    const applyPreset = useCallback((key) => {
        setPreset(key);
        setParams(p => ({ ...p, ...PRESET_FREEVERB[key] }));
    }, [setPreset, setParams]);
    useEffect(() => {
        if (!isPlaying) {
            cancelAnimationFrame(animRef.current);
            scopeHistoryRef.current = [];
            meterClockRef.current = null;
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
                const rawOutputDb = outPeak > 1e-6 ? 20 * Math.log10(outPeak) : METER_FLOOR_DB;
                smoothedOutputDbRef.current = levelBallistic(smoothedOutputDbRef.current, rawOutputDb, dt);
            }
            const history = scopeHistoryRef.current;
            history.push({ t: now, inputDb: smoothedInputDbRef.current, outputDb: smoothedOutputDbRef.current });
            const cutoff = now - SCOPE_WINDOW_S - 0.5;
            while (history.length > 0 && history[0].t < cutoff)
                history.shift();
            if (scopeRef.current)
                drawReverbScope(scopeRef.current, history, now, true);
            animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, getInputPeak, getOutputPeak, getNow]);
    return (<div className="reverb-body">
      <div className="reverb-left">
        <div className="canvas-label">IMPULSE RESPONSE — DECAY OVER TIME</div>
        <div className="ir-display">
          <canvas ref={irRef} width={760} height={160} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
        </div>

        <div className="canvas-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <span>
            LIVE REVERB TAIL SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
            <span style={{ color: 'var(--text-faint)', fontWeight: 400, marginLeft: '0.5rem' }}>
              · real dry input vs wet output over time — the diagram above is illustrative, this is the actual audio
            </span>
          </span>
          {onTestTail && (<button className="toggle-btn" style={{ fontSize: '0.6rem', padding: '0.25rem 0.6rem', whiteSpace: 'nowrap' }} onClick={onTestTail} disabled={!isPlaying} title="Fire one isolated hit and mute the loop so the tail rings out cleanly">
              ⚡ PING TAIL
            </button>)}
        </div>
        <div className="reverb-scope-display">
          <canvas ref={scopeRef} width={760} height={150} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
        </div>
        <div className="legend-row" style={{ marginBottom: '1rem' }}>
          <div className="legend-item"><span className="legend-line" style={{ background: '#F5A623' }}/>DRY INPUT</div>
          <div className="legend-item"><span className="legend-line" style={{ background: '#2DD4BF' }}/>WET OUTPUT (TAIL)</div>
        </div>
        <div className="concept-callout" style={{ marginTop: '-0.5rem', marginBottom: '1rem', background: 'rgba(45,212,191,0.05)', borderColor: 'rgba(45,212,191,0.15)' }}>
          The drum groove's near-continuous hi-hat keeps re-triggering the reverb, so SIZE/DECAY/DAMPING
          changes can be hard to see in a busy loop. Click <strong style={{ color: 'var(--teal)' }}>PING TAIL</strong>{' '}
          to hear (and see) one hit ring out with nothing else in the way.
        </div>

        <div className="canvas-label">ROOM PRESET</div>
        <div className="room-preset-row">
          {PRESET_ORDER.map(key => {
            const p = ROOM_PRESETS[key];
            return (<div key={key} className={`room-preset${preset === key ? ' active' : ''}`} onClick={() => applyPreset(key)}>
                <div className="room-preset-icon">{p.icon}</div>
                <div className="room-preset-name">{p.name}</div>
              </div>);
        })}
        </div>

        <div className="concept-callout" style={{ background: 'var(--teal-dim)', borderColor: 'rgba(45,212,191,0.2)' }}>
          <strong style={{ color: 'var(--teal)' }}>Concept check:</strong> Early reflections tell your
          brain the room's size and shape. The late, dense tail tells it the surface material — hard
          walls decay slower than soft ones. Current RT60:{' '}
          <strong style={{ color: 'var(--teal)' }}>{currentPreset.rt60}s</strong> ({currentPreset.label}).
        </div>
      </div>

      <div className="reverb-right">
        <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>RT60 DECAY ENVELOPE</div>
        <div className="reverb-decay-viz">
          <DecayBars rt60={calcEffectiveRt60(params.size, params.decay)} damping={params.damping}/>
          <div className="decay-readout">
            <span>RT60: <strong style={{ color: 'var(--teal)' }}>{calcEffectiveRt60(params.size, params.decay).toFixed(1)}s</strong></span>
            <span>−60dB POINT</span>
          </div>
        </div>

        <div className="canvas-label" style={{ marginBottom: '0.75rem' }}>REVERB PARAMETERS</div>

        {engineBadge}

        <div className="reverb-knob-grid">
          <Knob spec={KNOB_SPECS.size} value={params.size} onChange={v => setParams(p => ({ ...p, size: v }))}/>
          <Knob spec={KNOB_SPECS.decay} value={params.decay} onChange={v => setParams(p => ({ ...p, decay: v }))}/>
          <Knob spec={KNOB_SPECS.preDelay} value={params.preDelay} onChange={v => setParams(p => ({ ...p, preDelay: v }))}/>
          <Knob spec={KNOB_SPECS.damping} value={params.damping} onChange={v => setParams(p => ({ ...p, damping: v }))}/>
          <Knob spec={KNOB_SPECS.diffusion} value={params.diffusion} onChange={v => setParams(p => ({ ...p, diffusion: v }))}/>

          <Knob spec={KNOB_SPECS.hiShelfFreq} value={params.hiShelfFreq} onChange={v => setParams(p => ({ ...p, hiShelfFreq: v }))}/>
          <Knob spec={KNOB_SPECS.hiShelfGain} value={params.hiShelfGain} onChange={v => setParams(p => ({ ...p, hiShelfGain: v }))}/>
          <Knob spec={KNOB_SPECS.loShelfFreq} value={params.loShelfFreq} onChange={v => setParams(p => ({ ...p, loShelfFreq: v }))}/>
          <Knob spec={KNOB_SPECS.loShelfGain} value={params.loShelfGain} onChange={v => setParams(p => ({ ...p, loShelfGain: v }))}/>
          <Knob spec={KNOB_SPECS.wetDry} value={params.wetDry} onChange={v => setParams(p => ({ ...p, wetDry: v }))}/>
        </div>

        <div style={{
            marginTop: '0.75rem',
            background: 'var(--black)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '0.6rem 0.75rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '0.5rem',
        }}>
          {['size', 'decay', 'damping', 'diffusion'].map(key => (<div key={key} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#A855F7', fontWeight: 500 }}>
                {KNOB_SPECS[key].fmt(params[key])}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
                {KNOB_SPECS[key].label}
              </div>
            </div>))}
        </div>

        <div className="tip-box" style={{ marginTop: '0.75rem', background: 'rgba(45,212,191,0.07)', borderColor: 'rgba(45,212,191,0.2)' }}>
          <strong style={{ color: 'var(--teal)' }}>SIZE</strong> sets the perceived room volume —
          bigger rooms mean longer gaps between reflections.{' '}
          <strong style={{ color: 'var(--teal)' }}>DECAY</strong> controls how long the tail takes
          to fade out.{' '}
          <strong style={{ color: 'var(--teal)' }}>DAMPING</strong> rolls off high frequencies as
          the tail decays, mimicking absorption from air and soft surfaces.{' '}
          <strong style={{ color: 'var(--teal)' }}>DIFFUSION</strong> thickens echo density into a
          smooth wash rather than distinct slaps.{' '}
          <strong style={{ color: 'var(--teal)' }}>HI-SHELF</strong> and{' '}
          <strong style={{ color: 'var(--teal)' }}>LO-SHELF</strong> tame the tail's brightness and
          boom — a gentle gain shift above/below their corner frequency, rather than a hard
          HPF/LPF cutoff — so the tail can darken or thin out without losing everything past a
          brick-wall point. Drag knobs vertically to adjust.
        </div>
      </div>
    </div>);
}
