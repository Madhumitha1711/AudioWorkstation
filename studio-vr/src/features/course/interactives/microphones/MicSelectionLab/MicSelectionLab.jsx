import { useEffect, useMemo, useRef, useState } from "react";
import "../../shared/labs.css";
import "../shared/micLabs.css";
import "./MicSelectionLab.css";
import { MIC_TYPES, micAccent } from "../shared/micLabShared";
import MicPortrait from "../shared/MicPortrait";
import { useTheme } from "../../../../../theme/ThemeContext";
import {
  COPY,
  FACTORS,
  FACTOR_TAG,
  GOALS,
  LEVELS,
  MIC_INFO,
  ROOMS,
  SEL_SOURCES,
  TAKEAWAY,
  fitPercent,
  scoreMic,
  selectionAudioPath,
  sourceById,
} from "./micSelectionData";

// Ported from design/mic-selection-lab.html — "Pick the mic for the job"
// (chapter 6, courseData.js TOPICS[id="mic-stand"], Selection subchapter).
// Replaces the old "mic-selection-lab" alias of MicTypeLab.
//
// The student answers the four questions an engineer asks before reaching
// for a mic (source, loudness, room, desired sound); every answer re-scores
// all five MIC_TYPES families (scoreMic in micSelectionData.js) and the
// result panel explains the pick: "Why this mic" (top positive factors, each
// tagged with the factor it comes from, plus one honest trade-off), a ranked
// fit meter for all five, and "Why not the others" (each family's biggest
// weakness for this job, de-duplicated so every row teaches something new).
//
// Differences from the mockup (it renders inside the course content column):
//   - no page <h1>/theme button — the lesson heading and ThemeContext cover
//     those; type is the app's (inherited body font, var(--heading) for
//     titles) instead of the mockup's Space Grotesk / JetBrains Mono.
//   - pickers reuse labs.css .lab-toggle; the pick uses the shared
//     MicPortrait silhouette on the mic "screen" like the other mic labs.
//   - brand --accent replaces the mockup's green.
//
// Audio: "Hear the difference" plays public/audio/mic-selection/
// <mic>-<source>.mp3 for the top three practical picks (or any mic clicked
// in the ranking). Files don't exist yet → "Clip pending" hint, same as
// MicTypeLab. onInteract fires on the first answer change or play.

const MIC_BY_ID = Object.fromEntries(MIC_TYPES.map((t) => [t.id, t]));

