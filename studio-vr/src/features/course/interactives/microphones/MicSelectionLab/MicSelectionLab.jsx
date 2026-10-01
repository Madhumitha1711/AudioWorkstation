import { useEffect, useMemo, useRef, useState } from "react";
import { Accordion, AccordionItem } from "../../../../../components/Accordion";
import { FlipCard } from "../../../../../components/FlipCard";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../../shared/labs.css";
import "../shared/micLabs.css";
import "./MicSelectionLab.css";
import { MIC_TYPES, micAccent } from "../shared/micLabShared";
import MicPortrait from "../shared/MicPortrait";
import { useTheme } from "../../../../../theme/ThemeContext";
import {
  COPY,
  FACTOR_TAG,
  GOALS,
  LEVELS,
  MIC_INFO,
  POINTS,
  QUESTIONS,
  ROOMS,
  SCORING_NOTE,
  SEL_SOURCES,
  fitPercent,
  rankStatus,
  scoreMic,
  selectionAudioPath,
  sourceById,
} from "./micSelectionData";

// "Pick the mic for the job" — chapter 6 (courseData.js TOPICS[id=
// "mic-stand"], Selection subchapter). Originally ported from
// design/mic-selection-lab.html; restyled to the shared lab system:
//
//   1. The four questions an engineer asks (source, loudness, room, desired
//      sound) are shared Accordion steps (components/Accordion), one open
//      at a time. Each closed row shows its current answer on the right, and
//      picking an answer opens the next question — so the student walks
//      through them in order but can reopen any step to change it.
//   2. The recommendation is a set of shared FlipCards (components/FlipCard),
//      the same card ActiveSpeakerLab / WhatIsMixerLab use:
//        - Best pick (full width): front = mic "screen" + name + specs + fit
//          meter; back = "Why this mic" (top factors, each tagged with the
//          factor it comes from, one honest trade-off) + classic examples.
//        - The other four (2 × 2, in rank order): front = rank, mic, status
//          and fit meter; back = "Why not" (each family's biggest weakness
//          for this job, de-duplicated so every card teaches something new)
//          + what it *would* bring to this source.
//      Cards keep their flip state while answers change (keyed by mic id;
//      the best-pick card is one card whose content swaps), so a student can
//      leave the "why" side up and watch the reasons move as they tweak.
//   3. "Hear the difference" A/B player, a "How is the pick made?" reveal
//      Accordion, then the global KeyPoints.
//
// Scoring is unchanged (scoreMic in micSelectionData.js).
//
// Audio: plays public/audio/mic-selection/<mic>-<source>.mp3 for the top
// three practical picks (or any practical mic picked from the chips). Files
// don't exist yet → "Clip pending" hint, same as MicTypeLab. onInteract
// fires on the first answer change, card flip, reveal or play.

const MIC_BY_ID = Object.fromEntries(MIC_TYPES.map((t) => [t.id, t]));
const OPTIONS = { source: SEL_SOURCES, level: LEVELS, room: ROOMS, goal: GOALS };

function FitMeter({ pct, tone }) {
  return (
    <div className={`msl-fit msl-fit--${tone}`}>
      <span className="msl-fit-label">Fit</span>
      <span className="msl-bar">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="msl-pct">{tone === "no" ? "n/a" : `${pct}%`}</span>
    </div>
  );
}

function MicScreen({ type, theme, size = "md" }) {
  return (
    <div className={`mic-portrait msl-portrait msl-portrait--${size}`}>
      <MicPortrait shape={type.shape} color={micAccent(type, theme)} />
    </div>
  );
}

