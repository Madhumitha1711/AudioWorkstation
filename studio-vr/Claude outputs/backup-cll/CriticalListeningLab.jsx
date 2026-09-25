import { useEffect, useMemo, useRef, useState } from "react";
import "../../shared/labs.css";
import "./CriticalListeningLab.css";
import { createListeningEngine } from "./criticalListeningAudio";
import Spectrum from "./Spectrum";
import {
  CATS,
  CAT_COLOR,
  LEVELS,
  PROBLEMS,
  PROBLEM_BY_ID as P,
  buildQuestions,
} from "./criticalListeningData";

// Ported from design/critical-listening-lab-1.html — "Spot the problem", the
// Critical Listening lab for Foundations chapter 4 (courseData.js
// TOPICS[id="listening-skills"]). Two tabs:
//   - Train: an 8-question quiz. Each question plays a synthesized loop
//     with an instant, sample-aligned A/B flip between the clean reference
//     and a copy with one problem applied (EQ, compression, clipping, hum,
//     comb filtering, reverb…); the student names the problem, then gets
//     What it is / Listen for / Common cause / How to fix. Beginner /
//     Intermediate / Pro change which problems are in the pool and how
//     strongly they're applied. The spectrum is hidden until answered,
//     or revealed early as a half-point hint.
//   - Problem library: every problem, grouped by category and searchable,
//     each auditionable with the same A/B player.
// All audio is real Web Audio processing (criticalListeningAudio.js +
// each problem's build() in criticalListeningData.js), nothing prerecorded.
//
// Differences from the mockup, because it renders inside a course lesson
// rather than as a standalone page:
//   - no page <h1>/hero or theme button — InteractiveSection's heading and
//     the app's ThemeContext cover those. Chrome colors come from the
//     .svr-course tokens (--panel, --border, --text-dim…); the mockup's
//     semantic colors are lab-scoped as --cll-* with light-theme values.
//   - keyboard shortcuts (Space play/stop, A/B flip, 1–4 answer, Enter
//     next, ↑/↓ step the library) are bound to the lab's own root, not the
//     document, so they only fire while focus is inside the lab and can't
//     hijack Space for the rest of the course page.
//   - audio stops on tab switch and is torn down on unmount.
//
// Added after the port:
//   - Reference uploads (bar just below the Train / Problem library tabs):
//     the student can upload any number of their own audio files. Each is
//     prepared once (stereo + fixed headroom, same level on A and B — see
//     criticalListeningAudio.js) and kept for the session. Which one plays
//     is picked with the "Reference track" select under the A card, in both
//     the quiz and the library (one shared choice; built-in loop is the
//     default). Uploading doesn't switch tracks by itself except for the
//     very first upload batch, so a student mid-quiz isn't surprised.
//   - Clip B is unity gain apart from the problem itself (no level-matching
//     make-up gains — see criticalListeningData.js), hence the "Unity gain"
//     tag instead of the mockup's "Level-matched".
//   - While the spectrum is hidden it isn't drawn at all (not blurred), so
//     there's nothing to squint at through the veil — the L/R meters are
//     hidden too, since they'd give away an imbalance.
//
// onInteract (from InteractiveSection) fires the first time the student
// answers a question or auditions a problem in the library.
const fmt = (x) => (Number.isInteger(x) ? x : x.toFixed(1));

function ABSwitch({ side, onSide, bLabel, bDesc, aLabel = "Reference", aDesc = "Clean mix", aFooter = null }) {
  const group = (
    <div className="cll-ab" role="radiogroup" aria-label="Which clip to hear">
      {[
        ["A", aLabel, aDesc],
        ["B", bLabel, bDesc],
      ].map(([k, l, d]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={side === k}
          data-side={k}
          className={side === k ? "active" : undefined}
          onClick={() => onSide(k)}
        >
          <span className="cll-live" />
          <span className="cll-ab-k">{k}</span>
          <span className="cll-ab-l">{l}</span>
          <span className="cll-ab-d">{d}</span>
        </button>
      ))}
    </div>
  );
  if (!aFooter) return group;
  // The footer sits in its own 2-column grid under the switch, in the A
  // column, so it reads as part of the reference card without being nested
  // inside the A <button> (interactive content can't live in a button).
  return (
    <div className="cll-ab-wrap">
      {group}
      <div className="cll-ab-foot">{aFooter}</div>
    </div>
  );
}

