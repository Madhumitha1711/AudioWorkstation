import { useState } from "react";

// NOTE: this file is still named HotspotPrecheck.jsx even though the export
// below is HotspotKnowledgeCheck — it started life as a single-question
// "guess before we tell you" precheck shown the instant a hotspot was
// selected. It's since grown into a 5-question, fully optional "Test your
// knowledge" quiz launched from the gear panel's "choose how to start" view
// instead (see PanoramaTour.jsx's `quizActive` state), so the old name no
// longer fits. Renaming the file was left for a follow-up pass so this
// change stays focused on behavior rather than a file move.
//
// Reuses the SAME question bank as the in-course "Knowledge Check"
// (courseData.js topic.assessment.questions / AssessmentSection.jsx), just
// walked through one question at a time instead of all five on one page, to
// fit this floating panel's compact width — and restyled to match the
// panel's chrome instead of the full CoursePage layout.
//
// This is deliberately never a gate: the panel that launches this always
// offers "Start course" directly without it, and this panel offers
// "Skip questions" at every step plus a full results recap with its own
// "Start course" button once all 5 are answered.
function HotspotKnowledgeCheck({ gear, questions, onSkip, onBackToOverview, onStartCourse, onClose }) {
  const [step, setStep] = useState(0);
  const [responses, setResponses] = useState(() =>
    (questions ?? []).map(() => ({ selected: null, submitted: false }))
  );

  if (!questions || questions.length === 0) return null;

  const total = questions.length;
  const finished = step >= total;
  const answeredCount = responses.filter((r) => r.submitted).length;

  const choose = (optionIndex) => {
    const current = responses[step];
    if (current.submitted) return;
    setResponses((prev) => {
      const next = [...prev];
      next[step] = { ...next[step], selected: optionIndex };
      return next;
    });
  };

  const checkAnswer = () => {
    const current = responses[step];
    if (current.selected === null) return;
    setResponses((prev) => {
      const next = [...prev];
      next[step] = { ...next[step], submitted: true };
      return next;
    });
  };

  const advance = () => setStep((s) => s + 1);

  if (finished) {
    const correctCount = responses.filter(
      (r, i) => r.submitted && r.selected === questions[i].correctIndex
    ).length;
    const scoreNote =
      correctCount === total
        ? "Clean sweep — you clearly know this gear already."
        : correctCount >= Math.ceil(total / 2)
          ? "Good starting point — the lesson ahead fills in the rest."
          : "That's exactly what the course is for — let's go learn it.";

    return (
      <div className="svr-tour-gear-panel svr-tour-precheck-panel">
        <div className="svr-tour-gear-panel__head">
          <span className="svr-tour-gear-badge">{gear.number}</span>
          <div className="svr-tour-gear-panel__titles">
            <div className="svr-tour-gear-panel__title">{gear.title}</div>
            <div className="svr-tour-gear-panel__kicker">Test your knowledge · Results</div>
          </div>
          <button onClick={onClose} className="svr-tour-gear-panel__close" aria-label="Close">
            ×
          </button>
        </div>

        <div className="svr-tour-gear-panel__body">
          <div className="svr-tour-precheck-score">
            <div className="svr-tour-precheck-score-value">
              {correctCount} / {total}
            </div>
            <div className="svr-tour-precheck-score-note">{scoreNote}</div>
          </div>

          <div className="svr-tour-section-label">Recap</div>
          <ul className="svr-tour-precheck-recap">
            {questions.map((q, i) => {
              const r = responses[i];
              const isCorrect = r.submitted && r.selected === q.correctIndex;
              return (
                <li key={q.id} className={isCorrect ? "good" : "bad"}>
                  <span className="svr-tour-precheck-recap-mark">{isCorrect ? "✓" : "✕"}</span>
                  {q.prompt}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="svr-tour-gear-panel__footer">
          <div className="svr-tour-gear-panel__footer-row">
            <button onClick={onBackToOverview} className="svr-tour-btn svr-tour-btn-secondary">
              ← Back
            </button>
            <button onClick={onStartCourse} className="svr-tour-btn svr-tour-btn-primary">
              Start course →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const current = questions[step];
  const currentResponse = responses[step];
  const isCorrect = currentResponse.selected === current.correctIndex;

  return (
    <div className="svr-tour-gear-panel svr-tour-precheck-panel">
      <div className="svr-tour-gear-panel__head">
        <span className="svr-tour-gear-badge">{gear.number}</span>
        <div className="svr-tour-gear-panel__titles">
          <div className="svr-tour-gear-panel__title">{gear.title}</div>
          <div className="svr-tour-gear-panel__kicker">
            Test your knowledge · {step + 1} of {total}
          </div>
        </div>
        <button onClick={onClose} className="svr-tour-gear-panel__close" aria-label="Close">
          ×
        </button>
      </div>

      <div className="svr-tour-precheck-progress">
        {questions.map((q, i) => (
          <span
            key={q.id}
            className={`svr-tour-precheck-progress-seg${i < answeredCount ? " filled" : ""}${
              i === step ? " current" : ""
            }`}
          />
        ))}
      </div>

      <div className="svr-tour-gear-panel__body">
        {step === 0 && (
          <p className="svr-tour-precheck-lede">
            Five quick questions on {gear.title.toLowerCase()} — take a guess, it's fine if you're not
            sure yet.
          </p>
        )}

        <div className="svr-tour-precheck-question">{current.prompt}</div>

        <div className="svr-tour-precheck-options">
          {current.options.map((option, index) => {
            const isSelected = currentResponse.selected === index;
            let state = "";
            if (currentResponse.submitted) {
              if (index === current.correctIndex) state = "correct";
              else if (isSelected) state = "incorrect";
            } else if (isSelected) {
              state = "selected";
            }
            return (
              <button
                type="button"
                key={index}
                className={`svr-tour-precheck-option ${state}`}
                onClick={() => choose(index)}
                disabled={currentResponse.submitted}
              >
                <span className="svr-tour-precheck-option-mark" />
                {option}
              </button>
            );
          })}
        </div>

        {currentResponse.submitted && (
          <div className={`svr-tour-precheck-feedback ${isCorrect ? "good" : "bad"}`}>
            {isCorrect ? "Correct — " : "Not quite — "}
            {current.explanation}
          </div>
        )}
      </div>

      <div className="svr-tour-gear-panel__footer">
        <button type="button" onClick={onSkip} className="svr-tour-precheck-skip">
          Skip questions
        </button>
        <div className="svr-tour-gear-panel__footer-row">
          {!currentResponse.submitted ? (
            <button
              onClick={checkAnswer}
              disabled={currentResponse.selected === null}
              className="svr-tour-btn svr-tour-btn-primary"
            >
              Check answer
            </button>
          ) : (
            <button onClick={advance} className="svr-tour-btn svr-tour-btn-primary">
              {step === total - 1 ? "See results →" : "Next question →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default HotspotKnowledgeCheck;
