import { useRef, useState, useEffect, useCallback } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { compileFaustWasm } from '../../audio/faust/faustTypes';
import { downloadBlob, audioBufferToWavBlob } from '../../audio/wavRender';
import { useTheme } from '../../theme/ThemeContext';
import './chapters.css';
import { Tabs, TabPanel } from '../../components/Tabs';
import { LIVE_GAIN_ADDR_TO_BAND, DEFAULT_BANDS, applyBandsToNode, BAND_DEFS, getFreq, getGain, getQ, getBypass, getDynamicOn, getThreshold, getRange, getAttack, getRelease, getOrder, withFreq, withGain, withQ, withBypass, withDynamicOn, withThreshold, withRange, withAttack, withRelease, withOrder, FMIN, FMAX, GMIN, GMAX, ANALYSER_MIN_DB, ANALYSER_MAX_DB, clamp, bandResponseDB, totalResponseDB, gainOnlyResponseDB, curveRMSErrorDB, scoreFromRMS, fToFrac, fracToF, gainToFrac, fracToGain, EQ_PRESETS, applyPreset, pickRandomPreset, dbToLinear, applyOutputGain } from '../../audio/effects/equalizerEngine';
import { canvasFont } from "../../theme/fonts";
import { hiDpi } from './shared/panelUtils';
const FAUST_BASE_PATH = '/faust/ParamEQ';
function uiColor(def, theme) {
    return theme === 'light' ? def.lightColor : def.color;
}
async function renderParamEQOffline(generator, meta, dspModule, source, bands, outputGainDb = 0) {
    const offlineCtx = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate);
    const factory = { module: dspModule, json: JSON.stringify(meta), soundfiles: {} };
    const node = await generator.createNode(offlineCtx, meta.name, factory, false, 512);
    applyBandsToNode(node, bands);
    const outputGain = offlineCtx.createGain();
    outputGain.gain.value = dbToLinear(outputGainDb);
    const src = offlineCtx.createBufferSource();
    src.buffer = source;
    src.connect(node);
    node.connect(outputGain);
    outputGain.connect(offlineCtx.destination);
    src.start();
    return offlineCtx.startRendering();
}
function normAndFade(buf, peakTarget = 0.3) {
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    let peak = 0;
    for (let i = 0; i < L.length; i++)
        peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    const scale = peakTarget / Math.max(peak, 0.001);
    for (let i = 0; i < L.length; i++) {
        L[i] *= scale;
        R[i] *= scale;
    }
    const sr = buf.sampleRate;
    const fadeN = Math.round(sr * 0.02);
    for (let i = 0; i < fadeN; i++) {
        const f = i / fadeN;
        L[i] *= f;
        R[i] *= f;
        const idx = L.length - 1 - i;
        L[idx] *= f;
        R[idx] *= f;
    }
}
function createDemoLoopBuffer(ctx) {
    const sr = ctx.sampleRate;
    const dur = 4;
    const buf = ctx.createBuffer(2, sr * dur, sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    const padNotes = [110.0, 130.81, 164.81, 196.0, 261.63];
    const harmonics = [[1, 1.0], [2, 0.35], [3, 0.18], [4, 0.09], [5, 0.05]];
    for (const fund of padNotes) {
        for (const [ratio, amp] of harmonics) {
            const freq = fund * ratio;
            if (freq > sr / 2)
                continue;
            for (let n = 0; n < L.length; n++) {
                const t = n / sr;
                const env = Math.min(1, t / 0.4) * amp * 0.22;
                const s = Math.sin(2 * Math.PI * freq * t) * env;
                L[n] += s * 0.9;
                R[n] += s * 1.1;
            }
        }
    }
    const bassFreqs = [41.2, 55.0];
    for (let beat = 0; beat < 8; beat++) {
        const start = Math.round(beat * 0.5 * sr);
        const freq = bassFreqs[beat % 2];
        for (let i = 0; i < Math.round(0.45 * sr) && start + i < L.length; i++) {
            const t = i / sr;
            const env = Math.exp(-t * 4) * 0.5;
            const s = Math.sin(2 * Math.PI * freq * t) * env;
            L[start + i] += s;
            R[start + i] += s;
        }
    }
    for (let e = 0; e < 32; e++) {
        const start = Math.round(e * 0.25 * sr);
        let prev = 0;
        for (let i = 0; i < Math.round(sr * 0.05) && start + i < L.length; i++) {
            const t = i / sr;
            const env = Math.exp(-t * 45) * 0.18;
            const n = Math.random() * 2 - 1;
            const hp = n - prev * 0.94;
            prev = n;
            L[start + i] += hp * env;
            R[start + i] += hp * env;
        }
    }
    normAndFade(buf);
    return buf;
}
const GAIN_GRID_DB = [18, 12, 6, 0, -6, -12, -18];
const ACTIVITY_EPS_DB = 0.05;
const EQ_GRAPH_PALETTE = {
    dark: {
        bg: '#0A0A0C',
        gridMinor: 'rgba(255,255,255,0.05)',
        gridMinorH: 'rgba(255,255,255,0.04)',
        gridZero: '#2E2E3D',
        gainLabel: 'rgba(120,170,255,0.55)',
        levelLabel: 'rgba(255,77,106,0.5)',
        freqLabel: 'rgba(255,255,255,0.45)',
        dryStroke: '#E5E7EB',
        liveFill: '#FF4D6A',
        liveStroke: '#FF4D6A',
        curveTarget: '#F5A623',
        curveMine: '#4D9EFF',
        dynPreview: '#2DD4BF',
        outputGainRibbon: '#A78BFA',
        targetHiddenText: 'rgba(245,166,35,0.3)',
    },
    light: {
        bg: '#e7eae1',
        gridMinor: 'rgba(18,20,15,0.07)',
        gridMinorH: 'rgba(18,20,15,0.09)',
        gridZero: '#98a08c',
        gainLabel: 'rgba(37,99,235,0.75)',
        levelLabel: 'rgba(192,41,63,0.75)',
        freqLabel: 'rgba(18,20,15,0.55)',
        dryStroke: '#8b93a0',
        liveFill: '#c0293f',
        liveStroke: '#c0293f',
        curveTarget: '#ad6a12',
        curveMine: '#2563eb',
        dynPreview: '#0f9488',
        outputGainRibbon: '#7c3aed',
        targetHiddenText: 'rgba(173,106,18,0.4)',
    },
};
function drawEQGraph(canvas, opts) {
    const { bands, targetBands, showTarget, outputGainDb, analyserData, dryAnalyserData, sampleRate, highlightBandId, liveDynGain, liveDynGainTarget = 'bands', theme = 'dark', } = opts;
    const pal = EQ_GRAPH_PALETTE[theme] ?? EQ_GRAPH_PALETTE.dark;
    const hd = hiDpi(canvas);
    if (!hd)
        return;
    const { ctx, W, H } = hd;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = pal.gridMinor;
    ctx.lineWidth = 1;
    const freqLines = [
        [30, '30'], [50, '50'], [100, '100'], [200, '200'], [500, '500'],
        [1000, '1k'], [2000, '2k'], [5000, '5k'], [10000, '10k'], [20000, '20k'],
    ];
    for (const [f] of freqLines) {
        const x = fToFrac(f) * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
    }
    ctx.font = canvasFont(9, { mono: true });
    for (const g of GAIN_GRID_DB) {
        const y = gainToFrac(g) * H;
        ctx.strokeStyle = g === 0 ? pal.gridZero : pal.gridMinorH;
        ctx.lineWidth = g === 0 ? 1.5 : 1;
        ctx.setLineDash(g === 0 ? [5, 5] : []);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = pal.gainLabel;
        ctx.textAlign = 'left';
        ctx.fillText(`${g > 0 ? '+' : ''}${g}`, 4, y + 3);
        const levelAtY = ANALYSER_MAX_DB - (y / H) * (ANALYSER_MAX_DB - ANALYSER_MIN_DB);
        ctx.fillStyle = pal.levelLabel;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(levelAtY)}`, W - 4, y + 3);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.freqLabel;
    for (const [f, l] of freqLines)
        ctx.fillText(l, fToFrac(f) * W - 6, H - 3);
    const levelToY = (db) => H - clamp((db - ANALYSER_MIN_DB) / (ANALYSER_MAX_DB - ANALYSER_MIN_DB), 0, 1) * H;
    const toSpectrumPts = (data) => {
        const pts = [];
        const nyquist = sampleRate / 2;
        const binCount = data.length;
        for (let i = 1; i < binCount; i++) {
            const f = (i / binCount) * nyquist;
            if (f < FMIN || f > FMAX)
                continue;
            const db = ANALYSER_MIN_DB + (data[i] / 255) * (ANALYSER_MAX_DB - ANALYSER_MIN_DB);
            pts.push({ x: fToFrac(f) * W, y: levelToY(db) });
        }
        return pts;
    };
    if (dryAnalyserData) {
        const dryPts = toSpectrumPts(dryAnalyserData);
        if (dryPts.length > 1) {
            ctx.save();
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = pal.dryStroke;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(dryPts[0].x, dryPts[0].y);
            for (const p of dryPts.slice(1))
                ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.restore();
            ctx.setLineDash([]);
        }
    }
    if (analyserData) {
        const levelPts = toSpectrumPts(analyserData);
        if (levelPts.length > 1) {
            ctx.save();
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = pal.liveFill;
            ctx.beginPath();
            ctx.moveTo(levelPts[0].x, H);
            ctx.lineTo(levelPts[0].x, levelPts[0].y);
            for (const p of levelPts.slice(1))
                ctx.lineTo(p.x, p.y);
            ctx.lineTo(levelPts[levelPts.length - 1].x, H);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = pal.liveStroke;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(levelPts[0].x, levelPts[0].y);
            for (const p of levelPts.slice(1))
                ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.restore();
        }
    }
    const y0 = gainToFrac(0) * H;
    const sampleResponse = (b, responseFn) => {
        const N = 160;
        const pts = [];
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const f = fracToF(t);
            const db = responseFn(b, f);
            pts.push({ x: t * W, y: gainToFrac(clamp(db, GMIN, GMAX)) * H });
        }
        return pts;
    };
    const strokeCurve = (b, color, alpha, fillAlpha, outputGain = 0, curveLiveDynGain) => {
        if (fillAlpha > 0) {
            const fillPts = sampleResponse(b, (bb, f) => gainOnlyResponseDB(bb, f, curveLiveDynGain));
            ctx.save();
            ctx.globalAlpha = fillAlpha;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(fillPts[0].x, y0);
            ctx.lineTo(fillPts[0].x, fillPts[0].y);
            for (const p of fillPts.slice(1))
                ctx.lineTo(p.x, p.y);
            ctx.lineTo(fillPts[fillPts.length - 1].x, y0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        if (outputGain !== 0) {
            const basePts = sampleResponse(b, (bb, f) => totalResponseDB(bb, f, false, curveLiveDynGain));
            const shiftedPts = sampleResponse(b, (bb, f) => totalResponseDB(bb, f, false, curveLiveDynGain) + outputGain);
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = pal.outputGainRibbon;
            ctx.beginPath();
            ctx.moveTo(basePts[0].x, basePts[0].y);
            for (const p of basePts.slice(1))
                ctx.lineTo(p.x, p.y);
            for (let i = shiftedPts.length - 1; i >= 0; i--)
                ctx.lineTo(shiftedPts[i].x, shiftedPts[i].y);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
        const linePts = sampleResponse(b, (bb, f) => totalResponseDB(bb, f, false, curveLiveDynGain) + outputGain);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(linePts[0].x, linePts[0].y);
        for (const p of linePts.slice(1))
            ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
        if (curveLiveDynGain) {
            for (const def of BAND_DEFS) {
                if (!def.gainKey || getBypass(b, def))
                    continue;
                const g = curveLiveDynGain[def.id];
                if (g === undefined || Math.abs(g) <= ACTIVITY_EPS_DB)
                    continue;
                const aPts = sampleResponse(b, (bb, f) => bandResponseDB(def, bb, f, false, g));
                const bandColor = uiColor(def, theme);
                ctx.save();
                ctx.globalAlpha = 0.22;
                ctx.fillStyle = bandColor;
                ctx.beginPath();
                ctx.moveTo(aPts[0].x, y0);
                ctx.lineTo(aPts[0].x, aPts[0].y);
                for (const p of aPts.slice(1))
                    ctx.lineTo(p.x, p.y);
                ctx.lineTo(aPts[aPts.length - 1].x, y0);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                ctx.save();
                ctx.globalAlpha = 0.75;
                ctx.strokeStyle = bandColor;
                ctx.lineWidth = 1.5;
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(aPts[0].x, aPts[0].y);
                for (const p of aPts.slice(1))
                    ctx.lineTo(p.x, p.y);
                ctx.stroke();
                ctx.restore();
            }
        }
    };
    const anyDynamic = BAND_DEFS.some(def => getDynamicOn(bands, def));
    if (anyDynamic) {
        const dynPts = sampleResponse(bands, (bb, f) => totalResponseDB(bb, f, true) + outputGainDb);
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = pal.dynPreview;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(dynPts[0].x, dynPts[0].y);
        for (const p of dynPts.slice(1))
            ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
        ctx.setLineDash([]);
    }
    if (targetBands && showTarget) {
        strokeCurve(targetBands, pal.curveTarget, 0.9, 0.16, 0, liveDynGainTarget === 'target' ? liveDynGain : undefined);
    }
    else if (targetBands && !showTarget) {
        ctx.fillStyle = pal.targetHiddenText;
        ctx.font = canvasFont(10, { mono: true });
        ctx.fillText('TARGET HIDDEN — LISTEN & MATCH BY EAR', W / 2 - 150, 14);
    }
    strokeCurve(bands, pal.curveMine, 0.95, 0.22, outputGainDb, liveDynGainTarget === 'target' ? undefined : liveDynGain);
    if (highlightBandId) {
        const hDef = BAND_DEFS.find(d => d.id === highlightBandId);
        if (hDef && !getBypass(bands, hDef)) {
            const hLiveGain = liveDynGainTarget === 'target' ? 0 : (liveDynGain?.[hDef.id] ?? 0);
            const hPts = sampleResponse(bands, (bb, f) => bandResponseDB(hDef, bb, f, false, hLiveGain));
            const hColor = uiColor(hDef, theme);
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = hColor;
            ctx.beginPath();
            ctx.moveTo(hPts[0].x, y0);
            ctx.lineTo(hPts[0].x, hPts[0].y);
            for (const p of hPts.slice(1))
                ctx.lineTo(p.x, p.y);
            ctx.lineTo(hPts[hPts.length - 1].x, y0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            ctx.save();
            ctx.globalAlpha = 0.95;
            ctx.strokeStyle = hColor;
            ctx.lineWidth = 1.75;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(hPts[0].x, hPts[0].y);
            for (const p of hPts.slice(1))
                ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.restore();
        }
    }
}
function EQNode({ def, bands, containerRef, onChange, editable, selected, onSelect, onDragStateChange, }) {
    const dragRef = useRef(false);
    const [dragging, setDragging] = useState(false);
    const freq = getFreq(bands, def);
    const gain = getGain(bands, def);
    const xPct = fToFrac(freq) * 100;
    const yPct = gainToFrac(def.gainKey ? gain : 0) * 100;
    const updateFromPointer = useCallback((clientX, clientY) => {
        if (!onChange || !containerRef.current)
            return;
        const rect = containerRef.current.getBoundingClientRect();
        const xFrac = clamp((clientX - rect.left) / rect.width, 0, 1);
        const newFreq = clamp(fracToF(xFrac), FMIN, FMAX);
        let next = withFreq(bands, def, newFreq);
        if (def.gainKey) {
            const yFrac = clamp((clientY - rect.top) / rect.height, 0, 1);
            next = withGain(next, def, clamp(fracToGain(yFrac), GMIN, GMAX));
        }
        onChange(next);
    }, [bands, def, onChange, containerRef]);
    const handlePointerDown = (e) => {
        onSelect?.();
        if (!editable || !onChange)
            return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = true;
        setDragging(true);
        onDragStateChange?.(true);
    };
    const handlePointerMove = (e) => {
        if (!dragRef.current)
            return;
        updateFromPointer(e.clientX, e.clientY);
    };
    const handlePointerUp = () => {
        dragRef.current = false;
        if (dragging) {
            setDragging(false);
            onDragStateChange?.(false);
        }
    };
    const handleWheel = (e) => {
        if (!editable || !onChange || !def.qKey)
            return;
        e.preventDefault();
        const q = getQ(bands, def) ?? 1;
        onChange(withQ(bands, def, clamp(q - Math.sign(e.deltaY) * 0.1, 0.1, 10)));
    };
    const q = getQ(bands, def);
    const bypassed = getBypass(bands, def);
    const size = bypassed ? 9 : 14;
    const title = `${def.label}: ${freq >= 1000 ? (freq / 1000).toFixed(2) + 'k' : Math.round(freq)}Hz`
        + (def.gainKey ? ` · ${gain > 0 ? '+' : ''}${gain.toFixed(1)}dB` : '')
        + (q !== undefined ? ` · Q ${q.toFixed(2)} (scroll to adjust)` : '')
        + (bypassed ? ' · OFF (click to select, then turn ON below)' : '');
    return (<div onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onWheel={handleWheel} title={title} style={{
            position: 'absolute',
            left: `${xPct}%`,
            top: `${yPct}%`,
            width: size,
            height: size,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            borderRadius: '50%',
            background: bypassed ? 'transparent' : def.color,
            border: `${selected ? 2 : bypassed ? 1 : 2}px ${bypassed ? 'dashed' : 'solid'} ${selected ? '#fff' : bypassed ? def.color : 'rgba(0,0,0,0.5)'}`,
            boxShadow: selected
                ? `0 0 0 3px ${def.color}55, 0 0 10px ${def.color}cc`
                : bypassed ? 'none' : `0 0 8px ${def.color}88`,
            opacity: bypassed ? 0.5 : 1,
            cursor: editable ? 'grab' : 'default',
            touchAction: 'none',
            zIndex: selected ? 3 : 2,
        }}>
      {dragging && (<div style={{
                position: 'absolute', left: '50%', bottom: `calc(100% + ${size / 2 + 8}px)`,
                transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10,
                background: 'rgba(10,10,14,0.95)', border: `1px solid ${def.color}`, borderRadius: 4,
                padding: '0.3rem 0.55rem', whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#fff', lineHeight: 1.55,
                boxShadow: `0 0 10px ${def.color}66`,
            }}>
          <div style={{ color: def.color, fontWeight: 600, letterSpacing: '0.04em' }}>{def.label}</div>
          <div>{freq >= 1000 ? (freq / 1000).toFixed(2) + 'k' : Math.round(freq)} Hz</div>
          {def.gainKey && <div>{gain > 0 ? '+' : ''}{gain.toFixed(1)} dB</div>}
          {q !== undefined && <div>Q {q.toFixed(2)}</div>}
        </div>)}
    </div>);
}
function OutputGainSlider({ value, onChange, min = -15, max = 15, }) {
    const trackRef = useRef(null);
    const dragRef = useRef(false);
    const pctFromValue = (v) => ((max - v) / (max - min)) * 100;
    const valueFromClientY = (clientY) => {
        if (!trackRef.current)
            return value;
        const rect = trackRef.current.getBoundingClientRect();
        const frac = clamp((clientY - rect.top) / rect.height, 0, 1);
        return max - frac * (max - min);
    };
    const commit = (v) => onChange(clamp(roundTo(v, 1), min, max));
    const handlePointerDown = (e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = true;
        commit(valueFromClientY(e.clientY));
    };
    const handlePointerMove = (e) => {
        if (!dragRef.current)
            return;
        commit(valueFromClientY(e.clientY));
    };
    const handlePointerUp = () => { dragRef.current = false; };
    const clamped = clamp(value, min, max);
    const pct = pctFromValue(clamped);
    const ticks = [15, 10, 5, 0, -5, -10, -15].filter(t => t <= max && t >= min);
    return (<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', width: 40, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: '0.25rem', flex: 1, minHeight: 160, width: '100%', justifyContent: 'center' }}>
        <div style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)', fontSize: '0.45rem', color: 'var(--text-faint)', textAlign: 'right',
        }}>
          {ticks.map(t => <div key={t}>{Math.abs(t)}</div>)}
        </div>
        <div onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} title={`Output gain: ${clamped > 0 ? '+' : ''}${clamped.toFixed(1)} dB`} style={{
            position: 'relative',
            width: 16,
            flex: 1,
            display: 'flex',
            justifyContent: 'center',
            cursor: 'ns-resize',
            touchAction: 'none',
        }}>
          <div ref={trackRef} style={{
            position: 'relative',
            width: 3,
            height: '100%',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 2,
        }}>
            <div style={{ position: 'absolute', left: -4, right: -4, top: `${pctFromValue(0)}%`, height: 1, background: 'var(--border-bright)' }}/>
            <div style={{
            position: 'absolute', left: '50%', top: `${pct}%`, transform: 'translate(-50%, -50%)',
            width: 12, height: 6, borderRadius: 2, background: 'var(--purple)',
            boxShadow: '0 0 6px rgba(167,139,250,0.6)', border: '1px solid rgba(0,0,0,0.4)',
        }}/>
          </div>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--text-faint)', letterSpacing: '0.06em' }}>GAIN</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--text)' }}>
        {clamped > 0 ? '+' : ''}{clamped.toFixed(1)}dB
      </div>
    </div>);
}
function ParamEQCurve({ bands, onChange, targetBands, showTarget, analyserRef, dryAnalyserRef, analyserActive, sampleRate, outputGainDb, onOutputGainChange, selectedBandId, onSelectBand, liveDynGainRef, liveDynGainActive, liveDynGainTarget, }) {
    const { theme } = useTheme();
    const themeRef = useRef(theme);
    useEffect(() => { themeRef.current = theme; }, [theme]);
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const dataRef = useRef(null);
    const dryDataRef = useRef(null);
    const rafRef = useRef(null);
    const [draggingBandId, setDraggingBandId] = useState(null);
    const bandsRef = useRef(bands);
    useEffect(() => { bandsRef.current = bands; }, [bands]);
    const targetRef = useRef(targetBands);
    useEffect(() => { targetRef.current = targetBands; }, [targetBands]);
    const showTargetRef = useRef(showTarget);
    useEffect(() => { showTargetRef.current = showTarget; }, [showTarget]);
    const outputGainRef = useRef(outputGainDb);
    useEffect(() => { outputGainRef.current = outputGainDb; }, [outputGainDb]);
    const draggingBandRef = useRef(draggingBandId);
    useEffect(() => { draggingBandRef.current = draggingBandId; }, [draggingBandId]);
    const liveDynGainActiveRef = useRef(liveDynGainActive);
    useEffect(() => { liveDynGainActiveRef.current = liveDynGainActive; }, [liveDynGainActive]);
    const liveDynGainTargetRef = useRef(liveDynGainTarget);
    useEffect(() => { liveDynGainTargetRef.current = liveDynGainTarget; }, [liveDynGainTarget]);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        drawEQGraph(canvas, {
            bands, targetBands, showTarget: !!showTarget, outputGainDb: outputGainDb ?? 0,
            analyserData: dataRef.current, dryAnalyserData: dryDataRef.current, sampleRate,
            highlightBandId: draggingBandId,
            liveDynGain: liveDynGainActive ? liveDynGainRef?.current : undefined,
            liveDynGainTarget, theme,
        });
    }, [bands, targetBands, showTarget, outputGainDb, sampleRate, draggingBandId, liveDynGainActive, liveDynGainRef, liveDynGainTarget, theme]);
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        if (!(analyserActive && analyserRef?.current)) {
            drawEQGraph(canvas, {
                bands: bandsRef.current, targetBands: targetRef.current, showTarget: !!showTargetRef.current,
                outputGainDb: outputGainRef.current ?? 0, analyserData: null, dryAnalyserData: null, sampleRate,
                highlightBandId: draggingBandRef.current,
                liveDynGain: liveDynGainActiveRef.current ? liveDynGainRef?.current : undefined,
                liveDynGainTarget: liveDynGainTargetRef.current, theme: themeRef.current,
            });
            return undefined;
        }
        const analyser = analyserRef.current;
        if (!dataRef.current || dataRef.current.length !== analyser.frequencyBinCount) {
            dataRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        const tick = () => {
            if (!analyserRef.current)
                return;
            const buf = dataRef.current;
            analyserRef.current.getByteFrequencyData(buf);
            let dryBuf = null;
            const dryAnalyser = dryAnalyserRef?.current;
            if (dryAnalyser) {
                if (!dryDataRef.current || dryDataRef.current.length !== dryAnalyser.frequencyBinCount) {
                    dryDataRef.current = new Uint8Array(dryAnalyser.frequencyBinCount);
                }
                dryAnalyser.getByteFrequencyData(dryDataRef.current);
                dryBuf = dryDataRef.current;
            }
            drawEQGraph(canvas, {
                bands: bandsRef.current, targetBands: targetRef.current, showTarget: !!showTargetRef.current,
                outputGainDb: outputGainRef.current ?? 0, analyserData: buf, dryAnalyserData: dryBuf, sampleRate,
                highlightBandId: draggingBandRef.current,
                liveDynGain: liveDynGainActiveRef.current ? liveDynGainRef?.current : undefined,
                liveDynGainTarget: liveDynGainTargetRef.current, theme: themeRef.current,
            });
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current)
            cancelAnimationFrame(rafRef.current); };
    }, [analyserActive, analyserRef, dryAnalyserRef, sampleRate]);
    return (<div style={{ display: 'flex', gap: '0.6rem', alignItems: 'stretch' }}>
      <div ref={containerRef} className="spectrum-display" style={{ height: 320, flex: 1, marginBottom: 0 }}>
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
        {BAND_DEFS.map(def => (<EQNode key={def.id} def={def} bands={bands} containerRef={containerRef} onChange={onChange} editable={!!onChange} selected={selectedBandId === def.id} onSelect={onSelectBand ? () => {
                onSelectBand(def.id);
                if (onChange && getBypass(bands, def))
                    onChange(withBypass(bands, def, false));
            } : undefined} onDragStateChange={dragging => setDraggingBandId(prev => {
                if (dragging)
                    return def.id;
                return prev === def.id ? null : prev;
            })}/>))}
      </div>
      {onOutputGainChange && (<OutputGainSlider value={outputGainDb ?? 0} onChange={onOutputGainChange}/>)}
    </div>);
}
function roundTo(v, decimals) {
    const p = Math.pow(10, decimals);
    return Math.round(v * p) / p;
}
function NumberField({ value, onChange, min, max, step, disabled, }) {
    const [local, setLocal] = useState(String(value));
    const focusedRef = useRef(false);
    useEffect(() => { if (!focusedRef.current)
        setLocal(String(value)); }, [value]);
    const handleChange = (e) => {
        const text = e.target.value;
        setLocal(text);
        const n = parseFloat(text);
        if (!Number.isNaN(n))
            onChange(clamp(n, min, max));
    };
    const handleBlur = () => {
        focusedRef.current = false;
        const n = parseFloat(local);
        const clamped = Number.isNaN(n) ? value : clamp(n, min, max);
        onChange(clamped);
        setLocal(String(clamped));
    };
    return (<input type="number" value={local} min={min} max={max} step={step} disabled={disabled} onFocus={() => { focusedRef.current = true; }} onChange={handleChange} onBlur={handleBlur} onKeyDown={e => { if (e.key === 'Enter')
        e.target.blur(); }} style={{
            width: '100%',
            background: disabled ? 'transparent' : 'var(--surface)',
            border: `1px solid ${disabled ? 'transparent' : 'var(--border)'}`,
            borderRadius: '3px',
            color: disabled ? 'var(--text-faint)' : 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            textAlign: 'center',
            padding: '0.1rem 0.15rem',
            outline: 'none',
        }}/>);
}
function valueToFrac(v, min, max, log) {
    if (log) {
        const lv = Math.log10(Math.max(v, 1e-6)), lmin = Math.log10(min), lmax = Math.log10(max);
        return clamp((lv - lmin) / (lmax - lmin), 0, 1);
    }
    return clamp((v - min) / (max - min), 0, 1);
}
function fracToValue(f, min, max, log) {
    const frac = clamp(f, 0, 1);
    if (log) {
        const lmin = Math.log10(min), lmax = Math.log10(max);
        return Math.pow(10, lmin + frac * (lmax - lmin));
    }
    return min + frac * (max - min);
}
const KNOB_SWEEP_DEG = 270;
const KNOB_START_DEG = -135;
const KNOB_DRAG_PX = 170;
function knobPolar(r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: r * Math.sin(rad), y: -r * Math.cos(rad) };
}
function knobArcPath(r, startDeg, endDeg) {
    if (Math.abs(endDeg - startDeg) < 0.1)
        endDeg = startDeg + 0.1;
    const s = knobPolar(r, startDeg), e = knobPolar(r, endDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}
const KNOB_BODY = {
    dark: {
        background: 'radial-gradient(circle at 35% 30%, #2b2b32, #131316 75%)',
        shadow: 'inset 0 1px 2px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.04)',
        track: 'rgba(255,255,255,0.1)',
    },
    light: {
        background: 'radial-gradient(circle at 35% 30%, #fbfcf8, #ccd2c2 75%)',
        shadow: 'inset 0 1px 2px rgba(18,20,15,0.15), 0 1px 0 rgba(255,255,255,0.8), 0 2px 5px rgba(18,20,15,0.12)',
        track: 'rgba(18,20,15,0.16)',
    },
};
function Knob({ value, onChange, min, max, disabled, color = 'var(--blue)', log = false, size = 56, }) {
    const { theme } = useTheme();
    const body = KNOB_BODY[theme] ?? KNOB_BODY.dark;
    const dragRef = useRef(null);
    const frac = valueToFrac(value, min, max, log);
    const angle = KNOB_START_DEG + frac * KNOB_SWEEP_DEG;
    const r = size / 2 - 3;
    const handlePointerDown = (e) => {
        if (disabled)
            return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { startY: e.clientY, startFrac: frac };
    };
    const handlePointerMove = (e) => {
        if (!dragRef.current || disabled)
            return;
        const dy = dragRef.current.startY - e.clientY;
        const nextFrac = clamp(dragRef.current.startFrac + dy / KNOB_DRAG_PX, 0, 1);
        onChange(fracToValue(nextFrac, min, max, log));
    };
    const handlePointerUp = () => { dragRef.current = null; };
    const handleWheel = (e) => {
        if (disabled)
            return;
        e.preventDefault();
        const nextFrac = clamp(frac - Math.sign(e.deltaY) * 0.015, 0, 1);
        onChange(fracToValue(nextFrac, min, max, log));
    };
    return (<div onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onWheel={handleWheel} style={{
            position: 'relative', width: size, height: size, borderRadius: '50%',
            background: body.background,
            boxShadow: disabled ? 'none' : body.shadow,
            cursor: disabled ? 'default' : 'ns-resize',
            touchAction: 'none',
            opacity: disabled ? 0.4 : 1,
            flexShrink: 0,
        }}>
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <path d={knobArcPath(r, KNOB_START_DEG, KNOB_START_DEG + KNOB_SWEEP_DEG)} fill="none" stroke={body.track} strokeWidth={3.5} strokeLinecap="round"/>
        <path d={knobArcPath(r, KNOB_START_DEG, angle)} fill="none" stroke={disabled ? 'var(--text-faint)' : color} strokeWidth={3.5} strokeLinecap="round"/>
      </svg>
      <div style={{
            position: 'absolute', left: '50%', top: '50%', width: 3, height: size / 2 - 10,
            background: disabled ? 'var(--text-faint)' : color, borderRadius: 1.5,
            transformOrigin: 'bottom center', transform: `translate(-50%, -100%) rotate(${angle}deg)`,
        }}/>
    </div>);
}
function KnobField({ label, value, onChange, min, max, step, disabled, color, log, decimals = 1, }) {
    return (<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
      <span style={{ fontSize: '0.55rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{label}</span>
      <Knob value={value} onChange={onChange} min={min} max={max} disabled={disabled} color={color} log={log}/>
      <div style={{ width: 66 }}>
        <NumberField value={roundTo(value, decimals)} onChange={onChange} min={min} max={max} step={step} disabled={disabled}/>
      </div>
    </div>);
}
function Field({ label, children }) {
    return (<div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', alignItems: 'center' }}>
      <span style={{ fontSize: '0.55rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{label}</span>
      {children}
    </div>);
}
const navBtnStyle = {
    width: 22, height: 22, borderRadius: '3px', cursor: 'pointer',
    border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)',
    fontFamily: 'var(--font-mono)', fontSize: '0.75rem', lineHeight: 1, flexShrink: 0,
};
const KNOB_HEADER_H = '1.5rem';
const SHAPE_LABEL = {
    hpf: 'LOW CUT', lowshelf: 'LOW SHELF', peak: 'BELL', highshelf: 'HIGH SHELF', lpf: 'HIGH CUT',
};
function getDynModeUI(bands, def) {
    if (!getDynamicOn(bands, def))
        return 'static';
    return getGain(bands, def) === 0 ? 'dynamic' : 'both';
}
function withDynModeUI(bands, def, mode) {
    if (mode === 'static')
        return withDynamicOn(bands, def, false);
    if (mode === 'dynamic')
        return withGain(withDynamicOn(bands, def, true), def, 0);
    return withDynamicOn(bands, def, true);
}
function BandEditPanel({ bands, onChange, selectedId, onSelect, }) {
    const { theme } = useTheme();
    const [modeOverride, setModeOverride] = useState({});
    const idx = Math.max(0, BAND_DEFS.findIndex(d => d.id === selectedId));
    const def = BAND_DEFS[idx] ?? BAND_DEFS[0];
    const bypassed = getBypass(bands, def);
    const freq = getFreq(bands, def);
    const gain = getGain(bands, def);
    const q = getQ(bands, def);
    const dynCapable = !!def.dynamicOnKey;
    const dynamicOn = dynCapable && getDynamicOn(bands, def);
    const dynMode = !dynCapable ? 'static'
        : !dynamicOn ? 'static'
            : (modeOverride[def.id] ?? getDynModeUI(bands, def));
    const threshold = getThreshold(bands, def);
    const range = getRange(bands, def);
    const attack = getAttack(bands, def);
    const release = getRelease(bands, def);
    const neutralKnobColor = theme === 'light' ? '#5b6472' : '#9AA5B1';
    const goto = (delta) => {
        const next = (idx + delta + BAND_DEFS.length) % BAND_DEFS.length;
        onSelect(BAND_DEFS[next].id);
    };
    return (<div style={{
            border: '1px solid var(--border)', borderRadius: '8px',
            background: 'rgba(255,255,255,0.02)', padding: '1rem 1.4rem', marginTop: '0.75rem',
        }}>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {BAND_DEFS.map(d => {
            const active = d.id === selectedId;
            const bandOn = !getBypass(bands, d);
            const c = uiColor(d, theme);
            return (<button key={d.id} onClick={() => {
                    if (active) {
                        onChange(withBypass(bands, d, bandOn));
                    }
                    else {
                        onSelect(d.id);
                        if (!bandOn)
                            onChange(withBypass(bands, d, false));
                    }
                }} title={active
                    ? (bandOn ? `${d.label} — on, click to turn off` : `${d.label} — off, click to turn on`)
                    : d.label} style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.32rem 0.7rem', borderRadius: '4px', cursor: 'pointer',
                    border: `1px solid ${active ? c : 'var(--border)'}`,
                    background: active ? `${c}22` : 'transparent',
                    color: active ? c : bandOn ? 'var(--text-dim)' : 'var(--text-faint)',
                    fontFamily: 'var(--font-mono)', fontSize: '0.64rem', letterSpacing: '0.04em',
                    opacity: bandOn ? 1 : 0.5,
                }}>
              <span style={{
                    width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                    background: bandOn ? (active ? c : 'var(--text-dim)') : 'var(--text-faint)',
                }}/>
              {d.short}
            </button>);
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: '1.5rem', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '0.3rem' }}>
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
            paddingRight: '1.8rem', borderRight: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button onClick={() => goto(-1)} title="Previous band" style={navBtnStyle}>‹</button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 92 }}>
              <span style={{ fontSize: '0.68rem', color: uiColor(def, theme), fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{def.label}</span>
              <span style={{ fontSize: '0.5rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{SHAPE_LABEL[def.kind]}</span>
            </div>
            <button onClick={() => goto(1)} title="Next band" style={navBtnStyle}>›</button>
          </div>
        </div>

        <div style={{
            display: 'flex', flexDirection: 'column', gap: '0.7rem', flexShrink: 0,
            paddingRight: (def.gainKey || dynCapable) ? '1.8rem' : 0,
            borderRight: (def.gainKey || dynCapable) ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{ height: KNOB_HEADER_H }}/>
          <div style={{ display: 'flex', gap: '1.4rem' }}>
            <KnobField label="FREQ (Hz)" value={freq} min={FMIN} max={FMAX} step={1} decimals={0} log color={neutralKnobColor} disabled={bypassed} onChange={v => onChange(withFreq(bands, def, clamp(v, FMIN, FMAX)))}/>
            {def.orderKey ? (<Field label="SLOPE">
                <select value={getOrder(bands, def)} disabled={bypassed} onChange={e => onChange(withOrder(bands, def, Number(e.target.value)))} style={{
                background: bypassed ? 'transparent' : 'var(--surface)',
                border: `1px solid ${bypassed ? 'transparent' : 'var(--border)'}`,
                borderRadius: '3px', color: bypassed ? 'var(--text-faint)' : 'var(--text)',
                fontFamily: 'var(--font-mono)', fontSize: '0.6rem', textAlign: 'center',
                padding: '0.1rem 0.15rem', outline: 'none',
            }}>
                  <option value={2}>12dB</option>
                  <option value={4}>24dB</option>
                  <option value={6}>36dB</option>
                  <option value={8}>48dB</option>
                </select>
              </Field>) : def.qKey ? (<KnobField label="Q" value={q ?? 1} min={0.1} max={10} step={0.01} decimals={2} color={neutralKnobColor} disabled={bypassed} onChange={v => onChange(withQ(bands, def, clamp(v, 0.1, 10)))}/>) : null}
          </div>
        </div>

        {def.gainKey && (<div style={{
                display: 'flex', flexDirection: 'column', gap: '0.7rem', flexShrink: 0,
                paddingRight: dynCapable ? '1.8rem' : 0, borderRight: dynCapable ? '1px solid var(--border)' : 'none',
            }}>
            <div style={{ minHeight: KNOB_HEADER_H, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: '0.58rem', color: 'var(--blue)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', fontWeight: 600 }}>
                STANDARD EQ
              </span>
            </div>
            <div style={{ display: 'flex', gap: '1.4rem' }}>
              <KnobField label="GAIN (dB)" value={gain} min={GMIN} max={GMAX} step={0.1} decimals={1} color="var(--blue)" disabled={bypassed || dynMode === 'dynamic'} onChange={v => onChange(withGain(bands, def, clamp(v, GMIN, GMAX)))}/>
            </div>
          </div>)}

        {dynCapable && (<div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', flexShrink: 0 }}>
            <div style={{ minHeight: KNOB_HEADER_H, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.58rem', color: 'var(--teal)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', fontWeight: 600 }}>
                DYNAMIC EQ
              </span>
              {['static', 'dynamic', 'both'].map(m => (<button key={m} onClick={() => {
                    setModeOverride(prev => ({ ...prev, [def.id]: m }));
                    onChange(withDynModeUI(bands, def, m));
                }} disabled={bypassed} style={{
                    padding: '0.24rem 0.6rem', borderRadius: '4px', cursor: bypassed ? 'default' : 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.02em',
                    border: `1px solid ${dynMode === m ? 'var(--teal)' : 'var(--border)'}`,
                    background: dynMode === m ? 'rgba(45,212,191,0.15)' : 'transparent',
                    color: dynMode === m ? 'var(--teal)' : 'var(--text-faint)',
                    opacity: bypassed ? 0.5 : 1,
                }}>
                  {m === 'static' ? 'OFF' : m === 'dynamic' ? 'DYNAMIC' : 'BOTH'}
                </button>))}
            </div>

            {dynMode !== 'static' ? (<div style={{ display: 'flex', gap: '1.4rem' }}>
                <KnobField label="THRESH (dB)" value={threshold} min={-60} max={0} step={0.1} decimals={1} color="var(--teal)" disabled={bypassed} onChange={v => onChange(withThreshold(bands, def, clamp(v, -60, 0)))}/>
                <KnobField label="RANGE (dB)" value={range} min={-24} max={24} step={0.1} decimals={1} color="var(--teal)" disabled={bypassed} onChange={v => onChange(withRange(bands, def, clamp(v, -24, 24)))}/>
                <KnobField label="ATTACK (s)" value={attack} min={0.001} max={0.5} step={0.001} decimals={3} color="var(--teal)" disabled={bypassed} onChange={v => onChange(withAttack(bands, def, clamp(v, 0.001, 0.5)))}/>
                <KnobField label="RELEASE (s)" value={release} min={0.01} max={2} step={0.01} decimals={2} color="var(--teal)" disabled={bypassed} onChange={v => onChange(withRelease(bands, def, clamp(v, 0.01, 2)))}/>
              </div>) : (<div style={{ fontSize: '0.56rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', maxWidth: 280, lineHeight: 1.5 }}>
                Pick DYNAMIC or BOTH to arm level-dependent movement on this band.
              </div>)}
          </div>)}
      </div>

      {dynCapable && dynMode !== 'static' && (<div style={{ fontSize: '0.56rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginTop: '0.85rem', paddingTop: '0.7rem', borderTop: '1px solid var(--border)', lineHeight: 1.6, maxWidth: 620 }}>
          {dynMode === 'dynamic' && 'Gain stays at 0 dB until the signal crosses Threshold, then moves toward Range — negative cuts, positive boosts. Freq/Q above still shape it — they set the center and width of both the static peak and the level detector this is watching. Only audible during playback.'}
          {dynMode === 'both' && 'Static Gain always applies; Range adds to it once the signal crosses Threshold, during playback. Freq/Q above apply to both.'}
        </div>)}
    </div>);
}
export function EqualizerEditorPanel({
    bands, setBands,
    selectedBandId, setSelectedBandId,
    outputGainDb, setOutputGainDb,
    analyserRef, dryAnalyserRef, analyserActive, sampleRate,
    liveDynGainRef, liveDynGainActive,
    targetBands = null, showTarget = false, liveDynGainTarget = 'bands',
}) {
    return (<>
      <ParamEQCurve bands={bands} onChange={setBands} targetBands={targetBands ?? undefined} showTarget={showTarget} analyserRef={analyserRef} dryAnalyserRef={dryAnalyserRef} analyserActive={analyserActive} sampleRate={sampleRate} outputGainDb={outputGainDb} onOutputGainChange={setOutputGainDb} selectedBandId={selectedBandId} onSelectBand={setSelectedBandId} liveDynGainRef={liveDynGainRef} liveDynGainActive={liveDynGainActive} liveDynGainTarget={liveDynGainTarget}/>
      <BandEditPanel bands={bands} onChange={setBands} selectedId={selectedBandId} onSelect={setSelectedBandId}/>
    </>);
}
const EQ_TABS = [
    { id: 'bench', label: '🧪 TEST BENCH' },
    { id: 'ear', label: '🎧 EAR TRAINING' },
];
export default function Equalizer() {
    const { theme } = useTheme();
    const originalLineColor = theme === 'light' ? '#8b93a0' : '#E5E7EB';
    const grBoostGradient = theme === 'light'
        ? 'linear-gradient(90deg, #7a8a1a, #0f9488, #7c3aed)'
        : 'linear-gradient(90deg, #D9E86B, #2DD4BF, #A78BFA)';
    const [tab, setTab] = useState('bench');
    const [engineStatus, setEngineStatus] = useState('idle');
    const [engineError, setEngineError] = useState(null);
    const dspMetaRef = useRef(null);
    const dspModuleRef = useRef(null);
    const generatorRef = useRef(null);
    useEffect(() => {
        let cancelled = false;
        setEngineStatus('loading');
        setEngineError(null);
        (async () => {
            try {
                const meta = await (await fetch(`${FAUST_BASE_PATH}/dsp-meta.json`)).json();
                const mod = await compileFaustWasm(`${FAUST_BASE_PATH}/dsp-module.wasm`);
                if (cancelled)
                    return;
                dspMetaRef.current = meta;
                dspModuleRef.current = mod;
                generatorRef.current = new FaustMonoDspGenerator();
                setEngineStatus('ready');
            }
            catch (err) {
                if (cancelled)
                    return;
                console.error('[Chapter2b] failed to load Faust ParamEQ DSP', err);
                setEngineError(err instanceof Error ? err.message : String(err));
                setEngineStatus('error');
            }
        })();
        return () => { cancelled = true; };
    }, []);
    const audioCtxRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const activeNodeRef = useRef(null);
    const outputGainNodeRef = useRef(null);
    const analyserRef = useRef(null);
    const dryAnalyserRef = useRef(null);
    const liveDynGainRef = useRef({});
    const demoBufferRef = useRef(null);
    const [playSource, setPlaySource] = useState('idle');
    const [playError, setPlayError] = useState('');
    const [sampleRate, setSampleRate] = useState(44100);
    const ensureAudioCtx = useCallback(() => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new AudioContext();
            setSampleRate(audioCtxRef.current.sampleRate);
        }
        return audioCtxRef.current;
    }, []);
    const ensureDemoBuffer = useCallback((ctx) => {
        if (!demoBufferRef.current)
            demoBufferRef.current = createDemoLoopBuffer(ctx);
        return demoBufferRef.current;
    }, []);
    const [benchBands, setBenchBands] = useState(DEFAULT_BANDS);
    const benchBandsRef = useRef(benchBands);
    useEffect(() => { benchBandsRef.current = benchBands; }, [benchBands]);
    const [benchOutputGain, setBenchOutputGain] = useState(0);
    const benchOutputGainRef = useRef(benchOutputGain);
    useEffect(() => { benchOutputGainRef.current = benchOutputGain; }, [benchOutputGain]);
    const [benchBuffer, setBenchBuffer] = useState(null);
    const [benchFileName, setBenchFileName] = useState('');
    const [benchDecoding, setBenchDecoding] = useState(false);
    const [benchUploadError, setBenchUploadError] = useState('');
    const benchFileInputRef = useRef(null);
    const [benchDownloading, setBenchDownloading] = useState(false);
    const [benchTracks, setBenchTracks] = useState([]);
    const [benchActiveTrackId, setBenchActiveTrackId] = useState(null);
    const benchUploadIdSeqRef = useRef(0);
    const [benchSelectedBandId, setBenchSelectedBandId] = useState('peak1');
    const [targetPreset, setTargetPreset] = useState(() => pickRandomPreset());
    const targetBands = applyPreset(DEFAULT_BANDS, targetPreset);
    const targetBandsRef = useRef(targetBands);
    useEffect(() => { targetBandsRef.current = targetBands; });
    const [myBands, setMyBands] = useState(DEFAULT_BANDS);
    const myBandsRef = useRef(myBands);
    useEffect(() => { myBandsRef.current = myBands; }, [myBands]);
    const [myOutputGain, setMyOutputGain] = useState(0);
    const myOutputGainRef = useRef(myOutputGain);
    useEffect(() => { myOutputGainRef.current = myOutputGain; }, [myOutputGain]);
    const [earBuffer, setEarBuffer] = useState(null);
    const [earFileName, setEarFileName] = useState('');
    const [earDecoding, setEarDecoding] = useState(false);
    const [earUploadError, setEarUploadError] = useState('');
    const earFileInputRef = useRef(null);
    const [revealed, setRevealed] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [hintUsed, setHintUsed] = useState(false);
    const [earDownloading, setEarDownloading] = useState(null);
    const [earSelectedBandId, setEarSelectedBandId] = useState('peak1');
    const stopAudio = useCallback(() => {
        if (sourceNodeRef.current) {
            try {
                sourceNodeRef.current.stop();
            }
            catch {  }
            sourceNodeRef.current.disconnect();
            sourceNodeRef.current = null;
        }
        if (activeNodeRef.current) {
            try {
                activeNodeRef.current.disconnect();
            }
            catch {  }
            activeNodeRef.current = null;
        }
        if (outputGainNodeRef.current) {
            try {
                outputGainNodeRef.current.disconnect();
            }
            catch {  }
            outputGainNodeRef.current = null;
        }
        if (analyserRef.current) {
            try {
                analyserRef.current.disconnect();
            }
            catch {  }
            analyserRef.current = null;
        }
        if (dryAnalyserRef.current) {
            try {
                dryAnalyserRef.current.disconnect();
            }
            catch {  }
            dryAnalyserRef.current = null;
        }
        liveDynGainRef.current = {};
        setPlaySource('idle');
    }, []);
    const play = useCallback(async (which) => {
        if (playSource === which) {
            stopAudio();
            return;
        }
        stopAudio();
        if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
            setPlayError('Faust ParamEQ engine is still loading — try again in a moment.');
            return;
        }
        setPlayError('');
        const ctx = ensureAudioCtx();
        if (ctx.state === 'suspended')
            await ctx.resume();
        let buffer;
        let bands;
        let outputGainDb;
        if (which === 'bench') {
            buffer = benchBuffer ?? ensureDemoBuffer(ctx);
            bands = benchBandsRef.current;
            outputGainDb = benchOutputGainRef.current;
        }
        else if (which === 'mine') {
            buffer = earBuffer ?? ensureDemoBuffer(ctx);
            bands = myBandsRef.current;
            outputGainDb = myOutputGainRef.current;
        }
        else {
            buffer = earBuffer ?? ensureDemoBuffer(ctx);
            bands = targetBandsRef.current;
            outputGainDb = 0;
        }
        const factory = { module: dspModuleRef.current, json: JSON.stringify(dspMetaRef.current), soundfiles: {} };
        let node;
        try {
            node = await generatorRef.current.createNode(ctx, dspMetaRef.current.name, factory, true, 512);
        }
        catch (err) {
            console.error('[Chapter2b] failed to build Faust ParamEQ node', err);
            setPlayError('Could not start the Faust ParamEQ engine — see console for details.');
            return;
        }
        applyBandsToNode(node, bands);
        liveDynGainRef.current = {};
        node.setOutputParamHandler?.((path, value) => {
            const bandId = LIVE_GAIN_ADDR_TO_BAND[path];
            if (bandId)
                liveDynGainRef.current[bandId] = value;
        });
        const outputGain = ctx.createGain();
        applyOutputGain(outputGain, outputGainDb, ctx);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.78;
        analyser.minDecibels = ANALYSER_MIN_DB;
        analyser.maxDecibels = ANALYSER_MAX_DB;
        const dryAnalyser = ctx.createAnalyser();
        dryAnalyser.fftSize = 2048;
        dryAnalyser.smoothingTimeConstant = 0.78;
        dryAnalyser.minDecibels = ANALYSER_MIN_DB;
        dryAnalyser.maxDecibels = ANALYSER_MAX_DB;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(node);
        src.connect(dryAnalyser);
        node.connect(outputGain);
        outputGain.connect(analyser);
        analyser.connect(ctx.destination);
        src.start();
        sourceNodeRef.current = src;
        activeNodeRef.current = node;
        outputGainNodeRef.current = outputGain;
        analyserRef.current = analyser;
        dryAnalyserRef.current = dryAnalyser;
        setPlaySource(which);
    }, [playSource, stopAudio, engineStatus, benchBuffer, earBuffer, ensureAudioCtx, ensureDemoBuffer]);
    useEffect(() => {
        if (playSource === 'bench' && activeNodeRef.current)
            applyBandsToNode(activeNodeRef.current, benchBands);
    }, [benchBands, playSource]);
    useEffect(() => {
        if (playSource === 'bench' && outputGainNodeRef.current)
            applyOutputGain(outputGainNodeRef.current, benchOutputGain, audioCtxRef.current);
    }, [benchOutputGain, playSource]);
    useEffect(() => {
        if (playSource === 'mine' && outputGainNodeRef.current)
            applyOutputGain(outputGainNodeRef.current, myOutputGain, audioCtxRef.current);
    }, [myOutputGain, playSource]);
    useEffect(() => {
        if (playSource === 'mine' && activeNodeRef.current)
            applyBandsToNode(activeNodeRef.current, myBands);
    }, [myBands, playSource]);
    const handleTabChange = useCallback((next) => {
        stopAudio();
        setTab(next);
    }, [stopAudio]);
    useEffect(() => () => {
        try {
            sourceNodeRef.current?.stop();
        }
        catch {  }
        sourceNodeRef.current?.disconnect();
        try {
            activeNodeRef.current?.disconnect();
        }
        catch {  }
        outputGainNodeRef.current?.disconnect();
        analyserRef.current?.disconnect();
        dryAnalyserRef.current?.disconnect();
        audioCtxRef.current?.close();
    }, []);
    const handleBenchUploadClick = useCallback(() => { benchFileInputRef.current?.click(); }, []);
    const handleBenchFileSelected = useCallback(async (e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length === 0)
            return;
        stopAudio();
        setBenchUploadError('');
        setBenchDecoding(true);
        try {
            const ctx = ensureAudioCtx();
            if (ctx.state === 'suspended')
                await ctx.resume();
            const newTracks = [];
            let failures = 0;
            for (const file of files) {
                try {
                    const arrayBuf = await file.arrayBuffer();
                    const decoded = await ctx.decodeAudioData(arrayBuf);
                    newTracks.push({
                        id: ++benchUploadIdSeqRef.current,
                        name: file.name.replace(/\.[^/.]+$/, ''),
                        buffer: decoded,
                    });
                }
                catch (err) {
                    console.error('Failed to decode audio file', file.name, err);
                    failures++;
                }
            }
            if (newTracks.length > 0) {
                setBenchTracks(prev => [...prev, ...newTracks]);
                const last = newTracks[newTracks.length - 1];
                setBenchActiveTrackId(last.id);
                setBenchBuffer(last.buffer);
                setBenchFileName(last.name);
            }
            if (failures > 0) {
                setBenchUploadError(newTracks.length > 0
                    ? `${failures} file${failures > 1 ? 's' : ''} could not be read — try mp3, wav, or m4a.`
                    : 'Could not read that file — try an mp3, wav, or m4a.');
            }
        }
        finally {
            setBenchDecoding(false);
        }
    }, [stopAudio, ensureAudioCtx]);
    const handleBenchSelectTrack = useCallback((id) => {
        stopAudio();
        setBenchActiveTrackId(id);
        if (id === null) {
            setBenchBuffer(null);
            setBenchFileName('');
            return;
        }
        const track = benchTracks.find(t => t.id === id);
        if (track) {
            setBenchBuffer(track.buffer);
            setBenchFileName(track.name);
        }
    }, [stopAudio, benchTracks]);
    const handleBenchReset = useCallback(() => {
        stopAudio();
        setBenchBands(DEFAULT_BANDS);
        setBenchOutputGain(0);
    }, [stopAudio]);
    const handleBenchDownload = useCallback(async () => {
        if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
            setPlayError('Faust ParamEQ engine is still loading — try again in a moment.');
            return;
        }
        setBenchDownloading(true);
        setPlayError('');
        try {
            const ctx = ensureAudioCtx();
            const source = benchBuffer ?? ensureDemoBuffer(ctx);
            const rendered = await renderParamEQOffline(generatorRef.current, dspMetaRef.current, dspModuleRef.current, source, benchBands, benchOutputGain);
            const blob = audioBufferToWavBlob(rendered);
            downloadBlob(blob, `${benchFileName || 'paramEQ-test-bench'}-eq.wav`);
        }
        catch (err) {
            console.error('[Chapter2b] offline render failed', err);
            setPlayError('Could not render the audio for download — see console for details.');
        }
        finally {
            setBenchDownloading(false);
        }
    }, [engineStatus, benchBuffer, benchBands, benchOutputGain, benchFileName, ensureAudioCtx, ensureDemoBuffer]);
    const handleEarUploadClick = useCallback(() => { earFileInputRef.current?.click(); }, []);
    const handleEarFileSelected = useCallback(async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file)
            return;
        stopAudio();
        setEarUploadError('');
        setEarDecoding(true);
        try {
            const ctx = ensureAudioCtx();
            if (ctx.state === 'suspended')
                await ctx.resume();
            const arrayBuf = await file.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arrayBuf);
            setEarBuffer(decoded);
            setEarFileName(file.name.replace(/\.[^/.]+$/, ''));
            setTargetPreset(pickRandomPreset());
            setMyBands(DEFAULT_BANDS);
            setRevealed(false);
            setSubmitted(false);
            setHintUsed(false);
        }
        catch (err) {
            console.error('Failed to decode audio file', err);
            setEarUploadError('Could not read that file — try an mp3, wav, or m4a.');
        }
        finally {
            setEarDecoding(false);
        }
    }, [stopAudio, ensureAudioCtx]);
    const handleEarReset = useCallback(() => {
        stopAudio();
        setMyBands(DEFAULT_BANDS);
        setMyOutputGain(0);
        setTargetPreset(pickRandomPreset());
        setRevealed(false);
        setSubmitted(false);
        setHintUsed(false);
    }, [stopAudio]);
    const handleEarSubmit = useCallback(() => {
        stopAudio();
        setRevealed(true);
        setSubmitted(true);
    }, [stopAudio]);
    const handleEarHint = useCallback(() => {
        setRevealed(true);
        setHintUsed(true);
    }, []);
    const handleEarDownload = useCallback(async (which) => {
        if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
            setPlayError('Faust ParamEQ engine is still loading — try again in a moment.');
            return;
        }
        setEarDownloading(which);
        setPlayError('');
        try {
            const ctx = ensureAudioCtx();
            const source = earBuffer ?? ensureDemoBuffer(ctx);
            const bands = which === 'mine' ? myBands : targetBands;
            const outputGainDb = which === 'mine' ? myOutputGain : 0;
            const rendered = await renderParamEQOffline(generatorRef.current, dspMetaRef.current, dspModuleRef.current, source, bands, outputGainDb);
            const blob = audioBufferToWavBlob(rendered);
            downloadBlob(blob, `paramEQ-${which}.wav`);
        }
        catch (err) {
            console.error('[Chapter2b] offline render failed', err);
            setPlayError('Could not render the audio for download — see console for details.');
        }
        finally {
            setEarDownloading(null);
        }
    }, [engineStatus, earBuffer, myBands, targetBands, myOutputGain, ensureAudioCtx, ensureDemoBuffer]);
    const rms = curveRMSErrorDB(myBands, targetBands);
    const score = scoreFromRMS(rms);
    const scoreColor = score >= 90 ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--red)';
    const bandDiagnostics = BAND_DEFS.map(def => {
        const f = getFreq(targetBands, def);
        const t = totalResponseDB(targetBands, f);
        const u = totalResponseDB(myBands, f);
        const diff = u - t;
        const color = Math.abs(diff) < 1.5 ? 'var(--green)' : Math.abs(diff) < 4 ? 'var(--amber)' : 'var(--red)';
        const acc = clamp(1 - Math.abs(diff) / 10, 0, 1);
        return { def, diff, color, acc };
    });
    const engineBadge = {
        idle: { bg: 'var(--surface)', border: 'var(--border)', fg: 'var(--text-faint)', text: '○ IDLE' },
        loading: { bg: 'rgba(245,166,35,0.15)', border: 'rgba(245,166,35,0.4)', fg: 'var(--amber)', text: '◌ LOADING DSP…' },
        ready: { bg: 'rgba(45,212,191,0.15)', border: 'rgba(45,212,191,0.4)', fg: 'var(--teal)', text: '● FAUST WASM' },
        error: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', fg: '#EF4444', text: '✕ ENGINE ERROR' },
    };
    const eb = engineBadge[engineStatus];
    const engineReady = engineStatus === 'ready';
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code !== 'Space')
                return;
            const target = e.target;
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable)
                return;
            e.preventDefault();
            if (playSource !== 'idle') {
                stopAudio();
            }
            else if (engineReady) {
                void play(tab === 'bench' ? 'bench' : 'target');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [playSource, engineReady, tab, play, stopAudio]);
    return (<div className="chapter-lab eq-lab">
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--purple-dim)', borderColor: 'rgba(167,139,250,0.4)' }}>
            〰
          </div>
          <div>
            <div className="lab-name">ParamEQ</div>
            <div className="lab-subtitle">8-BAND PARAMETRIC · FAUST WASM</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button className="btn-secondary" onClick={() => (playSource !== 'idle' ? stopAudio() : play(tab === 'bench' ? 'bench' : 'target'))} disabled={!engineReady} title={engineReady ? '' : 'Loading Faust ParamEQ engine…'} style={{
                fontSize: '0.65rem',
                padding: '0.4rem 0.9rem',
                fontWeight: 600,
                borderColor: playSource !== 'idle' ? 'var(--red)' : 'var(--blue)',
                color: playSource !== 'idle' ? 'var(--red)' : 'var(--blue)',
                background: playSource !== 'idle' ? 'var(--red-dim)' : 'var(--blue-dim)',
            }}>
            {playSource !== 'idle' ? '■ STOP' : '▶ PLAY'}
          </button>
          {tab === 'bench' && (<>
              <input ref={benchFileInputRef} type="file" accept="audio/*" multiple onChange={handleBenchFileSelected} style={{ display: 'none' }}/>
              <button className="btn-secondary" onClick={handleBenchUploadClick} disabled={benchDecoding} title="Upload one or more audio files — pick multiple in the file dialog to load them all" style={{
                fontSize: '0.65rem',
                padding: '0.4rem 0.8rem',
                fontWeight: 600,
                borderColor: 'rgba(167,139,250,0.5)',
                color: 'var(--purple)',
                background: 'rgba(167,139,250,0.1)',
            }}>
                {benchDecoding ? '⏳ Decoding…' : '⬆ Upload Audio'}
              </button>
              {benchUploadError && <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{benchUploadError}</span>}
            </>)}
          <span className="badge" style={{ background: eb.bg, borderColor: eb.border, color: eb.fg, fontFamily: 'var(--font-mono)', fontSize: '0.55rem', letterSpacing: '0.06em' }}>
            {eb.text}
          </span>
          <div className="lab-status" style={{ color: 'var(--purple)' }}>
            <div className="status-dot" style={{ background: 'var(--purple)', boxShadow: '0 0 6px var(--purple)' }}/>
            {tab === 'bench' ? 'TEST BENCH' : (submitted ? `SCORE: ${score}%` : 'MATCHING')}
          </div>
        </div>
      </div>

      {engineStatus === 'error' && (<div className="concept-callout" style={{ background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)', margin: '1rem 1.25rem 0' }}>
          <strong style={{ color: '#EF4444' }}>Failed to load Faust ParamEQ DSP:</strong> {engineError}
          <br />
          Check that <code>dsp-module.wasm</code> and <code>dsp-meta.json</code> are present at{' '}
          <code>public/faust/ParamEQ/</code>.
        </div>)}

      <div className="eq-tabrow" style={{ padding: '0.55rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <Tabs className="eq-mode-tabs" variant="segmented" size="sm" items={EQ_TABS} value={tab} onChange={handleTabChange} ariaLabel="Equalizer mode" idPrefix="eq-mode"/>
      </div>

      <TabPanel idPrefix="eq-mode" value={tab} index={EQ_TABS.findIndex((t) => t.id === tab)}>

      {tab === 'bench' && benchTracks.length > 0 && (<div style={{
                display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center',
                padding: '0.5rem 1rem 0',
            }}>
          <span style={{ fontSize: '0.55rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
            SOURCE:
          </span>
          <button onClick={() => handleBenchSelectTrack(null)} title="Built-in demo loop" style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem',
                background: benchActiveTrackId === null ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
                border: `1px solid ${benchActiveTrackId === null ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
                borderRadius: '3px', color: benchActiveTrackId === null ? 'var(--purple)' : 'var(--text-dim)',
                fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}>
            🎵 Demo Loop
          </button>
          {benchTracks.map(track => {
                const active = benchActiveTrackId === track.id;
                return (<button key={track.id} onClick={() => handleBenchSelectTrack(track.id)} title={track.name} style={{
                        display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem',
                        background: active ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
                        border: `1px solid ${active ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
                        borderRadius: '3px', color: active ? 'var(--purple)' : 'var(--text-dim)',
                        fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
                        cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                        maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                📁 {track.name}
              </button>);
            })}
        </div>)}

      {tab === 'bench' && (<>
          <div className="eq-body" style={{ gridTemplateColumns: '1fr' }}>
            <div className="eq-main" style={{ borderRight: 'none' }}>
              <div className="legend-row">
                <div className="legend-item"><div className="legend-line" style={{ background: 'var(--blue)' }}/>YOUR CURVE (DRAG NODES)</div>
                <div className="legend-item"><div className="legend-line" style={{ background: 'var(--text-faint)', height: '1px' }}/>FLAT (0 dB)</div>
                {playSource === 'bench' && (<>
                    <div className="legend-item">
                      <div className="legend-line" style={{ background: `repeating-linear-gradient(90deg, ${originalLineColor} 0 2px, transparent 2px 4px)` }}/>
                      ORIGINAL (PRE-EQ)
                    </div>
                    <div className="legend-item">
                      <div className="legend-line" style={{ background: '#FF4D6A' }}/>
                      LIVE SIGNAL (POST-EQ)
                    </div>
                  </>)}
                {BAND_DEFS.some(def => getDynamicOn(benchBands, def)) && (<>
                    <div className="legend-item">
                      <div className="legend-line" style={{ background: 'repeating-linear-gradient(90deg, var(--teal) 0 5px, transparent 5px 9px)' }}/>
                      DYNAMIC RANGE (ONLY AUDIBLE PAST THRESHOLD, DURING PLAYBACK)
                    </div>
                    {playSource === 'bench' && (<div className="legend-item">
                        <div className="legend-line" style={{ background: grBoostGradient }}/>
                        LIVE GR/BOOST (EACH BAND'S OWN COLOR, WHILE IT'S ACTUALLY MOVING)
                      </div>)}
                  </>)}
              </div>

              <EqualizerEditorPanel bands={benchBands} setBands={setBenchBands} analyserRef={analyserRef} dryAnalyserRef={dryAnalyserRef} analyserActive={playSource === 'bench'} sampleRate={sampleRate} outputGainDb={benchOutputGain} setOutputGainDb={setBenchOutputGain} selectedBandId={benchSelectedBandId} setSelectedBandId={setBenchSelectedBandId} liveDynGainRef={liveDynGainRef} liveDynGainActive={playSource === 'bench'}/>

              <div className="canvas-label" style={{ margin: '1rem 0 0.5rem' }}>QUICK PRESETS</div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {EQ_PRESETS.map(p => (<button key={p.name} className="btn-secondary" style={{ fontSize: '0.6rem', padding: '0.35rem 0.6rem' }} onClick={() => setBenchBands(applyPreset(DEFAULT_BANDS, p))}>
                    {p.name}
                  </button>))}
              </div>
            </div>
          </div>

          <div className="lab-footer">
            <div className="hint-text">
              {playError
                ? <span style={{ color: '#EF4444' }}>{playError}</span>
                : <>Drag nodes on the curve, then <strong style={{ color: 'var(--blue)', margin: '0 0.25rem' }}>Play</strong> to hear it.</>}
            </div>
            <div className="btn-row">
              <button className="btn-secondary" onClick={handleBenchReset}>Reset</button>
              <button className="btn-secondary" onClick={() => play('bench')} disabled={!engineReady} title={engineReady ? '' : 'Loading Faust ParamEQ engine…'} style={playSource === 'bench' ? { borderColor: 'var(--blue)', color: 'var(--blue)' } : {}}>
                {playSource === 'bench' ? '⏸ Stop' : '▶ Play'}
              </button>
              <button className="btn-primary" onClick={handleBenchDownload} disabled={benchDownloading || !engineReady}>
                {benchDownloading ? 'Rendering…' : '⬇ Download EQ\'d Audio'}
              </button>
            </div>
          </div>
        </>)}

      {tab === 'ear' && (<>
          <div className="eq-body">
            <div className="eq-main">
              <div className="legend-row">
                <div className="legend-item">
                  <div className="legend-line" style={{ background: revealed ? 'var(--amber)' : 'var(--text-faint)', opacity: revealed ? 1 : 0.4 }}/>
                  {revealed ? 'TARGET CURVE' : 'TARGET (HIDDEN)'}
                </div>
                <div className="legend-item"><div className="legend-line" style={{ background: 'var(--blue)' }}/>YOUR EQ</div>
                {(playSource === 'mine' || playSource === 'target') && (<>
                    <div className="legend-item">
                      <div className="legend-line" style={{ background: `repeating-linear-gradient(90deg, ${originalLineColor} 0 2px, transparent 2px 4px)` }}/>
                      ORIGINAL (PRE-EQ)
                    </div>
                    <div className="legend-item">
                      <div className="legend-line" style={{ background: '#FF4D6A' }}/>
                      LIVE SIGNAL (POST-EQ)
                    </div>
                  </>)}
                {BAND_DEFS.some(def => getDynamicOn(myBands, def)) && (<>
                    <div className="legend-item">
                      <div className="legend-line" style={{ background: 'repeating-linear-gradient(90deg, var(--teal) 0 5px, transparent 5px 9px)' }}/>
                      DYNAMIC RANGE (ONLY AUDIBLE PAST THRESHOLD, DURING PLAYBACK)
                    </div>
                    {(playSource === 'mine' || playSource === 'target') && (<div className="legend-item">
                        <div className="legend-line" style={{ background: grBoostGradient }}/>
                        LIVE GR/BOOST (EACH BAND'S OWN COLOR, WHILE IT'S ACTUALLY MOVING)
                      </div>)}
                  </>)}
              </div>

              <EqualizerEditorPanel bands={myBands} setBands={setMyBands} targetBands={targetBands} showTarget={revealed} analyserRef={analyserRef} dryAnalyserRef={dryAnalyserRef} analyserActive={playSource === 'mine' || playSource === 'target'} sampleRate={sampleRate} outputGainDb={myOutputGain} setOutputGainDb={setMyOutputGain} selectedBandId={earSelectedBandId} setSelectedBandId={setEarSelectedBandId} liveDynGainRef={liveDynGainRef} liveDynGainActive={playSource === 'mine' || playSource === 'target'} liveDynGainTarget={playSource === 'target' ? 'target' : 'bands'}/>
            </div>

            <div className="eq-sidebar">
              {submitted && (<div className="score-ring-wrap">
                  <div className="score-ring" style={{ background: `conic-gradient(${scoreColor} 0% ${score}%, var(--surface) ${score}% 100%)` }}>
                    <div className="score-ring-inner">
                      <div className="score-num" style={{ color: scoreColor }}>{score}</div>
                      <div className="score-lbl">SCORE</div>
                    </div>
                  </div>
                  <div className="score-label">CURVE MATCH ACCURACY</div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>
                    TARGET WAS: {targetPreset.name}
                  </div>
                  {hintUsed && <div style={{ fontSize: '0.55rem', color: 'var(--red)', fontFamily: 'var(--font-mono)', marginTop: '0.2rem' }}>HINT USED</div>}
                </div>)}

              {submitted && (<div className="band-analysis">
                  <div className="canvas-label">BAND ACCURACY (AT TARGET FREQ)</div>
                  {bandDiagnostics.map(({ def, diff, color, acc }) => (<div className="band-item" key={def.id}>
                      <div className="band-name">{def.short}</div>
                      <div className="band-bar-track"><div className="band-bar-fill" style={{ width: `${acc * 100}%`, background: color }}/></div>
                      <div className="band-diff" style={{ color }}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}</div>
                    </div>))}
                </div>)}

              <input ref={earFileInputRef} type="file" accept="audio/*" onChange={handleEarFileSelected} style={{ display: 'none' }}/>
              <button className="btn-secondary" onClick={handleEarUploadClick} disabled={earDecoding} style={{ fontSize: '0.68rem' }}>
                {earDecoding ? '⏳ Decoding…' : (earBuffer ? `📁 ${earFileName}` : '+ Use My Own Audio')}
              </button>
              {earUploadError && <span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{earUploadError}</span>}

              {!submitted && !revealed && (<button className="btn-secondary" onClick={handleEarHint} style={{ fontSize: '0.7rem', borderColor: 'rgba(245,166,35,0.3)', color: 'var(--amber)' }}>
                  👁 Show Target Curve (reveals answer)
                </button>)}
            </div>
          </div>

          <div className="lab-footer">
            <div className="hint-text">
              {playError
                ? <span style={{ color: '#EF4444' }}>{playError}</span>
                : submitted
                    ? (score >= 90
                        ? <span style={{ color: 'var(--green)' }}>✓ Excellent ear! Orange curve shows the target.</span>
                        : 'Orange curve shows the target shape. Retry to improve.')
                    : <>Press <strong style={{ color: 'var(--amber)', margin: '0 0.25rem' }}>Hear Target / Mine</strong> — tap again to switch and drag until they match.</>}
            </div>
            <div className="btn-row">
              <button className="btn-secondary" onClick={handleEarReset}>Reset</button>
              <button className="btn-secondary" onClick={() => play(playSource === 'target' ? 'mine' : 'target')} disabled={!engineReady} title={engineReady ? '' : 'Loading Faust ParamEQ engine…'} style={playSource === 'target' ? { borderColor: 'var(--amber)', color: 'var(--amber)' }
                : playSource === 'mine' ? { borderColor: 'var(--blue)', color: 'var(--blue)' }
                    : {}}>
                {playSource === 'target' ? '⏸ Target · Tap for Mine'
                : playSource === 'mine' ? '⏸ Mine · Tap for Target'
                    : '▶ Hear Target / Mine'}
              </button>
              <button className="btn-secondary" onClick={stopAudio} disabled={playSource === 'idle'}>
                ■ Stop
              </button>
              <button className="btn-secondary" onClick={() => handleEarDownload('target')} disabled={earDownloading !== null || !engineReady}>
                {earDownloading === 'target' ? 'Rendering…' : '⬇ Target WAV'}
              </button>
              <button className="btn-secondary" onClick={() => handleEarDownload('mine')} disabled={earDownloading !== null || !engineReady}>
                {earDownloading === 'mine' ? 'Rendering…' : '⬇ Mine WAV'}
              </button>
              <button className="btn-primary" onClick={handleEarSubmit} disabled={submitted && score >= 90}>
                {submitted && score >= 90 ? '✓ Passed →' : 'Submit Score →'}
              </button>
            </div>
          </div>
        </>)}
      </TabPanel>
    </div>);
}
