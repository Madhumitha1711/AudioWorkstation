import { useEffect, useMemo, useRef, useState } from "react";
import "../../shared/labs.css";
import "./HearingAgeLab.css";
import { useLabAudio } from "../../shared/useLabAudio";
import { Audiogram, AgeFamily } from "./HearingCharts";
import {
  SCALE_AGES,
  SEX_LABEL,
  SWEEP,
  SWEEP_TICKS,
  THR_FREQS,
  TRY_TONES,
  ZONES,
  ageForCeil,
  ALPHA,
  ceilForAge,
  computeResults,
  earAge,
  fmtAge,
  levelGain,
  loadHistory,
  median,
  parseAge,
  pta,
  saveHistoryEntry,
  updateHistoryEntry,
  sweepFreqAt,
  whoGrade,
  zoneFor,
} from "./hearingAgeModel";

// Ported from design/hearing-health-age.html — "How old are your ears?", the
// Hearing Health lab for Foundations chapter 4 (courseData.js
// TOPICS[id="listening-skills"]), alongside critical-listening-lab. Three tabs:
//   - Take the test: setup checklist → Part 1, a rising 8→20 kHz sweep per
//     ear (press when it disappears) → Part 2, a simplified up-down
//     staircase (10 dB down / 5 dB up) at 1/2/4/6/8 kHz per ear → done.
//   - Results: hearing age vs calendar age (better ear), per-ear cards,
//     audiogram against ISO 7029 medians, insights (noise notch, biggest
//     gap, ear asymmetry), studio ear-care tips and the student's trend.
//   - The scale: the research/maths behind the number, a per-decade chart,
//     and a grid of high tones to try.
// The hearing-age maths lives in hearingAgeModel.js; charts in
// HearingCharts.jsx. All tones are live oscillators through this lab's own
// AudioContext (useLabAudio), not spatialAudioEngine.
//
// Differences from the mockup, because it renders inside a course lesson:
//   - no hero/<h1> or theme button — InteractiveSection's heading and the
//     app's ThemeContext cover those. Chrome uses the .svr-course tokens;
//     semantic colors are lab-scoped as --hha-* with light-theme values
//     (see HearingAgeLab.css). Charts color via CSS classes / var(), so a
//     theme flip restyles them with no redraw.
//   - Space / Y / N shortcuts are bound to the lab root, not the document,
//     so they only fire while focus is inside the lab.
//   - tab panels stay mounted (progress survives a tab switch) but audio
//     stops on switch; an interrupted sweep restarts that ear, and an
//     interrupted threshold trial is replayed on return.
//   - no demo/sample results: the Results tab stays empty until the
//     student finishes the test, and everything on it is computed from
//     that test's measurements (computeResults) when it completes.
//   - "Hearing age over time" shows the student's real saved results
//     (localStorage, per browser) instead of illustrative bars, and the
//     mockup's non-functional "Remind me" button is dropped.
//
// onInteract fires the first time the student plays any tone.

