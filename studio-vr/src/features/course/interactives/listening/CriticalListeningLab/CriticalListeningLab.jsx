import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import "./CriticalListeningLab.css";
import { Tabs, TabPanel } from "../../../../../components/Tabs";
import { createListeningEngine } from "./criticalListeningAudio";
import { CATS, LEVELS, PROBLEMS, PROBLEM_BY_ID as P, shuffledClips } from "./criticalListeningData";


const TABS = Object.entries(LEVELS).map(([id, L]) => ({ id, label: L.label }));
const WORDS = ["zero", "one", "two", "three", "four"];

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

const fileName = (url) => url.replace(/^\/audio\//, "");

function MissingNote({ clip }) {
  return (
    <p className="cll-missing" role="status">
      Recording coming soon. Add <code>{fileName(clip.clips.clean)}</code> and{" "}
      <code>{fileName(clip.clips.problem)}</code> to <code>public/audio/</code>.
    </p>
  );
}

// One level's round of clips. Mounted with key={level}, so switching tabs
// starts that level fresh.
function Round({ level, engine, onInteract }) {
  const L = LEVELS[level];
  const [queue, setQueue] = useState(() => shuffledClips(level));
  const [idx, setIdx] = useState(0);
  const [found, setFound] = useState(() => new Set());
  const [wrong, setWrong] = useState(() => new Set());
  const [side, setSideState] = useState("B");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(() => new Set()); // clip ids with no recordings yet

  const rootRef = useRef(null);
  const nextBtnRef = useRef(null);
  const playTokenRef = useRef(0);

  const clip = queue[idx];
  const need = clip.problems.length;
  const solved = found.size === need;

  // Stop (and invalidate any pending load) when this round unmounts.
  useEffect(() => () => {
    playTokenRef.current++;
    engine.stop();
  }, [engine]);

  useEffect(() => {
    if (solved) nextBtnRef.current?.focus({ preventScroll: true });
  }, [solved]);


  async function play(c = clip) {
    const token = ++playTokenRef.current;
    setLoading(true);
    const ok = await engine.ensure();
    if (!ok || token !== playTokenRef.current) return;
    const pair = await engine.loadPair(c.clips);
    if (token !== playTokenRef.current) return;
    setLoading(false);
    setMissing((m) => {
      if (!pair === m.has(c.id)) return m;
      const n = new Set(m);
      if (pair) n.delete(c.id);
      else n.add(c.id);
      return n;
    });
    if (!pair) {
      engine.stop();
      setPlaying(false);
      return;
    }
    engine.start(pair);
    setPlaying(true);
  }
  function stop() {
    playTokenRef.current++;
    engine.stop();
    setPlaying(false);
    setLoading(false);
  }
  function toggle() {
    if (playing || loading) stop();
    else play();
  }
  function setSide(s) {
    engine.setSide(s);
    setSideState(s);
  }

  // ---------- picking ----------
  function pick(id) {
    if (solved || found.has(id) || wrong.has(id)) return;
    onInteract();
    if (!clip.problems.includes(id)) {
      setWrong((w) => new Set(w).add(id));
      return;
    }
    const f = new Set(found).add(id);
    setFound(f);
    if (f.size === need) {
      // Every problem found: switch to the clean take.
      setSide("A");
      if (!playing && !loading) play();
    }
  }

  function next() {
    let q = queue;
    let i = idx + 1;
    if (i >= q.length) {
      q = shuffledClips(level);
      if (q.length > 1 && q[0].id === clip.id) [q[0], q[q.length - 1]] = [q[q.length - 1], q[0]];
      setQueue(q);
      i = 0;
    }
    setIdx(i);
    setFound(new Set());
    setWrong(new Set());
    setSide("B");
    if (playing || loading) play(q[i]);
    rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === " ") {
      e.preventDefault();
      toggle();
    } else if (e.key === "Enter" && solved && e.target.tagName !== "BUTTON") {
      e.preventDefault();
      next();
    }
  }

  const status = solved
    ? side === "A"
      ? "Clean take"
      : `With the ${need === 1 ? "problem" : "problems"}`
    : "Mystery clip";

  return (
    <div ref={rootRef} className="cll-round" onKeyDown={onKeyDown}>
      {/* =========== player =========== */}
      <div className={`cll-panel cll-player${solved ? " solved" : ""}`}>
        <div className="cll-q-top">
          <span className="cll-q-num">
            Clip <b>{idx + 1}</b> of {queue.length}
          </span>
          <span className="cll-tag" title="Real recordings, played exactly as recorded — no processing.">
            {L.blurb}
          </span>
        </div>

        <div className="cll-transport">
          <PlayButton on={playing || loading} onClick={toggle} />
          <div className="cll-now">
            <div className="cll-now-top">
              <span className="cll-now-title">{status}</span>
            </div>
            <div className="cll-slots" aria-label={`${found.size} of ${need} found`}>
              {clip.problems.map((id, i) => {
                // Slots fill in the order the problems were found.
                const fid = [...found][i];
                return (
                  <span key={i} className={`cll-slot${fid ? " found" : ""}`}>
                    {fid ? P[fid].name : "?"}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        {missing.has(clip.id) && <MissingNote clip={clip} />}

        {solved && (
          <div className="cll-solved">
            <div className="cll-seg" role="radiogroup" aria-label="Which take to hear">
              {[
                ["B", need === 1 ? "With problem" : "With problems"],
                ["A", "Clean"],
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={side === k}
                  className={side === k ? `active side-${k}` : undefined}
                  onClick={() => setSide(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p>
              {wrong.size === 0 ? "Nailed it, no wrong picks." : `Solved with ${wrong.size} wrong ${wrong.size === 1 ? "pick" : "picks"}.`}{" "}
              Flip between the takes to hear what changed.
            </p>
            <button type="button" ref={nextBtnRef} className="cll-btn" onClick={next}>
              Next clip →
            </button>
          </div>
        )}
      </div>

      {/* =========== problem list =========== */}
      <div className="cll-question">
        <h3>What&apos;s wrong with this clip?</h3>
        <p>
          {solved
            ? "All found. The clean take is playing."
            : need === 1
              ? "Pick the one problem you hear."
              : `Find all ${WORDS[need] ?? need} problems. ${found.size} of ${need} found.`}
        </p>
      </div>

      {CATS.map((c) => {
        const items = PROBLEMS.filter((p) => p.cat === c);
        return (
          <section key={c} className="cll-cat">
            <h4 className="cll-cat-h">
              <span className="cll-cdot" />
              {c}
            </h4>
            <div className="cll-list">
              {items.map((p) => {
                const isFound = found.has(p.id);
                const isWrong = wrong.has(p.id);
                const state = isFound ? "found" : isWrong ? "wrong" : solved ? "dim" : "";
                return (
                  <div key={p.id} className={`cll-prob ${state}`}>
                    <button
                      type="button"
                      className="cll-prob-btn"
                      aria-disabled={solved || isFound || isWrong}
                      aria-pressed={isFound}
                      onClick={() => pick(p.id)}
                    >
                      <span className="cll-mark" aria-hidden="true">
                        {isFound ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                        ) : isWrong ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        ) : null}
                      </span>
                      <span className="tx">
                        <span className="nm">
                          {p.name}
                          <span className="sh">{p.short}</span>
                        </span>
                        <span className="ds">{p.what}</span>
                        {isWrong && <span className="cll-verdict-note">Not in this clip.</span>}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="cll-keys" aria-hidden="true">
        <kbd>Space</kbd> play / stop · <kbd>Enter</kbd> next clip
      </p>
    </div>
  );
}

function CriticalListeningLab({ onInteract }) {
  const [engine] = useState(createListeningEngine);
  const [level, setLevel] = useState("beginner");
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  useEffect(() => () => engine.close(), [engine]);

  function interacted() {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  }

  return (
    <div className="lab cll">
      <Tabs
        className="cll-tabs"
        items={TABS}
        value={level}
        onChange={setLevel}
        ariaLabel="Difficulty"
        idPrefix="cll"
      />
      <TabPanel idPrefix="cll" value={level} index={TABS.findIndex((t) => t.id === level)}>
        <Round key={level} level={level} engine={engine} onInteract={interacted} />
      </TabPanel>
    </div>
  );
}

export default CriticalListeningLab;
