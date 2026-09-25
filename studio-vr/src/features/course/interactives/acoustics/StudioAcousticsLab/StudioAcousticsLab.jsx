import { useState } from "react";
import "../../shared/labs.css";
import "../shared/acousticsLabs.css";
import "./StudioAcousticsLab.css";
import { useRoomAudio } from "../shared/useRoomAudio";
import { RoomPlayer, SetupBar, WhyItMatters } from "../shared/AcousticsUI";
import { KEPT_SAME, ROOMS, TAKEAWAY, WHY } from "./studioAcousticsData";

// Ported from design/studio-acoustics-rooms.html — "Same source, different
// rooms" (chapter 5, courseData.js TOPICS[id="diffuser-panel"]). One source
// heard in five rooms; each card is a player + short explanation, ending
// with "Why this matters".
//
// Differences from the mockup (it renders inside the course content column):
//   - no page <h1>/theme button — the lesson heading and ThemeContext cover
//     those; colors come from the course tokens (acousticsLabs.css).
//   - an A/B button on every room flips to the vocal booth reference at the
//     same position.
//   - a blind "Guess the room" test, enabled once all five recordings exist.
//
// Audio: plain playback of each room's recording (studioAcousticsData.js
// `src`); a room without its file yet shows "Audio coming soon".
// onInteract fires on the first play (any card or the blind test).
function StudioAcousticsLab({ onInteract }) {
  const audio = useRoomAudio({ items: ROOMS, onFirstPlay: onInteract });
  const reference = ROOMS[0];

  return (
    <div className="lab acl">
      <p className="acl-intro">
        We recorded the same sound in five different places. Listen to each one. The sound didn&rsquo;t change, only
        the room did.
      </p>

      <SetupBar keptSame={KEPT_SAME} />

      <div className="acl-rooms">
        {ROOMS.map((room) => {
          const p = audio.playing;
          const live = !!p && !p.mystery && ((p.id === room.id && !p.fromCompare) || p.fromCompare === room.id);
          return (
            <article key={room.id} className={`acl-room${live ? " is-live" : ""}`}>
              <div className="acl-room-tag">{room.tag}</div>
              <h3>{room.title}</h3>
              <RoomPlayer
                id={room.id}
                label={room.title}
                audio={audio}
                compare={room.id === reference.id ? null : { id: reference.id, label: reference.title, short: reference.short }}
              />
              <p>{room.body}</p>
            </article>
          );
        })}
      </div>

      <GuessTheRoom audio={audio} />

      <WhyItMatters points={WHY} takeaway={TAKEAWAY} />
    </div>
  );
}

/**
 * Blind test, run as a fixed round: every room comes up exactly once, in a
 * shuffled order, so a round is always ROOMS.length questions.
 *
 *   order[]    — the shuffled room ids for this round (question n plays
 *                order[n])
 *   index      — the current question (0-based); -1 = round not started
 *   guesses[]  — the student's pick for each answered question
 *   finished   — results screen showing (set after the last question's
 *                feedback, via "See results")
 *
 * Everything shown is derived from those three: "Question n of N", the
 * progress dots (pending / current / right / wrong), and the score, which
 * is right answers out of questions ANSWERED so far — then out of N on the
 * results screen. The clip plays unlabelled (the hook's `mystery` flag
 * hides it from the card players). Needs every room's recording, so it
 * stays disabled until they all load.
 */