const TABS = [
  ["test", "01 · Take the test"],
  ["results", "02 · Results"],
  ["scale", "03 · The scale"],
];
const STEPS = ["Set up", "Top frequency", "Quietest sounds", "Done"];
const PRECHECKS = [
  ["Wired headphones on", "Over-ear or in-ear. Laptop speakers can't play the highest tones cleanly."],
  ["Quiet room", "No fan, TV or traffic. Background noise hides the quietest tones."],
  ["No loud music in the last hour", "Loud sound dulls your hearing for a while and would make you look older."],
];
const TIPS = [
  ["bars", "Mix at 79–85 dB SPL", "That's loud enough to judge balance. Check loud passages briefly, not for whole sessions."],
  ["clock", "Take 10 minutes off every hour", "Tired ears lose top end first — and you'll push the treble up to compensate."],
  ["ear", "Wear musician's earplugs at gigs", "Flat-response plugs cut the level evenly, so music still sounds natural. The WHO suggests no more than 40 hours a week at 80 dB."],
];
const ICONS = {
  notch: <path d="M3 7l5 0 3 9 3-9 7 0" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 8v5M12 16.5v.5" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  check: <path d="M5 12.5 10 17 19 7" />,
  bars: <path d="M4 18V8M9 18V4M14 18v-7M19 18v-4" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  ear: (
    <>
      <path d="M12 3a6 6 0 0 0-6 6c0 3 2 4 2 7a3 3 0 0 0 6 0" />
      <path d="M12 9a2 2 0 0 1 2 2" />
    </>
  ),
};
// Research sources — every link opens free, full text (no paywall / cart).
// ISO 7029 itself is a paid standard, so it points to the official free
// preview, which already contains the median formula and α coefficients.
const SOURCES = [
  ["ISO 7029:2017 (free preview: median formula & coefficient tables) — ", "Statistical distribution of hearing thresholds related to age and gender", "https://cdn.standards.iteh.ai/samples/42916/a2207a1a6c474475a6db216c9a44983c/ISO-7029-2017.pdf"],
  ["Jin et al. (2024), Journal of Audiology & Otology — ", "Trends in hearing thresholds by age: ISO 7029 vs newer country-specific data", "https://www.ejao.org/journal/view.php?doi=10.7874/jao.2023.00626"],
  ["Wang et al. (2021), J. Otolaryngology – Head & Neck Surgery — ", "Extended high-frequency audiometry in healthy adults with different age groups", "https://journals.sagepub.com/doi/full/10.1186/s40463-021-00534-w"],
  ["Hassan et al. (2025), Audiology Research — ", "The accuracy of self-administered web- and app-based hearing tests (systematic review)", "https://www.mdpi.com/2039-4349/15/3/73"],
  ["WHO & ITU (2019) — ", "Safe listening devices and systems: a WHO-ITU standard (80 dB for 40 hours a week)", "https://www.who.int/publications/i/item/9789241515276"],
  ["World Health Organization — ", "hearWHO: WHO's free hearing-check app", "https://www.who.int/teams/noncommunicable-diseases/sensory-functions-disability-and-rehabilitation/hearwho"],
];

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}
function SpeakerRing({ waves = 2, className = "" }) {
  return (
    <div className={`hha-ring ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        {waves > 1 && <path d="M18.5 5.5a9 9 0 0 1 0 13" />}
      </svg>
    </div>
  );
}
function EarPill({ ear }) {
  return <span className={`hha-ear-pill hha-ear-${ear}`}>● {ear === "R" ? "Right ear" : "Left ear"}</span>;
}
function Seg({ options, value, onChange, label }) {
  return (
    <div className="hha-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? "active" : undefined} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}
function Insight({ tone, icon, title, text }) {
  return (
    <div className="hha-insight">
      <div className={`hha-ic hha-tone-${tone}`}>
        <Icon name={icon} />
      </div>
      <div>
        <h4>{title}</h4>
        <p>{text}</p>
      </div>
    </div>
  );
}

export default function HearingAgeLab({ onInteract }) {
  const { getCtx, track, stopAll } = useLabAudio();
  const interactedRef = useRef(false);
  const markInteract = () => {
    if (!interactedRef.current) {
      interactedRef.current = true;
      onInteract?.();
    }
  };

  const [tab, setTab] = useState("test");
  const [step, setStep] = useState(0);
  const [toneOn, setToneOn] = useState(false);

  // ---- setup ----
  const [checks, setChecks] = useState([false, false, false]);
  const [ageInput, setAgeInput] = useState("32");
  const [sex, setSex] = useState("m");

  // The in-progress test, kept in a ref so the audio callbacks (RAF loop,
  // timeouts) always see the latest values without stale closures.
  const testRef = useRef({ age: 32, sex: "m", ceil: {}, thr: { R: {}, L: {} } });
  const [results, setResults] = useState(null); // null until a test is completed
  const [history, setHistory] = useState(loadHistory);

  // One place for every pending timeout, so tab switches / unmount can
  // cancel scheduled beeps in one go.
  const timersRef = useRef([]);
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  };
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  /* One enveloped sine tone, panned hard L/R (or centre). Short linear
     ramps avoid clicks, which would otherwise be audible even when the
     tone itself isn't — and give away a "silent" trial. */
  function tone({ freq, gain = 0.08, pan = 0, dur = 1, ramp = 0.03 }) {
    markInteract();
    const c = getCtx();
    const o = track(c.createOscillator());
    const g = track(c.createGain());
    const p = track(c.createStereoPanner());
    o.frequency.value = freq;
    p.pan.value = pan;
    o.connect(g).connect(p).connect(c.destination);
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + ramp);
    g.gain.setValueAtTime(gain, t + dur - ramp);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /* ================= Part 1: high-frequency sweep ================= */
  const sweepRef = useRef({ ear: "R", osc: null, gain: null, t0: 0, raf: 0, running: false });
  const [sweepEar, setSweepEar] = useState("R");
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepFreq, setSweepFreq] = useState(SWEEP.lo);
  const [sweepRightDone, setSweepRightDone] = useState(null); // right-ear ceiling, once measured

  function startSweep() {
    markInteract();
    const c = getCtx();
    const s = sweepRef.current;
    const o = track(c.createOscillator());
    const g = track(c.createGain());
    const p = track(c.createStereoPanner());
    p.pan.value = s.ear === "R" ? 1 : -1;
    o.connect(g).connect(p).connect(c.destination);
    const t = c.currentTime;
    // Exponential frequency ramp = equal time per octave, matching the
    // log-scaled progress bar below.
    o.frequency.setValueAtTime(SWEEP.lo, t);
    o.frequency.exponentialRampToValueAtTime(SWEEP.hi, t + SWEEP.dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.2);
    o.start(t);
    Object.assign(s, { osc: o, gain: g, t0: t, running: true });
    setSweepRunning(true);
    setToneOn(true);
    const loop = () => {
      const el = c.currentTime - s.t0;
      setSweepFreq(sweepFreqAt(el));
      if (el >= SWEEP.dur) {
        stopSweep();
        return;
      }
      s.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  /* Silence the sweep. `record` = the student pressed (or it reached the
     top) — store the ceiling and advance; otherwise it was interrupted. */
  function silenceSweep() {
    const s = sweepRef.current;
    if (!s.running) return null;
    const c = getCtx();
    const f = sweepFreqAt(c.currentTime - s.t0);
    s.gain.gain.cancelScheduledValues(c.currentTime);
    s.gain.gain.setTargetAtTime(0, c.currentTime, 0.02);
    try {
      s.osc.stop(c.currentTime + 0.1);
    } catch {
      /* already stopped */
    }
    cancelAnimationFrame(s.raf);
    s.running = false;
    setSweepRunning(false);
    setToneOn(false);
    return f;
  }
  function stopSweep() {
    const f = silenceSweep();
    if (f == null) return;
    const s = sweepRef.current;
    testRef.current.ceil[s.ear] = Math.round(f);
    if (s.ear === "R") {
      s.ear = "L";
      setSweepEar("L");
      setSweepRightDone(f);
    } else {
      goStep(2);
    }
  }
  function resetSweep() {
    sweepRef.current.ear = "R";
    setSweepEar("R");
    setSweepFreq(SWEEP.lo);
    setSweepRightDone(null);
  }
  function onSweepButton() {
    if (sweepRef.current.running) stopSweep();
    else {
      setSweepFreq(SWEEP.lo);
      startSweep();
    }
  }

  /* ================= Part 2: threshold staircase ==================
     Simplified up-down staircase (10 dB down after "heard", 5 dB up after
     "nothing"). Threshold = the first level heard twice on an ascending
     run, a "heard" at the -10 floor (can't go quieter), or the lowest
     level heard after MAX_TRIALS. Levels are relative.

     UX notes (the first port felt stuck — "Heard it" just replayed the
     same pitch quieter with nothing on screen changing, and both buttons
     were locked while the beeps played):
       - "Heard it" is live WHILE the beeps play, like a real audiometer's
         response button; pressing it cuts the remaining beeps. "Nothing"
         only unlocks once all three beeps have played.
       - every answer shows feedback ("Heard at 30 dB — trying quieter")
         and moves a level bar, so each press visibly does something.
       - "Play again" repeats the current beeps without counting a trial.
       - after every answer there's a short silent pause (≈1–1.8 s, a
         little random so the student can't anticipate the beeps) before
         the next trial plays; the answer buttons are locked during it.
         Without it the next, quieter beeps started the instant "Heard it"
         was pressed and sounded like the same tone carrying on. */
  // 14 answers per tone is enough for three ascending runs; a normal
  // listener confirms in ~9–10 (40✓ 30✓ 20✓ 10✓ 0✗ 5✓ -5✗ 0✗ 5✓ → 5 dB).
  // The old cap of 8 cut most tones off before the second ascending "heard",
  // so the result fell back to a (less reliable) descending answer.
  const MAX_TRIALS = 14;
  const thrRef = useRef(null);
  const [thrView, setThrView] = useState({ i: 0, busy: true, live: false, waiting: false, L: 40, msg: null, path: [] });
  const needsReplayRef = useRef(false);
  const thrEar = (i) => (i < THR_FREQS.length ? "R" : "L");
  const thrFreq = (i) => THR_FREQS[i % THR_FREQS.length];
  // asc[L]  = "heard" answers at level L that came right after a "nothing"
  //           (i.e. on the way up) — only these count towards the threshold.
  // ascYes  = every such level, for the fallback when the cap is hit.
  // path    = every level tried + answer, shown on screen as a trace.
  const freshTrialState = () => ({ L: 40, asc: {}, ascYes: [], lastNo: false, n: 0, lowestYes: null, live: false, path: [] });
  /* Cap reached without two matching ascending answers: use the lowest
     level heard on the way up; failing that the lowest heard at all; never
     heard → the level we stopped at (no response). */
  const fallbackThr = (t) => (t.ascYes.length ? Math.min(...t.ascYes) : t.lowestYes ?? t.L);

  function initThr() {
    thrRef.current = { i: 0, ...freshTrialState() };
    presentTrial(null);
  }
  function presentTrial(msg = thrView.msg) {
    const t = thrRef.current;
    const pan = thrEar(t.i) === "R" ? 1 : -1;
    const f = thrFreq(t.i);
    clearTimers();
    t.live = true; // a trial is on screen — answers now count
    setThrView({ i: t.i, busy: true, live: true, waiting: false, L: t.L, msg, path: t.path });
    setToneOn(true);
    needsReplayRef.current = true;
    [0, 450, 900].forEach((d) => later(() => tone({ freq: f, gain: levelGain(t.L), pan, dur: 0.25, ramp: 0.02 }), d));
    later(() => {
      needsReplayRef.current = false;
      setToneOn(false);
      setThrView((v) => ({ ...v, busy: false }));
    }, 1300);
  }
  /* Cut any beeps still scheduled or sounding for the current trial. */
  function silenceTrial() {
    clearTimers();
    stopAll();
    needsReplayRef.current = false;
    setToneOn(false);
  }
  function answer(heard) {
    const t = thrRef.current;
    if (!t || !t.live) return;
    if (!heard && thrView.busy) return; // "Nothing" only after all 3 beeps
    silenceTrial();
    t.n++;
    const was = t.L;
    t.path = [...t.path, { L: was, heard }];
    if (heard) {
      const ascending = t.lastNo;
      if (ascending) {
        t.asc[was] = (t.asc[was] || 0) + 1;
        t.ascYes.push(was);
      }
      t.lowestYes = t.lowestYes == null ? was : Math.min(t.lowestYes, was);
      if (t.asc[was] >= 2 || was <= -10) return recordThr(was);
      if (t.n >= MAX_TRIALS) return recordThr(fallbackThr(t));
      t.L = Math.max(-10, was - 10);
      t.lastNo = false;
      queueTrial(
        ascending
          ? { tone: "green", text: `Heard at ${was} dB on the way up (${t.asc[was]} of 2) — dropping 10 dB to double-check` }
          : { tone: "green", text: `Heard at ${was} dB — trying 10 dB quieter` },
      );
    } else {
      t.lastNo = true;
      if (was >= 90) return recordThr(90);
      if (t.n >= MAX_TRIALS) return recordThr(fallbackThr(t));
      t.L = Math.min(90, was + 5);
      queueTrial({
        tone: "amber",
        text: `Not heard at ${was} dB — going up in small 5 dB steps. Close to your limit the beeps will stay faint; that's expected.`,
      });
    }
  }
  /* Lock the answers, wait a short silent pause, then play the next trial. */
  function queueTrial(msg, base = 1000) {
    const t = thrRef.current;
    t.live = false;
    needsReplayRef.current = true; // leaving the tab mid-pause replays on return
    setThrView({ i: t.i, busy: true, live: false, waiting: true, L: t.L, msg, path: t.path });
    later(() => presentTrial(msg), base + Math.random() * 800);
  }
  function replayTrial() {
    if (thrRef.current?.live && !thrView.busy) presentTrial();
  }
  function recordThr(L) {
    const t = thrRef.current;
    const f = thrFreq(t.i);
    testRef.current.thr[thrEar(t.i)][f] = L;
    t.i++;
    if (t.i >= THR_FREQS.length * 2) {
      finishTest();
      return;
    }
    Object.assign(t, freshTrialState()); // live=false until the next trial starts
    const msg = {
      tone: "green",
      text: `✓ ${f / 1000} kHz: your quietest level is ${L} dB. Next: ${thrFreq(t.i) / 1000} kHz${t.i === THR_FREQS.length ? " in your left ear" : ""}`,
    };
    queueTrial(msg, 1200);
  }
  function finishTest() {
    // Fill the untested audiogram points so the chart reads cleanly:
    // 250/500 Hz copy 1 kHz (low pitches barely age), 3 kHz interpolates.
    const test = testRef.current;
    ["R", "L"].forEach((e) => {
      const t = test.thr[e];
      t[250] = t[500] = t[1000];
      t[3000] = Math.round((t[2000] + t[4000]) / 2);
    });
    const r = JSON.parse(JSON.stringify({ ...test, date: new Date().toISOString() }));
    setResults(r);
    setHistory(saveHistoryEntry({ date: r.date, age: r.age, hear: computeResults(r).hear }));
    goStep(3);
  }

  /* ================= flow ================= */
  function goStep(n) {
    setStep(n);
    if (n === 1) resetSweep();
    if (n === 2) initThr();
  }
  function startTest() {
    const age = parseAge(ageInput);
    if (age == null) return; // Start is disabled; the field shows why
    testRef.current = { age, sex, ceil: {}, thr: { R: {}, L: {} } };
    goStep(1);
  }
  /* Age / comparison group changed (setup form or the Results banner).
     They don't affect the measurements, only what they're compared with,
     so an existing result is re-scored straight away instead of showing
     the age that was typed before the test. */
  function updateProfile(nextAgeInput, nextSex) {
    setAgeInput(nextAgeInput);
    setSex(nextSex);
    const a = parseAge(nextAgeInput);
    if (a == null || !results || (results.age === a && results.sex === nextSex)) return;
    const r = { ...results, age: a, sex: nextSex };
    setResults(r);
    setHistory(updateHistoryEntry(r.date, { age: a, hear: computeResults(r).hear }));
  }
  function retake() {
    abortAudio();
    setTab("test");
    goStep(0);
  }

  /* Stop whatever is sounding without recording anything. */
  function abortAudio() {
    clearTimers();
    if (sweepRef.current.running) {
      silenceSweep();
      setSweepFreq(SWEEP.lo);
    }
    stopAll();
    setToneOn(false);
  }

  // Audio stops when leaving the test tab; an interrupted threshold trial
  // is replayed when the student comes back.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (tab !== "test") {
      abortAudio();
    } else if (stepRef.current === 2 && needsReplayRef.current && thrRef.current) {
      presentTrial();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(
    () => () => {
      clearTimers();
      cancelAnimationFrame(sweepRef.current.raf);
    },
    [],
  );

  function onKeyDown(e) {
    if (tab !== "test" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (step === 1 && e.code === "Space") {
      e.preventDefault();
      onSweepButton();
    } else if (step === 2) {
      const k = e.key.toLowerCase();
      if (k === "y") answer(true);
      if (k === "n") answer(false);
      if (k === "r") replayTrial();
    }
  }

  /* ================= scale tab ================= */
  const [scaleSex, setScaleSex] = useState("m");
  const [playingTone, setPlayingTone] = useState(null);
  function tryTone(f) {
    tone({ freq: f, gain: 0.06, dur: 1.5 });
    setPlayingTone(f);
    later(() => setPlayingTone((p) => (p === f ? null : p)), 1500);
  }

  /* ================= derived ================= */
  const res = useMemo(() => (results ? computeResults(results) : null), [results]);
  const allChecked = checks.every(Boolean);
  const ageOk = parseAge(ageInput) != null;

  return (
    <div
      className={`lab hha${toneOn ? " hha-tone-playing" : ""}`}
      onKeyDown={onKeyDown}
    >
      <div className="hha-tabs" role="tablist" aria-label="Hearing age check">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {/* ============================ TEST ============================ */}
      <section role="tabpanel" hidden={tab !== "test"}>
        <div className="hha-stepper">
          {STEPS.map((s, i) => (
            <div key={s} className={i < step ? "done" : i === step ? "cur" : undefined}>
              <i />
              <span>{s}</span>
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="hha-panel">
            <div className="hha-grid hha-g2">
              <div>
                <p className="hha-label">Before you start</p>
                <ul className="hha-checklist">
                  {PRECHECKS.map(([b, s], i) => (
                    <li key={b}>
                      <label>
                        <input
                          type="checkbox"
                          checked={checks[i]}
                          onChange={(e) => setChecks((c) => c.map((v, k) => (k === i ? e.target.checked : v)))}
                        />
                        <div>
                          <b>{b}</b>
                          <small>{s}</small>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="hha-label">About you</p>
                <p className="hha-muted" style={{ margin: "0 0 14px" }}>
                  Ears age a little differently in men and women, so we compare you with the right group.
                </p>
                <div className="hha-row" style={{ gap: 18, alignItems: "flex-end", marginBottom: 18 }}>
                  <div className="hha-field">
                    <label htmlFor="hha-age">Age</label>
                    <input
                      id="hha-age"
                      type="number"
                      inputMode="numeric"
                      min="18"
                      max="90"
                      step="1"
                      value={ageInput}
                      aria-invalid={!ageOk}
                      aria-describedby="hha-age-err"
                      onChange={(e) => updateProfile(e.target.value, sex)}
                    />
                  </div>
                  <div className="hha-field">
                    <span className="hha-field-label">Compare with</span>
                    <Seg label="Compare with" value={sex} onChange={(v) => updateProfile(ageInput, v)} options={[["m", "Men"], ["f", "Women"], ["x", "Everyone"]]} />
                  </div>
                </div>
                <p id="hha-age-err" className="hha-field-error" role="alert" style={{ margin: "-8px 0 14px" }}>
                  {ageOk ? "" : "Enter your age in whole years, 18 to 90 (the hearing tables start at 18)."}
                </p>
                <p className="hha-label">Set your volume</p>
                <div className="hha-cal">
                  <button type="button" className="hha-play" aria-label="Play reference tone" onClick={() => tone({ freq: 1000, gain: 0.12, dur: 1.5 })}>
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M7 5v14l12-7z" />
                    </svg>
                  </button>
                  <div>
                    Play the tone and set your device volume so it's <b>clearly audible but comfortable</b>. Don't change volume during the test.
                  </div>
                </div>
              </div>
            </div>
            <div className="hha-row" style={{ marginTop: 22 }}>
              <span className="hha-spacer" />
              <button type="button" className="hha-btn primary" disabled={!allChecked || !ageOk} onClick={startTest}>
                Start test →
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="hha-panel">
            <div className="hha-row">
              <p className="hha-label" style={{ margin: 0 }}>Part 1 of 2 · Highest tone you can hear</p>
              <span className="hha-spacer" />
              <EarPill ear={sweepEar} />
            </div>
            <div className="hha-stage">
              <SpeakerRing />
              <div className="hha-freq" aria-live="off">
                {(sweepFreq / 1000).toFixed(1)}
                <small>kHz</small>
              </div>
              <div className="hha-track">
                <div className="hha-track-fill" style={{ width: `${(Math.log(sweepFreq / SWEEP.lo) / Math.log(SWEEP.hi / SWEEP.lo)) * 100}%` }} />
              </div>
              <div className="hha-ticks">
                {SWEEP_TICKS.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <p className="hha-muted hha-hint">
                {sweepRightDone != null && sweepEar === "L" ? (
                  <>
                    Right ear: <b>{(sweepRightDone / 1000).toFixed(1)} kHz</b>. Now the same for your left ear.
                  </>
                ) : (
                  <>
                    A steady tone will rise in pitch. Press the button the moment it <b>disappears</b>.
                  </>
                )}
              </p>
              <button type="button" className="hha-big-stop" onClick={onSweepButton}>
                {sweepRunning ? "I can't hear it" : sweepEar === "L" ? "Next: left ear" : "Start tone"}
              </button>
              <span className="hha-muted hha-small">
                or press <kbd>Space</kbd>
              </span>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="hha-panel">
            <div className="hha-row">
              <p className="hha-label" style={{ margin: 0 }}>Part 2 of 2 · Quietest sound you can hear</p>
              <span className="hha-spacer" />
              <EarPill ear={thrEar(thrView.i)} />
            </div>
            <div className="hha-stage">
              <div className="hha-mini-dots" aria-label={`Tone ${thrView.i + 1} of ${THR_FREQS.length * 2}`}>
                {Array.from({ length: THR_FREQS.length * 2 }, (_, k) => (
                  <i key={k} className={k < thrView.i ? "ok" : k === thrView.i ? "cur" : undefined} />
                ))}
              </div>
              <SpeakerRing waves={1} />
              <div className="hha-freq">
                {thrFreq(thrView.i) / 1000}
                <small>kHz</small>
              </div>
              <p className="hha-muted hha-hint">
                {thrView.waiting
                  ? "Get ready — next beeps in a moment…"
                  : thrView.busy
                  ? "Listen… press Heard it as soon as you hear the beeps."
                  : "Did you hear three short beeps? Quieter after each ✓, a little louder after each ✗ — that zig-zag homes in on your limit."}
              </p>
              <div className="hha-level" role="img" aria-label={`Level ${thrView.L} dB`}>
                <span>Level</span>
                <div className="hha-level-bar">
                  <i style={{ width: `${((thrView.L + 10) / 100) * 100}%` }} />
                </div>
                <b>{thrView.L} dB</b>
              </div>
              <ol className="hha-trace" aria-label="Levels tried for this tone">
                {thrView.path.map((p, k) => (
                  <li key={k} className={p.heard ? "yes" : "no"}>
                    {p.L}
                    <span aria-label={p.heard ? "heard" : "not heard"}>{p.heard ? "✓" : "✗"}</span>
                  </li>
                ))}
              </ol>
              <p className={`hha-feedback${thrView.msg ? ` hha-tone-${thrView.msg.tone}` : ""}`} aria-live="polite">
                {thrView.msg?.text ?? " "}
              </p>
              <div className="hha-yn">
                <button type="button" className="yes" disabled={!thrView.live} onClick={() => answer(true)}>
                  ✓ Heard it
                </button>
                <button type="button" className="no" disabled={thrView.busy} onClick={() => answer(false)}>
                  ✗ Nothing
                </button>
              </div>
              <button type="button" className="hha-link hha-replay" disabled={thrView.busy} onClick={replayTrial}>
                ↻ Play again
              </button>
              <span className="hha-muted hha-small">
                <kbd>Y</kbd> heard · <kbd>N</kbd> nothing · <kbd>R</kbd> replay
              </span>
            </div>
            <p className="hha-note">
              Levels are relative, not calibrated dB HL. A medical hearing test calibrates each headphone model first — treat these numbers as a screen, not a diagnosis.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="hha-panel hha-done">
            <div className="hha-ring hha-ring-ok" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 12.5 10 17 19 7" />
              </svg>
            </div>
            <h3 className="hha-h2">All done.</h3>
            <p className="hha-muted" style={{ maxWidth: "44ch", margin: "0 auto 20px" }}>
              We compared your ears with population hearing tables, age by age.
            </p>
            <button type="button" className="hha-btn primary" onClick={() => setTab("results")}>
              See my hearing age →
            </button>
          </div>
        )}
      </section>

      {/* ============================ RESULTS ============================ */}
      <section role="tabpanel" hidden={tab !== "results"}>
        {results ? (
          <ResultsView r={results} res={res} history={history} onRetake={retake} onAge={(v) => updateProfile(v, results.sex)} />
        ) : (
          <div className="hha-panel hha-empty">
            <SpeakerRing />
            <h3 className="hha-h2">No results yet</h3>
            <p className="hha-muted">
              Your hearing age is worked out from your own measurements. Finish both parts of the test and your results will appear here.
            </p>
            <button type="button" className="hha-btn primary" onClick={() => setTab("test")}>
              {step > 0 && step < 3 ? "Continue the test →" : "Take the test →"}
            </button>
          </div>
        )}
      </section>

      {/* ============================ SCALE ============================ */}
      <section role="tabpanel" hidden={tab !== "scale"}>
        <div className="hha-panel">
          <p className="hha-label">The idea</p>
          <h3 className="hha-h2">Two ages, one pair of ears</h3>
          <div className="hha-compare" style={{ marginTop: 14 }}>
            <div>
              <b>Calendar age</b>
              <p>How many years you've lived. Fixed — you can't change it.</p>
            </div>
            <div>
              <b>Hearing age</b>
              <p>The age at which an average person hears like you do. Noise, genes and health can push it up or keep it down.</p>
            </div>
          </div>
          <p className="hha-muted" style={{ margin: "14px 0 0" }}>
            It works like "metabolic age" on a smart scale: we compare your result with large population tables of how hearing normally changes with age, and find the age you match best.
          </p>
        </div>

        <div className="hha-panel hha-mt">
          <div className="hha-row" style={{ marginBottom: 6 }}>
            <p className="hha-label" style={{ margin: 0 }}>How ears age — typical hearing by decade</p>
            <span className="hha-spacer" />
            <Seg label="Show tables for" value={scaleSex} onChange={setScaleSex} options={[["m", "Men"], ["f", "Women"]]} />
          </div>
          <AgeFamily sex={scaleSex} />
          <p className="hha-muted hha-caption">Low pitches barely change. High pitches (4–8 kHz) fade first and fastest — which is why the test focuses there.</p>
        </div>

        <div className="hha-grid hha-g2 hha-mt">
          <div className="hha-panel">
            <p className="hha-label">The scale</p>
            <div className="hha-table-scroll">
              <table className="hha-table">
                <thead>
                  <tr>
                    <th>Age</th>
                    <th>Loss @ 4 kHz</th>
                    <th>Loss @ 8 kHz</th>
                    <th>Top tone</th>
                  </tr>
                </thead>
                <tbody>
                  {SCALE_AGES.map((a) => (
                    <tr key={a}>
                      <td className="num">{a}</td>
                      <td className="num">{median(4000, a, scaleSex).toFixed(0)} dB</td>
                      <td className="num">{median(8000, a, scaleSex).toFixed(0)} dB</td>
                      <td className="num">~{(ceilForAge(a) / 1000).toFixed(1)} kHz</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hha-muted hha-caption">Hearing loss in dB compared with a healthy 18-year-old (median person). Top frequency is a rough guide; it varies a lot between people.</p>
          </div>
          <div className="hha-panel">
            <p className="hha-label">Try it — which tones can you hear?</p>
            <div className="hha-tone-grid">
              {TRY_TONES.map((f) => (
                <button key={f} type="button" className={playingTone === f ? "playing" : undefined} onClick={() => tryTone(f)}>
                  <b>{f / 1000} kHz</b>
                  <small>{f <= 9000 ? "Most people" : `Typical under ~${Math.round(ageForCeil(f))}`}</small>
                </button>
              ))}
            </div>
            <p className="hha-muted hha-caption">Use headphones at a moderate volume. Your device may cut off above ~18 kHz.</p>
          </div>
        </div>

        <div className="hha-panel hha-mt">
          <HowWeCalculate />
        </div>

        <div className="hha-panel hha-mt">
          <p className="hha-label">Research sources</p>
          <ol className="hha-sources">
            {SOURCES.map(([pre, text, href]) => (
              <li key={href}>
                {pre}
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {text}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------
   "How we calculate it" — the whole hearing-age calculation walked through
   with one worked example (a 32-year-old man's right ear). Every number is
   computed live from hearingAgeModel.js (median / earAge / ALPHA), so the
   explanation can never drift from the maths the lab actually runs.
---------------------------------------------------------------- */
const EX = {
  age: 32,
  sex: "m",
  // Right-ear thresholds from the beep test (3 kHz = average of 2k & 4k, rounded)
  thr: { 1000: 5, 2000: 5, 3000: 13, 4000: 20, 6000: 15, 8000: 10 },
  ceil: 15000, // highest tone heard in the sweep
  leftEarAge: 38, // the other ear, calculated the same way
};
const FIT_FREQS = [1000, 2000, 3000, 4000, 6000, 8000];
const kHz = (f) => `${f / 1000}k`;
const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const r2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
const exScore = (age) => FIT_FREQS.reduce((sum, f) => sum + (Math.max(EX.thr[f], 0) - median(f, age, EX.sex)) ** 2, 0);

function HowWeCalculate() {
  const ex = earAge(EX.thr, EX.ceil, EX.sex); // { fit, ceilAge, age }
  const fit = ex.fit;
  const overall = Math.min(ex.age, EX.leftEarAge);
  const delta = overall - EX.age;
  const zone = ZONES[zoneFor(delta)];
  const scoreAges = [30, 40, 44, fit, 48, 50, 60];

  return (
    <>
      <p className="hha-label">How we calculate it</p>
      <p className="hha-muted" style={{ marginTop: 0 }}>
        Each step has a worked example you can open — all five follow the same person, <b>a {EX.age}-year-old man's right ear</b>, and the numbers
        are worked out by the same code that calculates your result.
      </p>

      <ol className="hha-steps">
        {/* ---- Step 1 ---- */}
        <li>
          <div>
            <b>Find the quietest sound you can hear at each pitch.</b>{" "}
            <span className="hha-muted">
              At 1, 2, 4, 6 and 8 kHz the beeps get 10 dB quieter every time you hear them and 5 dB louder when you don't. The quietest level you
              reliably hear is your <b>threshold</b>, written <b>T</b>. A low T (0–10) means good hearing; a high T means sounds must be louder before
              you notice them.
            </span>
            <details className="hha-example">
              <summary>
                <span className="hha-example-tag">Example</span>
                <span className="hha-example-toggle" />
              </summary>
              <div className="hha-example-body">
              
              He heard the beeps at 15 dB twice but missed them at 10 dB, so at that pitch <b>T = 15</b>. Across all pitches his right ear gave:
              <div className="hha-table-scroll">
                <table className="hha-table hha-table-compact">
                  <thead>
                    <tr>
                      <th>Pitch</th>
                      {FIT_FREQS.map((f) => (
                        <th key={f}>{kHz(f)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>His T (dB)</td>
                      {FIT_FREQS.map((f) => (
                        <td key={f} className="num">{EX.thr[f]}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <span className="hha-example-foot">3 kHz isn't tested — it's the average of 2k and 4k: (5 + 20) ÷ 2 = 12.5 → 13.</span>
            </div>
            </details>
          </div>
        </li>

        {/* ---- Step 2 ---- */}
        <li>
          <div>
            <b>Work out what's typical at every age.</b>{" "}
            <span className="hha-muted">
              The international standard ISO 7029 gives the threshold of the <i>typical</i> (median) person at each age — as extra dB compared with a
              healthy 18-year-old. Half of people that age hear better, half worse.
            </span>
            <div className="hha-formula">typical T = α × (age − 18)²</div>
            <span className="hha-muted hha-sub">
              α depends on pitch and sex — small for low pitches, big for high ones, because high pitches fade first. For men: 1k = {ALPHA.m[1000]},
              4k = {ALPHA.m[4000]}, 8k = {ALPHA.m[8000]}.
            </span>
            <details className="hha-example">
              <summary>
                <span className="hha-example-tag">Example</span>
                <span className="hha-example-toggle" />
              </summary>
              <div className="hha-example-body">
              
              Typical threshold at <b>4 kHz</b> for men (α = {ALPHA.m[4000]}):
              <div className="hha-table-scroll">
                <table className="hha-table hha-table-compact">
                  <thead>
                    <tr>
                      <th>Age</th>
                      <th>Sum</th>
                      <th>Typical T</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[18, 30, 46, 60].map((a) => (
                      <tr key={a}>
                        <td className="num">{a}</td>
                        <td className="num">{a <= 18 ? "same as an 18-year-old" : `${ALPHA.m[4000]} × ${a - 18}² = ${ALPHA.m[4000]} × ${(a - 18) ** 2}`}</td>
                        <td className="num">
                          <b>{r1(median(4000, a, "m"))} dB</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span className="hha-example-foot">So a typical 60-year-old man needs a 4 kHz sound about 28 dB louder than an 18-year-old before he hears it.</span>
            </div>
            </details>
          </div>
        </li>

        {/* ---- Step 3 ---- */}
        <li>
          <div>
            <b>Find the age that matches you best.</b>{" "}
            <span className="hha-muted">
              For every age from 18 to 90 (in quarter-year steps) we measure how far your thresholds are from that age's typical ones. Each gap is
              squared so bigger misses count more, then added up. The age with the <b>smallest total</b> is your <b>chart-fit age</b>.
            </span>
            <div className="hha-formula">score(age) = Σ (your T − typical T)²</div>
            <details className="hha-example">
              <summary>
                <span className="hha-example-tag">Example</span>
                <span className="hha-example-toggle" />
              </summary>
              <div className="hha-example-body">
              
              His thresholds against a typical {r2(fit)}-year-old:
              <div className="hha-table-scroll">
                <table className="hha-table hha-table-compact">
                  <thead>
                    <tr>
                      <th>Pitch</th>
                      <th>His T</th>
                      <th>Typical T</th>
                      <th>Gap</th>
                      <th>Gap²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FIT_FREQS.map((f) => {
                      const typ = median(f, fit, EX.sex);
                      const gap = EX.thr[f] - typ;
                      return (
                        <tr key={f}>
                          <td>{kHz(f)}</td>
                          <td className="num">{EX.thr[f]}</td>
                          <td className="num">{r2(typ)}</td>
                          <td className="num">{r2(gap)}</td>
                          <td className="num">{r2(gap * gap)}</td>
                        </tr>
                      );
                    })}
                    <tr className="hha-total">
                      <td colSpan={4}>Score</td>
                      <td className="num">{r1(exScore(fit))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              Doing the same for other ages:
              <div className="hha-table-scroll">
                <table className="hha-table hha-table-compact">
                  <thead>
                    <tr>
                      <th>Age</th>
                      {scoreAges.map((a) => (
                        <th key={a} className={a === fit ? "hha-best" : undefined}>{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Score</td>
                      {scoreAges.map((a) => (
                        <td key={a} className={`num${a === fit ? " hha-best" : ""}`}>{r1(exScore(a))}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <span className="hha-example-foot">
                Lowest score is at <b>{r2(fit)}</b> → his chart-fit age is <b>{r2(fit)}</b>.
              </span>
            </div>
            </details>
          </div>
        </li>

        {/* ---- Step 4 ---- */}
        <li>
          <div>
            <b>Turn your highest tone into an age.</b>{" "}
            <span className="hha-muted">
              The highest pitch people can hear falls with age — about 17 kHz at 25, 16 kHz at 30, 14.5 kHz at 40, 12.5 kHz at 50. Your highest
              tone is placed on that scale; if it falls between two ages we take the matching point in between. That's your <b>top-pitch age</b>.
            </span>
            <details className="hha-example">
              <summary>
                <span className="hha-example-tag">Example</span>
                <span className="hha-example-toggle" />
              </summary>
              <div className="hha-example-body">
              
              He heard up to <b>15 kHz</b> — between 30 years (16 kHz) and 40 years (14.5 kHz):
              <div className="hha-formula">30 + 10 × (16,000 − 15,000) ÷ (16,000 − 14,500) = {r2(ex.ceilAge)}</div>
              <span className="hha-example-foot">
                His top-pitch age is <b>{r1(ex.ceilAge)}</b>.
              </span>
            </div>
            </details>
          </div>
        </li>

        {/* ---- Step 5 ---- */}
        <li>
          <div>
            <b>Blend the two, then pick your better ear.</b>{" "}
            <span className="hha-muted">
              Each ear's hearing age is a weighted average: the chart fit counts 70% (it uses five pitches, so it's steadier) and the top pitch 30%
              (a single button press). Your overall hearing age is your <b>better ear</b>.
            </span>
            <div className="hha-formula">ear age = 0.7 × chart-fit age + 0.3 × top-pitch age</div>
            <details className="hha-example">
              <summary>
                <span className="hha-example-tag">Example</span>
                <span className="hha-example-toggle" />
              </summary>
              <div className="hha-example-body">
              
              <div className="hha-calc">
                <span>Right ear</span>
                <b>
                  0.7 × {r2(fit)} + 0.3 × {r2(ex.ceilAge)} = {r2(0.7 * fit + 0.3 * ex.ceilAge)} → {ex.age}
                </b>
                <span>Left ear (same steps)</span>
                <b>{EX.leftEarAge}</b>
                <span>Hearing age (better ear)</span>
                <b>
                  lower of {ex.age} and {EX.leftEarAge} = {overall}
                </b>
                <span>Compared with his real age</span>
                <b>
                  {overall} − {EX.age} = {delta > 0 ? "+" : ""}
                  {delta} years
                </b>
              </div>
              <span className="hha-example-foot">
                Result: <b className={`hha-tone-${zone.tone}`}>{zone.label}</b> — {zone.title.toLowerCase()}.
              </span>
            </div>
            </details>
          </div>
        </li>
      </ol>
      <p className="hha-note">
        Why the better ear? It's how the WHO grades hearing overall. A big left/right difference is shown separately because it's a reason to see a
        doctor, not just a sign of age. And because levels aren't calibrated to your headphones, compare results over time using the same headphones,
        room and volume.
      </p>
    </>
  );
}

/* ---------------------------------------------------------------- */
function ResultsView({ r, res, history, onRetake, onAge }) {
  const { ears, hear, delta, zone, insights } = res;
  // Text being typed into the banner's age box (null = show r.age). Only a
  // valid age is applied, so half-typed values never re-score the result.
  const [ageDraft, setAgeDraft] = useState(null);
  const Z = ZONES[zone];
  const tone = Z.tone;

  // Ruler spans ages 15–85.
  const pos = (a) => Math.max(0, Math.min(100, ((a - 15) / 70) * 100));
  const pc = pos(r.age);
  const ph = pos(hear);
  const labelsCollide = Math.abs(pc - ph) < 9;

  // Trend: the student's real saved results, oldest → newest.
  const trend = history.slice(-6).map((h, i, arr) => [
    i === arr.length - 1 ? "Now" : new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    h.hear,
  ]);
  const trendMax = Math.max(...trend.map((t) => t[1]), r.age) + 5;

  return (
    <>
      <div className="hha-banner">
          <>
            <span className="hha-tag hha-tag-ok">Your test</span>
            <span>
              Results from {new Date(r.date).toLocaleDateString()} · compared with <b>{SEX_LABEL[r.sex]}</b> aged{" "}
              <input
                className="hha-inline-age"
                type="number"
                inputMode="numeric"
                min="18"
                max="90"
                step="1"
                aria-label="Calendar age"
                value={ageDraft ?? String(r.age)}
                aria-invalid={ageDraft != null && parseAge(ageDraft) == null}
                onChange={(e) => {
                  setAgeDraft(e.target.value);
                  if (parseAge(e.target.value) != null) onAge(e.target.value);
                }}
                onBlur={() => setAgeDraft(null)}
              />
              .
            </span>
          </>
      </div>

      <div className="hha-panel">
        <div className="hha-age-hero">
          <div>
            <p className="hha-label">Your hearing age</p>
            <div className="hha-ages">
              <div>
                <div className={`hha-age-num big hha-tone-${tone}`}>{fmtAge(hear)}</div>
                <div className="hha-age-cap">Hearing age</div>
              </div>
              <div>
                <div className="hha-age-num small">{r.age}</div>
                <div className="hha-age-cap">Calendar age</div>
              </div>
            </div>
            <div className={`hha-delta hha-tone-${tone}`}>
              {delta === 0 ? "Same as your age" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} years ${delta > 0 ? "older" : "younger"}`}
            </div>
            <div className="hha-verdict">{Z.title}</div>
            <p className="hha-muted" style={{ margin: 0, maxWidth: "48ch" }}>{Z.text}</p>
          </div>
          <div>
            <div className="hha-ruler">
              <div className="hha-ruler-track" />
              <div className={`hha-ruler-span hha-bg-${tone}`} style={{ left: `${Math.min(pc, ph)}%`, width: `${Math.abs(pc - ph)}%` }} />
              <span className="hha-ruler-lbl hha-ruler-lbl-cal" style={{ left: `${pc}%`, top: labelsCollide ? 26 : -30 }}>
                You {r.age}
              </span>
              <span className={`hha-ruler-lbl hha-tone-${tone}`} style={{ left: `${ph}%` }}>
                Ears {fmtAge(hear)}
              </span>
              <div className="hha-ruler-mk cal" style={{ left: `${pc}%` }} />
              <div className={`hha-ruler-mk hear hha-bg-${tone}`} style={{ left: `${ph}%` }} />
            </div>
            <div className="hha-ruler-ticks">
              {[15, 25, 35, 45, 55, 65, 75, 85].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div className="hha-zones">
              {ZONES.map((z, i) => (
                <div key={z.label} className={`hha-tone-${z.tone}${i === zone ? " on" : ""}`}>
                  <b>{z.label}</b>
                  <span className="hha-muted">{z.range}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="hha-grid hha-g2 hha-mt">
        {["R", "L"].map((e) => {
          const E = ears[e];
          const p = pta(r.thr[e]);
          return (
            <div key={e} className="hha-panel hha-ear-card">
              <div className="hha-ear-top">
                <EarPill ear={e} />
                <span className="hha-tag">{E.age === hear ? "Better ear" : "—"}</span>
              </div>
              <div>
                <span className={`hha-age-num hha-ear-age hha-tone-${e === "R" ? "red" : "blue"}`}>{fmtAge(E.age)}</span>{" "}
                <span className="hha-muted" style={{ fontSize: 13 }}>hearing age</span>
              </div>
              <div className="hha-kv">
                <span>Highest tone heard</span>
                <b>{(r.ceil[e] / 1000).toFixed(1)} kHz</b>
                <span>Typical at {r.age}</span>
                <b className="hha-muted">{(ceilForAge(r.age) / 1000).toFixed(1)} kHz</b>
                <span>Average loss (0.5–4 kHz)</span>
                <b>{p.toFixed(0)} dB</b>
                <span>Hearing grade (WHO)</span>
                <b>{whoGrade(p)}</b>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hha-panel hha-mt">
        <div className="hha-row" style={{ marginBottom: 6 }}>
          <p className="hha-label" style={{ margin: 0 }}>Your hearing chart (audiogram)</p>
          <span className="hha-spacer" />
          <span className="hha-tag">Lower on the chart = quieter sounds you missed</span>
        </div>
        <Audiogram r={r} hear={hear} />
        <div className="hha-legend">
          <span>
            <b className="hha-tone-red">○</b> Right ear
          </span>
          <span>
            <b className="hha-tone-blue">✕</b> Left ear
          </span>
          <span>
            <i className="hha-legend-cal" /> Typical at your calendar age
          </span>
          <span>
            <i className="hha-legend-hear" /> Typical at your hearing age
          </span>
        </div>
      </div>

      <div className="hha-grid hha-g2 hha-mt">
        <div className="hha-panel">
          <p className="hha-label">What this means for you</p>
          <div className="hha-stack">
            {insights.map((x) => (
              <Insight key={x.title} {...x} />
            ))}
          </div>
        </div>
        <div className="hha-panel">
          <p className="hha-label">Protect your ears in the studio</p>
          <div className="hha-stack">
            {TIPS.map(([icon, title, text]) => (
              <Insight key={title} tone="teal" icon={icon} title={title} text={text} />
            ))}
          </div>
        </div>
      </div>

      <div className="hha-grid hha-g2 hha-mt">
        <div className="hha-panel">
          <div className="hha-row">
            <p className="hha-label" style={{ margin: 0 }}>Hearing age over time</p>
            <span className="hha-spacer" />
            <span className="hha-tag">Saved on this device</span>
          </div>
          {trend.length > 1 ? (
            <div className="hha-trend">
              {trend.map(([lbl, v], i) => (
                <div key={`${lbl}-${i}`}>
                  <span>{fmtAge(v)}</span>
                  <i className={i === trend.length - 1 ? "now" : undefined} style={{ height: `${(v / trendMax) * 70}px` }} />
                  <span>{lbl}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="hha-muted hha-caption">This is your first result. Retest in a few months and your trend will build up here.</p>
          )}
          <p className="hha-muted hha-caption">A single result can be off by a few years. The trend is what matters — a jump between tests is worth acting on.</p>
        </div>
        <div className="hha-panel hha-next">
          <div>
            <p className="hha-label">Next check</p>
            <h3 className="hha-h3">Retest in 3 months</h3>
            <p className="hha-muted" style={{ margin: 0, fontSize: 13 }}>Same headphones, same room, same volume — so results are comparable.</p>
          </div>
          <div className="hha-row">
            <button type="button" className="hha-btn primary" onClick={onRetake}>
              Retake now
            </button>
          </div>
        </div>
      </div>

      <div className="hha-disclaimer">
        <b>This is a screening check, not a diagnosis.</b> Hearing age compares you with population averages (ISO 7029). See an audiologist if your hearing age is 10+ years above your calendar age, your two ears differ a lot, or you have ringing, pain or sudden change in hearing.
      </div>
    </>
  );
}