function PlayButton({ on, onClick }) {
  return (
    <button type="button" className="cll-play" aria-label={on ? "Stop" : "Play"} onClick={onClick}>
      {on ? (
        <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z" /></svg>
      )}
    </button>
  );
}

function ScopeCaption() {
  return (
    <div className="cll-scope-cap" aria-hidden="true">
      <span>20 Hz</span><span>200</span><span>2k</span><span>20 kHz</span>
    </div>
  );
}

function LearnGrid({ p, withWhat = true, className = "" }) {
  return (
    <div className={`cll-learn ${className}`}>
      {withWhat && (
        <div><h4>What it is</h4><p>{p.what}</p></div>
      )}
      <div><h4 className="hl">Listen for</h4><p>{p.listen}</p></div>
      <div><h4>Common cause</h4><p>{p.cause}</p></div>
      <div><h4>How to fix</h4><p>{p.fix}</p></div>
    </div>
  );
}

const fmtDur = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

// Upload strip (below the tabs): add one or many reference files, see
// what's loaded, remove files. The file input is hidden behind a styled
// button; the whole strip is also a drop target.
function ReferenceUploads({ refs, activeId, busy, errors, onFiles, onSelect, onRemove }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`cll-source${drag ? " drag" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        onFiles([...(e.dataTransfer.files ?? [])]);
      }}
    >
      <div className="cll-source-main">
        <svg className="cll-source-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
        <div className="cll-source-txt">
          <span className="cll-source-k">Reference audio</span>
          <span className="cll-source-v">
            {refs.length
              ? `${refs.length} file${refs.length > 1 ? "s" : ""} uploaded · pick one under the A card`
              : "Built-in practice loop · upload or drop your own files here"}
          </span>
        </div>
      </div>
      <div className="cll-source-actions">
        <button type="button" className="cll-btn ghost cll-source-btn" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Loading…" : refs.length ? "Add more" : "Upload references"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"
          hidden
          onChange={(e) => {
            onFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      {refs.length > 0 && (
        <ul className="cll-chips" aria-label="Uploaded reference files">
          {refs.map((r) => (
            <li key={r.id} className={`cll-chip${r.id === activeId ? " active" : ""}`}>
              <button type="button" className="cll-chip-name" title={`Use ${r.name}`} aria-pressed={r.id === activeId} onClick={() => onSelect(r.id)}>
                <span className="nm">{r.name}</span>
                <span className="du">{fmtDur(r.duration)}</span>
              </button>
              <button type="button" className="cll-chip-x" aria-label={`Remove ${r.name}`} title="Remove" onClick={() => onRemove(r.id)} disabled={busy}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {errors.length > 0 && (
        <div className="cll-source-err" role="alert">
          {errors.map((m, i) => (
            <p key={i}>{m}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// "Reference track" select, rendered in the reference (A) column of the
// A/B switch. `null` = built-in loop.
function ReferencePicker({ refs, activeId, onSelect }) {
  const active = refs.find((r) => r.id === activeId);
  return (
    <label className="cll-refpick">
      <span className="cll-refpick-k">Reference track</span>
      <select value={activeId ?? ""} onChange={(e) => onSelect(e.target.value === "" ? null : Number(e.target.value))}>
        <option value="">Built-in practice loop</option>
        {refs.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} ({fmtDur(r.duration)})
          </option>
        ))}
      </select>
      {active && active.trimDb < -0.05 && (
        <span
          className="cll-refpick-note"
          title="Turned down once, equally on A and B, so the processing on clip B can't clip. It's the same file, just quieter."
        >
          Played {Math.abs(active.trimDb).toFixed(1)} dB lower for headroom (same on A and B)
        </span>
      )}
    </label>
  );
}

function CriticalListeningLab({ onInteract }) {
  const [engine] = useState(createListeningEngine);
  const [tab, setTab] = useState("train");
  const [side, setSideState] = useState("A");
  const [owner, setOwner] = useState(null); // "train" | "lib" | null — who is playing

  // ---- quiz state ----
  const [level, setLevel] = useState("beginner");
  const [qs, setQs] = useState(() => buildQuestions("beginner"));
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState([]); // [{ id, ok, pts }]
  const [chosen, setChosen] = useState(null);
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState(false);

  // ---- library state ----
  const [libId, setLibId] = useState(null);
  const [libQuery, setLibQuery] = useState("");

  // ---- reference source ----
  const [refs, setRefs] = useState([]); // [{ id, name, duration, trimDb }]
  const [sourceId, setSourceId] = useState(null); // null = built-in loop
  const [srcBusy, setSrcBusy] = useState(false);
  const [srcErrors, setSrcErrors] = useState([]);
  const usingUpload = sourceId != null;
  // Category accordion in the library side panel: one group open at a time
  // (the one holding the selected problem, unless the student collapses or
  // opens another). While a search is active every matching group is shown
  // expanded instead, so results are never hidden behind a closed header.
  const [openCat, setOpenCat] = useState(null);

  const rootRef = useRef(null);
  const nextBtnRef = useRef(null);
  const playTokenRef = useRef(0);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  useEffect(() => () => engine.close(), [engine]);

  const q = qs[idx];
  const latestRef = useRef({ owner, q, libId });
  useEffect(() => {
    latestRef.current = { owner, q, libId };
  });
  const answered = chosen !== null;
  const score = results.reduce((a, r) => a + r.pts, 0);

  function interacted() {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  }

  // ---------- audio ----------
  // playTokenRef guards against a slow first ensure() (the loop renders
  // offline on first play) resolving after the student has already
  // stopped, switched tabs or moved on — only the latest request starts.
  async function play(who, problem, strength) {
    const token = ++playTokenRef.current;
    const ok = await engine.ensure();
    if (!ok || token !== playTokenRef.current) return;
    engine.start(problem, strength);
    setOwner(who);
  }
  // Restart whatever is playing so it picks up a new source buffer. Reads
  // the latest state through latestRef because it runs after an await.
  function restartIfPlaying() {
    const { owner: o, q: cq, libId: lid } = latestRef.current;
    if (o === "train") play("train", P[cq.id], cq.s);
    else if (o === "lib" && lid) play("lib", P[lid], 1);
  }
  // Upload one or more files. Decoded one at a time (keeps peak memory
  // down); bad files are reported and skipped, good ones still land. The
  // very first upload switches the reference to the first new file; later
  // uploads only add to the list, so a track change is always the
  // student's own choice via the picker.
  async function onFiles(files) {
    if (!files?.length || srcBusy) return;
    setSrcErrors([]);
    setSrcBusy(true);
    const added = [], errors = [];
    for (const file of files) {
      try {
        const info = await engine.addReference(file);
        if (info) added.push({ name: file.name, ...info });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Couldn't load ${file.name}.`);
      }
    }
    setSrcBusy(false);
    setSrcErrors(errors);
    if (!added.length) return;
    const first = refs.length === 0;
    setRefs((r) => [...r, ...added]);
    if (first) selectSource(added[0].id);
  }
  function selectSource(id) {
    engine.selectSource(id);
    setSourceId(id);
    restartIfPlaying();
  }
  function removeReference(id) {
    engine.removeReference(id);
    setRefs((r) => r.filter((x) => x.id !== id));
    if (sourceId === id) {
      setSourceId(null);
      restartIfPlaying();
    }
  }

  function stop() {
    playTokenRef.current++;
    engine.stop();
    setOwner(null);
  }
  function setSide(s) {
    engine.setSide(s);
    setSideState(s);
  }
  function toggle(who) {
    if (owner === who) return stop();
    if (who === "train") play("train", P[q.id], q.s);
    else {
      const id = libId ?? PROBLEMS[0].id;
      if (!libId) selectLib(id);
      play("lib", P[id], 1);
    }
  }

  // ---------- quiz ----------
  function loadQuestion(list, i) {
    setIdx(i);
    setChosen(null);
    setHint(false);
    setSide("A");
    if (owner === "train") play("train", P[list[i].id], list[i].s);
  }
  function newSession(ids, lvl = level) {
    const list = buildQuestions(lvl, ids);
    setQs(list);
    setResults([]);
    setDone(false);
    loadQuestion(list, 0);
  }
  function changeLevel(lvl) {
    setLevel(lvl);
    newSession(undefined, lvl);
  }
  function answer(id) {
    if (answered || done) return;
    const ok = id === q.id;
    setChosen(id);
    setResults((r) => [...r, { id: q.id, ok, pts: ok ? (hint ? 0.5 : 1) : 0 }]);
    interacted();
  }
  function next() {
    if (!answered) return;
    if (idx < qs.length - 1) loadQuestion(qs, idx + 1);
    else {
      stop();
      setDone(true);
    }
  }

  useEffect(() => {
    if (chosen !== null) nextBtnRef.current?.focus({ preventScroll: true });
  }, [chosen]);

  // ---------- library ----------
  const libVisible = useMemo(() => {
    const qy = libQuery.trim().toLowerCase();
    return PROBLEMS.filter((p) => !qy || `${p.name} ${p.short} ${p.cat}`.toLowerCase().includes(qy));
  }, [libQuery]);

  function selectLib(id, { autoplay = false } = {}) {
    setLibId(id);
    setOpenCat(P[id].cat);
    setSide("B");
    if (owner === "lib" || autoplay) {
      play("lib", P[id], 1);
      interacted();
    }
    // Keep the active row visible in the scrolling list.
    requestAnimationFrame(() => {
      rootRef.current?.querySelector(`.cll-item[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
    });
  }
  function stepLib(d) {
    const list = libVisible.length ? CATS.flatMap((c) => libVisible.filter((p) => p.cat === c)) : PROBLEMS;
    const i = list.findIndex((p) => p.id === libId);
    selectLib(list[(i + d + list.length) % list.length].id);
  }

  function showTab(t) {
    if (owner) stop();
    setTab(t);
    if (t === "library" && !libId) selectLib(PROBLEMS[0].id);
  }

  // ---------- keyboard (scoped to the lab root) ----------
  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    const k = e.key.toLowerCase();
    const inTrain = tab === "train";
    if (k === " ") {
      e.preventDefault();
      if (inTrain && done) return;
      toggle(inTrain ? "train" : "lib");
    } else if (k === "a" || k === "b") {
      setSide(k.toUpperCase());
    } else if (!inTrain && (k === "arrowdown" || k === "arrowup")) {
      e.preventDefault();
      stepLib(k === "arrowdown" ? 1 : -1);
    } else if (inTrain && !done && /^[1-4]$/.test(k)) {
      const id = q.options[+k - 1];
      if (id) answer(id);
    } else if (inTrain && k === "enter" && answered && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      next();
    }
  }

  // ---------- summary ----------
  const summary = useMemo(() => {
    if (!done) return null;
    const stats = Object.fromEntries(CATS.map((c) => [c, { r: 0, t: 0 }]));
    results.forEach((r) => {
      const s = stats[P[r.id].cat];
      s.t++;
      if (r.ok) s.r++;
    });
    const weak = CATS.filter((c) => stats[c].t).sort((a, b) => stats[a].r / stats[a].t - stats[b].r / stats[b].t)[0];
    const pct = Math.round((score / qs.length) * 100);
    return {
      pct,
      weak: weak && stats[weak].r < stats[weak].t ? weak : null,
      missed: results.filter((r) => !r.ok),
    };
  }, [done, results, score, qs.length]);

  const libP = libId ? P[libId] : null;
  const playing = owner !== null;

  return (
    <div
      ref={rootRef}
      className={`lab cll${playing ? " is-playing" : ""}`}
      onKeyDown={onKeyDown}
    >
      <div className="cll-tabs" role="tablist" aria-label="Critical listening">
        {[
          ["train", "Train"],
          ["library", "Problem library"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => tab !== id && showTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <ReferenceUploads
        refs={refs}
        activeId={sourceId}
        busy={srcBusy}
        errors={srcErrors}
        onFiles={onFiles}
        onSelect={selectSource}
        onRemove={removeReference}
      />

      {/* =================== TRAIN =================== */}
      {tab === "train" && (
        <section>
          <div className="cll-session">
            <div className="cll-seg" role="radiogroup" aria-label="Difficulty">
              {Object.entries(LEVELS).map(([id, L]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={level === id}
                  className={level === id ? "active" : undefined}
                  onClick={() => level !== id && changeLevel(id)}
                >
                  {L.label}
                </button>
              ))}
            </div>
            <div className="cll-dots" aria-hidden="true">
              {qs.map((_, i) => {
                const r = results[i];
                const cls = r ? (r.pts === 1 ? "ok" : r.pts ? "half" : "bad") : i === idx && !done ? "cur" : "";
                return <i key={i} className={cls} />;
              })}
            </div>
            <div className="cll-stats">
              Score <b>{fmt(score)}</b>
            </div>
          </div>

          {!done ? (
            <div className="cll-panel">
              <div className="cll-q-top">
                <span className="cll-q-num">
                  Question <b>{idx + 1}</b> of {qs.length}
                </span>
                <span
                  className="cll-tag"
                  title="Clip B is clip A with only the problem applied — no extra volume changes. Any level difference you hear is part of the problem itself."
                >
                  Unity gain
                </span>
              </div>

              <ABSwitch
                side={side}
                onSide={setSide}
                aDesc={usingUpload ? "Your file, untouched" : "Clean mix"}
                aFooter={<ReferencePicker refs={refs} activeId={sourceId} onSelect={selectSource} />}
                bLabel="Mystery clip"
                bDesc="Something's off"
              />

              <div className="cll-transport">
                <PlayButton on={owner === "train"} onClick={() => toggle("train")} />
                <div className="cll-scope">
                  <Spectrum
                    engine={engine}
                    side={side}
                    band={answered ? P[q.id].band : null}
                    active={owner === "train"}
                    concealed={!answered && !hint}
                  />
                  {!answered && !hint && (
                    <div className="cll-veil">
                      <p>Spectrum hidden. Trust your ears first.</p>
                      <button type="button" className="cll-link-btn" onClick={() => setHint(true)}>
                        Show spectrum · hint, costs ½ point
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <ScopeCaption />

              <div className="cll-question">What&apos;s wrong with clip B?</div>
              <div className="cll-options">
                {q.options.map((id, i) => {
                  const state = !answered ? "" : id === q.id ? "right" : id === chosen ? "wrong" : "dim";
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`cll-opt ${state}`}
                      disabled={answered}
                      onClick={() => answer(id)}
                    >
                      <span className="n">{i + 1}</span>
                      <span className="t">
                        {P[id].name}
                        {answered && <span className="c">{P[id].short}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>

              {answered && (
                <div className="cll-feedback">
                  <div className={`cll-verdict ${chosen === q.id ? "ok" : "bad"}`}>
                    <div className="ico">
                      {chosen === q.id ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      )}
                    </div>
                    <div>
                      <h3>
                        {chosen === q.id
                          ? hint
                            ? "Correct, with the hint · +½"
                            : "Correct · +1"
                          : `Not quite. It was ${P[q.id].name.toLowerCase()}.`}
                      </h3>
                      <p>{P[q.id].cat} problem</p>
                    </div>
                  </div>
                  <LearnGrid p={P[q.id]} />
                  <div className="cll-fb-foot">
                    <p>Flip A ↔ B again now that you know what to listen for.</p>
                    <button type="button" ref={nextBtnRef} className="cll-btn" onClick={next}>
                      {idx === qs.length - 1 ? "See results →" : "Next clip →"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="cll-panel cll-summary">
              <div className="cll-q-num">Session complete</div>
              <div className="cll-big">
                {fmt(score)}
                <small>/{qs.length}</small>
              </div>
              <p className="cll-sub">
                {summary.pct}% accuracy{summary.weak ? ` · work on ${summary.weak.toLowerCase()}` : ""}
              </p>
              {summary.missed.length > 0 && (
                <div className="cll-missed">
                  <h4>Missed ({summary.missed.length})</h4>
                  <ul>
                    {summary.missed.map((r, i) => (
                      <li key={`${r.id}-${i}`}>
                        <span>{P[r.id].name}</span>
                        <button
                          type="button"
                          className="cll-link-btn"
                          onClick={() => {
                            setTab("library");
                            selectLib(r.id);
                          }}
                        >
                          Study in library
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="cll-row-btns">
                {summary.missed.length > 0 && (
                  <button type="button" className="cll-btn ghost" onClick={() => newSession(summary.missed.map((r) => r.id))}>
                    Retry missed
                  </button>
                )}
                <button type="button" className="cll-btn" onClick={() => newSession()}>
                  New session
                </button>
              </div>
            </div>
          )}
          <p className="cll-keys" aria-hidden="true">
            <kbd>Space</kbd> play / stop · <kbd>A</kbd> <kbd>B</kbd> flip · <kbd>1</kbd>–<kbd>4</kbd> answer · <kbd>Enter</kbd> next
          </p>
        </section>
      )}

      {/* =================== LIBRARY =================== */}
      {tab === "library" && libP && (
        <section className="cll-lib">
          <nav className="cll-panel cll-lib-nav" aria-label="Problems">
            <label className="cll-lib-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
              <input
                type="search"
                placeholder="Search problems"
                autoComplete="off"
                aria-label="Search problems"
                value={libQuery}
                onChange={(e) => setLibQuery(e.target.value)}
              />
            </label>
            <div className="cll-lib-list">
              {libVisible.length === 0 && <div className="cll-lib-none">No problems match that search.</div>}
              {CATS.map((c) => {
                const items = libVisible.filter((p) => p.cat === c);
                if (!items.length) return null;
                const searching = libQuery.trim() !== "";
                const open = searching || openCat === c;
                const slug = c.replace(/\W+/g, "-").toLowerCase();
                const hasActive = items.some((p) => p.id === libId);
                return (
                  <div
                    key={c}
                    className={`cll-lib-group${open ? " open" : ""}${hasActive ? " has-active" : ""}`}
                    style={{ "--cc": `var(${CAT_COLOR[c]})` }}
                  >
                    <h4>
                      <button
                        type="button"
                        className="cll-acc-head"
                        aria-expanded={open}
                        aria-controls={`cll-acc-${slug}`}
                        disabled={searching}
                        onClick={() => setOpenCat(open ? null : c)}
                      >
                        <span className="cll-cdot" />
                        <span className="cll-acc-title">{c}</span>
                        <span className="ct">{items.length}</span>
                        <svg className="cll-acc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                      </button>
                    </h4>
                    <div className="cll-acc-body" id={`cll-acc-${slug}`} inert={!open}>
                      <div className="cll-acc-inner">
                        {items.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            data-id={p.id}
                            className={`cll-item${p.id === libId ? " active" : ""}${owner === "lib" ? " live" : ""}`}
                            aria-current={p.id === libId ? "true" : undefined}
                            onClick={() => selectLib(p.id, { autoplay: owner !== "lib" })}
                          >
                            <span className="tx">
                              <span className="nm">{p.name}</span>
                              <span className="sh">{p.short}</span>
                            </span>
                            <span className="cll-eq" aria-hidden="true"><i /><i /><i /></span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="cll-panel cll-lib-detail">
            <div className="cll-crumb">
              <span className="cll-cdot" style={{ "--cc": `var(${CAT_COLOR[libP.cat]})` }} />
              <span>{libP.cat}</span>
            </div>
            <div className="cll-lib-head">
              <div>
                <h3>{libP.name}</h3>
                <p>{libP.what}</p>
              </div>
              <div className="cll-stepper">
                <span>
                  {PROBLEMS.indexOf(libP) + 1} / {PROBLEMS.length}
                </span>
                <button type="button" className="cll-icon-btn" aria-label="Previous problem" onClick={() => stepLib(-1)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
                </button>
                <button type="button" className="cll-icon-btn" aria-label="Next problem" onClick={() => stepLib(1)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </div>
            </div>
            <ABSwitch
              side={side}
              onSide={setSide}
              aLabel="Clean"
              aDesc={usingUpload ? "Your file" : "Reference"}
              bLabel="With problem"
              bDesc={libP.short}
              aFooter={<ReferencePicker refs={refs} activeId={sourceId} onSelect={selectSource} />}
            />
            <div className="cll-transport">
              <PlayButton on={owner === "lib"} onClick={() => toggle("lib")} />
              <div className="cll-scope">
                <Spectrum engine={engine} side={side} band={libP.band} active={owner === "lib"} />
              </div>
            </div>
            <ScopeCaption />
            <LearnGrid p={libP} withWhat={false} className="cll-lib-learn" />
          </div>
        </section>
      )}
    </div>
  );
}

export default CriticalListeningLab;