function shuffle(ids) {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function GuessTheRoom({ audio }) {
  const total = ROOMS.length;
  const [order, setOrder] = useState([]);
  const [index, setIndex] = useState(-1);
  const [guesses, setGuesses] = useState([]);
  const [finished, setFinished] = useState(false);

  const started = index >= 0;
  const mysteryId = started ? order[index] : null;
  const answer = started ? guesses[index] : undefined;
  const answered = answer !== undefined;
  const rightCount = guesses.filter((g, i) => g === order[i]).length;
  const mysteryPlaying = !!audio.playing?.mystery;
  const roomById = (id) => ROOMS.find((r) => r.id === id);

  function start() {
    const next = shuffle(ROOMS.map((r) => r.id));
    setOrder(next);
    setGuesses([]);
    setFinished(false);
    setIndex(0);
    audio.play(next[0], { mystery: true });
  }

  function nextQuestion() {
    const n = index + 1;
    if (n >= total) {
      audio.stop();
      setFinished(true);
      return;
    }
    setIndex(n);
    audio.play(order[n], { mystery: true });
  }

  function guess(id) {
    if (!started || answered) return;
    setGuesses((g) => [...g, id]);
  }

  const replay = () => (mysteryPlaying ? audio.stop() : audio.play(mysteryId, { mystery: true }));

  return (
    <section className="acl-guess" aria-labelledby="acl-guess-title">
      <div className="acl-guess-head">
        <div>
          <div className="acl-room-tag">Blind test</div>
          <h3 id="acl-guess-title">Guess the room</h3>
        </div>
        {started && (
          <span className="acl-guess-score" aria-live="polite">
            {finished ? `${rightCount} / ${total} correct` : `Question ${index + 1} of ${total}`}
          </span>
        )}
      </div>

      {started && (
        <ol className="acl-guess-progress" aria-label={`${guesses.length} of ${total} answered, ${rightCount} correct`}>
          {order.map((id, i) => {
            const g = guesses[i];
            const state = g === undefined ? (i === index ? "is-current" : "") : g === id ? "is-right" : "is-wrong";
            return <li key={id} className={state} />;
          })}
        </ol>
      )}

      {!started && (
        <p className="acl-guess-lead">
          {total} questions, one per room, in a random order. Each clip plays unlabelled — pick which room it was.
          Listen for how long the sound hangs on, how bright it is, and whether the bass booms.
        </p>
      )}
      {!audio.allReady && <p className="acl-guess-lead acl-guess-wait">Available once all five room recordings are added.</p>}

      {started && !finished && (
        <>
          <div className="acl-guess-actions">
            <button type="button" className="acl-btn" onClick={replay}>
              {mysteryPlaying ? "Stop" : "Replay clip"}
            </button>
            {mysteryPlaying && (
              <span className="acl-guess-live" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </div>

          <div className="acl-guess-options" role="group" aria-label="Which room was it?">
            {ROOMS.map((r) => {
              const state = !answered ? "" : r.id === mysteryId ? " is-right" : r.id === answer ? " is-wrong" : " is-dim";
              return (
                <button key={r.id} type="button" className={`acl-guess-opt${state}`} disabled={answered} onClick={() => guess(r.id)}>
                  {r.title}
                </button>
              );
            })}
          </div>

          {answered && (
            <>
              <p className={`acl-guess-result${answer === mysteryId ? " is-right" : " is-wrong"}`} role="status">
                <b>{answer === mysteryId ? "Correct!" : "Not quite."}</b> That was the{" "}
                {roomById(mysteryId).title.toLowerCase()}. {HINTS[mysteryId]}
              </p>
              <div className="acl-guess-actions">
                <button type="button" className="acl-btn acl-btn--primary" onClick={nextQuestion}>
                  {index + 1 < total ? `Next question (${index + 2} of ${total})` : "See results"}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {finished && (
        <div className="acl-guess-summary" role="status">
          <p className="acl-guess-result">
            <b>
              You got {rightCount} of {total}.
            </b>{" "}
            {rightCount === total
              ? "Perfect ears — every room identified."
              : rightCount >= total - 2
                ? "Nearly there. Re-listen to the rooms you missed above, then try again."
                : "Rooms are hard to tell apart at first. Listen to each card above again, then have another go."}
          </p>
          <ul className="acl-guess-review">
            {order.map((id, i) => {
              const ok = guesses[i] === id;
              return (
                <li key={id} className={ok ? "is-right" : "is-wrong"}>
                  <span className="acl-guess-review-n">Q{i + 1}</span>
                  <span>{roomById(id).title}</span>
                  <span className="acl-guess-review-you">
                    {ok ? "✓ correct" : `✗ you said ${roomById(guesses[i]).title.toLowerCase()}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(!started || finished) && (
        <div className="acl-guess-actions">
          <button type="button" className="acl-btn acl-btn--primary" disabled={!audio.allReady} onClick={start}>
            {finished ? "Try again" : "Start the test"}
          </button>
        </div>
      )}
    </section>
  );
}

const HINTS = {
  booth: "Almost nothing after each sound stops.",
  liveroom: "A short, soft halo that fades quickly and stays clear.",
  bedroom: "Very short echo, but a hollow, boxy colour and uneven bass.",
  bathroom: "A bright ring that lasts over a second.",
  hall: "A long, smooth tail with a gap before it — the sound seems far away.",
};

export default StudioAcousticsLab;
