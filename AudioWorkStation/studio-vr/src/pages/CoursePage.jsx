import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TOPICS, buildStepList, firstStepIdForTopic } from "../course/courseData";
import AssessmentSection from "../course/AssessmentSection";
import InteractiveSection from "../course/InteractiveSection";
import GearModelViewer from "../panorama/GearModelViewer";
import { ThemeToggle } from "../theme/ThemeToggle";
import "./CoursePage.css";

const STEPS = buildStepList(TOPICS);

const STEP_TAG = { assessment: "Quiz", interactive: "Lab" };

function CoursePage() {
  const navigate = useNavigate();
  const location = useLocation();
  // If a hotspot in the VR tour requested a specific topic (via "Start
  // course"), it's passed as route state — open straight to it; otherwise
  // fall back to the first step. Read once, at mount: revisiting this page
  // later shouldn't keep reopening a stale request.
  const pendingTopicId = useMemo(() => location.state?.topicId ?? null, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initialStepId = useMemo(() => {
    const requested = pendingTopicId && firstStepIdForTopic(STEPS, pendingTopicId);
    return requested ?? STEPS[0]?.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only meant to run once, at mount
  }, []);

  const [openTopics, setOpenTopics] = useState(() => {
    const topicId = STEPS.find((s) => s.id === initialStepId)?.topicId ?? STEPS[0]?.topicId;
    return new Set([topicId]);
  });
  const [activeStepId, setActiveStepId] = useState(initialStepId);
  const [completed, setCompleted] = useState(() => new Set());

  const activeIndex = STEPS.findIndex((s) => s.id === activeStepId);
  const activeStep = STEPS[activeIndex] ?? STEPS[0];
  const activeTopic = TOPICS.find((t) => t.id === activeStep?.topicId);

  const stepsInTopic = useMemo(
    () => STEPS.filter((s) => s.topicId === activeTopic?.id),
    [activeTopic]
  );
  const doneInTopic = stepsInTopic.filter((s) => completed.has(s.id)).length;
  const topicPct = stepsInTopic.length ? Math.round((doneInTopic / stepsInTopic.length) * 100) : 0;
  const overallPct = STEPS.length ? Math.round((completed.size / STEPS.length) * 100) : 0;

  const goToStudio = () => navigate("/studio");
  const goHome = () => navigate("/");

  const toggleTopic = (topicId) => {
    setOpenTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const selectStep = (stepId, topicId) => {
    setActiveStepId(stepId);
    setOpenTopics((prev) => new Set(prev).add(topicId));
  };

  const markComplete = (stepId) => {
    setCompleted((prev) => (prev.has(stepId) ? prev : new Set(prev).add(stepId)));
  };

  const toggleActiveLessonComplete = () => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(activeStep.id)) next.delete(activeStep.id);
      else next.add(activeStep.id);
      return next;
    });
  };

  const stepAt = (offset) => STEPS[activeIndex + offset];
  const goPrev = () => {
    const s = stepAt(-1);
    if (s) selectStep(s.id, s.topicId);
  };
  const goNext = () => {
    const s = stepAt(1);
    if (s) selectStep(s.id, s.topicId);
  };

  const lessonIndex =
    activeStep?.kind === "lesson"
      ? activeTopic.lessons.findIndex((l) => l.id === activeStep.id)
      : -1;

  const isDone = completed.has(activeStep?.id);

  return (
    <div className="svr-course">
      <div className="course-topbar">
        <div className="course-topbar-left">
          <button className="course-brand-mark" onClick={goHome} aria-label="Back to landing">
            ◎
          </button>
          <div className="course-title-block">
            <div className="course-crumb">
              Control Room &nbsp;/&nbsp; <b>{activeTopic?.title}</b>
            </div>
            <h1>Studio VR — Audio Engineering</h1>
            <div className="progress-wrap">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${overallPct}%` }} />
              </div>
              <span className="progress-label">
                {completed.size} / {STEPS.length} sections complete
              </span>
            </div>
          </div>
        </div>
        <div className="course-topbar-right">
          <ThemeToggle className="theme-toggle-btn" />
          <button className="btn-primary" onClick={goToStudio}>
            Launch VR studio →
          </button>
        </div>
      </div>

      <div className="course-layout">
        <aside className="course-sidebar">
          <div className="sidebar-section-label">Control Room</div>
          {TOPICS.map((topic) => {
            if (!topic.ready) {
              return (
                <div className="topic-block" key={topic.id}>
                  <div className="topic-head locked">
                    <span className="chev">▸</span>
                    <span className="tname">{topic.title}</span>
                    <span className="tsoon">Soon</span>
                  </div>
                </div>
              );
            }

            const isOpen = openTopics.has(topic.id);
            const isCurrent = topic.id === activeTopic?.id;
            const topicSteps = STEPS.filter((s) => s.topicId === topic.id);
            const doneCount = topicSteps.filter((s) => completed.has(s.id)).length;

            return (
              <div className="topic-block" key={topic.id}>
                <button
                  className={`topic-head${isOpen ? " open" : ""}${isCurrent ? " current" : ""}`}
                  onClick={() => toggleTopic(topic.id)}
                >
                  <span className="chev">▸</span>
                  <span className="tname">{topic.title}</span>
                  <span className="tcount">
                    {doneCount}/{topicSteps.length}
                  </span>
                </button>
                <div className={`lesson-list${isOpen ? " open" : ""}`}>
                  {topicSteps.map((step) => (
                    <button
                      key={step.id}
                      className={`lesson-item${step.id === activeStep?.id ? " active" : ""}`}
                      onClick={() => selectStep(step.id, topic.id)}
                    >
                      <span className={`lesson-check${completed.has(step.id) ? " done" : ""}`}>
                        {completed.has(step.id) ? "✓" : ""}
                      </span>
                      <span className="lname">{step.data.title}</span>
                      {STEP_TAG[step.kind] && <span className="ltag">{STEP_TAG[step.kind]}</span>}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="sidebar-section-label">Recording Room</div>
          <div className="empty-topic-note">More lessons coming soon</div>
        </aside>

        <main className="course-main">
          {activeTopic && activeStep && (
            <div className="course-content">
              <div className="topic-eyebrow">
                Control Room · {activeTopic.title}
              </div>
              <h1 className="topic-heading">{activeTopic.title}</h1>
              <p className="topic-intro">{activeTopic.intro}</p>
              <div className="topic-progress-row">
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${topicPct}%` }} />
                </div>
                <span className="progress-label">
                  {doneInTopic} / {stepsInTopic.length} sections in this topic
                </span>
              </div>

              {activeStep.kind === "lesson" && (
                <>
                  <div className="lesson-video">
                    <img src="/paranoma.png" alt="" />
                    <div className="play-btn" />
                    <div className="vtag">Lesson video · {activeStep.data.duration}</div>
                  </div>
                  <p className="video-caption">Watch first, then read the full lesson below.</p>

                  <div className={`lesson-body-row${activeTopic.model ? " has-model" : ""}`}>
                    {activeTopic.model && (
                      <div className="topic-model-box">
                        <GearModelViewer
                          url={activeTopic.model.url}
                          kind={activeTopic.model.kind}
                          height={320}
                        />
                        <div className="vtag">Inspect in 3D · drag to rotate</div>
                      </div>
                    )}

                    <div className="lesson-text-col">
                      <div className="lesson-kicker">
                        Lesson {lessonIndex + 1} of {activeTopic.lessons.length}
                      </div>
                      <h2 className="lesson-title">{activeStep.data.title}</h2>

                      <div className="lesson-article">
                        {activeStep.data.paragraphs.map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="lesson-actions">
                    <div className="nav-arrows">
                      <button className="arrow-btn" onClick={goPrev} disabled={activeIndex === 0}>
                        ← Previous
                      </button>
                      <button
                        className="arrow-btn"
                        onClick={goNext}
                        disabled={activeIndex === STEPS.length - 1}
                      >
                        Next →
                      </button>
                    </div>
                    <button
                      className={`complete-btn${isDone ? " done" : ""}`}
                      onClick={toggleActiveLessonComplete}
                    >
                      {isDone ? "✓ Completed" : "Mark as complete"}
                    </button>
                  </div>
                </>
              )}

              {activeStep.kind === "assessment" && (
                <>
                  <AssessmentSection
                    assessment={activeStep.data}
                    onComplete={() => markComplete(activeStep.id)}
                  />
                  <div className="lesson-actions">
                    <div className="nav-arrows">
                      <button className="arrow-btn" onClick={goPrev} disabled={activeIndex === 0}>
                        ← Previous
                      </button>
                      <button
                        className="arrow-btn"
                        onClick={goNext}
                        disabled={activeIndex === STEPS.length - 1}
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeStep.kind === "interactive" && (
                <>
                  <InteractiveSection
                    interactive={activeStep.data}
                    onComplete={() => markComplete(activeStep.id)}
                  />
                  <div className="lesson-actions">
                    <div className="nav-arrows">
                      <button className="arrow-btn" onClick={goPrev} disabled={activeIndex === 0}>
                        ← Previous
                      </button>
                      <button
                        className="arrow-btn"
                        onClick={goNext}
                        disabled={activeIndex === STEPS.length - 1}
                      >
                        Next →
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="studio-cta">
                <div>
                  <h4>Want to see it in place?</h4>
                  <p>
                    Step into the 360° control room and find the {activeTopic.title.toLowerCase()} hotspot
                    yourself.
                  </p>
                </div>
                <button className="btn-primary" onClick={goToStudio}>
                  Launch VR studio →
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default CoursePage;
