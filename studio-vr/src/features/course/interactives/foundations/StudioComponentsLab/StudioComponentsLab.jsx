import { useEffect, useRef, useState } from "react";
import { Tabs, TabPanel, useTabTransition } from "../../../../../components/Tabs";
import "../../shared/labs.css";
import "./StudioComponentsLab.css";
import { ALL_COMPONENTS, ICONS, SECTIONS, componentImagePath } from "./studioComponentsData";

// "Key Elements of the Recording Space" (Foundations, alongside chapter 2
// "The Studio: Recording Room and Control Room"). Horizontal layout, built
// to design/studio-components-tabs.html:
//
//   ROW 1  Area tabs — standard <Tabs> (underline, fill): one tab per
//          section labelled "Electronic" / "Non-electronic". The room names
//          are group headers above the bar — "Control Room" over its two
//          tabs, a vertical divider, then "Recording Room" over its two —
//          so each room is named once instead of on every tab.
//   ROW 2  Component tabs — standard <Tabs variant="segmented" size="sm">
//          with the 4 components of the active area (icon + name).
//   ROW 3  <TabPanel> — photo on top, copy below it.
//   ROW 4  Previous / Next across all 16 components (crosses areas).
//
// Navigation colour is only the theme primary / secondary (--brand-accent,
// --brand-accent-2) plus the neutral text tokens — the per-section tone
// (--c, see CSS) is used in the CONTENT only (placeholder icon),
// never on a tab. Type is the global --font-sans throughout.
//
// Second-level motion: when the area changes, the component bar is
// remounted (key = area id) inside a wrapper that plays the standard panel
// transition (useTabTransition — fade + 10px slide in the direction of
// travel, same tokens as every TabPanel), so the new set of components
// glides in instead of the labels swapping in place. Within one area the
// bar is not remounted, so its pill glides between components as usual.
//
// Explored state: the area bar tracks "areas opened"; the component bar is
// controlled (`visited`) from the lab's own `viewed` set so its dots/count
// mean "components opened in this area" and survive the remount.
//
// onInteract (from InteractiveSection) fires the first time the student
// picks a component themselves — the initial selection doesn't count.

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

const SECTION_TABS = SECTIONS.map((s) => ({ id: s.n, label: s.type, room: s.room, ariaLabel: `${s.room} — ${s.type}` }));

// Rooms in order, each with its sections (Control Room → 01, 02; Recording
// Room → 03, 04). Drives the group headers above the area bar.
const ROOMS = SECTIONS.reduce((acc, s) => {
  const last = acc[acc.length - 1];
  if (last && last.name === s.room) last.ids.push(s.n);
  else acc.push({ name: s.room, ids: [s.n] });
  return acc;
}, []);

function StudioComponentsLab({ onInteract }) {
  const [selectedId, setSelectedId] = useState(ALL_COMPONENTS[0].id);
  const [viewed, setViewed] = useState(() => new Set([ALL_COMPONENTS[0].id]));
  const [loadedImgs, setLoadedImgs] = useState(() => new Set());
  const [failedImgs, setFailedImgs] = useState(() => new Set());
  const railRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  const index = ALL_COMPONENTS.findIndex((c) => c.id === selectedId);
  const item = ALL_COMPONENTS[index];
  const section = item.section;
  const sectionIndex = SECTIONS.indexOf(section);
  const prev = ALL_COMPONENTS[index - 1];
  const next = ALL_COMPONENTS[index + 1];

  // Component bar slides in from the side of travel when the area changes.
  useTabTransition(railRef, section.n, sectionIndex);

  function select(id) {
    if (id === selectedId || !ALL_COMPONENTS.some((c) => c.id === id)) return;
    setSelectedId(id);
    setViewed((v) => (v.has(id) ? v : new Set(v).add(id)));
    if (!firedRef.current) {
      firedRef.current = true;
      onInteractRef.current?.();
    }
  }

  // Opening an area lands on its first component not yet opened (or the
  // first one if all have been seen).
  function selectSection(n) {
    const s = SECTIONS.find((x) => x.n === n);
    if (!s) return;
    select((s.items.find((it) => !viewed.has(it.id)) || s.items[0]).id);
  }

  const imgSrc = componentImagePath(item.id);
  const imgLoaded = loadedImgs.has(item.id);
  const imgFailed = failedImgs.has(item.id);

  return (
    <div className="lab scl">
      {/* ---------- row 1: areas ---------- */}
      <div className="scl-areas-wrap" style={{ "--scl-rooms": ROOMS.length }}>
        <div className="scl-rooms" aria-hidden="true">
          {ROOMS.map((r) => (
            <span key={r.name} className={`scl-room${r.ids.includes(section.n) ? " is-active" : ""}`}>
              {r.name}
            </span>
          ))}
        </div>
        <Tabs
          items={SECTION_TABS}
          value={section.n}
          onChange={selectSection}
          ariaLabel="Studio areas"
          idPrefix="scl-sec"
          className="scl-areas"
          fill
          showCount={false}
          renderTab={(t) => <span className="scl-area-type">{t.label}</span>}
        />
        <span className="scl-rooms-divider" aria-hidden="true" />
      </div>

      {/* ---------- row 2: components of the active area ---------- */}
      <div ref={railRef} className="scl-rail">
        <Tabs
          key={section.n}
          variant="segmented"
          size="sm"
          items={section.items.map((it) => ({ id: it.id, label: it.name }))}
          value={item.id}
          onChange={select}
          visited={section.items.filter((it) => viewed.has(it.id)).map((it) => it.id)}
          ariaLabel={`${section.room} — ${section.type} components`}
          idPrefix="scl-item"
          renderTab={(t) => (
            <>
              <Icon id={t.id} className="scl-rail-ic" />
              <span>{t.label}</span>
            </>
          )}
        />
      </div>

      {/* ---------- row 3: detail ---------- */}
      <TabPanel idPrefix="scl-item" value={item.id} index={index} innerClassName={`scl-panel scl-tone-${section.tone}`}>
        <div className="scl-grid">
          <figure className="scl-media">
            <div className="scl-frame">
              {!imgFailed && (
                <img
                  key={item.id}
                  src={imgSrc}
                  alt={item.name}
                  style={imgLoaded ? undefined : { visibility: "hidden" }}
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
            <figcaption className="scl-caption">
              {item.name} · {section.room}
            </figcaption>
          </figure>

          <div className="scl-text">
            <h3 className="scl-title">{item.name}</h3>
            <p className="scl-lead">{item.lead}</p>
            {item.body.map((p, i) => (
              <p key={i} className="scl-body">
                {renderRich(p)}
              </p>
            ))}
          </div>
        </div>

      </TabPanel>

      {/* ---------- row 4: pager ---------- */}
      <div className="scl-pager">
        <button type="button" disabled={!prev} onClick={() => prev && select(prev.id)}>
          <small>← Previous</small>
          <span className="scl-pager-name">{prev ? prev.name : "—"}</span>
        </button>
        <button type="button" disabled={!next} onClick={() => next && select(next.id)}>
          <small>Next →</small>
          <span className="scl-pager-name">{next ? next.name : "—"}</span>
        </button>
      </div>
    </div>
  );
}

export default StudioComponentsLab;
