import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildStepList, firstStepIdForTopic } from "./data/courseData";
import { useCourseTopics } from "./data/useCourseTopics";
import AssessmentSection from "./components/AssessmentSection";
import InteractiveSection from "./components/InteractiveSection";
import { LABS } from "./interactives/registry";
import SectionBlocks from "./components/SectionBlocks";
import SectionExtras from "./components/SectionExtras";
import { StepNavContext } from "../../components/Tabs";
import { ROOMS } from "../tour/data/roomsData";
import "./CoursePage.css";

const STEP_TAG = { assessment: "Quiz", interactive: "Lab" };

const MOBILE_QUERY = "(max-width: 960px)";

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

  const pendingTopicId = useMemo(() => location.state?.topicId ?? null, []); // eslint-disable-line react-hooks/exhaustive-deps

  const STEPS = useMemo(() => (topics ? buildStepList(topics, (kind) => Boolean(LABS[kind])) : []), [topics]);

  const moduleList = useMemo(() => {
    const byId = new Map();
    (topics ?? []).forEach((t) => {
      if (!t.module || byId.has(t.module)) return;
      byId.set(t.module, {
        id: t.module,
        title: t.moduleTitle ?? t.module,
        order: t.moduleOrder ?? 0,
      });
    });
    return Array.from(byId.values()).sort((a, b) => a.order - b.order);
  }, [topics]);

  const [hasInitialized, setHasInitialized] = useState(false);

  const [openTopics, setOpenTopics] = useState(() => new Set());
  const [openModules, setOpenModules] = useState(() => new Set());
  const [activeStepId, setActiveStepId] = useState(null);
  const [completed, setCompleted] = useState(() => new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(MOBILE_QUERY).matches
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE_QUERY);
    if (!mq) return undefined;
    const onChange = (e) => {
      setIsMobile(e.matches);
      if (!e.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);
  const collapsed = sidebarCollapsed && !isMobile;

  useEffect(() => {
    if (hasInitialized || STEPS.length === 0) return;
    const requestedId = pendingTopicId && firstStepIdForTopic(STEPS, pendingTopicId);
    const initialStepId = requestedId ?? STEPS[0]?.id;
    const topicId = STEPS.find((s) => s.id === initialStepId)?.topicId ?? STEPS[0]?.topicId;
    const moduleId = (topics ?? []).find((t) => t.id === topicId)?.module;

    setActiveStepId(initialStepId);
    setOpenTopics(new Set(topicId ? [topicId] : []));
    setOpenModules(new Set(moduleId ? [moduleId] : []));
    setHasInitialized(true);
  }, [STEPS, hasInitialized, pendingTopicId, topics]);

  const activeIndex = STEPS.findIndex((s) => s.id === activeStepId);
  const activeStep = STEPS[activeIndex] ?? STEPS[0];
  const activeTopic = (topics ?? []).find((t) => t.id === activeStep?.topicId);

  const stepsInTopic = useMemo(
    () => STEPS.filter((s) => s.topicId === activeTopic?.id),
    [STEPS, activeTopic]
  );
  const doneInTopic = stepsInTopic.filter((s) => completed.has(s.id)).length;
  const topicPct = stepsInTopic.length ? Math.round((doneInTopic / stepsInTopic.length) * 100) : 0;
  const overallPct = STEPS.length ? Math.round((completed.size / STEPS.length) * 100) : 0;

  const goToStudio = (hotspotId = activeTopic?.hotspotId) =>
    navigate("/studio", { state: { focusHotspotId: hotspotId } });

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
    setDrawerOpen(false);
    setOpenTopics((prev) => new Set(prev).add(topicId));
    const moduleId = (topics ?? []).find((t) => t.id === topicId)?.module;
    if (moduleId) setOpenModules((prev) => new Set(prev).add(moduleId));
  };

  const markComplete = (stepId) => {
    setCompleted((prev) => (prev.has(stepId) ? prev : new Set(prev).add(stepId)));
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

  const [pagerCount, setPagerCount] = useState(0);
  const registerPager = useCallback(() => {
    setPagerCount((n) => n + 1);
    return () => setPagerCount((n) => n - 1);
  }, []);
  const stepLabel = (s) => (s ? s.data?.title || STEP_TAG[s.kind] || "Section" : null);
  const prevStep = STEPS[activeIndex - 1];
  const nextStep = STEPS[activeIndex + 1];
  const stepNav = {
    prev: prevStep ? { label: stepLabel(prevStep) } : null,
    next: nextStep ? { label: stepLabel(nextStep) } : null,
    goPrev,
    goNext,
    register: registerPager,
  };

  const lessonIndex =
    activeStep?.kind === "lesson"
      ? (activeTopic?.lessons ?? []).findIndex((l) => l.id === activeStep.id)
      : -1;

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

  const lessonNav = (
    <div className="lesson-actions">
      <button type="button" className="btn-secondary studio-back-btn" onClick={() => goToStudio()}>
        ← Back to the studio
      </button>
      {pagerCount === 0 && (
        <div className="nav-arrows">
          <button
            className="arrow-btn"
            onClick={goPrev}
            disabled={!stepNav.prev}
            title={stepNav.prev ? `Previous: ${stepNav.prev.label}` : undefined}
          >
            <span className="arrow-dir">← Previous</span>
            {stepNav.prev && <span className="arrow-name">{stepNav.prev.label}</span>}
          </button>
          <button
            className="arrow-btn"
            onClick={goNext}
            disabled={!stepNav.next}
            title={stepNav.next ? `Next: ${stepNav.next.label}` : undefined}
          >
            {stepNav.next && <span className="arrow-name">{stepNav.next.label}</span>}
            <span className="arrow-dir">Next →</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="svr-course">
      <div
        className={`course-layout${collapsed ? " sidebar-collapsed" : ""}${drawerOpen ? " drawer-open" : ""}`}
      >
        <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
        <aside
          id="course-outline"
          className={`course-sidebar${collapsed ? " collapsed" : ""}`}
          aria-label="Course contents"
          inert={isMobile && !drawerOpen}
        >
          <div className="sidebar-toggle-row">
            {!collapsed && <span className="sidebar-title">Course Contents</span>}
            {isMobile ? (
              <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close course outline"
                title="Close course outline"
              >
                ✕
              </button>
            ) : (
              <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={() => setSidebarCollapsed((v) => !v)}
                aria-expanded={!sidebarCollapsed}
                aria-label={sidebarCollapsed ? "Expand course outline" : "Collapse course outline"}
                title={sidebarCollapsed ? "Expand course outline" : "Collapse course outline"}
              >
                {sidebarCollapsed ? "»" : "«"}
              </button>
            )}
          </div>
          {collapsed ? (
            <div
              className="sidebar-progress-mini"
              title={`${completed.size} / ${STEPS.length} sections complete`}
            >
              {overallPct}%
            </div>
          ) : (
            <div className="sidebar-progress">
              <div className="sidebar-progress-head">
                <span>Overall progress</span>
                <span className="sidebar-progress-pct">{overallPct}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${overallPct}%` }} />
              </div>
              <span className="progress-label">
                {completed.size} / {STEPS.length} sections complete
              </span>
            </div>
          )}
          {!collapsed && moduleList.map((mod) => {
            const moduleTopics = (topics ?? []).filter((t) => t.module === mod.id);
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
                            <span className="tname-col">
                              <span className="tname">
                                {topic.number ? `Ch ${topic.number} ` : ""}
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
                          <span className="tname-col">
                            <span className="tname">
                              {topic.number ? `Ch ${topic.number} ` : ""}
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
                              className={`lesson-item${step.id === activeStep?.id ? " active" : ""}${step.kind === "interactive" ? " interactive" : ""}`}
                              onClick={() => selectStep(step.id, topic.id)}
                            >
                              <span className={`lesson-check${completed.has(step.id) ? " done" : ""}`}>
                                {completed.has(step.id) ? "✓" : ""}
                              </span>
                              <span className="lname">{step.data.title || "Untitled activity"}</span>
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

        <StepNavContext.Provider value={stepNav}>
        <main className="course-main">
          <button
            type="button"
            className="drawer-trigger"
            onClick={() => setDrawerOpen(true)}
            aria-controls="course-outline"
            aria-expanded={drawerOpen}
          >
            <span className="drawer-trigger-icon" aria-hidden="true">☰</span>
            <span className="drawer-trigger-label">Course contents</span>
            <span className="drawer-trigger-pct">{overallPct}%</span>
          </button>
          {activeTopic && activeStep && (
            <div className="course-content">
              <div className="topic-top-row">
                {activeTopic.moduleTitle || activeTopic.number ? (
                  <div className="topic-eyebrow">
                    {[activeTopic.moduleTitle, activeTopic.number && `Chapter ${activeTopic.number}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                ) : null}
                <div
                  className="topic-progress-row"
                  title={`${doneInTopic} of ${stepsInTopic.length} sections complete in this chapter`}
                >
                  <span className="progress-label">
                    {doneInTopic}/{stepsInTopic.length} sections
                  </span>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${topicPct}%` }} />
                  </div>
                </div>
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

              <SectionExtras key={activeStep.id} step={activeStep}>
                {activeStep.kind === "lesson" && (
                  <>
                    <div className="lesson-kicker">
                      Lesson {lessonIndex + 1} of {activeTopic.lessons.length}
                    </div>
                    <h2 className="lesson-title">{activeStep.data.title}</h2>

                    <SectionBlocks
                      blocks={activeStep.data.blocks}
                      fallbackDuration={activeStep.data.duration}
                      sectionTitle={activeStep.data.title}
                      onInteractiveComplete={() => markComplete(activeStep.id)}
                    />
                  </>
                )}

                {activeStep.kind === "assessment" && (
                  <AssessmentSection
                    assessment={activeStep.data}
                    onComplete={() => markComplete(activeStep.id)}
                  />
                )}

                {activeStep.kind === "interactive" && (
                  <InteractiveSection
                    interactive={activeStep.data}
                    onComplete={() => markComplete(activeStep.id)}
                  />
                )}
              </SectionExtras>

              {lessonNav}

            </div>
          )}
        </main>
        </StepNavContext.Provider>
      </div>

    </div>
  );
}

export default CoursePage;
