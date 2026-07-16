import { useRef, useState, useEffect, useCallback } from 'react';
import { FaustMonoDspGenerator } from '@grame/faustwasm';
import { compileFaustWasm } from '../faust/faustTypes';
import { downloadAudioBufferAsWav } from '../audio/wavRender';
// ── Chapter 11 — Limiter Studio ──────────────────────────────────────────────
// "Set a Brickwall Ceiling with a Limiter". Real DSP lives at
// public/faust/limiter/ (dsp-module.wasm + dsp-meta.json) — a Faust
// lookahead brickwall limiter: Threshold sets the level above which gain
// reduction kicks in, Out Ceiling is the hard maximum the output can ever
// reach (the "brickwall"), Release + Auto Release shape how quickly gain
// recovers, and Link L/R ties the stereo gain-reduction together so loud
// transients don't shift the stereo image. Unlike the compressor/gate
// patches elsewhere in this app, this patch exposes a *live* Gain_Reduction
// bargraph — so the LIMITING/UNITY badge in the top bar reads the real DSP
// output instead of being estimated from a static transfer-curve model.
// That bargraph is a read-only DSP *output*, though, so it's never
// registered as an AudioParam — reading it needs setOutputParamHandler (a
// port-message callback from the audio thread), not getParamValue() (which
// only ever sees registered AudioParams, i.e. the input controls, and
// silently returns 0 for anything else). See the setOutputParamHandler
// wiring in startAudio() below. The live scope analyzer further down (real
// input/output level over time, replacing the old static vertical meters)
// mirrors Chapter4's compressor and Chapter10's gate.
// ── Types ────────────────────────────────────────────────────────────────────
// Ranges mirror the live bounds in public/faust/limiter/dsp-meta.json (the
// Faust limiter patch clamps its own params internally, so dialing a knob
// past these won't change the audio any further even though the knob keeps
// turning). Release has no "unit" meta on the patch — it's a 0–2 character
// knob (lower = tighter/faster recovery, higher = looser/slower), not ms.
const KNOBS = [
    { key: 'threshold', label: 'THRESHOLD', min: -30, max: 0, step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
    { key: 'ceiling', label: 'CEILING', min: -30, max: 0, step: 0.1, fmt: v => `${v.toFixed(1)} dB` },
    // release: 0-2, release character; ignored while Auto Release is on.
    { key: 'release', label: 'RELEASE', min: 0, max: 2, step: 0.01, fmt: v => v.toFixed(2) },
];
// Defaults — mirror the `init` values in public/faust/limiter/dsp-meta.json
// (checkboxes have no init in the patch, so they start off — same "explore
// away from the default" pattern the task checklist below uses).
const DEFAULTS = {
    threshold: -6.6,
    ceiling: -0.3,
    release: 1,
    linkLR: false,
    autoRelease: false,
};
// ── Faust limiter engine wiring ──────────────────────────────────────────────
// Real DSP: public/faust/limiter/ (dsp-module.wasm + dsp-meta.json), a
// lookahead brickwall limiter exported straight from the Faust IDE, driven
// the same way as the compressor / gate / reverb patches elsewhere in this
// app.
const FAUST_BASE_PATH = '/faust/limiter';
// Faust addresses, from public/faust/limiter/dsp-meta.json's `ui` tree.
const ADDR = {
    threshold: '/BRICKWALL_LIMITER/Threshold',
    ceiling: '/BRICKWALL_LIMITER/Out_Ceiling',
    release: '/BRICKWALL_LIMITER/Release',
    linkLR: '/BRICKWALL_LIMITER/Link_L_R',
    autoRelease: '/BRICKWALL_LIMITER/Auto_Release',
    gainReduction: '/BRICKWALL_LIMITER/Gain_Reduction', // read-only hbargraph output
};
// The limiter patch has no internal Wet_Dry (unlike the compressor's), so
// bypass and wet/dry mixing are done at the WebAudio graph level instead — a
// dry/wet crossfade around the Faust node — same pattern Chapter10's gate uses.
function pushFaustParams(node, params) {
    node.setParamValue(ADDR.threshold, params.threshold);
    node.setParamValue(ADDR.ceiling, params.ceiling);
    node.setParamValue(ADDR.release, params.release);
    node.setParamValue(ADDR.linkLR, params.linkLR ? 1 : 0);
    node.setParamValue(ADDR.autoRelease, params.autoRelease ? 1 : 0);
}
// Renders an uploaded track through the same Faust limiter + dry/wet
// crossfade used live (an OfflineAudioContext instead of a live one), so it
// can be exported as a WAV — mirrors the graph built in startAudio() but
// with no analysers/meters/GR bargraph subscription.
async function renderLimiterOffline(generator, meta, dspModule, source, params, bypass) {
    const offlineCtx = new OfflineAudioContext(source.numberOfChannels, source.length, source.sampleRate);
    // No user-facing wet/dry mix control (removed, same as the compressor and
    // gate) — always fully wet outside of bypass.
    const dryGain = offlineCtx.createGain();
    dryGain.gain.value = bypass ? 1 : 0;
    const wetGain = offlineCtx.createGain();
    wetGain.gain.value = bypass ? 0 : 1;
    const factory = { module: dspModule, json: JSON.stringify(meta), soundfiles: {} };
    const node = await generator.createNode(offlineCtx, meta.name, factory, false, 512);
    pushFaustParams(node, params);
    const src = offlineCtx.createBufferSource();
    src.buffer = source;
    src.connect(dryGain);
    dryGain.connect(offlineCtx.destination);
    src.connect(node);
    node.connect(wetGain);
    wetGain.connect(offlineCtx.destination);
    src.start();
    return offlineCtx.startRendering();
}
// ── Transfer function math (static curve — a visual approximation of the
// brickwall behaviour; the real gain reduction meter reads the live Faust
// bargraph instead, see animate() below) ────────────────────────────────────
function applyLimiter(inputDb, p) {
    const { threshold, ceiling } = p;
    if (inputDb <= threshold)
        return Math.min(inputDb, ceiling);
    const headroom = ceiling - threshold;
    if (headroom <= 0.05)
        return ceiling; // no room between threshold & ceiling — instant clamp
    const over = inputDb - threshold;
    const knee = Math.max(0.4, headroom * 0.5);
    return ceiling - headroom * Math.exp(-over / knee); // asymptotically approaches, never exceeds, the ceiling
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
// ── Canvas: limiter transfer function ────────────────────────────────────────
function drawTransfer(canvas, params) {
    const hd = hiDpi(canvas);
    if (!hd)
        return;
    const { ctx, W, H } = hd;
    const DB_MIN = -30, DB_MAX = 6; // allow input to be shown hitting/exceeding 0 dBFS — the whole point of a ceiling
    const toX = (db) => ((db - DB_MIN) / (DB_MAX - DB_MIN)) * W;
    const toY = (db) => H - ((Math.max(DB_MIN, db) - DB_MIN) / (DB_MAX - DB_MIN)) * H;
    ctx.fillStyle = '#0D0D0F';
    ctx.fillRect(0, 0, W, H);
    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let db = DB_MIN; db <= DB_MAX; db += 6) {
        ctx.beginPath();
        ctx.moveTo(toX(db), 0);
        ctx.lineTo(toX(db), H);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, toY(db));
        ctx.lineTo(W, toY(db));
        ctx.stroke();
    }
    // dB axis tick labels (every 6 dB) — input along the bottom, output along the left edge
    ctx.fillStyle = '#6A6A7A';
    ctx.font = '9px "JetBrains Mono", monospace';
    for (let db = DB_MIN; db <= DB_MAX; db += 6) {
        ctx.fillText(`${db}`, toX(db) + 2, H - 2);
        ctx.fillText(`${db}`, 2, toY(db) - 2);
    }
    // Unity line
    ctx.strokeStyle = '#2E2E3D';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(toX(DB_MIN), toY(DB_MIN));
    ctx.lineTo(toX(DB_MAX), toY(DB_MAX));
    ctx.stroke();
    ctx.setLineDash([]);
    // 0 dBFS reference — the line most peaks would otherwise slam into
    ctx.strokeStyle = 'rgba(255,77,106,0.25)';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, toY(0));
    ctx.lineTo(W, toY(0));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toX(0), 0);
    ctx.lineTo(toX(0), H);
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
    // Ceiling marker — the brickwall itself
    ctx.strokeStyle = 'rgba(245,166,35,0.55)';
    ctx.setLineDash([2, 2]);
    const cy = toY(params.ceiling);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(W, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'var(--amber)';
    ctx.fillStyle = '#F5A623';
    ctx.fillText('CEILING', W - 56, cy - 4);
    // Fill + stroke
    const stroke = '#F5A623';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(245,166,35,0.08)';
    ctx.beginPath();
    let first = true;
    for (let db = DB_MIN; db <= DB_MAX; db += 0.5) {
        const x = toX(db), y = toY(applyLimiter(db, params));
        first ? (ctx.moveTo(x, H), ctx.lineTo(x, y), (first = false)) : ctx.lineTo(x, y);
    }
    ctx.lineTo(toX(DB_MAX), H);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    let first2 = true;
    for (let db = DB_MIN; db <= DB_MAX; db += 0.5) {
        const x = toX(db), y = toY(applyLimiter(db, params));
        first2 ? (ctx.moveTo(x, y), (first2 = false)) : ctx.lineTo(x, y);
    }
    ctx.stroke();
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
// ── Canvas: live limiter scope ────────────────────────────────────────────────
// Same idea as the compressor's Live Compression Scope (Chapter4) and the
// gate's Live Gate Scope (Chapter10): a separate, dedicated analyzer — not
// drawn into the transfer-function graph above — that scrolls the real,
// smoothed input/output level over a fixed time window. For a limiter this
// is what makes Release / Auto Release legible: a loud transient shows as
// the output trace snapping flat against the Ceiling line while the input
// trace pokes above it, then Release governs how quickly the gap between
// them (the amber shading) closes back down once the peak has passed.
const SCOPE_WINDOW_S = 4;
const SCOPE_MIN_DB = -66;
const SCOPE_MAX_DB = 12;
function drawLimiterScope(canvas, history, nowT, thresholdDb, ceilingDb, showThresholds) {
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
    for (let db = Math.ceil(SCOPE_MIN_DB / 12) * 12; db <= SCOPE_MAX_DB; db += 12) {
        const y = toY(db);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.fillText(`${db > 0 ? '+' : ''}${db}`, 3, y - 2);
    }
    // 0 dBFS reference — the line most peaks would otherwise slam into
    ctx.strokeStyle = 'rgba(255,77,106,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    const y0 = toY(0);
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(W, y0);
    ctx.stroke();
    ctx.setLineDash([]);
    if (showThresholds) {
        ctx.strokeStyle = 'rgba(138,138,154,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        const threshY = toY(thresholdDb);
        ctx.beginPath();
        ctx.moveTo(0, threshY);
        ctx.lineTo(W, threshY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(138,138,154,0.85)';
        ctx.fillText('THRESH', W - 42, threshY - 3);
        ctx.strokeStyle = 'rgba(245,166,35,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        const ceilY = toY(ceilingDb);
        ctx.beginPath();
        ctx.moveTo(0, ceilY);
        ctx.lineTo(W, ceilY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(245,166,35,0.85)';
        ctx.fillText('CEILING', W - 46, ceilY + 9);
    }
    const visible = history.filter(p => p.t >= nowT - SCOPE_WINDOW_S - 0.25);
    if (visible.length < 2)
        return;
    const inPts = visible.map(p => ({ x: toX(p.t), y: toY(p.inputDb) }));
    const outPts = visible.map(p => ({ x: toX(p.t), y: toY(p.outputDb) }));
    // Shaded gap between input and output — the actual gain reduction in
    // motion. Amber, matching this chapter's own Gain Reduction meter/Ceiling
    // accent color rather than the red used on the compressor/gate scopes.
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#F5A623';
    ctx.beginPath();
    ctx.moveTo(inPts[0].x, inPts[0].y);
    for (const p of inPts.slice(1))
        ctx.lineTo(p.x, p.y);
    for (let i = outPts.length - 1; i >= 0; i--)
        ctx.lineTo(outPts[i].x, outPts[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Input trace
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
    // Output trace (what actually reaches the ear — never above Ceiling)
    ctx.strokeStyle = '#4D9EFF';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(outPts[0].x, outPts[0].y);
    for (const p of outPts.slice(1))
        ctx.lineTo(p.x, p.y);
    ctx.stroke();
}
// ── Knob helpers (plain linear) ───────────────────────────────────────────────
function specToFrac(spec, v) {
    return (v - spec.min) / (spec.max - spec.min);
}
function specFromFrac(spec, f) {
    return spec.min + f * (spec.max - spec.min);
}
function knobRotationForSpec(spec, v) {
    return -140 + specToFrac(spec, v) * 280;
}
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
// ── Level ballistics + live Gain Reduction readout ──────────────────────────
// The old vertical INPUT/G·R/OUTPUT bar meters were removed — the live
// limiter scope below shows the same input/output levels (and the gain
// reduction between them) as motion over time, which is strictly more
// information than three static bars, so keeping both was redundant (same
// change made to the compressor's Chapter4 and the gate's Chapter10). The
// smoothed input/output dB values are still computed here (fast-attack/
// slow-release, so they're readable frame to frame) — the scope is what
// displays them now.
const METER_FLOOR_DB = -60;
const LEVEL_ATTACK_S = 0.015;
const LEVEL_RELEASE_S = 0.35;
function levelBallistic(prev, target, dt) {
    if (dt <= 0)
        return prev;
    const tau = target > prev ? LEVEL_ATTACK_S : LEVEL_RELEASE_S;
    return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}
// gainReduction (real DSP telemetry, not a scope estimate) still drives the
// LIMITING/UNITY badge in the top bar, so this smoothing stays even with the
// bar meter gone. The gain-reduction meter reads the Faust patch's own live
// Gain_Reduction bargraph (unlike the compressor/gate charts, which have to
// estimate GR from a static curve) — this just takes the *edge* off
// frame-to-frame flicker so the readout doesn't blur, without altering the
// real ballistics the DSP itself already applies (attack/release/lookahead
// all happen inside the patch).
const GR_READOUT_TAU_S = 0.03;
function grReadoutSmooth(prev, target, dt) {
    if (dt <= 0)
        return prev;
    return prev + (target - prev) * (1 - Math.exp(-dt / GR_READOUT_TAU_S));
}
// ── Test signal: a hot "mastered" loop that pokes above 0 dBFS ──────────────
// A limiter's whole job is catching peaks a mix would otherwise clip on — so
// unlike the compressor/gate demo loops, this one is deliberately mixed hot
// (kick + snare + hats + bass all summing close to, or past, digital full
// scale) plus an occasional loud accent hit, so with the limiter bypassed
// the input meter visibly pokes above 0 dBFS and you can hear the difference
// once Play + a sane Ceiling are engaged.
const BPM = 128;
const STEP_SEC = 60 / BPM / 2;
const STEPS = 16;
const PAT_KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0];
const PAT_SNARE = [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
const PAT_HAT = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1];
const PAT_BASS = [82, 0, 0, 0, 98, 0, 0, 0, 82, 0, 0, 0, 62, 0, 0, 0];
const PAT_ACCENT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]; // one loud hit per bar-loop — the "surprise peak" a limiter exists for
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
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.06);
    g.gain.setValueAtTime(1.0, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.32);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.36);
}
function synthSnare(ctx, dest, time) {
    const body = ctx.createOscillator();
    const bg = ctx.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(200, time);
    body.frequency.exponentialRampToValueAtTime(100, time + 0.06);
    bg.gain.setValueAtTime(0.6, time);
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
    ng.gain.setValueAtTime(0.75, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    noise.connect(filt);
    filt.connect(ng);
    ng.connect(dest);
    noise.start(time);
    noise.stop(time + 0.15);
}
function synthHihat(ctx, dest, time) {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 0.05);
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 9000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noise.connect(filt);
    filt.connect(g);
    g.connect(dest);
    noise.start(time);
    noise.stop(time + 0.05);
}
function synthBass(ctx, dest, time, freq) {
    const osc = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(1000, time);
    filt.frequency.exponentialRampToValueAtTime(200, time + 0.25);
    filt.Q.value = 3;
    g.gain.setValueAtTime(0.7, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.38);
    osc.connect(filt);
    filt.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.4);
}
// The "surprise peak" — a bright, loud stab that sums with whatever else is
// hitting on that beat to push well past 0 dBFS pre-limiter.
function synthAccent(ctx, dest, time) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(660, time);
    g.gain.setValueAtTime(0.9, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    osc.connect(g);
    g.connect(dest);
    osc.start(time);
    osc.stop(time + 0.2);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 0.2);
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 4000;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.7, time);
    ng.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    noise.connect(filt);
    filt.connect(ng);
    ng.connect(dest);
    noise.start(time);
    noise.stop(time + 0.2);
}
function scheduleStep(ctx, dest, step, time) {
    if (PAT_KICK[step])
        synthKick(ctx, dest, time);
    if (PAT_SNARE[step])
        synthSnare(ctx, dest, time);
    if (PAT_HAT[step])
        synthHihat(ctx, dest, time);
    if (PAT_BASS[step])
        synthBass(ctx, dest, time, PAT_BASS[step]);
    if (PAT_ACCENT[step])
        synthAccent(ctx, dest, time);
}
function normalizeUploadedBuffer(buf, peakTarget = 0.95) {
    let peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < data.length; i++)
            peak = Math.max(peak, Math.abs(data[i]));
    }
    if (peak < 1e-6)
        return;
    // Ceiling, not a target: only ever turn a hot file DOWN to avoid clipping.
    // `peakTarget / peak` alone would also turn a quiet file UP to hit
    // peakTarget, baking a silent gain boost into the uploaded buffer itself —
    // audible even with the effect bypassed, since it happens once at upload
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
// ── Component ─────────────────────────────────────────────────────────────────
export default function Limiter() {
    const [params, setParams] = useState(DEFAULTS);
    const [isPlaying, setIsPlaying] = useState(false);
    const [bypass, setBypass] = useState(false);
    const [gainReduction, setGR] = useState(0);
    const [tasks, setTasks] = useState([false, false, false, false]);
    // Signal source — hot drum+bass loop, or an uploaded track.
    const [uploadedTracks, setUploadedTracks] = useState([]);
    const [activeSourceId, setActiveSourceId] = useState('synth');
    const [decoding, setDecoding] = useState(false);
    const [uploadError, setUploadError] = useState('');
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState('');
    const fileInputRef = useRef(null);
    const uploadIdSeqRef = useRef(0);
    const activeSourceIdRef = useRef(activeSourceId);
    const uploadedTracksRef = useRef(uploadedTracks);
    const bufSourceRef = useRef(null);
    useEffect(() => { activeSourceIdRef.current = activeSourceId; }, [activeSourceId]);
    useEffect(() => { uploadedTracksRef.current = uploadedTracks; }, [uploadedTracks]);
    const activeTrack = activeSourceId !== 'synth' ? uploadedTracks.find(t => t.id === activeSourceId) : undefined;
    // Canvas refs
    const transferRef = useRef(null);
    const scopeRef = useRef(null);
    const scopeHistoryRef = useRef([]);
    // Faust limiter engine (module + meta loaded once on mount, one node
    // instantiated per AudioContext in startAudio — same pattern as Chapter4's
    // compressor / Chapter10's gate).
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
                console.error('[Chapter11] failed to load Faust limiter DSP', err);
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
    const mixRef = useRef(null);
    const dryGainRef = useRef(null);
    const wetGainRef = useRef(null);
    const outputRef = useRef(null); // post-crossfade sum → destination
    const finalAnalRef = useRef(null); // taps the actual blended output (reflects bypass/mix)
    const animRef = useRef(0);
    const schedulerRef = useRef(null);
    const nextNoteRef = useRef(0);
    const currentStepRef = useRef(0);
    const startTokenRef = useRef(0);
    const paramsRef = useRef(params);
    const bypassRef = useRef(bypass);
    useEffect(() => { paramsRef.current = params; }, [params]);
    useEffect(() => { bypassRef.current = bypass; }, [bypass]);
    // Meter ballistics state
    const smoothedInputDbRef = useRef(METER_FLOOR_DB);
    const smoothedOutputDbRef = useRef(METER_FLOOR_DB);
    const smoothedGrDbRef = useRef(0);
    const meterClockRef = useRef(null);
    // Latest raw Gain_Reduction value pushed from the audio thread — see the
    // setOutputParamHandler wiring in startAudio() and the comment on
    // FaustNodeLike.setOutputParamHandler in faustTypes.ts for why this can't
    // just be read with faustNode.getParamValue() every frame.
    const grRawRef = useRef(0);
    // Knob drag ref
    const mainDragRef = useRef(null);
    // ── Main transfer canvas ──────────────────────────────────────────────────
    useEffect(() => {
        if (transferRef.current) {
            const displayParams = bypass ? { ...params, threshold: 6, ceiling: 6 } : params;
            drawTransfer(transferRef.current, displayParams);
        }
    }, [params, bypass]);
    // ── Sync Faust limiter params (always live — bypass is handled by the
    // dry/wet crossfade below, not by touching the DSP itself) ───────────────
    useEffect(() => {
        const node = faustNodeRef.current;
        if (!node)
            return;
        pushFaustParams(node, params);
    }, [params]);
    // ── Bypass (crossfade to dry) ──────────────────────────────────────────────
    // No user-facing wet/dry mix control (removed, same as the compressor and
    // gate) — this crossfade only ever moves between fully wet and fully dry,
    // driven by Bypass alone.
    useEffect(() => {
        const wet = wetGainRef.current, dry = dryGainRef.current, ac = ctxRef.current;
        if (!wet || !dry || !ac)
            return;
        const w = bypass ? 0 : 1;
        wet.gain.setTargetAtTime(w, ac.currentTime, 0.01);
        dry.gain.setTargetAtTime(1 - w, ac.currentTime, 0.01);
    }, [bypass]);
    // ── Task tracking ─────────────────────────────────────────────────────────
    useEffect(() => {
        setTasks([
            params.threshold !== DEFAULTS.threshold,
            params.ceiling !== DEFAULTS.ceiling,
            params.release !== DEFAULTS.release,
            params.linkLR || params.autoRelease,
        ]);
    }, [params]);
    // ── Scheduler ─────────────────────────────────────────────────────────────
    const runScheduler = useCallback(() => {
        const ctx = ctxRef.current;
        const mix = mixRef.current;
        if (!ctx || !mix)
            return;
        while (nextNoteRef.current < ctx.currentTime + 0.1) {
            scheduleStep(ctx, mix, currentStepRef.current, nextNoteRef.current);
            currentStepRef.current = (currentStepRef.current + 1) % STEPS;
            nextNoteRef.current += STEP_SEC;
        }
        schedulerRef.current = setTimeout(runScheduler, 25);
    }, []);
    // ── Animation loop ────────────────────────────────────────────────────────
    const animate = useCallback(() => {
        const dryAnal = dryAnalRef.current;
        const now = ctxRef.current?.currentTime ?? performance.now() / 1000;
        const dt = meterClockRef.current !== null ? Math.max(0, Math.min(0.2, now - meterClockRef.current)) : 0;
        meterClockRef.current = now;
        if (dryAnal) {
            const buf = new Float32Array(dryAnal.fftSize);
            dryAnal.getFloatTimeDomainData(buf);
            let peak = 0;
            for (let i = 0; i < buf.length; i++)
                peak = Math.max(peak, Math.abs(buf[i]));
            const rawInputDb = peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
            smoothedInputDbRef.current = levelBallistic(smoothedInputDbRef.current, rawInputDb, dt);
        }
        // Gain reduction: read the *real* Faust patch's own live Gain_Reduction
        // bargraph — no estimation needed, unlike the compressor/gate charts
        // elsewhere in this app. The value itself arrives asynchronously via
        // setOutputParamHandler (see startAudio) into grRawRef; this just smooths
        // it for display. Still drives the LIMITING/UNITY badge up top even
        // though the bar meter that used to show it is gone.
        if (!bypassRef.current) {
            smoothedGrDbRef.current = grReadoutSmooth(smoothedGrDbRef.current, grRawRef.current, dt);
            setGR(smoothedGrDbRef.current);
        }
        else {
            smoothedGrDbRef.current = 0;
            setGR(0);
        }
        if (finalAnalRef.current) {
            const buf = new Float32Array(finalAnalRef.current.fftSize);
            finalAnalRef.current.getFloatTimeDomainData(buf);
            let peak = 0;
            for (let i = 0; i < buf.length; i++)
                peak = Math.max(peak, Math.abs(buf[i]));
            const rawOutputDb = peak > 1e-6 ? 20 * Math.log10(peak) : METER_FLOOR_DB;
            smoothedOutputDbRef.current = levelBallistic(smoothedOutputDbRef.current, rawOutputDb, dt);
        }
        // Live limiter scope — records the smoothed input/output dB into a
        // scrolling history, so Release/Auto Release are visible as actual
        // motion on the real signal instead of only as numbers on a knob.
        if (dryAnal && finalAnalRef.current) {
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
        animRef.current = requestAnimationFrame(animate);
    }, []);
    // ── Start / Stop audio ────────────────────────────────────────────────────
    const startAudio = useCallback(async () => {
        if (engineStatus !== 'ready' || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current)
            return;
        const myToken = ++startTokenRef.current;
        const ctx = new AudioContext();
        // mix ─┬→ dryAnal (viz + input-level tap) → dryGain ─┐
        //      └→ faustNode (limiter) → wetAnal (viz tap) → wetGain ─┴→ output → finalAnal → destination
        const mix = ctx.createGain();
        mix.gain.value = 1.0;
        const dryAnal = ctx.createAnalyser();
        dryAnal.fftSize = 1024;
        dryAnal.smoothingTimeConstant = 0.4;
        const wetAnal = ctx.createAnalyser();
        wetAnal.fftSize = 1024;
        wetAnal.smoothingTimeConstant = 0.4;
        // No user-facing wet/dry mix control (removed, same as the compressor
        // and gate) — always fully wet outside of bypass.
        const dryGain = ctx.createGain();
        dryGain.gain.value = bypass ? 1 : 0;
        const wetGain = ctx.createGain();
        wetGain.gain.value = bypass ? 0 : 1;
        const output = ctx.createGain();
        output.gain.value = 1;
        const finalAnal = ctx.createAnalyser();
        finalAnal.fftSize = 1024;
        finalAnal.smoothingTimeConstant = 0.35;
        const factory = { module: dspModuleRef.current, json: JSON.stringify(dspMetaRef.current), soundfiles: {} };
        let faustNode;
        try {
            faustNode = await generatorRef.current.createNode(ctx, dspMetaRef.current.name, factory, false, 512);
        }
        catch (err) {
            console.error('[Chapter11] failed to build Faust limiter node', err);
            ctx.close();
            return;
        }
        if (myToken !== startTokenRef.current) {
            try {
                ctx.close();
            }
            catch { /* ok */ }
            return;
        }
        pushFaustParams(faustNode, params);
        // Live Gain_Reduction bargraph: this is a read-only DSP *output*, so it's
        // never registered as an AudioParam — getParamValue() on this address
        // would just return 0 forever. The processor posts updates from the
        // audio thread instead; subscribe to them here.
        grRawRef.current = 0;
        faustNode.setOutputParamHandler?.((path, value) => {
            if (path === ADDR.gainReduction)
                grRawRef.current = value;
        });
        ctxRef.current = ctx;
        mixRef.current = mix;
        dryAnalRef.current = dryAnal;
        wetAnalRef.current = wetAnal;
        dryGainRef.current = dryGain;
        wetGainRef.current = wetGain;
        outputRef.current = output;
        finalAnalRef.current = finalAnal;
        faustNodeRef.current = faustNode;
        mix.connect(dryAnal);
        dryAnal.connect(dryGain);
        dryGain.connect(output);
        mix.connect(faustNode);
        faustNode.connect(wetAnal);
        wetAnal.connect(wetGain);
        wetGain.connect(output);
        output.connect(finalAnal);
        finalAnal.connect(ctx.destination);
        const track = activeSourceIdRef.current !== 'synth'
            ? uploadedTracksRef.current.find(t => t.id === activeSourceIdRef.current)
            : undefined;
        if (track) {
            const bufSrc = ctx.createBufferSource();
            bufSrc.buffer = track.buffer;
            bufSrc.loop = true;
            bufSrc.connect(mix);
            bufSrc.start();
            bufSourceRef.current = bufSrc;
        }
        else {
            nextNoteRef.current = ctx.currentTime + 0.05;
            currentStepRef.current = 0;
            runScheduler();
        }
        scopeHistoryRef.current = [];
        animRef.current = requestAnimationFrame(animate);
        setIsPlaying(true);
    }, [engineStatus, params, bypass, runScheduler, animate]);
    const stopAudio = useCallback(() => {
        startTokenRef.current++;
        if (schedulerRef.current)
            clearTimeout(schedulerRef.current);
        cancelAnimationFrame(animRef.current);
        if (bufSourceRef.current) {
            try {
                bufSourceRef.current.stop();
            }
            catch { /* ok */ }
            bufSourceRef.current.disconnect();
            bufSourceRef.current = null;
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
        dryGainRef.current = null;
        wetGainRef.current = null;
        outputRef.current = null;
        finalAnalRef.current = null;
        smoothedInputDbRef.current = METER_FLOOR_DB;
        smoothedOutputDbRef.current = METER_FLOOR_DB;
        smoothedGrDbRef.current = 0;
        grRawRef.current = 0;
        meterClockRef.current = null;
        setGR(0);
        setIsPlaying(false);
        scopeHistoryRef.current = [];
        if (scopeRef.current) {
            const c = scopeRef.current.getContext('2d');
            c.fillStyle = '#0D0D0F';
            c.fillRect(0, 0, scopeRef.current.width, scopeRef.current.height);
        }
    }, []);
    useEffect(() => () => {
        startTokenRef.current++;
        if (schedulerRef.current)
            clearTimeout(schedulerRef.current);
        cancelAnimationFrame(animRef.current);
        if (bufSourceRef.current) {
            try {
                bufSourceRef.current.stop();
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
    const handleUploadClick = useCallback(() => { fileInputRef.current?.click(); }, []);
    const handleFileSelected = useCallback(async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file)
            return;
        stopAudio();
        setUploadError('');
        setDecoding(true);
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
            setActiveSourceId(track.id);
        }
        catch (err) {
            console.error('Failed to decode audio file', err);
            setUploadError('Could not read that file — try an mp3, wav, or m4a.');
        }
        finally {
            tmpCtx?.close();
            setDecoding(false);
        }
    }, [stopAudio]);
    // Renders the currently active uploaded track through the limiter (with
    // current knob/bypass settings) and downloads it as a WAV — the "download
    // after processing" counterpart to the upload button above.
    const handleDownload = useCallback(async () => {
        const track = activeTrack;
        if (!track || !generatorRef.current || !dspMetaRef.current || !dspModuleRef.current)
            return;
        setDownloadError('');
        setDownloading(true);
        try {
            const rendered = await renderLimiterOffline(generatorRef.current, dspMetaRef.current, dspModuleRef.current, track.buffer, params, bypass);
            downloadAudioBufferAsWav(rendered, `${track.name || 'limiter-studio'}-limited.wav`);
        }
        catch (err) {
            console.error('[Chapter11] failed to render audio for download', err);
            setDownloadError('Could not render the audio for download — see console for details.');
        }
        finally {
            setDownloading(false);
        }
    }, [activeTrack, params, bypass]);
    // ── Main lab knob drag ────────────────────────────────────────────────────
    const onMainKnobDown = useCallback((e, spec, val) => {
        e.preventDefault();
        mainDragRef.current = { spec, startY: e.clientY, startFrac: specToFrac(spec, val) };
    }, []);
    useEffect(() => {
        const onMove = (e) => {
            const d = mainDragRef.current;
            if (!d)
                return;
            const frac = Math.min(1, Math.max(0, d.startFrac + (d.startY - e.clientY) / 220));
            const raw = specFromFrac(d.spec, frac);
            const clamped = Math.min(d.spec.max, Math.max(d.spec.min, Math.round(raw / d.spec.step) * d.spec.step));
            setParams(p => ({ ...p, [d.spec.key]: clamped }));
        };
        const onUp = () => { mainDragRef.current = null; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, []);
    const reset = useCallback(() => setParams(DEFAULTS), []);
    // Derived
    const TASK_LABELS = ['Lower the threshold', 'Set an output ceiling', 'Adjust release character', 'Try Auto Release / Link L-R'];
    const renderSourceRow = () => (<div className="eq-tabrow" style={{
            display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center',
            padding: '0.5rem 0 0.1rem',
        }}>
      <button onClick={() => handleSelectSource('synth')} style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.3rem 0.65rem',
            background: activeSourceId === 'synth' ? 'rgba(245,166,35,0.13)' : 'var(--surface)',
            border: `1px solid ${activeSourceId === 'synth' ? 'rgba(245,166,35,0.5)' : 'var(--border)'}`,
            borderRadius: '3px',
            color: activeSourceId === 'synth' ? 'var(--amber)' : 'var(--text-dim)',
            fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
        }}>
        <span style={{ fontSize: '0.85rem' }}>🔁</span>
        <span>MASTER LOOP</span>
      </button>

      {uploadedTracks.map(track => {
            const active = activeSourceId === track.id;
            return (<button key={track.id} onClick={() => handleSelectSource(track.id)} title={track.name} style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    padding: '0.3rem 0.65rem',
                    background: active ? 'rgba(77,158,255,0.13)' : 'var(--surface)',
                    border: `1px solid ${active ? 'rgba(77,158,255,0.5)' : 'var(--border)'}`,
                    borderRadius: '3px',
                    color: active ? 'var(--blue)' : 'var(--text-dim)',
                    fontFamily: 'var(--mono)', fontSize: '0.6rem', letterSpacing: '0.06em',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
                }}>
            <span style={{ fontSize: '0.85rem' }}>📁</span>
            <span>{track.name}</span>
          </button>);
        })}

      <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelected} style={{ display: 'none' }}/>
      <button onClick={handleUploadClick} disabled={decoding} title="Upload your own audio to run through the limiter" style={{
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
      {activeTrack && (<button onClick={() => { void handleDownload(); }} disabled={downloading} title="Render the active track through the limiter and download it as a WAV" style={{
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
          <div className="lab-icon" style={{ background: 'var(--amber-dim)', border: '1px solid rgba(245,166,35,0.4)' }}>⬒</div>
          <div>
            <div className="lab-name">Limiter Studio</div>
            <div className="lab-subtitle">DYNAMICS — BRICKWALL LIMITER</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="badge" style={{
            background: !isPlaying ? 'var(--surface)' : gainReduction < -0.1 ? 'rgba(245,166,35,0.15)' : 'rgba(0,255,135,0.12)',
            borderColor: !isPlaying ? 'var(--border)' : gainReduction < -0.1 ? 'rgba(245,166,35,0.4)' : 'rgba(0,255,135,0.4)',
            color: !isPlaying ? 'var(--text-faint)' : gainReduction < -0.1 ? 'var(--amber)' : 'var(--green)',
        }}>
            {!isPlaying ? '○ IDLE' : gainReduction < -0.1 ? `● LIMITING ${gainReduction.toFixed(1)} dB` : '● UNITY'}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className={`toggle-btn${isPlaying ? ' on' : ''}`} style={isPlaying ? { borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-dim)' } : {}} onClick={isPlaying ? stopAudio : () => { void startAudio(); }} disabled={!isPlaying && engineStatus !== 'ready'} title={engineStatus === 'loading' ? 'Loading Faust limiter engine…' : engineStatus === 'error' ? (engineError ?? 'Faust engine failed to load') : undefined}>
              {isPlaying ? '⏹ STOP' : engineStatus === 'loading' ? '⏳ LOADING…' : engineStatus === 'error' ? '⚠ ENGINE ERROR' : '▶ PLAY'}
            </button>
            <button className={`toggle-btn${bypass ? ' on' : ''}`} onClick={() => setBypass(b => !b)}>
              {bypass ? 'BYPASS: ON' : 'BYPASS: OFF'}
            </button>
          </div>
          <div className="lab-status" style={{ color: isPlaying ? 'var(--amber)' : 'var(--text-dim)' }}>
            <div className="status-dot" style={{
            background: isPlaying ? 'var(--amber)' : 'var(--text-faint)',
            boxShadow: isPlaying ? '0 0 6px var(--amber)' : 'none',
            animation: isPlaying ? undefined : 'none',
        }}/>
            {isPlaying ? (bypass ? 'BYPASSED' : 'ACTIVE') : 'STOPPED'}
          </div>
        </div>
      </div>

      {/* Signal source selector */}
      <div style={{ padding: '0 1.25rem', borderBottom: '1px solid var(--border)' }}>
        {renderSourceRow()}
      </div>

      {/* Body */}
      <div className="comp-body">
        {/* Left: meters + knobs */}
        <div className="comp-controls">
          <div className="canvas-label" style={{ marginBottom: '1rem' }}>
            LIMITER PARAMETERS · DRAG KNOBS VERTICALLY
          </div>

          {/* Knobs, evenly spread across the full control column now that the
            old meter column beside them is gone — the live scope on the
            right already covers input/output/gain-reduction, so this
            panel is just the controls themselves (same change made to the
            compressor's Chapter4 and the gate's Chapter10). */}
          <div className="knob-grid">
            {KNOBS.map(spec => {
            const val = params[spec.key];
            const rot = knobRotationForSpec(spec, val);
            return (<div className="knob-wrap" key={spec.key}>
                  <div style={{ position: 'relative', width: 64, height: 64 }}>
                    <svg style={{ position: 'absolute', top: 0, left: 0 }} width={64} height={64} viewBox="-32 -32 64 64">
                      <path d={describeArc(28, -140, 140)} fill="none" stroke="#2E2E3D" strokeWidth={3} strokeLinecap="round"/>
                      <path d={describeArc(28, -140, rot)} fill="none" stroke="#F5A623" strokeWidth={3} strokeLinecap="round" opacity={0.85}/>
                    </svg>
                    <div className="big-knob" style={{ position: 'absolute', top: 6, left: 6, width: 52, height: 52, cursor: 'ns-resize', userSelect: 'none' }} onMouseDown={e => onMainKnobDown(e, spec, val)}>
                      <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    width: 3, height: 16, background: '#E8E8EC', borderRadius: 2,
                    transformOrigin: 'bottom center',
                    transform: `translate(-50%, -100%) rotate(${rot}deg)`,
                    marginTop: -2,
                }}/>
                    </div>
                  </div>
                  <div className="knob-name">{spec.label}</div>
                  <div className="knob-val">{spec.fmt(val)}</div>
                  <KnobNumberInput value={val} min={spec.min} max={spec.max} step={spec.step} onChange={v => setParams(p => ({ ...p, [spec.key]: v }))}/>
                </div>);
        })}
          </div>

          {/* Link L/R + Auto Release toggles */}
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

        {/* Right: transfer + live scope */}
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
      </div>

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
          <button className="btn-primary">Submit &amp; Continue →</button>
        </div>
      </div>
    </div>);
}
