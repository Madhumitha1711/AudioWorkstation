import { useRef, useState } from "react";
import "./AssessmentSection.css";

// A question can optionally carry `audioClips`: [{ id, label, url }, ...] —
// short reference clips a student listens to before answering (e.g. a
// "Before"/"After" pair for an ear-training question like "which of these
// has more compression?"). All clips for a single question share one
// underlying <audio> element so pressing a second clip's button always
// stops whatever was already playing, rather than layering clips on top of
// each other.
function AudioClipRow({ clips }) {
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);

  const toggle = (clip) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === clip.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = clip.url;
    audio.currentTime = 0;
    audio.play();
    setPlayingId(clip.id);
  };

  return (
    <div className="assess-audio-row">
      {clips.map((clip) => (
        <button
          type="button"
          key={clip.id}
          className={`assess-audio-btn ${playingId === clip.id ? "playing" : ""}`}
          onClick={() => toggle(clip)}
        >
          <span className="assess-audio-icon" aria-hidden="true" />
          {clip.label || "Play clip"}
        </button>
      ))}
      <audio ref={audioRef} preload="none" onEnded={() => setPlayingId(null)} />
    </div>
  );
}

function AssessmentSection({ assessment, onComplete }) {
  const { title, questions } = assessment;
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  const choose = (questionId, optionIndex) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const checkAnswers = () => {
    setSubmitted(true);
    onComplete?.();
  };

  const retake = () => {
    setAnswers({});
    setSubmitted(false);
  };

  const score = submitted
    ? questions.filter((q) => answers[q.id] === q.correctIndex).length
    : 0;

  return (
    <div className="assess">
      <div className="assess-kicker">Knowledge Check</div>
      <h2 className="assess-title">{title}</h2>
      <p className="assess-lede">
        Answer every question, then check your work. You can retake it as many times as you like.
      </p>

      {submitted && (
        <div className="assess-score">
          You scored <b>{score}</b> / {questions.length}
        </div>
      )}

      <div className="assess-questions">
        {questions.map((q, qi) => {
          const selected = answers[q.id];
          const isCorrect = selected === q.correctIndex;
          return (
            <div className="assess-q" key={q.id}>
              <div className="assess-q-prompt">
                <span className="assess-q-num">{qi + 1}</span>
                {q.prompt}
              </div>
              {q.audioClips?.length > 0 && <AudioClipRow clips={q.audioClips} />}
              <div className="assess-options">
                {q.options.map((opt, oi) => {
                  const isSelected = selected === oi;
                  let state = "";
                  if (submitted) {
                    if (oi === q.correctIndex) state = "correct";
                    else if (isSelected) state = "incorrect";
                  } else if (isSelected) {
                    state = "selected";
                  }
                  return (
                    <button
                      type="button"
                      key={oi}
                      className={`assess-option ${state}`}
                      onClick={() => choose(q.id, oi)}
                      disabled={submitted}
                    >
                      <span className="assess-option-mark" />
                      {opt}
                    </button>
                  );
                })}
              </div>
              {submitted && (
                <div className={`assess-feedback ${isCorrect ? "good" : "bad"}`}>
                  {isCorrect ? "Correct — " : "Not quite — "}
                  {q.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="assess-actions">
        {!submitted ? (
          <button className="btn-primary" disabled={!allAnswered} onClick={checkAnswers}>
            Check answers
          </button>
        ) : (
          <button className="btn-secondary" onClick={retake}>
            Retake quiz
          </button>
        )}
      </div>
    </div>
  );
}

export default AssessmentSection;