function MicSelectionLab({ onInteract }) {
  const { theme } = useTheme();
  const [answers, setAnswers] = useState({ source: "lead-vocal", level: "medium", room: "treated", goal: "natural" });
  const [levelAuto, setLevelAuto] = useState(true);
  const [openQ, setOpenQ] = useState("source");
  const [hearId, setHearId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [clipMissing, setClipMissing] = useState(false);
  const audioRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  const src = sourceById(answers.source);
  const srcLower = src.label.toLowerCase();
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
        <em>Not a usual choice</em> for {srcLower}. {src.note[micId] || ""}
      </>
    ) : (
      COPY[key].neg
    );

  // Why not the others — biggest weakness per mic, skipping a reason already
  // shown for another mic so the cards don't repeat each other. `showsNote`
  // marks texts that already include the source note, so the card back
  // doesn't print it twice.
  const usedKeys = new Set();
  const runners = results.slice(1).map((r, i) => {
    const base = { ...r, rank: i + 2, status: rankStatus(i + 1, r.fit) };
    if (r.fit === 0) {
      return { ...base, showsNote: true, text: <><em>Not practical</em> for {srcLower}. It isn’t used this way.</> };
    }
    const negs = r.parts.filter((p) => p.v < 0).sort((a, b) => a.v - b.v);
    const worst = negs.find((p) => !usedKeys.has(p.key)) || negs[0];
    if (!worst) return { ...base, showsNote: true, text: <><em>Also a good choice.</em> {src.note[r.id] || ""}</> };
    usedKeys.add(worst.key);
    return { ...base, showsNote: worst.key === "fit", text: weakText(worst.key, r.id) };
  });

  // A/B options: top three practical mics (+ one picked from the chips).
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
    } else {
      if (key === "level") setLevelAuto(false);
      setAnswers((a) => ({ ...a, [key]: value }));
    }
    // Step on to the next question (the last one stays open).
    const i = QUESTIONS.findIndex((q) => q.id === key);
    if (i < QUESTIONS.length - 1) setOpenQ(QUESTIONS[i + 1].id);
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

  const answerLabel = (q) => {
    const label = OPTIONS[q.id].find((o) => o.id === answers[q.id])?.label;
    return q.id === "level" && levelAuto ? `${label} · auto` : label;
  };

  return (
    <div className="lab msl">
      <p className="msl-lead">
        There’s no “best” microphone, only the best one for a specific source, in a specific room, for a specific
        sound. Answer the four questions an engineer asks before reaching for a mic, then turn the cards over to see
        why one wins and what sinks the others.
      </p>

      {/* ---------- questions ---------- */}
      <h4 className="msl-subhead">Describe the recording</h4>
      <Accordion value={openQ} onChange={setOpenQ} className="msl-steps">
        {QUESTIONS.map((q) => (
          <AccordionItem
            key={q.id}
            id={q.id}
            marker={q.num}
            title={q.label}
            summary={answerLabel(q)}
            onOpen={markInteracted}
          >
            {q.hint && <p className="msl-q-hint">{q.hint}</p>}
            <div className="lab-toggle-row msl-chips" role="group" aria-label={q.label}>
              {OPTIONS[q.id].map((o) => (
                <button
                  type="button"
                  key={o.id}
                  className={`lab-toggle msl-chip${o.id === answers[q.id] ? " selected" : ""}`}
                  aria-pressed={o.id === answers[q.id]}
                  onClick={() => setAnswer(q.id, o.id)}
                >
                  {o.label}
                  {q.id === "level" && levelAuto && o.id === src.level && <span className="msl-auto">auto</span>}
                </button>
              ))}
            </div>
          </AccordionItem>
        ))}
      </Accordion>

      {/* ---------- recommendation ---------- */}
      <h4 className="msl-subhead">Recommendation</h4>
      <div className="msl-cards" aria-live="polite">
        <FlipCard
          label={`Best pick: ${pickName}`}
          onFlip={markInteracted}
          className="msl-card msl-card--best"
          front={
            <div className="msl-face msl-best-front">
              <MicScreen type={winType} theme={theme} size="lg" />
              <div className="msl-best-text">
                <span className="msl-kicker msl-kicker--win">{closeCall ? "Best pick · close call" : "Best pick"}</span>
                <h4 className="msl-card-title msl-card-title--lg">{pickName}</h4>
                <p className="msl-card-sub">
                  {info.sub} · for {srcLower}
                </p>
                <div className="msl-specs">
                  {info.specs.map(([k, v]) => (
                    <span className="msl-spec" key={k}>
                      {k} <b>{v}</b>
                    </span>
                  ))}
                </div>
                <FitMeter pct={fitPercent(win.total)} tone="win" />
              </div>
            </div>
          }
          back={
            <div className="msl-face msl-back">
              <span className="msl-kicker msl-kicker--win">Why {winType.label}</span>
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
            </div>
          }
        />

        {runners.map((r) => {
          const type = MIC_BY_ID[r.id];
          const tone = r.status.tone;
          const note = !r.showsNote && src.note[r.id];
          return (
            <FlipCard
              key={r.id}
              label={`${type.label}, ranked ${r.rank}`}
              onFlip={markInteracted}
              className={`msl-card msl-card--${tone}`}
              front={
                <div className="msl-face msl-runner-front">
                  <MicScreen type={type} theme={theme} size="sm" />
                  <div className="msl-runner-text">
                    <span className={`msl-kicker msl-kicker--${tone}`}>
                      <span className="msl-rank">#{r.rank}</span> {r.status.label}
                    </span>
                    <h4 className="msl-card-title">{type.label}</h4>
                    <FitMeter pct={r.fit > 0 ? fitPercent(r.total) : 4} tone={tone} />
                  </div>
                </div>
              }
              back={
                <div className="msl-face msl-back">
                  <span className={`msl-kicker msl-kicker--${tone}`}>
                    {tone === "alt" ? `Why it’s #${r.rank}` : `Why not ${type.label}?`}
                  </span>
                  <p className="msl-back-text">{r.text}</p>
                  {note && (
                    <p className="msl-back-note">
                      <b>On {srcLower}:</b> {note}
                    </p>
                  )}
                  <p className="msl-examples">
                    <b>Classic examples:</b> {MIC_INFO[r.id].examples}
                  </p>
                </div>
              }
            />
          );
        })}
      </div>

      {/* ---------- listen ---------- */}
      <h4 className="msl-subhead">Hear the difference</h4>
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

      <AccordionItem className="msl-how" marker="?" title="How is the pick made?" onOpen={markInteracted}>
        {SCORING_NOTE}
      </AccordionItem>

      <KeyPoints points={POINTS} />
    </div>
  );
}

export default MicSelectionLab;
