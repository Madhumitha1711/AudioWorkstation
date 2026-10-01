import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import { useLabAudio } from "../../shared/useLabAudio";
import "./CableMatchLab.css";
import { CABLES, GLYPH, MISTAKES, PORTS } from "./cableMatchData";

// Ported from design/cable-connector-sound-quiz.html — a match-the-following
// quiz for Ch.8 "Connectors, Cables, and Studio Wiring": 10 cables (left)
// are plugged into the right socket on a hardware rear panel (right).
// Drag a cable's plug onto a socket, or tap the cable then the socket
// (keyboard: Enter/Space on each, Esc cancels).
//
// Differences from the mockup:
//   - No music. The mockup synthesised a 4-bar groove where each correct
//     match brought an instrument into the mix. Here the console strip is a
//     row of status lights instead: one per cable, red = not connected,
//     green = connected. A wrong socket blinks that cable's red light.
//     The only sound is a short feedback tone per attempt (playFeedback).
//   - Connected wires show a slow "signal flow" dash instead of only while
//     the (now removed) mix is playing.
//   - No page heading / theme switch — the lesson heading and ThemeContext
//     cover those. Type uses the global --font-* / --fs-* tokens.
//
// Both columns sit in matching panels (course theme colours). Colour is
// minimal: one neutral cable colour, the accent for the selected cable,
// red / green for status.
// onInteract fires on the student's first connection attempt.

/* Feedback tones — one short blip per attempt, built from plain
   oscillators on the lab's own AudioContext (useLabAudio, not the
   panorama's spatialAudioEngine). Right = a bright rising two-note chime
   (E5 → B5, sine). Wrong = a low falling buzz (220 → 140 Hz square through
   a lowpass so it reads as "no" without being harsh). Each note gets its
   own gain envelope (fast attack, exponential decay) so there are no
   clicks; nodes stop themselves, so nothing needs tracking. */
function playFeedback(ctx, ok) {
  const t0 = ctx.currentTime + 0.01;
  const out = ctx.createGain();
  out.gain.value = 0.22;
  out.connect(ctx.destination);
  const note = (type, f0, f1, start, dur, dest) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(1, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur + 0.02);
  };
  if (ok) {
    note("sine", 659.25, 659.25, t0, 0.18, out);
    note("sine", 987.77, 987.77, t0 + 0.09, 0.32, out);
  } else {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.connect(out);
    note("square", 220, 140, t0, 0.32, lp);
  }
}

const byId = Object.fromEntries(CABLES.map((c) => [c.id, c]));
const portById = Object.fromEntries(PORTS.map((p) => [p.id, p]));

const PLUG_SVG = (
  <svg viewBox="0 0 46 22" aria-hidden="true">
    <path d="M0 11h12" stroke="var(--tone)" strokeWidth="3" strokeLinecap="round" />
    <g className="cml-plug-head">
      <rect x="10" y="4" width="22" height="14" rx="4" fill="var(--tone)" stroke="var(--cml-cable-outline)" />
      <path d="M14 7.5v7M18 7.5v7" stroke="rgba(0,0,0,.35)" strokeWidth="1.4" />
      <rect x="32" y="7" width="11" height="8" rx="1.5" fill="#c8cbd2" stroke="rgba(0,0,0,.4)" />
    </g>
  </svg>
);

const IC = {
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  ),
  ok: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  err: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 12h3l2-5 3 10 2.5-7 2 4H21" />
    </svg>
  ),
};

const INTRO = {
  kind: "info",
  title: "How it works",
  html: "Each cable is built for one kind of signal: a tiny mic signal, line level, amplifier current, digital data, or light. <strong>Drag a plug into a socket</strong>, or tap a cable and then a socket. Get it right and that cable's light at the top turns green.",
};

/* A hanging cable: horizontal exits at both ends, sag grows with span. */
function wirePath(a, b) {
  const dx = Math.max(30, Math.abs(b.x - a.x) * 0.45);
  const sag = 14 + Math.hypot(b.x - a.x, b.y - a.y) * 0.1;
  return `M${a.x},${a.y} C${a.x + dx},${a.y + sag} ${b.x - dx},${b.y + sag} ${b.x},${b.y}`;
}

