import { useRef, useEffect, useCallback } from 'react';
import {
  ROUTING_OPTIONS, DEFAULTS, MIN_DELAY_MS, MAX_DELAY_MS, CUT_MIN_HZ, CUT_MAX_HZ,
  METER_FLOOR_DB, clampMs, withDefaults,
} from '../../audio/effects/delayEngine';
import { drawLevelScope } from './shared/panelUtils';
import { levelBallistic } from '../../audio/effects/ballistics';
import './Delay.css';

//----------------------------------------------------------------------
// live echo scope: real dry input vs wet output (app palette; the
// scope helper swaps these literals for the light theme at draw time)
//----------------------------------------------------------------------
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

//----------------------------------------------------------------------
// value <-> 0..1 mapping and formatting
//----------------------------------------------------------------------
const toNorm = (v, min, max, log) => {
  const n = log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
  return Math.min(1, Math.max(0, n));
};
const fromNorm = (n, min, max, log) => (log ? min * Math.pow(max / min, n) : min + n * (max - min));
const fmtPct = (v) => `${Math.round(v)}%`;
const fmtHz = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}kHz` : `${Math.round(v)}Hz`);
const fmtMs = (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : v < 10 ? `${v.toFixed(1)}ms` : `${Math.round(v)}ms`);

// shared vertical-drag behaviour: pointer capture, shift = fine
function useVerticalDrag(norm, onNorm, pxPerRange = 200) {
  const drag = useRef(null);
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, n: norm };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const scale = e.shiftKey ? pxPerRange * 5 : pxPerRange;
    onNorm(Math.min(1, Math.max(0, d.n + (d.y - e.clientY) / scale)));
  };
  const end = (e) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}

//----------------------------------------------------------------------
// controls (styled from the app's chapter-lab tokens)
//----------------------------------------------------------------------
const polar = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
};
const arcPath = (r, from, to) => {
  if (to - from < 0.5) to = from + 0.5;
  const [x0, y0] = polar(r, from);
  const [x1, y1] = polar(r, to);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

function Knob({ norm, onNorm, onReset, label, value, size = 64, travel = 220, children }) {
  const handlers = useVerticalDrag(norm, onNorm, travel);
  const rot = -140 + norm * 280;
  const r = size / 2 - 3;
  const body = size * 0.8;
  const onKeyDown = (e) => {
    const inc = e.shiftKey ? 0.002 : 0.01;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onNorm(Math.min(1, norm + inc)); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onNorm(Math.max(0, norm - inc)); }
  };
  return (
    <div className="knob-wrap sdl-knob">
      <div className="sdl-knob__dial" style={{ width: size, height: size }} role="slider" tabIndex={0}
        aria-label={label} aria-valuetext={value} onDoubleClick={onReset} onKeyDown={onKeyDown} {...handlers}>
        <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
          <path d={arcPath(r, -140, 140)} className="sdl-knob__track" />
          <path d={arcPath(r, -140, rot)} className="sdl-knob__arc" />
        </svg>
        <div className="big-knob sdl-knob__body" style={{ width: body, height: body, top: (size - body) / 2, left: (size - body) / 2 }}>
          <div className="sdl-knob__tick" style={{ height: body * 0.3, transform: `translate(-50%, -100%) rotate(${rot}deg)` }} />
        </div>
      </div>
      <div className="knob-name">{label}</div>
      <div className="knob-val sdl-accent">{value}</div>
      {children}
    </div>
  );
}

function Segmented({ options, value, onChange, label, format = (o) => o }) {
  return (
    <div className="sdl-seg" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button key={o} type="button" role="radio" aria-checked={value === i}
          className={`sdl-seg__btn${value === i ? ' is-active' : ''}`} onClick={() => onChange(i)}>
          {format(o)}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onClick, children, title, label }) {
  return (
    <button type="button" className={`toggle-btn sdl-toggle${on ? ' on' : ''}`} onClick={onClick}
      aria-pressed={on} aria-label={label} title={title}>
      {children}
    </button>
  );
}

function CutRange({ low, high, onLow, onHigh, onReset }) {
  const trackRef = useRef(null);
  const active = useRef(null);
  const nLow = toNorm(low, CUT_MIN_HZ, CUT_MAX_HZ, true);
  const nHigh = toNorm(high, CUT_MIN_HZ, CUT_MAX_HZ, true);
  const normAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const move = (n) => {
    const hz = fromNorm(n, CUT_MIN_HZ, CUT_MAX_HZ, true);
    if (active.current === 'low') onLow(Math.min(hz, high));
    else onHigh(Math.max(hz, low));
  };
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const n = normAt(e.clientX);
    const dLow = Math.abs(n - nLow);
    const dHigh = Math.abs(n - nHigh);
    active.current = dLow < dHigh ? 'low' : dLow > dHigh ? 'high' : n < nLow ? 'low' : 'high';
    e.currentTarget.setPointerCapture?.(e.pointerId);
    move(n);
  };
  const onPointerMove = (e) => { if (active.current) move(normAt(e.clientX)); };
  const end = (e) => { active.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); };
  return (
    <div className="sdl-cut">
      <div className="sdl-cut__head">
        <span className="sdl-mini-label">REPEAT FILTER</span>
        <span className="sdl-cut__vals">
          <span>LO <b className="sdl-accent">{fmtHz(low)}</b></span>
          <span>HI <b className="sdl-accent">{fmtHz(high)}</b></span>
        </span>
      </div>
      <div className="sdl-cut__track" ref={trackRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={end} onPointerCancel={end} onDoubleClick={onReset}
        title="Low cut / high cut on the repeats · double-click to open fully">
        <div className="sdl-cut__shade" style={{ left: 0, width: `${nLow * 100}%` }} />
        <div className="sdl-cut__shade" style={{ left: `${nHigh * 100}%`, right: 0 }} />
        <div className="sdl-cut__band" style={{ left: `${nLow * 100}%`, width: `${(nHigh - nLow) * 100}%` }} />
        <div className="sdl-cut__thumb" style={{ left: `${nLow * 100}%` }} />
        <div className="sdl-cut__thumb" style={{ left: `${nHigh * 100}%` }} />
      </div>
      <div className="sdl-cut__scale"><span>20</span><span>200</span><span>2k</span><span>20k</span></div>
    </div>
  );
}

function LevelSlider({ label, value, onChange, onReset, accent }) {
  return (
    <div className="sdl-level" style={{ '--acc': accent }}>
      <span className="sdl-mini-label">{label}</span>
      <input type="range" min={0} max={100} step={0.5} value={value} aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))} onDoubleClick={onReset}
        style={{ '--fill': `${value}%` }} />
      <span className="sdl-level__val">{fmtPct(value)}</span>
    </div>
  );
}

//----------------------------------------------------------------------
// one channel card
//----------------------------------------------------------------------
const LINKED_KEYS = new Set(['Time', 'LowCut', 'HighCut', 'Feedback', 'Crossfeed', 'FeedbackPhase', 'CrossfeedPhase']);
const TIME_RANGE = [MIN_DELAY_MS, MAX_DELAY_MS, true];

function ChannelCard({ side, p, setSide, setSideMany }) {
  const isL = side === 'l';
  const k = (key) => p[`${side}${key}`];
  const timeMs = clampMs(k('Time'));

  return (
    <section className={`sdl-card ${isL ? 'is-left' : 'is-right'}`}>
      <header className="sdl-card__head">
        <span className="sdl-card__badge">{isL ? 'L' : 'R'}</span>
        <span className="sdl-card__title">{isL ? 'LEFT' : 'RIGHT'} DELAY</span>
        <span className="sdl-card__time sdl-accent">{fmtMs(timeMs)}</span>
      </header>

      <div className="sdl-knobs">
        <Knob label="TIME" value={fmtMs(timeMs)} norm={toNorm(timeMs, ...TIME_RANGE)} travel={320} size={72}
          onNorm={(n) => setSide(side, 'Time', Math.round(fromNorm(n, ...TIME_RANGE) * 100) / 100)}
          onReset={() => setSide(side, 'Time', DEFAULTS[`${side}Time`])}>
          <div className="sdl-halfdouble">
            <button type="button" className="sdl-chip" onClick={() => setSide(side, 'Time', clampMs(timeMs / 2))} title="Halve the delay time">÷2</button>
            <button type="button" className="sdl-chip" onClick={() => setSide(side, 'Time', clampMs(timeMs * 2))} title="Double the delay time">×2</button>
          </div>
        </Knob>
        <Knob label="FEEDBACK" value={fmtPct(k('Feedback'))} norm={k('Feedback') / 100}
          onNorm={(n) => setSide(side, 'Feedback', Math.round(n * 1000) / 10)}
          onReset={() => setSide(side, 'Feedback', DEFAULTS[`${side}Feedback`])} />
        <Knob label={isL ? 'X-FEED L→R' : 'X-FEED R→L'} value={fmtPct(k('Crossfeed'))} norm={k('Crossfeed') / 100}
          onNorm={(n) => setSide(side, 'Crossfeed', Math.round(n * 1000) / 10)}
          onReset={() => setSide(side, 'Crossfeed', 0)} />
      </div>

      <CutRange low={k('LowCut')} high={k('HighCut')}
        onLow={(v) => setSide(side, 'LowCut', Math.round(v))}
        onHigh={(v) => setSide(side, 'HighCut', Math.round(v))}
        onReset={() => setSideMany(side, { LowCut: CUT_MIN_HZ, HighCut: CUT_MAX_HZ })} />

      <div className="sdl-row">
        <span className="sdl-mini-label">INVERT</span>
        <div className="sdl-toggles">
          <Toggle on={k('FeedbackPhase')} label="Invert feedback phase" title="Flip the polarity of the feedback path"
            onClick={() => setSide(side, 'FeedbackPhase', !k('FeedbackPhase'))}>Ø FEEDBACK</Toggle>
          <Toggle on={k('CrossfeedPhase')} label="Invert crossfeed phase" title="Flip the polarity of the crossfeed path"
            onClick={() => setSide(side, 'CrossfeedPhase', !k('CrossfeedPhase'))}>Ø X-FEED</Toggle>
        </div>
      </div>
    </section>
  );
}

//----------------------------------------------------------------------
// panel
//----------------------------------------------------------------------
// `link` drives Stereo Link. `sync`/`setSync` from older callers are ignored:
// the browser DAW has no tempo, so delay times are always set in ms.
export function DelayEditorPanel({
  params, setParams, link = false, setLink, isPlaying,
  getInputPeak, getOutputPeak, getNow, onTestEcho = null, engineBadge = null,
}) {
  const p = withDefaults(params);
  const scopeRef = useRef(null);
  const scopeHistoryRef = useRef([]);
  const meterClockRef = useRef(null);
  const smoothedInputDbRef = useRef(METER_FLOOR_DB);
  const smoothedOutputDbRef = useRef(METER_FLOOR_DB);
  const animRef = useRef(0);

  const update = useCallback((fn) => setParams((prev) => fn(withDefaults(prev))), [setParams]);
  const setSideMany = useCallback((side, values) => {
    update((prev) => {
      const next = { ...prev };
      const other = side === 'l' ? 'r' : 'l';
      for (const [key, v] of Object.entries(values)) {
        next[`${side}${key}`] = v;
        if (link && LINKED_KEYS.has(key)) next[`${other}${key}`] = v;
      }
      return next;
    });
  }, [update, link]);
  const setSide = useCallback((side, key, v) => setSideMany(side, { [key]: v }), [setSideMany]);
  const setGlobal = useCallback((key, v) => update((prev) => ({ ...prev, [key]: v })), [update]);

  const toggleLink = () => {
    const turningOn = !link;
    setLink?.((v) => !v);
    if (turningOn) update((prev) => {
      const next = { ...prev };
      for (const key of LINKED_KEYS) next[`r${key}`] = prev[`l${key}`];
      return next;
    });
  };

  // ---- live scope ----
  useEffect(() => {
    if (isPlaying) return;
    if (scopeRef.current) drawDelayScope(scopeRef.current, [], 0, false);
  }, [isPlaying]);

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
        const raw = inPeak > 1e-6 ? 20 * Math.log10(inPeak) : METER_FLOOR_DB;
        smoothedInputDbRef.current = levelBallistic(smoothedInputDbRef.current, raw, dt);
      }
      const outPeak = getOutputPeak?.();
      if (outPeak !== null && outPeak !== undefined) {
        const raw = outPeak > 1e-6 ? 20 * Math.log10(outPeak) : METER_FLOOR_DB;
        smoothedOutputDbRef.current = levelBallistic(smoothedOutputDbRef.current, raw, dt);
      }
      const history = scopeHistoryRef.current;
      history.push({ t: now, inputDb: smoothedInputDbRef.current, outputDb: smoothedOutputDbRef.current });
      const cutoff = now - SCOPE_WINDOW_S - 0.5;
      while (history.length > 0 && history[0].t < cutoff) history.shift();
      if (scopeRef.current) drawDelayScope(scopeRef.current, history, now, true);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, getInputPeak, getOutputPeak, getNow]);

  return (
    <div className="sdl">
      <div className="sdl-global">
        <div className="sdl-global__group">
          <span className="sdl-mini-label">ROUTING</span>
          <Segmented label="Routing" options={ROUTING_OPTIONS} value={p.routing}
            format={(o) => o.toUpperCase()} onChange={(v) => setGlobal('routing', v)} />
        </div>
        <div className="sdl-global__group">
          <span className="sdl-mini-label">CHANNELS</span>
          <Toggle on={link} onClick={toggleLink} label="Stereo link"
            title="Edit both sides together (copies Left onto Right when switched on)">⛓ STEREO LINK</Toggle>
        </div>
      </div>

      <div className="sdl-channels">
        <ChannelCard side="l" p={p} setSide={setSide} setSideMany={setSideMany} />
        <ChannelCard side="r" p={p} setSide={setSide} setSideMany={setSideMany} />
      </div>

      <div className="sdl-output">
        <div className="subsection-label">OUTPUT MIX</div>
        <div className="sdl-output__rows">
          <LevelSlider label="LEFT WET" accent="var(--teal)" value={p.outLeft}
            onChange={(v) => setGlobal('outLeft', v)} onReset={() => setGlobal('outLeft', DEFAULTS.outLeft)} />
          <LevelSlider label="RIGHT WET" accent="var(--blue)" value={p.outRight}
            onChange={(v) => setGlobal('outRight', v)} onReset={() => setGlobal('outRight', DEFAULTS.outRight)} />
          <LevelSlider label="DRY" accent="var(--amber)" value={p.dry}
            onChange={(v) => setGlobal('dry', v)} onReset={() => setGlobal('dry', DEFAULTS.dry)} />
        </div>
      </div>

      <div className="sdl-scope">
        <div className="canvas-label sdl-scope__head">
          <span>
            LIVE DELAY ECHO SCOPE {!isPlaying && '· HIT PLAY TO SEE LIVE SIGNAL'}
            <span className="sdl-scope__sub"> · real dry input vs wet output over time</span>
          </span>
          {onTestEcho && (
            <button type="button" className="toggle-btn" onClick={onTestEcho} disabled={!isPlaying}
              title="Fire one isolated hit and mute the loop so the repeats ring out cleanly">⚡ PING ECHO</button>
          )}
        </div>
        <div className="sdl-scope__canvas"><canvas ref={scopeRef} width={760} height={150} /></div>
        <div className="legend-row">
          <div className="legend-item"><span className="legend-line" style={{ background: 'var(--amber)' }} />DRY INPUT</div>
          <div className="legend-item"><span className="legend-line" style={{ background: 'var(--teal)' }} />WET OUTPUT (ECHOES)</div>
        </div>
      </div>

      {engineBadge}

      <div className="concept-callout sdl-callout">
        <strong>Concept check:</strong> Feedback sends each echo back into its own line; crossfeed sends it to the
        other side. Ping-Pong routing bounces every repeat across the stereo field, and darkening the repeats with
        the high cut mimics how real echoes lose their top end.
      </div>
    </div>
  );
}
