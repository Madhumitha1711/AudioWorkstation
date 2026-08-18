import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MODULES, buildStepList, firstStepIdForTopic } from "../course/courseData";
import { useCourseTopics } from "../course/useCourseTopics";
import AssessmentSection from "../course/AssessmentSection";
import InteractiveSection from "../course/InteractiveSection";
import GearModelViewer from "../panorama/GearModelViewer";
import { ROOMS } from "../panorama/roomsData";
import "./CoursePage.css";

const STEP_TAG = { assessment: "Quiz", interactive: "Lab" };

// Every real VR-tour hotspot (Control Room + Recording Room gear markers),
// flattened so a chapter's `hotspotId` can be resolved back to the actual
// in-scene marker name instead of borrowing a course chapter's own (often
// longer, syllabus-style) title.
const ALL_HOTSPOTS = ROOMS.flatMap((room) => room.markers ?? []);
function hotspotName(hotspotId, fallbackTitle) {
  return ALL_HOTSPOTS.find((m) => m.id === hotspotId)?.title ?? fallbackTitle;
}

function CourseStatusScreen({ title, message, actionLabel, onAction }) {
  return (
    <div className="svr-course">
      <div className="course-status-screen">
        <h1>{title}</h1>
        <p>{message}</p>
        {actionLabel && (
          <button className="btn-primary" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function CoursePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { topics, loading, error, refetch } = useCourseTopics();

  // If a hotspot in the VR tour requested a specific topic (via "Start
  // course"), it's passed as route state — open straight to it; otherwise
  // fall back to the first step. Read once, at mount: revisiting this page
  // later shouldn't keep reopening a stale request.
  const pendingTopicId = useMemo(() => location.state?.topicId ?? null, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Topics now arrive asynchronously from studio-backend instead of being
  // available synchronously from a hardcoded import, so the step list and
  // the initial active step can't be computed at mount the way they used
  // to be. This derives STEPS whenever topics load/change, and the effect
  // below picks an initial step the first time real topics show up.
  const STEPS = useMemo(() => (topics ? buildStepList(topics) : []), [topics]);

  const [openTopics, setOpenTopics] = useState(() => new Set());
  const [activeStepId, setActiveStepId] = useState(null);
  const [completed, setCompleted] = useState(() => new Set());
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (hasInitialized || STEPS.length === 0) return;
    const requested = pendingTopicId && firstStepIdForTopic(STEPS, pendingTopicId);
    return requested ?? STEPS[0]?.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only meant to run once, at mount
  }, []);

  const [openTopics, setOpenTopics] = useState(() => {
    const topicId = STEPS.find((s) => s.id === initialStepId)?.topicId ?? STEPS[0]?.topicId;
    return new Set([topicId]);
  });
  // Which module accordion(s) are expanded in the sidebar — mirrors
  // openTopics above, one level up. Starts with just the module containing
  // wherever the student is actually landing (a fresh visit, or a topic
  // requested via route state), same "open where you are" logic as
  // openTopics.
  const [openModules, setOpenModules] = useState(() => {
    const topicId = STEPS.find((s) => s.id === initialStepId)?.topicId ?? STEPS[0]?.topicId;
    const moduleId = TOPICS.find((t) => t.id === topicId)?.module;
    return new Set(moduleId ? [moduleId] : []);
  });
  const [activeStepId, setActiveStepId] = useState(initialStepId);
  const [completed, setCompleted] = useState(() => new Set());

  const activeIndex = STEPS.findIndex((s) => s.id === activeStepId);
  const activeStep = STEPS[activeIndex] ?? STEPS[0];
  const activeTopic = (topics ?? []).find((t) => t.id === activeStep?.topicId);
  const activeModuleInfo = MODULES.find((m) => m.id === activeTopic?.module);

  const stepsInTopic = useMemo(
    () => STEPS.filter((s) => s.topicId === activeTopic?.id),
    [STEPS, activeTopic]
  );
  const doneInTopic = stepsInTopic.filter((s) => completed.has(s.id)).length;
  const topicPct = stepsInTopic.length ? Math.round((doneInTopic / stepsInTopic.length) * 100) : 0;
  const overallPct = STEPS.length ? Math.round((completed.size / STEPS.length) * 100) : 0;

  // Studio is where students actually land (LoginPage routes straight to
  // /studio) — this page is the notebook they get sent to from there, so
  // every way back hands PanoramaTour the hotspot that got them here. It
  // reads that as location.state.focusHotspotId and walks the camera
  // straight to it (powering the rig up on the way if it isn't already) —
  // see PanoramaTour's focus-hotspot effect. Several chapters share one
  // physical hotspot (e.g. "Signal Flow" shares the Patch Bay marker with
  // "Connectors, Cables, and Studio Wiring"), so this reads `hotspotId`
  // rather than the chapter's own `id` — see the field comment atop
  // course/courseData.js. A handful of "briefing" chapters have no hotspot
  // at all (hotspotId: null); PanoramaTour's focus effect already no-ops
  // gracefully when handed a null/missing target, so this still just lands
  // the student back in whichever room they left, unfocused.
  const goToStudio = (hotspotId = activeTopic?.hotspotId) =>
    navigate("/studio", { state: { focusHotspotId: hotspotId } });
  const goHome = () => navigate("/");

  const toggleModule = (moduleId) => {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

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
    const moduleId = TOPICS.find((t) => t.id === topicId)?.module;
    if (moduleId) setOpenModules((prev) => new Set(prev).add(moduleId));
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
      ? (activeTopic?.lessons ?? []).findIndex((l) => l.id === activeStep.id)
      : -1;

  const isDone = completed.has(activeStep?.id);

  if (loading) {
    return (
      <CourseStatusScreen
        title="Loading course…"
        message="Fetching the latest course content from studio-cms."
      />
    );
  }

  if (error) {
    return (
      <CourseStatusScreen
        title="Couldn't load the course"
        message={error}
        actionLabel="Retry"
        onAction={refetch}
      />
    );
  }

  if (STEPS.length === 0) {
    return (
      <CourseStatusScreen
        title="No course content yet"
        message="studio-cms doesn't have any published course topics yet. Check back soon."
        actionLabel="Retry"
        onAction={refetch}
      />
    );
  }

  return (
    <div className="svr-course">
      <div className="course-topbar">
        <div className="course-topbar-left">
          <button className="course-brand-mark" onClick={goHome} aria-label="Back to landing">
            ◎
          </button>
          <div className="course-title-block">
            <div className="course-crumb">
              {activeModuleInfo?.title ?? "Control Room"} &nbsp;/&nbsp; <b>{activeTopic?.title}</b>
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
          <button className="btn-primary" onClick={() => goToStudio()}>
            ← Back to the studio
          </button>
        </div>
      </div>

      <div className="course-layout">
        <aside className="course-sidebar">
          {MODULES.filter((mod) => TOPICS.some((t) => t.module === mod.id)).map((mod) => {
            const moduleTopics = TOPICS.filter((t) => t.module === mod.id);
            const isModuleOpen = openModules.has(mod.id);
            const moduleSteps = STEPS.filter((s) =>
              moduleTopics.some((t) => t.id === s.topicId)
            );
            const moduleDone = moduleSteps.filter((s) => completed.has(s.id)).length;

            return (
              <div className="module-block" key={mod.id}>
                <button
                  className={`module-head${isModuleOpen ? " open" : ""}`}
                  onClick={() => toggleModule(mod.id)}
                >
                  <span className="chev">▸</span>
                  <span className="mname">{mod.title}</span>
                  {moduleSteps.length > 0 && (
                    <span className="tcount">
                      {moduleDone}/{moduleSteps.length}
                    </span>
                  )}
                </button>

                <div className={`module-topics${isModuleOpen ? " open" : ""}`}>
                  {moduleTopics.map((topic) => {
                    if (!topic.ready) {
                      return (
                        <div className="topic-block" key={topic.id}>
                          <div className="topic-head locked">
                            <span className="chev" />
                            <span className="tname-col">
                              <span className="tname">
                                {topic.number ? `Ch ${topic.number} · ` : ""}
                                {topic.title}
                              </span>
                              {topic.room && (
                                <span className="tloc">
                                  📍 {topic.room}-{hotspotName(topic.hotspotId, topic.title)}
                                </span>
                              )}
                            </span>
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
                          <span className="tname-col">
                            <span className="tname">
                              {topic.number ? `Ch ${topic.number} · ` : ""}
                              {topic.title}
                            </span>
                            {topic.room && (
                              <span className="tloc anchored">
                                📍 {topic.room}-{hotspotName(topic.hotspotId, topic.title)}
                              </span>
                            )}
                          </span>
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
                </div>
              </div>
            );
          })}
        </aside>

        <main className="course-main">
          {activeTopic && activeStep && (
            <div className="course-content">
              <div className="topic-eyebrow">
                {activeModuleInfo?.title ?? "Control Room"}
                {activeTopic.number ? ` · Chapter ${activeTopic.number}` : ""} · {activeTopic.title}
              </div>
              <h1 className="topic-heading">{activeTopic.title}</h1>
              {activeTopic.hotspotId && (
                <div className="loc-chip anchored">
                  📍 Anchored —{" "}
                  {activeTopic.room} ·{" "}
                  {hotspotName(activeTopic.hotspotId, activeTopic.title)} hotspot
                </div>
              )}
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
                  <h4>{activeTopic.hotspotId ? "Back in the studio?" : "Ready to keep exploring?"}</h4>
                  <p>
                    {activeTopic.hotspotId
                      ? `This chapter is anchored to the ${hotspotName(activeTopic.hotspotId, activeTopic.title)} hotspot in the ${activeTopic.room} — head back and we'll walk you straight to it.`
                      : "This chapter is classroom-only — head back to the studio to pick up wherever you left off."}
                  </p>
                </div>
                <button className="btn-primary" onClick={() => goToStudio(activeTopic.hotspotId)}>
                  ← Back to the studio
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