function Picker({ label, num, hint, options, value, autoId, onPick }) {
  return (
    <div className="msl-q">
      <div className="msl-q-head">
        <span className="msl-q-num">{num}</span>
        <span className="msl-q-label">{label}</span>
      </div>
      {hint && <p className="msl-q-hint">{hint}</p>}
      <div className="lab-toggle-row msl-chips" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            type="button"
            key={o.id}
            className={`lab-toggle msl-chip${o.id === value ? " selected" : ""}`}
            aria-pressed={o.id === value}
            onClick={() => onPick(o.id)}
          >
            {o.label}
            {autoId === o.id && <span className="msl-auto">auto</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function MicSelectionLab({ onInteract }) {
  const { theme } = useTheme();
  const [answers, setAnswers] = useState({ source: "lead-vocal", level: "medium", room: "treated", goal: "natural" });
  const [levelAuto, setLevelAuto] = useState(true);
  const [hearId, setHearId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [clipMissing, setClipMissing] = useState(false);
  const audioRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  onInteractRef.current = onInteract;

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  const src = sourceById(answers.source);
  const results = useMemo(
    () => MIC_TYPES.map((t) => scoreMic(t.id, answers)).sort((a, b) => b.total - a.total),
    [answers],
  );
  const win = results[0];
  const winType = MIC_BY_ID[win.id];
  const info = MIC_INFO[win.id];
  const closeCall = results[1] && win.total - results[1].total < 1.2;

  let pickName = winType.label;
  if (win.id === "condenser-fet" && answers.source === "overheads") pickName += " — small-diaphragm pair";
  else if (win.id === "condenser-fet" && answers.source === "acoustic") pickName += " — small-diaphragm";

  // Why this mic: the source note first, then the strongest positive factors,
  // then its biggest weakness as an honest trade-off.
  const why = [];
  if (src.note[win.id]) why.push({ tag: FACTOR_TAG.fit, text: src.note[win.id] });
  win.parts
    .filter((p) => p.key !== "fit" && p.v > 0.4)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)
    .forEach((p) => why.push({ tag: FACTOR_TAG[p.key], text: COPY[p.key].pos }));
  const weak = win.parts.filter((p) => p.v < -0.5).sort((a, b) => a.v - b.v)[0];

  const weakText = (key, micId) =>
    key === "fit" ? (
      <>
        <em>Not a usual choice</em> for {src.label.toLowerCase()}. {src.note[micId] || ""}
      </>
    ) : (
      COPY[key].neg
    );

  // Why not the others — biggest weakness per mic, skipping a reason already
  // shown for another mic so the list doesn't repeat itself.
  const usedKeys = new Set();
  const whyNot = results.slice(1).map((r) => {
    if (r.fit === 0) {
      return { id: r.id, text: <><em>Not practical</em> for {src.label.toLowerCase()}. It isn’t used this way.</> };
    }
    const negs = r.parts.filter((p) => p.v < 0).sort((a, b) => a.v - b.v);
    const worst = negs.find((p) => !usedKeys.has(p.key)) || negs[0];
    if (!worst) return { id: r.id, text: <><em>Also a good choice.</em> {src.note[r.id] || ""}</> };
    usedKeys.add(worst.key);
    return { id: r.id, text: weakText(worst.key, r.id) };
  });

  // A/B options: top three practical mics (+ one picked from the ranking).
  const topPractical = results.filter((r) => r.fit > 0).slice(0, 3).map((r) => r.id);
  const heard = hearId && results.find((r) => r.id === hearId && r.fit > 0) ? hearId : topPractical[0];
  const abOptions = topPractical.includes(heard) ? topPractical : [...topPractical, heard];

  // Reload the clip when the heard mic or source changes, keeping playback
  // going across the switch (same behaviour as MicTypeLab).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setClipMissing(false);
    audio.src = selectionAudioPath(heard, answers.source);
    audio.load();
    if (playing) audio.play().catch(() => setClipMissing(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heard, answers.source]);

  function setAnswer(key, value) {
    markInteracted();
    setHearId(null);
    if (key === "source") {
      setLevelAuto(true);
      setAnswers((a) => ({ ...a, source: value, level: sourceById(value).level }));
      return;
    }
    if (key === "level") setLevelAuto(false);
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  function togglePlay() {
    markInteracted();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setClipMissing(true));
  }

  const accent = micAccent(winType, theme);

  return (
    <div className="lab msl">
      <p className="msl-intro">
        There’s no “best” microphone, only the best one for a specific source, in a specific room, for a specific
        sound. Answer the four questions an engineer asks before reaching for a mic, and see which one wins and why.
      </p>

      <div className="msl-grid">
        {/* ---------- questions ---------- */}
        <section className="msl-card" aria-label="Describe the recording">
          <div className="lab-control-label">Describe the recording</div>
          <Picker num="01" label="What are you recording?" options={SEL_SOURCES} value={answers.source} onPick={(v) => setAnswer("source", v)} />
          <Picker
            num="02"
            label="How loud is it at the mic?"
            hint="Set automatically from the source. Change it if your situation is different."
            options={LEVELS}
            value={answers.level}
            autoId={levelAuto ? src.level : null}
            onPick={(v) => setAnswer("level", v)}
          />
          <Picker num="03" label="Where are you recording?" options={ROOMS} value={answers.room} onPick={(v) => setAnswer("room", v)} />
          <Picker num="04" label="What should it sound like?" options={GOALS} value={answers.goal} onPick={(v) => setAnswer("goal", v)} />
        </section>

        {/* ---------- result ---------- */}
        <section className="msl-card msl-result" aria-live="polite" aria-label="Recommendation">
          <div className="lab-control-label">Recommendation</div>

          <div className="msl-pick">
            <div className="msl-pick-tag">{closeCall ? "Best pick · close call" : "Best pick"}</div>
            <div className="msl-pick-row">
              <div className="mic-portrait msl-portrait">
                <MicPortrait shape={winType.shape} color={accent} />
              </div>
              <div className="msl-pick-text">
                <div className="msl-pick-name">{pickName}</div>
                <div className="msl-pick-sub">
                  {info.sub} · for {src.label.toLowerCase()}
                </div>
              </div>
            </div>
            <div className="msl-specs">
              {info.specs.map(([k, v]) => (
                <span className="msl-spec" key={k}>
                  {k} <b>{v}</b>
                </span>
              ))}
            </div>
          </div>

          <h4 className="msl-h">Why this mic</h4>
          <ul className="msl-reasons">
            {why.map((r) => (
              <li key={r.text}>
                <span className="msl-ftag">{r.tag}</span>
                <span>{r.text}</span>
              </li>
            ))}
            {weak && (
              <li>
                <span className="msl-ftag msl-ftag--trade">Trade-off</span>
                <span>{weakText(weak.key, win.id)}</span>
              </li>
            )}
          </ul>
          <p className="msl-examples">
            <b>Classic examples:</b> {info.examples}
          </p>

          <h4 className="msl-h">How all five fit this job</h4>
          <div className="msl-rank">
            {results.map((r, i) => {
              const cls = i === 0 ? " is-win" : r.fit === 0 ? " is-no" : i < 3 ? " is-alt" : "";
              const practical = r.fit > 0;
              return (
                <button
                  type="button"
                  key={r.id}
                  className={`msl-rank-row${cls}`}
                  disabled={!practical}
                  title={practical ? `Hear ${MIC_BY_ID[r.id].label}` : "Not practical for this source"}
                  onClick={() => {
                    markInteracted();
                    setHearId(r.id);
                  }}
                >
                  <span className="msl-rank-name">{MIC_BY_ID[r.id].label}</span>
                  <span className="msl-bar">
                    <i style={{ width: `${practical ? fitPercent(r.total) : 4}%` }} />
                  </span>
                  <span className="msl-pct">{practical ? fitPercent(r.total) : "n/a"}</span>
                </button>
              );
            })}
          </div>

          <h4 className="msl-h">Why not the others</h4>
          <div className="msl-whynot">
            {whyNot.map((w) => (
              <div className="msl-wn" key={w.id}>
                <span className="msl-wn-name">{MIC_BY_ID[w.id].label}</span>
                <span className="msl-wn-text">{w.text}</span>
              </div>
            ))}
          </div>

          <h4 className="msl-h">Hear the difference</h4>
          <div className="msl-player">
            <button type="button" className={`lab-play-btn${playing ? " playing" : ""}`} onClick={togglePlay}>
              {playing ? "⏹ Stop" : "▶ Play"}
            </button>
            <div className="lab-toggle-row msl-chips" role="group" aria-label="Choose a mic to hear">
              {abOptions.map((id) => (
                <button
                  type="button"
                  key={id}
                  className={`lab-toggle msl-chip${id === heard ? " selected" : ""}`}
                  aria-pressed={id === heard}
                  onClick={() => {
                    markInteracted();
                    setHearId(id);
                  }}
                >
                  {MIC_BY_ID[id].label}
                </button>
              ))}
            </div>
          </div>
          {clipMissing && (
            <p className="lab-hint">Clip pending — the recording for this mic and source hasn’t been captured yet.</p>
          )}
          <audio
            ref={audioRef}
            preload="none"
            onEnded={() => setPlaying(false)}
            onError={() => {
              setClipMissing(true);
              setPlaying(false);
            }}
          />
        </section>
      </div>

      {/* ---------- why a specific mic ---------- */}
      <section className="msl-why">
        <h3>Why choose one mic over another?</h3>
        <p className="msl-why-lead">
          Every recommendation above comes from the same six questions. Learn these and you can reason your way to a
          good choice with any mic locker, even one you’ve never seen before.
        </p>
        <div className="msl-factors">
          {FACTORS.map((f, i) => (
            <div className="msl-factor" key={f.tag}>
              <div className="msl-factor-tag">
                {String(i + 1).padStart(2, "0")} · {f.tag}
              </div>
              <h4>{f.title}</h4>
              <p>
                {f.body.map(([t, bold], j) => (bold ? <b key={j}>{t}</b> : <span key={j}>{t}</span>))}
              </p>
            </div>
          ))}
        </div>
        <div className="msl-takeaway">
          <b>Takeaway:</b> {TAKEAWAY}
        </div>
      </section>
    </div>
  );
}

export default MicSelectionLab;
