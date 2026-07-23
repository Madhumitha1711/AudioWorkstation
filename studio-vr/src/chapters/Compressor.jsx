import { useRef, useState, useEffect, useCallback } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { compileFaustWasm } from '../faust/faustTypes';
import { downloadAudioBufferAsWav } from '../audio/wavRender';
import {
    BAND_IDS, BAND_LABELS, KNOBS,
    DEFAULT_BAND, makeDefaultBands, DEFAULT_CROSSOVER, DEFAULT_SIDECHAIN, DEFAULT_OUTPUT_GAIN, DEFAULT_MULTIBAND,
    ADDR, pushFaustParams, connectMainAndSidechain, applyCompression,
    METER_FLOOR_DB, LEVEL_ATTACK_S, LEVEL_RELEASE_S, levelBallistic,
    GR_READOUT_TAU_S, grReadoutSmooth, GR_METER_MAX_DB, analyserPeakDb,
} from './compressorEngine';
// ── Types ─────────────────────────────────────────────────────────────────────
// v2: the Faust patch is now a 4-band multiband compressor with internal/
// external sidechain detection (public/faust/compressor/compressor.dsp).
// Each band gets its own full compressor; three crossover points split the
// signal into Low / Low-Mid / High-Mid / High.
// An uploaded audio track that can be used as the signal source in the
// Compressor Studio (free play / learning).
// The main signal source is always the drum loop or one uploaded track (see
// UploadedTrack above). The sidechain source is independently selectable —
// 'none' mirrors whatever the main source is (self-sidechain), 'synth' is
// the built-in drum loop even when it isn't the main source, or a specific
// uploaded track id, so External Sidechain can genuinely duck one track off
// a different one (e.g. a kick loop ducking an uploaded bass/pad track).
// BAND_IDS/BAND_LABELS/KNOBS (incl. the segmented Attack/Release mapping),
// the per-band defaults, crossover/sidechain/output-gain/multiband defaults,
// the Faust ADDR map, pushFaustParams, and connectMainAndSidechain all now
// live in ./compressorEngine (see CompressorEditorPanel below for the shared
// editor UI built on top of them).
// ── Faust compressor engine wiring ───────────────────────────────────────────
// Real DSP: public/faust/compressor/ (dsp-module.wasm + dsp-meta.json), a
// 4-band multiband compressor with sidechain detection (compressors.lib
// soft-knee engine, same math as before, now instantiated per band). Two
// audio inputs: channel 0 is the main signal, channel 1 is the sidechain
// detector input — see the ChannelMergerNode wiring in startAudio() below.
const FAUST_BASE_PATH = '/faust/compressor';
// Renders an uploaded track through the same Faust compressor patch offline
// (an OfflineAudioContext instead of a live one), so it can be exported as a
// WAV — mirrors the live graph in startAudio() but with no meters/scheduler.
// `sidechainBuffer` is optional: pass a different track's buffer to render
// with a genuine external sidechain, or omit it to mirror `source` (matches
// "Same as main" / the built-in drum loop, which can't be rendered offline
// here without a dedicated offline scheduler).
async function renderCompressorOffline(generator, meta, dspModule, source, sidechainBuffer, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled) {
    const offlineCtx = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate);
    const factory = { module: dspModule, json: JSON.stringify(meta), soundfiles: {} };
    const node = await generator.createNode(offlineCtx, meta.name, factory, false, 512);
    pushFaustParams(node, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled);
    const mainSrc = offlineCtx.createBufferSource();
    mainSrc.buffer = source;
    const scSrc = offlineCtx.createBufferSource();
    scSrc.buffer = sidechainBuffer ?? source;
    scSrc.loop = true; // covers the full render even if the sidechain clip is shorter than the main one
    connectMainAndSidechain(offlineCtx, mainSrc, scSrc, node);
    node.connect(offlineCtx.destination);
    mainSrc.start();
    scSrc.start();
    return offlineCtx.startRendering();
}
// ── HiDPI canvas helper ───────────────────────────────────────────────────────
function hiDpi(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || canvas.width;
    const H = canvas.clientHeight || canvas.height;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx)
        return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W, H };
}
// ── Canvas: main transfer function ────────────────────────────────────────────
// Input axis stays -60..0 dB (that's the useful signal range coming in), but
// the output axis gets extra headroom above 0 dB — Makeup Gain (up to +24 dB)
// pushes the curve above unity, and without that headroom the makeup-shifted
// curve would just clip off the top of the graph and look like nothing
// happened. Shows the currently-selected band's curve only — each band has
// its own independent threshold/ratio/knee/makeup.
function drawTransfer(canvas, params) {
    const hd = hiDpi(canvas);
    if (!hd)
        return;
    const { ctx, W, H } = hd;
    const IN_MIN = -60, IN_MAX = 0;
    const OUT_MIN = -60, OUT_MAX = 24;
    const toX = (db) => ((db - IN_MIN) / (IN_MAX - IN_MIN)) * W;
    const toY = (db) => H - ((db - OUT_MIN) / (OUT_MAX - OUT_MIN)) * H;
    ctx.fillStyle = '#0D0D0F';
    ctx.fillRect(0, 0, W, H);
    // Grid — vertical lines follow the input axis, horizontal lines the output axis
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let db = IN_MIN; db <= IN_MAX; db += 10) {
        ctx.beginPath();
        ctx.moveTo(toX(db), 0);
        ctx.lineTo(toX(db), H);
        ctx.stroke();
    }
    for (let db = Math.ceil(OUT_MIN / 12) * 12; db <= OUT_MAX; db += 12) {
        ctx.beginPath();
        ctx.moveTo(0, toY(db));
        ctx.lineTo(W, toY(db));
        ctx.stroke();
    }
    // dB axis tick labels — input along the bottom, output along the left edge
    ctx.fillStyle = '#6A6A7A';
    ctx.font = '9px "JetBrains Mono", monospace';
    for (let db = IN_MIN; db <= IN_MAX; db += 10) {
        ctx.fillText(`${db}`, toX(db) + 2, H - 2);
    }
    for (let db = Math.ceil(OUT_MIN / 12) * 12; db <= OUT_MAX; db += 12) {
        ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 2, toY(db) - 2);
    }
    // Unity line (input == output, no makeup)
    ctx.strokeStyle = '#2E2E3D';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(toX(IN_MIN), toY(IN_MIN));
    ctx.lineTo(toX(IN_MAX), toY(IN_MAX));
    ctx.stroke();
    ctx.setLineDash([]);
    // Threshold marker
    ctx.strokeStyle = '#3D3D52';
    ctx.setLineDash([2, 3]);
    const tx = toX(params.threshold);
    ctx.beginPath();
    ctx.moveTo(tx, 0);
    ctx.lineTo(tx, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#8A8A9A';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('THRESH', tx + 3, H - 5);
    // Stroke (+ optional fill under the curve itself). The drawn curve is
    // compression (threshold/ratio/knee) PLUS Makeup Gain added on top —
    // Makeup Gain doesn't change the *shape* Faust applies (that's the
    // ratio/knee/threshold curve, unchanged), it just lifts the whole thing
    // vertically. No separate shaded region is drawn for the makeup portion.
    const curve = (p, stroke, fillAlpha) => {
        const shapedDb = (db) => applyCompression(db, p) + p.makeup;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2.5;
        if (fillAlpha > 0) {
            ctx.fillStyle = stroke.replace(')', `,${fillAlpha})`).replace('rgb', 'rgba');
            ctx.beginPath();
            let first = true;
            for (let db = IN_MIN; db <= IN_MAX; db += 0.5) {
                const x = toX(db), y = toY(shapedDb(db));
                first ? (ctx.moveTo(x, H), ctx.lineTo(x, y), (first = false)) : ctx.lineTo(x, y);
            }
            ctx.lineTo(toX(IN_MAX), H);
            ctx.closePath();
            ctx.fill();
        }
        ctx.beginPath();
        let first2 = true;
        for (let db = IN_MIN; db <= IN_MAX; db += 0.5) {
            const x = toX(db), y = toY(shapedDb(db));
            first2 ? (ctx.moveTo(x, y), (first2 = false)) : ctx.lineTo(x, y);
        }
        ctx.stroke();
    };
    curve(params, 'rgb(167,139,250)', 0.08);
    // Operating point crosshairs (example input: 12 dB above threshold)
    const exampleInput = Math.min(-1, params.threshold + 12);
    const exampleOutput = applyCompression(exampleInput, params) + params.makeup;
    const px = toX(exampleInput);
    const py = toY(exampleOutput);
    ctx.strokeStyle = 'rgba(167,139,250,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, H);
    ctx.stroke(); // vertical
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(px, py);
    ctx.stroke(); // horizontal
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(167,139,250,0.9)';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    // Labels
    ctx.fillStyle = '#8A8A9A';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('INPUT (dB) →', W - 82, H - 5);
    ctx.save();
    ctx.translate(11, H * 0.38);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('↑ OUT (dB)', 0, 0);
    ctx.restore();
}
// ── Canvas: live compression scope ───────────────────────────────────────────
// A separate, dedicated analyzer (not drawn into the transfer-function
// graph above) that answers the thing a static transfer curve can't: what do
// ATTACK and RELEASE actually *do* to the signal over time? It scrolls the
// real, smoothed broadband input/output level across a fixed time window,
// and shades the gap between the input trace and "input minus the selected
// band's real gain reduction" — that reduction number comes straight off the
// Faust patch's own Gain_Reduction meter for that band (see
// setOutputParamHandler in startAudio), not an estimate, so it's exact for
// whichever band is selected even though 4 bands are summing into the one
// broadband output trace.
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB = -54;
const SCOPE_MAX_DB = 12;
function drawCompressorScope(canvas, history, nowT, thresholdDb, showThreshold) {
    const hd = hiDpi(canvas);
    if (!hd)
        return;
    const { ctx, W, H } = hd;
    const toY = (db) => H - ((Math.min(SCOPE_MAX_DB, Math.max(SCOPE_MIN_DB, db)) - SCOPE_MIN_DB) / (SCOPE_MAX_DB - SCOPE_MIN_DB)) * H;
    const toX = (t) => ((t - (nowT - SCOPE_WINDOW_S)) / SCOPE_WINDOW_S) * W;
    ctx.fillStyle = '#0D0D0F';
    ctx.fillRect(0, 0, W, H);
    // dB grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6A6A7A';
    ctx.font = '9px "JetBrains Mono", monospace';
    for (let db = -48; db <= SCOPE_MAX_DB; db += 12) {
        const y = toY(db);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 3, y - 2);
    }
    // 0 dB reference
    ctx.strokeStyle = '#2E2E3D';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    const y0 = toY(0);
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(W, y0);
    ctx.stroke();
    ctx.setLineDash([]);
    if (showThreshold) {
        ctx.strokeStyle = 'rgba(245,166,35,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        const ty = toY(thresholdDb);
        ctx.beginPath();
        ctx.moveTo(0, ty);
        ctx.lineTo(W, ty);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(245,166,35,0.8)';
        ctx.fillText('THRESH', W - 42, ty - 3);
    }
    const visible = history.filter(p => p.t >= nowT - SCOPE_WINDOW_S - 0.25);
    if (visible.length < 2)
        return;
    const inPts = visible.map(p => ({ x: toX(p.t), y: toY(p.inputDb) }));
    const outPts = visible.map(p => ({ x: toX(p.t), y: toY(p.outputDb) }));
    // Reference line: input minus the selected band's real gain reduction —
    // exact, not backed-out from the (4-band-summed) output.
    const afterBandGrPts = visible.map(p => ({ x: toX(p.t), y: toY(p.inputDb - p.grDb) }));
    const fillBetween = (top, bottom, color, alpha) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(top[0].x, top[0].y);
        for (const p of top.slice(1))
            ctx.lineTo(p.x, p.y);
        for (let i = bottom.length - 1; i >= 0; i--)
            ctx.lineTo(bottom[i].x, bottom[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    };
    // Gain-reduction gap for the selected band — shrinks to nothing as that
    // band's Threshold goes up, or when its Bypass is on.
    fillBetween(inPts, afterBandGrPts, '#FF4D6A', 0.22);
    // Input trace (broadband, pre-compression)
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#00FF87';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(inPts[0].x, inPts[0].y);
    for (const p of inPts.slice(1))
        ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
    // Output trace (broadband, post-compression — what actually reaches the ear)
    ctx.strokeStyle = '#A78BFA';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(outPts[0].x, outPts[0].y);
    for (const p of outPts.slice(1))
        ctx.lineTo(p.x, p.y);
    ctx.stroke();
}
// ── Knob helpers ──────────────────────────────────────────────────────────────
// Linear by default; a spec with toFrac/fromFrac (Attack/Release) overrides
// this with its own segmented mapping instead.
function specToFrac(spec, v) {
    if (spec.toFrac)
        return spec.toFrac(v);
    return (v - spec.min) / (spec.max - spec.min);
}
function specFromFrac(spec, f) {
    if (spec.fromFrac)
        return spec.fromFrac(f);
    return spec.min + f * (spec.max - spec.min);
}
function knobRotationForSpec(spec, v) {
    return -140 + specToFrac(spec, v) * 280;
}
// Small numeric input for typing an exact knob value directly, alongside the
// knob itself — keeps its own draft text while focused so the knob's live
// value doesn't clobber what's mid-typing (e.g. typing "20" as "2" then "0").
function KnobNumberInput({ value, min, max, step, onChange, }) {
    const decimals = step < 1 ? Math.max(0, Math.ceil(-Math.log10(step))) : 0;
    const [local, setLocal] = useState(() => value.toFixed(decimals));
    const focusedRef = useRef(false);
    useEffect(() => { if (!focusedRef.current)
        setLocal(value.toFixed(decimals)); }, [value, decimals]);
    const commit = (text) => {
        const n = parseFloat(text);
        const clamped = Number.isNaN(n) ? value : Math.min(max, Math.max(min, n));
        onChange(clamped);
        setLocal(clamped.toFixed(decimals));
    };
    return (<input type="number" className="knob-num-input" value={local} min={min} max={max} step={step} onFocus={() => { focusedRef.current = true; }} onChange={e => {
            setLocal(e.target.value);
            const n = parseFloat(e.target.value);
            if (!Number.isNaN(n))
                onChange(Math.min(max, Math.max(min, n)));
        }} onBlur={() => { focusedRef.current = false; commit(local); }} onKeyDown={e => { if (e.key === 'Enter')
        e.target.blur(); }}/>);
}
// Compact labeled range slider used for the global Crossover / Sidechain /
// Output controls, which don't warrant a full rotary knob each (there are
// six of them, and none is a "learning objective" knob the way the six main
// per-band controls are) — plain, consistent with the app's dark theme via
// the same CSS variables the rest of this file already uses inline.
function MiniSlider({ label, value, min, max, step, fmt, onChange, accent = 'var(--purple)', }) {
    return (<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
      <span style={{
            width: 96, fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--text-dim)',
            letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1.25,
        }}>
        {label}
      </span>
      <input type="range" className="mini-range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={{ ['--mini-range-accent']: accent }}/>
      <span style={{ width: 58, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '0.55rem', color: accent }}>
        {fmt(value)}
      </span>
    </div>);
}
function polarToCartesian(r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}
function describeArc(r, start, end) {
    if (Math.abs(end - start) < 0.1)
        end = start + 0.1;
    const s = polarToCartesian(r, start);
    const e = polarToCartesian(r, end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}
// ── Level ballistics ─────────────────────────────────────────────────────────
// The old vertical INPUT/G·R/OUTPUT bar meters were removed — the live
// compression scope below shows the same input/output levels (and the gain
// change between them) as motion over time, which is strictly more
// information than three static bars, so keeping both was redundant. The
// smoothed dB values (levelBallistic/grReadoutSmooth, both from
// ./compressorEngine) are computed inside CompressorEditorPanel now — the
// scope is what displays them.
// ── Drum synthesiser ──────────────────────────────────────────────────────────
const BPM = 120;
const STEP_SEC = 60 / BPM / 2;
const STEPS = 16;
const PAT_KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0];
const PAT_SNARE = [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
const PAT_HAT = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
const PAT_OPEN = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const PAT_BASS = [82, 0, 0, 0, 98, 0, 0, 0, 82, 0, 0, 0, 62, 0, 0, 0];
function noiseBuffer(ctx, dur) {
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
        d[i] = Math.random() * 2 - 1;
    return buf;
}
function synthKick(ctx, dest, time) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.06);
    g.gain.setValueAtTime(0.9, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.4);
}
function synthSnare(ctx, dest, time) {
    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(200, time);
    body.frequency.exponentialRampToValueAtTime(100, time + 0.06);
    bg.gain.setValueAtTime(0.5, time);
    bg.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    body.connect(bg);
    bg.connect(dest);
    body.start(time);
    body.stop(time + 0.15);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 0.15);
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 2200;
    filt.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.6, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    noise.connect(filt);
    filt.connect(ng);
    ng.connect(dest);
    noise.start(time);
    noise.stop(time + 0.15);
}
function synthHihat(ctx, dest, time, open = false) {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, open ? 0.3 : 0.05);
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 9000;
    const g = ctx.createGain();
    const decay = open ? 0.25 : 0.04;
    g.gain.setValueAtTime(0.22, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + decay);
    noise.connect(filt);
    filt.connect(g);
    g.connect(dest);
    noise.start(time);
    noise.stop(time + decay + 0.01);
}
function synthBass(ctx, dest, time, freq) {
    const osc = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(900, time);
    filt.frequency.exponentialRampToValueAtTime(180, time + 0.25);
    filt.Q.value = 3;
    g.gain.setValueAtTime(0.55, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.38);
    osc.connect(filt);
    filt.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.4);
}
// Peak-normalise an uploaded buffer and fade its ends slightly so the loop
// doesn't click, regardless of channel count or the source recording's level.
function normalizeUploadedBuffer(buf, peakTarget = 0.6) {
    let peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < data.length; i++)
            peak = Math.max(peak, Math.abs(data[i]));
    }
    if (peak < 1e-6)
        return;
    // Ceiling, not a target: only ever turn a hot file DOWN to avoid clipping.
    // `peakTarget / peak` alone would also turn a quiet file UP to hit 0.6,
    // baking a silent gain boost into the uploaded buffer itself — audible
    // even with the compressor bypassed, since it happens once at upload
    // time, before Bypass or any DSP ever sees the audio.
    const scale = Math.min(1, peakTarget / peak);
    const fadeSamples = Math.min(Math.round(buf.sampleRate * 0.01), Math.floor(buf.length / 2));
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < data.length; i++)
            data[i] *= scale;
        for (let i = 0; i < fadeSamples; i++) {
            const f = i / fadeSamples;
            data[i] *= f;
            data[data.length - 1 - i] *= f;
        }
    }
}
// `fullDest` gets the whole kit (kick/snare/hats/bass) — that's the "Drum
// Loop" heard as a main source. `kickDest` gets a second, isolated copy of
// just the kick hits — that's what "Kick Only" feeds the sidechain with, so
// picking it as the Sidechain Source is a genuinely different (trigger-only)
// signal from the full drum loop, not a duplicate of it.
function scheduleStep(ctx, fullDest, kickDest, step, time) {
    if (PAT_KICK[step]) {
        synthKick(ctx, fullDest, time);
        synthKick(ctx, kickDest, time);
    }
    if (PAT_SNARE[step])
        synthSnare(ctx, fullDest, time);
    if (PAT_HAT[step])
        synthHihat(ctx, fullDest, time, false);
    if (PAT_OPEN[step])
        synthHihat(ctx, fullDest, time, true);
    if (PAT_BASS[step])
        synthBass(ctx, fullDest, time, PAT_BASS[step]);
}
// ── Shared editor panel ───────────────────────────────────────────────────────
// The mode switch / band tabs / knobs / crossover / sidechain / output-gain
// controls plus the transfer-function+GR-meter and live-scope visuals — the
// exact same body the standalone Compressor Studio lab below renders, reused
// verbatim by the DAW workstation's insert-chain popup
// (../panorama/DawWorkstationScreen) instead of a generic FaustPanel/curve
// approximation. Same split as GateEditorPanel in ./NoiseGate.
//
// Host contract:
//   - bands/setBands, crossover/setCrossover, sidechain/setSidechain,
//     outputGainDb/setOutputGainDb, selectedBand/setSelectedBand,
//     multibandEnabled/setMultibandEnabled — host-owned typed state, pushed
//     onto the live Faust node by the host via pushFaustParams (see
//     ./compressorEngine) whenever it changes.
//   - bypass — host-owned; read-only here (a global bypass toggle lives in
//     the host's own topbar/chain-chip UI).
//   - isPlaying — whether the host's transport is currently running; the
//     scope/meter animation loop only runs while there's something to read.
//   - getLevels() — called once per animation frame; returns
//     { inputDb, outputDb, bandGr: { low, lowMid, highMid, high } } read off
//     the host's own analysers/Gain_Reduction outputs, or null if none are
//     live yet. bandGr values are raw (unsmoothed) dB reduction amounts
//     (0 = no reduction) — this panel does its own display-only smoothing
//     (grReadoutSmooth), same as the standalone lab always did.
//   - getNow() — returns the audio clock (ctx.currentTime) driving the
//     scope's scroll, so it stays in sync with the actual audio rather than
//     performance.now() drifting from it.
//   - sidechainSourceRow — optional extra UI (e.g. the standalone lab's
//     "pick a different track/upload for the sidechain" row) rendered above
//     the External SC / SC Listen / SC HPF controls; hosts with only one
//     audio source (like the DAW, which always self-sidechains) simply omit
//     it.
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
    const mainDragRef = useRef(null);
    // Refs mirroring the latest props, read inside the animation loop so the
    // loop's own effect doesn't need to restart every time a knob moves.
    const bandsRef = useRef(bands);
    const selectedBandRef = useRef(selectedBand);
    const bypassRef = useRef(bypass);
    useEffect(() => { bandsRef.current = bands; }, [bands]);
    useEffect(() => { selectedBandRef.current = selectedBand; }, [selectedBand]);
    useEffect(() => { bypassRef.current = bypass; }, [bypass]);
    // ── Main transfer canvas — static, only depends on the selected band's knobs ──
    useEffect(() => {
        if (transferRef.current) {
            const band = bands[selectedBand];
            // When bypassed (globally, or this band alone), draw unity line
            // (ratio=1 collapses to straight diagonal).
            const displayParams = (bypass || band.bypass) ? { ...band, threshold: 0, ratio: 1, makeup: 0 } : band;
            drawTransfer(transferRef.current, displayParams);
        }
    }, [bands, selectedBand, bypass]);
    // ── Live GR meters + compression scope ────────────────────────────────────
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
    // ── Knob drag ──────────────────────────────────────────────────────────────
    const onMainKnobDown = useCallback((e, spec, val) => {
        e.preventDefault();
        mainDragRef.current = { spec, band: selectedBand, startY: e.clientY, startFrac: specToFrac(spec, val) };
    }, [selectedBand]);
    useEffect(() => {
        const onMove = (e) => {
            const d = mainDragRef.current;
            if (!d)
                return;
            const frac = Math.min(1, Math.max(0, d.startFrac + (d.startY - e.clientY) / 220));
            const raw = specFromFrac(d.spec, frac);
            const clamped = Math.min(d.spec.max, Math.max(d.spec.min, Math.round(raw / d.spec.step) * d.spec.step));
            setBands(prev => ({ ...prev, [d.band]: { ...prev[d.band], [d.spec.key]: clamped } }));
        };
        const onUp = () => { mainDragRef.current = null; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [setBands]);
    const setSelectedBandParam = useCallback((key, v) => {
        setBands(prev => ({ ...prev, [selectedBand]: { ...prev[selectedBand], [key]: v } }));
    }, [selectedBand, setBands]);
    // Bypasses a specific band's compression (its audio still passes through,
    // unprocessed) independently of which band is currently selected for
    // editing — each band tracks its own bypass flag, so any combination of
    // bands can be bypassed at once, not just one at a time.
    const toggleBandBypass = useCallback((band) => {
        setBands(prev => ({ ...prev, [band]: { ...prev[band], bypass: !prev[band].bypass } }));
    }, [setBands]);
    const selBand = bands[selectedBand];
    // In single-band mode (Multiband off) only "low" is actually live — its
    // controls act on the whole signal (see compressor.dsp v3.1), so it reads
    // as "COMPRESSOR" rather than "LOW" everywhere in the UI.
    const bandLabel = (b) => (!multibandEnabled && b === 'low') ? 'COMPRESSOR' : BAND_LABELS[b];
    // Mode switch — Single Band vs Multiband, mutually exclusive.
    const renderModeSwitch = () => (<div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
      <button onClick={() => setMultibandEnabled(false)} title="One compressor acting on the whole signal" style={{
            flex: 1,
            padding: '0.35rem 0.5rem',
            background: !multibandEnabled ? 'rgba(0,255,135,0.13)' : 'var(--surface)',
            border: `1px solid ${!multibandEnabled ? 'rgba(0,255,135,0.5)' : 'var(--border)'}`,
            borderRadius: '3px',
            color: !multibandEnabled ? 'var(--green)' : 'var(--text-dim)',
            fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.04em',
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
            fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.04em',
            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}>
        MULTIBAND
      </button>
    </div>);
    // Band tab row — each tab is two independent controls fused into one
    // pill: the label half selects which band's knobs/transfer curve/scope/GR
    // meter are shown, the ⦸ half bypasses *that* band's compression on its
    // own.
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
                    fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                    textDecoration: byp ? 'line-through' : 'none',
                }}>
              {bandLabel(b)}
            </button>
            <button onClick={() => toggleBandBypass(b)} title={byp ? `${bandLabel(b)} is bypassed — click to re-enable` : `Bypass the ${bandLabel(b)} band (its audio still passes through, unprocessed)`} style={{
                    padding: '0.3rem 0.45rem', border: 'none', borderLeft: `1px solid ${borderColor}`,
                    background: byp ? 'rgba(255,77,106,0.16)' : 'var(--surface)',
                    color: byp ? '#FF4D6A' : 'var(--text-faint)',
                    fontFamily: 'var(--mono)', fontSize: '0.65rem',
                    cursor: 'pointer', transition: 'all 0.15s',
                }}>
              ⦸
            </button>
          </div>);
        })}
    </div>);
    return (<div className="comp-body">
      {/* Left: mode / band tabs / knobs / crossover / sidechain / output */}
      <div className="comp-controls">
        <div className="canvas-label" style={{ marginBottom: '0.5rem' }}>
          MODE
        </div>
        {renderModeSwitch()}

        <div className="canvas-label" style={{ marginBottom: '0.5rem' }}>
          BAND · DRAG KNOBS VERTICALLY
        </div>
        {renderBandTabs()}

        {/* Knobs for whichever band is selected above. */}
        <div className="knob-grid">
          {KNOBS.map(spec => {
            const val = selBand[spec.key];
            const rot = knobRotationForSpec(spec, val);
            return (<div className="knob-wrap" key={spec.key}>
                  <div style={{ position: 'relative', width: 64, height: 64 }}>
                    <svg style={{ position: 'absolute', top: 0, left: 0 }} width={64} height={64} viewBox="-32 -32 64 64">
                      <path d={describeArc(28, -140, 140)} fill="none" stroke="var(--border)" strokeWidth={3} strokeLinecap="round"/>
                      <path d={describeArc(28, -140, rot)} fill="none" stroke="var(--purple)" strokeWidth={3} strokeLinecap="round" opacity={0.85}/>
                    </svg>
                    <div className="big-knob" style={{ position: 'absolute', top: 6, left: 6, width: 52, height: 52, cursor: 'ns-resize', userSelect: 'none' }} onMouseDown={e => onMainKnobDown(e, spec, val)}>
                      <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    width: 3, height: 16, background: 'var(--text)', borderRadius: 2,
                    transformOrigin: 'bottom center',
                    transform: `translate(-50%, -100%) rotate(${rot}deg)`,
                    marginTop: -2,
                }}/>
                    </div>
                  </div>
                  <div className="knob-name">{spec.label}</div>
                  <div className="knob-val">{spec.fmt(val)}</div>
                  <KnobNumberInput value={val} min={spec.min} max={spec.max} step={spec.step} onChange={v => setSelectedBandParam(spec.key, v)}/>
                </div>);
        })}
        </div>

        {/* Crossover — 3 points splitting the signal into 4 bands. Only
            meaningful (and only sent anywhere audible) once Multiband is
            on — see compressor.dsp v3.1, where the crossover filters are
            bypassed entirely in single-band mode. */}
        <div className="canvas-label" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
          CROSSOVER
        </div>
        {multibandEnabled ? (<>
            <MiniSlider label="Low – Low-Mid" value={crossover.loLowMid} min={20} max={1000} step={1} fmt={v => `${v.toFixed(0)} Hz`} onChange={v => setCrossover(c => ({ ...c, loLowMid: v }))}/>
            <MiniSlider label="Low-Mid – High-Mid" value={crossover.lowMidHiMid} min={200} max={5000} step={1} fmt={v => `${v.toFixed(0)} Hz`} onChange={v => setCrossover(c => ({ ...c, lowMidHiMid: v }))}/>
            <MiniSlider label="High-Mid – High" value={crossover.hiMidHigh} min={500} max={20000} step={1} fmt={v => `${v.toFixed(0)} Hz`} onChange={v => setCrossover(c => ({ ...c, hiMidHigh: v }))}/>
          </>) : (<div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--text-faint)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
            One compressor, whole signal. Turn on <strong style={{ color: 'var(--green)' }}>MULTIBAND</strong> above to split into 4 bands with independent crossover points.
          </div>)}

        {/* Sidechain — internal (each band's own audio) vs external (a
            filtered detector signal fed into a second input). The picker
            for WHICH signal feeds that second input (sidechainSourceRow)
            is lab-only and supplied by the host; hosts with one audio
            source (the DAW) always self-sidechain and omit it. */}
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
        <MiniSlider label="SC HPF" value={sidechain.hpf} min={20} max={2000} step={1} fmt={v => `${v.toFixed(0)} Hz`} onChange={v => setSidechain(s => ({ ...s, hpf: v }))}/>

        {/* Output trim */}
        <div className="canvas-label" style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          OUTPUT
        </div>
        <MiniSlider label="Gain" value={outputGainDb} min={-24} max={24} step={0.1} fmt={v => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} onChange={setOutputGainDb}/>

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

      {/* Right: transfer (+ GR meter alongside) + live scope */}
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

        {/* All live bands' real gain reduction at a glance — click a label
            to jump the knob column / transfer graph / scope to that band. */}
        <div className="canvas-label" style={{ marginTop: '0.75rem', marginBottom: '0.4rem' }}>
          {multibandEnabled ? 'ALL BANDS — GAIN REDUCTION' : 'GAIN REDUCTION'}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
          {(multibandEnabled ? BAND_IDS : ['low']).map(b => (<div key={b} onClick={() => setSelectedBand(b)} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem', cursor: 'pointer' }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: '0.5rem', textAlign: 'center', letterSpacing: '0.04em',
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
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--text-faint)', marginTop: '0.35rem', lineHeight: 1.5 }}>
          Red is the real Gain_Reduction the Faust patch reports for this band — it shrinks toward nothing as Threshold rises or Bypass is on.
        </div>
      </div>
    </div>);
}
// ── Component ─────────────────────────────────────────────────────────────────
export default function Compressor() {
    // Main lab state — per-band params, the 3 crossover points, sidechain
    // detection, and one global output trim, plus which band the knob column
    // is currently editing.
    const [bands, setBands] = useState(makeDefaultBands);
    const [crossover, setCrossover] = useState(DEFAULT_CROSSOVER);
    const [sidechain, setSidechain] = useState(DEFAULT_SIDECHAIN);
    const [outputGainDb, setOutputGainDb] = useState(DEFAULT_OUTPUT_GAIN);
    const [selectedBand, setSelectedBand] = useState('low');
    // Off by default (single-band, using the Low Band controls on the whole
    // signal) — matches the Faust patch's own Multiband/Enable default. On
    // restores the 4-band crossover split.
    const [multibandEnabled, setMultibandEnabled] = useState(DEFAULT_MULTIBAND);
    const [isPlaying, setIsPlaying] = useState(false);
    const [bypass, setBypass] = useState(false);
    const [tasks, setTasks] = useState([false, false, false, false]);
    // Signal source — the built-in synth drum loop, or one of any number of
    // uploaded tracks. The sidechain source is independent of this (see
    // sidechainSourceId below); 'none' is the default and mirrors whatever
    // the main source is, matching the old self-sidechain-only behavior.
    const [uploadedTracks, setUploadedTracks] = useState([]);
    const [activeSourceId, setActiveSourceId] = useState('synth');
    const [sidechainSourceId, setSidechainSourceId] = useState('none');
    const [decoding, setDecoding] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState('');
    const fileInputRef = useRef(null);
    const sidechainFileInputRef = useRef(null);
    const uploadIdSeqRef = useRef(0);
    const activeSourceIdRef = useRef(activeSourceId);
    const sidechainSourceIdRef = useRef(sidechainSourceId);
    const uploadedTracksRef = useRef(uploadedTracks);
    const bufSourceRef = useRef(null); // main source
    const scBufSourceRef = useRef(null); // dedicated sidechain source (only when it differs from main)
    useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
    useEffect(() => { sidechainSourceIdRef.current = sidechainSourceId; }, [sidechainSourceId]);
    useEffect(() => { uploadedTracksRef.current = uploadedTracks; }, [uploadedTracks]);
    const activeTrack = activeSourceId !== 'synth' ? uploadedTracks.find(t => t.id === activeSourceId) : undefined;
    const sidechainTrack = typeof sidechainSourceId === 'number' ? uploadedTracks.find(t => t.id === sidechainSourceId) : undefined;
    // Faust compressor engine (module + meta loaded once on mount, one node
    // instantiated per AudioContext in startAudio — same pattern as
    // Chapter2b's ParamEQ).
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
                console.error('[Chapter4] failed to load Faust compressor DSP', err);
                setEngineError(err instanceof Error ? err.message : String(err));
                setEngineStatus('error');
            }
        })();
        return () => { cancelled = true; };
    }, []);
    // Audio refs
    const ctxRef = useRef(null);
    const faustNodeRef = useRef(null);
    const dryAnalRef = useRef(null);
    const wetAnalRef = useRef(null);
    const mixRef = useRef(null); // main signal bus
    const scMixRef = useRef(null); // sidechain-detector bus (may mirror mixRef)
    const drumBusRef = useRef(null); // full drum kit, feeds mix when main source is 'synth'
    const kickBusRef = useRef(null); // kick-only, feeds scMix when sidechain source is 'synth'
    const outputRef = useRef(null); // final sum before destination
    const schedulerRef = useRef(null);
    const nextNoteRef = useRef(0);
    const currentStepRef = useRef(0);
    const startTokenRef = useRef(0); // invalidates in-flight startAudio() on stop
    // Real per-band Gain_Reduction, read off the Faust patch's own hbargraph
    // outputs via setOutputParamHandler (they're read-only DSP outputs, never
    // registered as AudioParams, so getParamValue() on these addresses would
    // just return 0 — see the comment on FaustNodeLike.setOutputParamHandler).
    // Raw values are the compressor's gain in dB (≤0); stored here negated, so
    // 0 = no reduction and larger = more reduction — read by getLevels() below
    // and smoothed for display inside CompressorEditorPanel itself.
    const grRawRef = useRef({ low: 0, lowMid: 0, highMid: 0, high: 0 });
    // ── Sync Faust compressor params + bypass (single effect) ─────────────────
    useEffect(() => {
        const node = faustNodeRef.current;
        if (!node)
            return;
        pushFaustParams(node, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled);
    }, [bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled]);
    // Single-band mode only exposes the Low Band controls (see compressor.dsp
    // v3.1) — if Multiband gets switched off while a different band is
    // selected, snap the selection back to the one band that's actually live.
    useEffect(() => {
        if (!multibandEnabled)
            setSelectedBand('low');
    }, [multibandEnabled]);
    // ── Task tracking ─────────────────────────────────────────────────────────
    useEffect(() => {
        const anyBandThresholdMoved = BAND_IDS.some(b => bands[b].threshold !== DEFAULT_BAND.threshold);
        const anyBandMakeupApplied = BAND_IDS.some(b => bands[b].makeup > 0);
        const crossoverReshaped = crossover.loLowMid !== DEFAULT_CROSSOVER.loLowMid ||
            crossover.lowMidHiMid !== DEFAULT_CROSSOVER.lowMidHiMid ||
            crossover.hiMidHigh !== DEFAULT_CROSSOVER.hiMidHigh;
        setTasks([
            anyBandThresholdMoved,
            crossoverReshaped,
            sidechain.external,
            anyBandMakeupApplied,
        ]);
    }, [bands, crossover, sidechain]);
    // ── Scheduler ─────────────────────────────────────────────────────────────
    // One clock drives two independent buses: drumBus gets the full kit
    // (kick/snare/hats/bass) and kickBus gets only the kick hits. startAudio()
    // fans drumBus into mix if the main source is 'synth', and kickBus into
    // scMix if the sidechain source is 'synth' — so picking "Kick Only" as the
    // sidechain is a genuinely isolated trigger signal, not a duplicate of the
    // full drum loop heard on the main input.
    const runScheduler = useCallback(() => {
        const ctx = ctxRef.current;
        const drumBus = drumBusRef.current;
        const kickBus = kickBusRef.current;
        if (!ctx || !drumBus || !kickBus)
            return;
        while (nextNoteRef.current < ctx.currentTime + 0.1) {
            scheduleStep(ctx, drumBus, kickBus, currentStepRef.current, nextNoteRef.current);
            currentStepRef.current = (currentStepRef.current + 1) % STEPS;
            nextNoteRef.current += STEP_SEC;
        }
        schedulerRef.current = setTimeout(runScheduler, 25);
    }, []);
    // ── Levels for CompressorEditorPanel's live scope ─────────────────────────
    // Mirrors getGateLevels in ../panorama/DawWorkstationScreen: reads the dry/
    // wet analyser taps plus the raw per-band Gain_Reduction ref populated by
    // startAudio()'s setOutputParamHandler subscription. The panel itself owns
    // all display-only smoothing (levelBallistic/grReadoutSmooth) and the
    // scope-history/canvas drawing — this just supplies the raw numbers.
    const getLevels = useCallback(() => {
        const dryAnal = dryAnalRef.current;
        const wetAnal = wetAnalRef.current;
        if (!dryAnal || !wetAnal)
            return null;
        const inputDb = analyserPeakDb(dryAnal);
        const outputDb = analyserPeakDb(wetAnal);
        if (inputDb === null || outputDb === null)
            return null;
        return { inputDb, outputDb, bandGr: { ...grRawRef.current } };
    }, []);
    const getNow = useCallback(() => ctxRef.current?.currentTime ?? 0, []);
    // ── Start / Stop audio ────────────────────────────────────────────────────
    const startAudio = useCallback(async () => {
        if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current) {
            // Faust engine still loading (or failed) — the topbar status/error
            // message below covers user feedback; Play is also disabled until ready.
            return;
        }
        const myToken = ++startTokenRef.current;
        const ctx = new AudioContext();
        // mix (main bus)       → dryAnal (viz tap) ─┐
        // scMix (sidechain bus) ────────────────────┤→ 2ch merger → faustNode → wetAnal → output → destination
        // drumBus (full kit) fans into mix, kickBus (kick hits only) fans into
        // scMix — kept as two separate buses so picking "Kick Only" as the
        // Sidechain Source is a genuinely different, isolated signal rather than
        // a duplicate of the full drum loop heard on the main input. See the
        // source-resolution block further down for exactly when each connects.
        //
        // The Faust node declares 2 audio inputs (main + sidechain, see
        // compressor.dsp's process(mainIn, scIn)), which @grame/faustwasm
        // exposes as ONE AudioNode input with channelCount 2 rather than two
        // separate AudioNode inputs — so feeding it two distinct sources means
        // merging them onto one 2-channel stream with a ChannelMergerNode
        // first (connectMainAndSidechain). mix and scMix can carry genuinely
        // different signals now (Sidechain Source selector), or scMix can just
        // mirror mix ("Same as main") for the old self-sidechain behavior.
        // mix/scMix stay unity gain — no .gain.value override — since neither
        // is backed by anything in the interface (no UI control scales the
        // main or sidechain bus), so they shouldn't silently attenuate the
        // signal feeding the compressor.
        const mix = ctx.createGain();
        const scMix = ctx.createGain();
        const drumBus = ctx.createGain();
        const kickBus = ctx.createGain();
        const dryAnal = ctx.createAnalyser();
        dryAnal.fftSize = 1024;
        dryAnal.smoothingTimeConstant = 0.4;
        const wetAnal = ctx.createAnalyser();
        wetAnal.fftSize = 1024;
        wetAnal.smoothingTimeConstant = 0.4;
        const output = ctx.createGain();
        output.gain.value = 1;
        const factory = { module: dspModuleRef.current, json: JSON.stringify(dspMetaRef.current), soundfiles: {} };
        let faustNode;
        try {
            faustNode = await generatorRef.current.createNode(ctx, dspMetaRef.current.name, factory, false, 512);
        }
        catch (err) {
            console.error('[Chapter4] failed to build Faust compressor node', err);
            ctx.close();
            return;
        }
        // stopAudio() (or a second startAudio()) ran while we were awaiting — bail
        if (myToken !== startTokenRef.current) {
            try {
                ctx.close();
            }
            catch { /* ok */ }
            return;
        }
        pushFaustParams(faustNode, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled);
        // Subscribe to all 4 bands' live Gain_Reduction outputs.
        grRawRef.current = { low: 0, lowMid: 0, highMid: 0, high: 0 };
        const grAddrToBand = new Map(BAND_IDS.map(b => [ADDR.band(b).gr, b]));
        faustNode.setOutputParamHandler?.((path, value) => {
            const band = grAddrToBand.get(path);
            if (band)
                grRawRef.current[band] = Math.max(0, -value);
        });
        ctxRef.current = ctx;
        mixRef.current = mix;
        scMixRef.current = scMix;
        drumBusRef.current = drumBus;
        kickBusRef.current = kickBus;
        dryAnalRef.current = dryAnal;
        wetAnalRef.current = wetAnal;
        outputRef.current = output;
        faustNodeRef.current = faustNode;
        mix.connect(dryAnal); // tap for dry waveform + input meter
        connectMainAndSidechain(ctx, mix, scMix, faustNode);
        faustNode.connect(wetAnal);
        wetAnal.connect(output);
        output.connect(ctx.destination);
        // ── Resolve the MAIN source into `mix` ──────────────────────────────
        const mainTrack = activeSourceIdRef.current !== 'synth'
            ? uploadedTracksRef.current.find(t => t.id === activeSourceIdRef.current)
            : undefined;
        let mainBufSrc = null;
        if (mainTrack) {
            mainBufSrc = ctx.createBufferSource();
            mainBufSrc.buffer = mainTrack.buffer;
            mainBufSrc.loop = true;
            mainBufSrc.connect(mix);
            mainBufSrc.start();
            bufSourceRef.current = mainBufSrc;
        }
        else {
            drumBus.connect(mix);
        }
        // ── Resolve the SIDECHAIN source into `scMix` ───────────────────────
        const scSel = sidechainSourceIdRef.current;
        if (scSel === 'synth') {
            // Isolated kick hits only — deliberately NOT drumBus, so this never
            // sounds identical to a "Drum Loop" main source (same performance,
            // same clock, but only the kick actually reaches the detector).
            kickBus.connect(scMix);
        }
        else if (mainTrack && scSel === mainTrack.id && mainBufSrc) {
            // Same uploaded track chosen for both — fan the one playing node into
            // scMix too, so main and sidechain stay perfectly sample-locked
            // instead of two independent loops slowly drifting apart.
            mainBufSrc.connect(scMix);
        }
        else if (typeof scSel === 'number') {
            const scTrack = uploadedTracksRef.current.find(t => t.id === scSel);
            if (scTrack) {
                const scBufSrc = ctx.createBufferSource();
                scBufSrc.buffer = scTrack.buffer;
                scBufSrc.loop = true;
                scBufSrc.connect(scMix);
                scBufSrc.start();
                scBufSourceRef.current = scBufSrc;
            }
            else {
                mix.connect(scMix); // selected track no longer exists — fall back to mirroring main
            }
        }
        else {
            mix.connect(scMix); // 'none' — mirror the main signal (self-sidechain)
        }
        // Drum scheduler runs whenever either source needs the synth loop.
        if (!mainTrack || scSel === 'synth') {
            nextNoteRef.current = ctx.currentTime + 0.05;
            currentStepRef.current = 0;
            runScheduler();
        }
        setIsPlaying(true);
    }, [engineStatus, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled, runScheduler]);
    const stopAudio = useCallback(() => {
        startTokenRef.current++; // invalidate any in-flight startAudio()
        if (schedulerRef.current)
            clearTimeout(schedulerRef.current);
        if (bufSourceRef.current) {
            try {
                bufSourceRef.current.stop();
            }
            catch { /* ok */ }
            bufSourceRef.current.disconnect();
            bufSourceRef.current = null;
        }
        if (scBufSourceRef.current) {
            try {
                scBufSourceRef.current.stop();
            }
            catch { /* ok */ }
            scBufSourceRef.current.disconnect();
            scBufSourceRef.current = null;
        }
        if (faustNodeRef.current) {
            try {
                faustNodeRef.current.disconnect();
            }
            catch { /* ok */ }
            faustNodeRef.current = null;
        }
        ctxRef.current?.close();
        ctxRef.current = null;
        dryAnalRef.current = null;
        wetAnalRef.current = null;
        mixRef.current = null;
        scMixRef.current = null;
        drumBusRef.current = null;
        kickBusRef.current = null;
        outputRef.current = null;
        grRawRef.current = { low: 0, lowMid: 0, highMid: 0, high: 0 };
        setIsPlaying(false);
    }, []);
    useEffect(() => () => {
        startTokenRef.current++;
        if (schedulerRef.current)
            clearTimeout(schedulerRef.current);
        if (bufSourceRef.current) {
            try {
                bufSourceRef.current.stop();
            }
            catch { /* ok */ }
        }
        if (scBufSourceRef.current) {
            try {
                scBufSourceRef.current.stop();
            }
            catch { /* ok */ }
        }
        if (faustNodeRef.current) {
            try {
                faustNodeRef.current.disconnect();
            }
            catch { /* ok */ }
        }
        ctxRef.current?.close();
    }, []);
    // ── Spacebar toggles play/stop ─────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.code !== 'Space')
                return;
            const target = e.target;
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable)
                return;
            e.preventDefault();
            if (isPlaying) {
                stopAudio();
            }
            else if (engineStatus === 'ready') {
                void startAudio();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, engineStatus, startAudio, stopAudio]);
    // ── Signal source: switch tab / upload new track ──────────────────────────
    const handleSelectSource = useCallback((id) => {
        stopAudio();
        setActiveSourceId(id);
    }, [stopAudio]);
    // The sidechain source graph is only wired up inside startAudio(), so a
    // change while playing needs a restart to actually take effect — same
    // reasoning as handleSelectSource above for the main source.
    const handleSelectSidechainSource = useCallback((id) => {
        stopAudio();
        setSidechainSourceId(id);
    }, [stopAudio]);
    // Shared decode step for both the main-source and sidechain-source upload
    // buttons — turns a File into a normalized, playable UploadedTrack and
    // adds it to the shared uploadedTracks pool, so once uploaded either
    // selector row can pick it (a file uploaded as the sidechain source shows
    // up as a selectable main source too, and vice versa).
    const decodeAndAddTrack = useCallback(async (file) => {
        let tmpCtx = null;
        try {
            tmpCtx = new AudioContext();
            if (tmpCtx.state === 'suspended')
                await tmpCtx.resume();
            const arrayBuf = await file.arrayBuffer();
            const decoded = await tmpCtx.decodeAudioData(arrayBuf);
            normalizeUploadedBuffer(decoded);
            const track = {
                id: ++uploadIdSeqRef.current,
                name: file.name.replace(/\.[^/.]+$/, '').toUpperCase().slice(0, 24),
                buffer: decoded,
            };
            setUploadedTracks(prev => [...prev, track]);
            return track;
        }
        finally {
            tmpCtx?.close();
        }
    }, []);
    const handleUploadClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);
    const handleFileSelected = useCallback(async (e) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-selecting the same file later
        if (!file)
            return;
        stopAudio();
        setUploadError('');
        setDecoding(true);
        try {
            const track = await decodeAndAddTrack(file);
            setActiveSourceId(track.id);
        }
        catch (err) {
            console.error('Failed to decode audio file', err);
            setUploadError('Could not read that file — try an mp3, wav, or m4a.');
        }
        finally {
            setDecoding(false);
        }
    }, [stopAudio, decodeAndAddTrack]);
    // Uploads a file straight into the Sidechain Source selector, without
    // touching the main source — lets you bring in a second, genuinely
    // different track (e.g. a kick loop) purely to drive detection.
    const handleUploadSidechainClick = useCallback(() => {
        sidechainFileInputRef.current?.click();
    }, []);
    const handleSidechainFileSelected = useCallback(async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file)
            return;
        stopAudio();
        setUploadError('');
        setDecoding(true);
        try {
            const track = await decodeAndAddTrack(file);
            setSidechainSourceId(track.id);
        }
        catch (err) {
            console.error('Failed to decode sidechain audio file', err);
            setUploadError('Could not read that file — try an mp3, wav, or m4a.');
        }
        finally {
            setDecoding(false);
        }
    }, [stopAudio, decodeAndAddTrack]);
    // Renders the currently active uploaded track through the compressor
    // (with current knob/bypass settings) and downloads it as a WAV — the
    // "download after processing" counterpart to the upload button above. If
    // the Sidechain Source is itself an uploaded track, that buffer is passed
    // through too, so the download reflects a genuine external sidechain
    // rather than silently falling back to self-sidechain. A 'synth' sidechain
    // selection can't be rendered offline here (no offline drum scheduler), so
    // it falls back to mirroring the main track, same as 'none'.
    const handleDownload = useCallback(async () => {
        const track = activeTrack;
        if (!track || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current)
            return;
        setDownloadError('');
        setDownloading(true);
        try {
            const rendered = await renderCompressorOffline(generatorRef.current, dspMetaRef.current, dspModuleRef.current, track.buffer, sidechainTrack?.buffer, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled);
            downloadAudioBufferAsWav(rendered, `${track.name || 'compressor-studio'}-compressed.wav`);
        }
        catch (err) {
            console.error('[Chapter4] failed to render audio for download', err);
            setDownloadError('Could not render the audio for download — see console for details.');
        }
        finally {
            setDownloading(false);
        }
    }, [activeTrack, sidechainTrack, bands, crossover, sidechain, outputGainDb, bypass, multibandEnabled]);
    const reset = useCallback(() => {
        setBands(makeDefaultBands());
        setCrossover(DEFAULT_CROSSOVER);
        setSidechain(DEFAULT_SIDECHAIN);
        setOutputGainDb(DEFAULT_OUTPUT_GAIN);
        setSelectedBand('low');
        setMultibandEnabled(DEFAULT_MULTIBAND);
    }, []);
    const TASK_LABELS = ['Compress a band', 'Reshape the crossover', 'Try External Sidechain', 'Apply makeup gain'];
    // Signal-source tab row — lets the source be switched (or a new one uploaded).
    const renderSourceRow = () => (<div className="eq-tabrow" style={{
            display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center',
            padding: '0.5rem 0 0.1rem',
        }}>
      <button onClick={() => handleSelectSource('synth')} style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.3rem 0.65rem',
            background: activeSourceId === 'synth' ? 'rgba(167,139,250,0.13)' : 'var(--surface)',
            border: `1px solid ${activeSourceId === 'synth' ? 'rgba(167,139,250,0.5)' : 'var(--border)'}`,
            borderRadius: '3px',
            color: activeSourceId === 'synth' ? 'var(--purple)' : 'var(--text-dim)',
            fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}>
        <span style={{ fontSize: '0.85rem' }}>🥁</span>
        <span>DRUM LOOP</span>
      </button>

      {uploadedTracks.map(track => {
            const active = activeSourceId === track.id;
            return (<button key={track.id} onClick={() => handleSelectSource(track.id)} title={track.name} style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.3rem 0.65rem',
                    background: active ? 'rgba(0,255,135,0.13)' : 'var(--surface)',
                    border: `1px solid ${active ? 'rgba(0,255,135,0.5)' : 'var(--border)'}`,
                    borderRadius: '3px',
                    color: active ? 'var(--green)' : 'var(--text-dim)',
                    fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                }}>
            <span style={{ fontSize: '0.85rem' }}>📁</span>
            <span>{track.name}</span>
          </button>);
        })}

      <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelected} style={{ display: 'none' }}/>
      <button onClick={handleUploadClick} disabled={decoding} title="Upload your own audio to run through the compressor" style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.3rem 0.65rem',
            background: 'var(--surface)',
            border: '1px dashed var(--border)',
            borderRadius: '3px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
            cursor: decoding ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}>
        <span style={{ fontSize: '0.85rem' }}>{decoding ? '⏳' : '+'}</span>
        <span>{decoding ? 'DECODING…' : 'UPLOAD AUDIO'}</span>
      </button>
      {activeTrack && (<button onClick={() => { void handleDownload(); }} disabled={downloading} title="Render the active track through the compressor and download it as a WAV" style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                padding: '0.3rem 0.65rem',
                background: 'var(--surface)',
                border: '1px dashed var(--border)',
                borderRadius: '3px',
                color: 'var(--text-dim)',
                fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
                cursor: downloading ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
            }}>
          <span style={{ fontSize: '0.85rem' }}>{downloading ? '⏳' : '⬇'}</span>
          <span>{downloading ? 'RENDERING…' : 'DOWNLOAD AUDIO'}</span>
        </button>)}
      {uploadError && (<span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--mono)', alignSelf: 'center' }}>
          {uploadError}
        </span>)}
      {downloadError && (<span style={{ fontSize: '0.6rem', color: 'var(--red)', fontFamily: 'var(--mono)', alignSelf: 'center' }}>
          {downloadError}
        </span>)}
    </div>);
    // ── Render ────────────────────────────────────────────────────────────────
    return (<div className="comp-lab">
      {/* Top bar */}
      <div className="lab-topbar">
        <div className="lab-title-row">
          <div className="lab-icon" style={{ background: 'var(--purple-dim)', border: '1px solid rgba(167,139,250,0.4)' }}>⬡</div>
          <div>
            <div className="lab-name">Compressor Studio</div>
            <div className="lab-subtitle">DYNAMICS · {multibandEnabled ? '4-BAND' : 'SINGLE-BAND'} + SIDECHAIN</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className={`toggle-btn${isPlaying ? ' on' : ''}`} style={isPlaying ? { borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-dim)' } : {}} onClick={isPlaying ? stopAudio : () => { void startAudio(); }} disabled={!isPlaying && engineStatus !== 'ready'} title={engineStatus === 'loading' ? 'Loading Faust compressor engine…' : engineStatus === 'error' ? (engineError ?? 'Faust engine failed to load') : undefined}>
              {isPlaying ? '⏹ STOP' : engineStatus === 'loading' ? '⏳ LOADING…' : engineStatus === 'error' ? '⚠ ENGINE ERROR' : '▶ PLAY'}
            </button>
            <button className={`toggle-btn${bypass ? ' on' : ''}`} onClick={() => setBypass(b => !b)}>
              {bypass ? 'BYPASS: ON' : 'BYPASS: OFF'}
            </button>
          </div>
          <div className="lab-status" style={{ color: isPlaying ? 'var(--purple)' : 'var(--text-dim)' }}>
            <div className="status-dot" style={{
            background: isPlaying ? 'var(--purple)' : 'var(--text-faint)',
            boxShadow: isPlaying ? '0 0 6px var(--purple)' : 'none',
            animation: isPlaying ? undefined : 'none',
        }}/>
            {isPlaying ? (bypass ? 'BYPASSED' : 'ACTIVE') : 'STOPPED'}
          </div>
        </div>
      </div>

      {/* Signal source selector — drum loop or any uploaded track */}
      <div style={{ padding: '0 1.25rem', borderBottom: '1px solid var(--border)' }}>
        {renderSourceRow()}
      </div>

      {/* Sidechain source picker — standalone-lab-only (picking a genuinely
          different track/synth to feed the detector); the DAW workstation has
          only one audio source so it omits this and just renders
          CompressorEditorPanel directly (see EXTERNAL SC / SC LISTEN / SC HPF
          inside the panel itself, which stay since they're real DSP params
          rather than source selection). */}
      <div style={{ padding: '0.5rem 1.25rem 0', borderBottom: '1px solid var(--border)' }}>
        <div className="canvas-label" style={{ marginBottom: '0.4rem' }}>
          SIDECHAIN SOURCE
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem' }}>
          {[['none', 'SAME AS MAIN'], ['synth', 'KICK ONLY']]
            .concat(uploadedTracks.map(t => [t.id, t.name]))
            .map(([id, label]) => {
              const active = id === sidechainSourceId;
              const title = id === 'none'
                ? 'Detector hears the same signal as the main input'
                : id === 'synth'
                  ? "Detector hears only the kick drum hits, isolated from the full loop — a classic sidechain trigger"
                  : `Detector hears ${label} instead of the main input`;
              return (<button key={String(id)} onClick={() => handleSelectSidechainSource(id)} title={title} style={{
                padding: '0.25rem 0.5rem',
                background: active ? 'rgba(245,166,35,0.13)' : 'var(--surface)',
                border: `1px solid ${active ? 'rgba(245,166,35,0.5)' : 'var(--border)'}`,
                borderRadius: '3px',
                color: active ? 'var(--amber)' : 'var(--text-dim)',
                fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.04em',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}>
                {label}
              </button>);
            })}
          <input ref={sidechainFileInputRef} type="file" accept="audio/*" onChange={handleSidechainFileSelected} style={{ display: 'none' }}/>
          <button onClick={handleUploadSidechainClick} disabled={decoding} title="Upload a separate track to use as the sidechain source — e.g. a kick loop to duck the main input" style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.25rem 0.5rem',
            background: 'var(--surface)',
            border: '1px dashed var(--border)',
            borderRadius: '3px',
            color: 'var(--text-dim)',
            fontFamily: 'var(--mono)', fontSize: '0.55rem', letterSpacing: '0.04em',
            cursor: decoding ? 'wait' : 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
          }}>
            <span>{decoding ? '⏳' : '+'}</span>
            <span>{decoding ? 'DECODING…' : 'UPLOAD'}</span>
          </button>
        </div>
        {sidechainSourceId !== 'none' && !sidechain.external && (<div style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--text-faint)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
          A Sidechain Source is selected but EXTERNAL SC is off, so it isn't driving detection yet — turn EXTERNAL SC on to use it.
        </div>)}
      </div>

      {/* Body — the mode switch/band tabs/knobs/crossover/sidechain-toggles/
          transfer-curve/live-scope, shared verbatim with the DAW workstation's
          Compressor insert popup via CompressorEditorPanel (see above). */}
      <CompressorEditorPanel bands={bands} setBands={setBands} crossover={crossover} setCrossover={setCrossover} sidechain={sidechain} setSidechain={setSidechain} outputGainDb={outputGainDb} setOutputGainDb={setOutputGainDb} selectedBand={selectedBand} setSelectedBand={setSelectedBand} multibandEnabled={multibandEnabled} setMultibandEnabled={setMultibandEnabled} bypass={bypass} isPlaying={isPlaying} getLevels={getLevels} getNow={getNow}/>

      {/* Footer */}
      <div className="lab-footer">
        <div className="task-list" style={{ flexDirection: 'row', gap: '1rem' }}>
          {TASK_LABELS.map((label, i) => (<div className="task-item" key={i}>
              <div className={`task-check${tasks[i] ? ' done' : ''}`}>{tasks[i] ? '✓' : ''}</div>
              {label}
            </div>))}
        </div>
        <div className="btn-row">
          <button className="btn-secondary" onClick={reset}>Reset</button>
          <button className="btn-primary">Submit & Continue →</button>
        </div>
      </div>
    </div>);
}
