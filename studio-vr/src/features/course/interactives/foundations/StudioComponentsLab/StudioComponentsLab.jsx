import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import "./StudioComponentsLab.css";
import { ALL_COMPONENTS, ICONS, SECTIONS, componentImagePath } from "./studioComponentsData";

// Ported from design/studio-components-chapter.html — the "Studio
// Components" briefing (Foundations, alongside chapter 2 "The Studio:
// Recording Room and Control Room"). Master/detail layout:
//   LEFT  — four collapsible sections (Control Room / Recording Room ×
//           Electronic / Non-electronic), grouped under a room label, each
//           listing its four components.
//   RIGHT — detail pane for the selected component: photo (or labelled
//           icon placeholder until the photo exists), title, lead, body,
//           key points, and prev/next paging through all 16 in order.
//
// Differences from the mockup, all because this renders inside the course
// content column rather than as a standalone page:
//   - no page header / theme toggle — the lesson's own heading and the
//     app's ThemeContext already cover those; colors come from the course
//     theme tokens (--panel, --border-soft, --text-dim…) plus four scoped
//     per-section accents (--scl-amber etc., see the CSS).
//   - no 100vh layout — the lab has a fixed max height on desktop with the
//     list and detail pane scrolling independently, and stacks on narrow
//     widths.
//   - sections are plain buttons with aria-expanded instead of <details>,
//     so open/closed state is React state (selecting an item force-opens
//     its section, others stay as the student left them — same behavior as
//     the mockup's show()).
//   - added: a "viewed" tick per component and a per-section N/4 count,
//     so the student can see what they haven't opened yet.
//
// onInteract (from InteractiveSection) fires the first time the student
// opens a component themselves — the initial auto-selection doesn't count.

// Renders **bold** runs from the data file as <strong>.
function renderRich(text) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

// Icon markup is static, trusted data from studioComponentsData.js.
function Icon({ id, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[id] ?? "" }}
    />
  );
}

function Chevron() {
  return (
    <svg className="scl-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function StudioComponentsLab({ onInteract }) {
  const [selectedId, setSelectedId] = useState(ALL_COMPONENTS[0].id);
  const [openSections, setOpenSections] = useState(() => new Set([SECTIONS[0].n]));
  const [viewed, setViewed] = useState(() => new Set([ALL_COMPONENTS[0].id]));
  // ids whose photo finished loading — hides the placeholder underneath
  const [loadedImgs, setLoadedImgs] = useState(() => new Set());
  const [failedImgs, setFailedImgs] = useState(() => new Set());
  const detailRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  const index = ALL_COMPONENTS.findIndex((c) => c.id === selectedId);
  const item = ALL_COMPONENTS[index];
  const section = item.section;
  const prev = ALL_COMPONENTS[index - 1];
  const next = ALL_COMPONENTS[index + 1];

  function select(id) {
    const target = ALL_COMPONENTS.find((c) => c.id === id);
    if (!target) return;
    setSelectedId(id);
    setViewed((v) => (v.has(id) ? v : new Set(v).add(id)));
    setOpenSections((s) => (s.has(target.section.n) ? s : new Set(s).add(target.section.n)));
    if (detailRef.current) detailRef.current.scrollTop = 0;
    if (!firedRef.current) {
      firedRef.current = true;
      onInteractRef.current?.();
    }
  }

  // On narrow widths the list stacks above the detail pane (see the CSS
  // breakpoint), so picking from the list would otherwise update content
  // the student can't see — bring the pane into view. Pager clicks already
  // happen inside the pane, so they don't need this.
  function selectFromList(id) {
    select(id);
    if (typeof window !== "undefined" && window.matchMedia?.("(max-width: 860px)").matches) {
      detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  function toggleSection(n) {
    setOpenSections((s) => {
      const nextSet = new Set(s);
      if (nextSet.has(n)) nextSet.delete(n);
      else nextSet.add(n);
      return nextSet;
    });
  }

  const imgSrc = componentImagePath(item.id);
  const imgLoaded = loadedImgs.has(item.id);
  const imgFailed = failedImgs.has(item.id);

  return (
    <div className="lab scl">
      <div className="scl-layout">
        {/* ---------- left: section list, grouped by room ---------- */}
        <nav className="scl-nav" aria-label="Studio components">
          {SECTIONS.map((s, i) => {
            const showRoom = i === 0 || SECTIONS[i - 1].room !== s.room;
            const open = openSections.has(s.n);
            const seen = s.items.filter((it) => viewed.has(it.id)).length;
            const listId = `scl-items-${s.n}`;
            return (
              <div key={s.n} className="scl-sec-wrap">
                {showRoom && <div className="scl-room-label">{s.room}</div>}
                <div className={`scl-sec scl-tone-${s.tone}${open ? " is-open" : ""}`}>
                  <button type="button" className="scl-sec-head" aria-expanded={open} aria-controls={listId} onClick={() => toggleSection(s.n)}>
                    <span className="scl-sec-n">{s.n}</span>
                    <span className="scl-sec-t">{s.type}</span>
                    <span className="scl-sec-count">
                      {seen}/{s.items.length}
                    </span>
                    <Chevron />
                  </button>
                  {open && (
                    <div className="scl-items" id={listId}>
                      {s.items.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          className="scl-item"
                          aria-current={it.id === selectedId ? "true" : undefined}
                          onClick={() => selectFromList(it.id)}
                        >
                          <span className="scl-ic">
                            <Icon id={it.id} />
                          </span>
                          <span className="scl-item-name">{it.name}</span>
                          {viewed.has(it.id) && <span className="scl-seen" aria-label="viewed" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </nav>

        {/* ---------- right: detail pane ---------- */}
        <article ref={detailRef} className={`scl-detail scl-tone-${section.tone}`} aria-live="polite">
          <div className="scl-media scl-fade" key={`m-${item.id}`}>
            <div className="scl-frame">
              {!imgFailed && (
                <img
                  src={imgSrc}
                  alt={item.name}
                  onLoad={() => setLoadedImgs((s) => new Set(s).add(item.id))}
                  onError={() => setFailedImgs((s) => new Set(s).add(item.id))}
                />
              )}
              {!imgLoaded && (
                <div className="scl-ph">
                  <Icon id={item.id} />
                  <span>{`public${imgSrc}`}</span>
                </div>
              )}
            </div>
            <div className="scl-caption">
              {item.name} · {section.room}
            </div>
          </div>

          <div className="scl-text scl-fade" key={`t-${item.id}`}>
            <h3 className="scl-title">{item.name}</h3>
            <p className="scl-lead">{item.lead}</p>
            {item.body.map((p, i) => (
              <p key={i} className="scl-body">
                {renderRich(p)}
              </p>
            ))}
            <h4 className="scl-kp">Key points</h4>
            <ul className="scl-points">
              {item.points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="scl-pager">
            <button type="button" disabled={!prev} onClick={() => prev && select(prev.id)}>
              <small>← PREVIOUS</small>
              {prev ? prev.name : "—"}
            </button>
            <button type="button" disabled={!next} onClick={() => next && select(next.id)}>
              <small>NEXT →</small>
              {next ? next.name : "—"}
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}

export default StudioComponentsLab;