/* Restart a one-shot CSS animation class on an element (wrong-socket shake,
   reveal pulse, nudge, LED blink) without remounting it — remounting would
   drop keyboard focus. */
function flash(el, cls, ms) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  clearTimeout(el[`_${cls}`]);
  el[`_${cls}`] = setTimeout(() => el.classList.remove(cls), ms);
}

function Wire({ a, b, className = "" }) {
  const d = wirePath(a, b);
  const tone = "var(--cml-cable)";
  return (
    <g className={className}>
      <path className="cml-wire-o" d={d} />
      <path className="cml-wire" d={d} style={{ stroke: tone }} />
      <path className="cml-wire-hi" d={d} />
      <path className="cml-wire-flow" d={d} />
      <rect className="cml-boot" x={b.x - 18} y={b.y - 4.5} width="16" height="9" rx="3" style={{ fill: tone }} />
    </g>
  );
}

function CableMatchLab({ onInteract }) {
  const [armed, setArmed] = useState(null);
  const [links, setLinks] = useState({}); // cableId -> portId
  const [order, setOrder] = useState([]); // cableIds in connection order
  const [attempts, setAttempts] = useState(0);
  const [misses, setMisses] = useState({});
  const [fb, setFb] = useState(INTRO);
  const [justLinked, setJustLinked] = useState(null);
  const [geo, setGeo] = useState({}); // cableId -> {a, b} wire endpoints
  const [drag, setDrag] = useState(null); // {id, a, p, over}

  const boardRef = useRef(null);
  const anchorRefs = useRef({});
  const wellRefs = useRef({});
  const cableRefs = useRef({});
  const portRefs = useRef({});
  const ledRefs = useRef({});
  const dragRef = useRef(null);
  const suppressClick = useRef(false);
  const interacted = useRef(false);
  const { getCtx } = useLabAudio();

  const n = order.length;
  const complete = n === CABLES.length;

  /* ---------- geometry ---------- */
  const srcPt = useCallback((id) => {
    const r = anchorRefs.current[id].getBoundingClientRect();
    const b = boardRef.current.getBoundingClientRect();
    return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 };
  }, []);
  const dstPt = useCallback((pid) => {
    const r = wellRefs.current[pid].getBoundingClientRect();
    const b = boardRef.current.getBoundingClientRect();
    return { x: r.left - b.left + 6, y: r.top - b.top + r.height / 2 };
  }, []);

  const measure = useCallback(() => {
    if (!boardRef.current) return;
    const next = {};
    Object.entries(links).forEach(([id, pid]) => {
      next[id] = { a: srcPt(id), b: dstPt(pid) };
    });
    setGeo(next);
  }, [links, srcPt, dstPt]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    if (!justLinked) return undefined;
    const t = setTimeout(() => setJustLinked(null), 700);
    return () => clearTimeout(t);
  }, [justLinked]);

  /* ---------- feedback ---------- */
  const showFact = useCallback((id, again, pid) => {
    const c = byId[id];
    const alt = c.correct.filter((x) => x !== pid).map((x) => portById[x].name);
    const altTxt = alt.length ? ` <span class="cml-fb-alt">Also correct: ${alt.join(", ")}.</span>` : "";
    setFb({
      kind: "ok",
      title: `${again ? "Connected" : "Signal"} · ${c.name} → ${portById[pid].name}`,
      html: c.fact + altTxt,
    });
  }, []);

  /* ---------- interaction ---------- */
  const arm = useCallback(
    (id) => {
      if (links[id]) {
        showFact(id, true, links[id]);
        return;
      }
      const next = armed === id ? null : id;
      setArmed(next);
      if (next) {
        setFb({
          kind: "info",
          title: "Now pick a socket",
          html: `<strong>${byId[id].name}</strong> (${byId[id].use}). Which connector carries this signal?`,
        });
      }
    },
    [armed, links, showFact],
  );

  const attempt = useCallback(
    (id, pid) => {
      if (!id || links[id]) return;
      const c = byId[id];
      if (!interacted.current) {
        interacted.current = true;
        onInteract?.();
      }
      setAttempts((a) => a + 1);
      const ok = c.correct.includes(pid);
      try {
        playFeedback(getCtx(), ok);
      } catch {
        /* no Web Audio — the lights and message still give feedback */
      }
      if (ok) {
        setLinks((l) => ({ ...l, [id]: pid }));
        setOrder((o) => [...o, id]);
        setJustLinked(id);
        setArmed(null);
        showFact(id, false, pid);
      } else {
        const m = (misses[id] || 0) + 1;
        setMisses((ms) => ({ ...ms, [id]: m }));
        flash(portRefs.current[pid], "wrong", 450);
        flash(ledRefs.current[id], "blink", 900);
        setFb({
          kind: "err",
          title: `No signal · ${portById[pid].name} is the wrong socket`,
          html: MISTAKES[`${id}>${pid}`] || c.hint,
          reveal: m >= 3 ? id : null,
        });
      }
    },
    [links, misses, onInteract, showFact, getCtx],
  );

  const reveal = (id) => flash(portRefs.current[byId[id].correct[0]], "reveal", 3400);

  const onCableClick = (id) => {
    if (suppressClick.current) return;
    arm(id);
  };

  const onPortClick = (pid) => {
    if (!armed) {
      setFb({ kind: "info", title: "Pick a cable first", html: "Choose a cable on the left, then plug it into this socket." });
      CABLES.forEach((c) => !links[c.id] && flash(cableRefs.current[c.id], "nudge", 500));
      return;
    }
    attempt(armed, pid);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setArmed(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* drag a plug across the gap */
  const onPlugDown = (e, id) => {
    if (links[id]) return;
    dragRef.current = { id, x0: e.clientX, y0: e.clientY, moved: false, over: null };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPlugMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    if (!d.moved) {
      d.moved = true;
      if (armed !== d.id) arm(d.id);
    }
    const b = boardRef.current.getBoundingClientRect();
    const portEl = document.elementFromPoint(e.clientX, e.clientY)?.closest(".cml-port");
    d.over = portEl?.dataset.id ?? null;
    setDrag({ id: d.id, a: srcPt(d.id), p: { x: e.clientX - b.left, y: e.clientY - b.top }, over: d.over });
  };
  const onPlugEnd = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDrag(null);
    if (d.moved) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      if (d.over) attempt(d.id, d.over);
    }
  };

  const restart = () => {
    setArmed(null);
    setLinks({});
    setOrder([]);
    setAttempts(0);
    setMisses({});
    setFb(INTRO);
  };

  /* ---------- render ---------- */
  return (
    <section className={`lab cml${armed ? " arming" : ""}`} aria-label="Cable and connector match">
      {/* status strip — one light per cable: red = not connected, green = connected */}
      <div className="cml-status">
        <div className="cml-score" aria-live="polite">
          <b>{n}</b>/ {CABLES.length} connected
          <small>
            {attempts} attempt{attempts === 1 ? "" : "s"}
          </small>
        </div>
        <ul className="cml-leds" aria-label="Connection status">
          {CABLES.map((c) => {
            const on = !!links[c.id];
            return (
              <li
                key={c.id}
                ref={(el) => (ledRefs.current[c.id] = el)}
                className={`cml-led${on ? " on" : ""}${justLinked === c.id ? " just" : ""}${armed === c.id ? " armed" : ""}`}
                title={`${c.name}: ${on ? "connected" : "not connected"}`}
              >
                <span className="cml-lamp" aria-hidden="true" />
                <span className="cml-led-name">{c.ch}</span>
                <span className="cml-sr">
                  {c.name} {on ? "connected" : "not connected"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="cml-body">
        <div className="cml-heads">
          <span>Cables · the signal</span>
          <span />
          <span>Rear panel · connectors</span>
        </div>
        <div className="cml-board" ref={boardRef}>
          <div className="cml-panel cml-panel--cables">
          <div className="cml-col">
            {CABLES.map((c) => {
              const done = !!links[c.id];
              return (
                <button
                  key={c.id}
                  type="button"
                  ref={(el) => (cableRefs.current[c.id] = el)}
                  className={`cml-cable${done ? " done" : ""}${armed === c.id ? " armed" : ""}${drag?.id === c.id ? " dragging" : ""}`}
                  aria-pressed={armed === c.id}
                  aria-label={done ? `${c.name}, connected to ${portById[links[c.id]].name}` : `${c.name}, ${c.use}`}
                  onClick={() => onCableClick(c.id)}
                >
                  <span className="cml-cable-txt">
                    <span className="cml-cable-name">{c.name}</span>
                    <span className="cml-cable-sub">{c.use}</span>
                  </span>
                  <span
                    className="cml-plug"
                    onPointerDown={(e) => onPlugDown(e, c.id)}
                    onPointerMove={onPlugMove}
                    onPointerUp={onPlugEnd}
                    onPointerCancel={onPlugEnd}
                  >
                    {PLUG_SVG}
                    <span className="cml-plug-anchor" ref={(el) => (anchorRefs.current[c.id] = el)} />
                  </span>
                </button>
              );
            })}
          </div>
          </div>
          <div />
          <div className="cml-panel cml-panel--ports">
            <div className="cml-col">
              {PORTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-id={p.id}
                  ref={(el) => (portRefs.current[p.id] = el)}
                  className={`cml-port${drag?.over === p.id ? " hover" : ""}`}
                  aria-label={`${p.name} socket`}
                  onClick={() => onPortClick(p.id)}
                >
                  <span className="cml-well" ref={(el) => (wellRefs.current[p.id] = el)}>
                    <svg viewBox="0 0 40 40" dangerouslySetInnerHTML={{ __html: GLYPH[p.id] }} />
                  </span>
                  <span className="cml-port-txt">
                    <span className="cml-port-name">{p.name}</span>
                    <span className="cml-port-sub">{p.sub}</span>
                  </span>
                  <span className="cml-port-leds">
                    {order
                      .filter((id) => links[id] === p.id)
                      .map((id) => (
                        <i key={id} />
                      ))}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <svg className="cml-svg" aria-hidden="true">
            <g>
              {order.map((id) =>
                geo[id] ? (
                  <Wire key={id} a={geo[id].a} b={geo[id].b} className={id === justLinked ? "cml-wire-new" : ""} />
                ) : null,
              )}
            </g>
            {drag && <Wire a={drag.a} b={drag.p} className="cml-drag-wire" />}
          </svg>
        </div>

        <div className="cml-foot">
          <div className={`cml-fb ${fb.kind === "info" ? "" : fb.kind}`} aria-live="polite">
            <div className="cml-fb-ic">{IC[fb.kind]}</div>
            <div>
              <div className="cml-fb-t">{fb.title}</div>
              <p>
                <span dangerouslySetInnerHTML={{ __html: fb.html }} />
                {fb.reveal && (
                  <button type="button" className="cml-fb-link" onClick={() => reveal(fb.reveal)}>
                    Show me
                  </button>
                )}
              </p>
            </div>
          </div>

          {complete && (
            <div className="cml-done">
              <h3>Every cable is connected</h3>
              <p>All ten cables found the connector built for their signal.</p>
              <div className="cml-stats">
                <div>
                  {Math.round((n / attempts) * 100)}%<small>accuracy</small>
                </div>
                <div>
                  {attempts}
                  <small>attempts</small>
                </div>
              </div>
              <ul className="cml-recap">
                {CABLES.map((c) => (
                  <li key={c.id}>
                    <i />
                    {c.name.replace(/ \(.*\)/, "")} → {portById[links[c.id]].name}
                  </li>
                ))}
              </ul>
              <button type="button" className="cml-btn" onClick={restart}>
                Restart quiz
              </button>
            </div>
          )}
          <p className="cml-note">
            Sockets can take more than one cable. Same plug, different signal: an XLR can carry a mic or AES digital, and an RCA can
            carry analog line level or S/PDIF.
          </p>
        </div>
      </div>
    </section>
  );
}

export default CableMatchLab;
