import { useEffect, useRef, useState } from "react";
import "../../shared/labs.css";
import "./StudioTypesLab.css";
import { STUDIO_TYPES, studioTypeImagePath } from "./studioTypesData";

// Ported from design/studio-types-tabs.html — the "Types of Recording
// Studios" briefing (Foundations, chapter 3, courseData.js
// TOPICS[id="studio-types"]). Six switchable tabs, one per studio type;
// each panel is an image, a title + lead, and three labelled facts
// (Layout / Acoustics & Build / Key Use Case). Content only, no audio.
//
// Differences from the mockup, because it renders inside the course
// content column rather than as a standalone page:
//   - no page <h1> — the lesson / InteractiveSection heading covers it.
//   - colors come from the course theme tokens on .svr-course
//     (--panel, --border, --text-dim…), so light/dark follows ThemeContext
//     automatically; the only lab-specific color is the tab/label accent,
//     scoped as --stl-accent with a darker light-theme value (see the CSS).
//   - the image slot loads public/studio-types/<id>.jpg and falls back to a
//     dashed placeholder until that photo exists.
//   - added: a small "viewed" dot per tab plus an N/6 count, so the student
//     can see which types they haven't opened yet.
//
// Tabs follow the WAI-ARIA tabs pattern (roving tabindex; Left/Right/Home/
// End move focus and selection). onInteract (from InteractiveSection) fires
// the first time the student switches tabs themselves — the initial
// selection doesn't count.
function StudioTypesLab({ onInteract }) {
  const [index, setIndex] = useState(0);
  const [viewed, setViewed] = useState(() => new Set([STUDIO_TYPES[0].id]));
  const [loadedImgs, setLoadedImgs] = useState(() => new Set());
  const [failedImgs, setFailedImgs] = useState(() => new Set());
  const tabRefs = useRef([]);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  const item = STUDIO_TYPES[index];

  function select(i, focus = false) {
    const n = STUDIO_TYPES.length;
    const next = ((i % n) + n) % n;
    setIndex(next);
    setViewed((v) => (v.has(STUDIO_TYPES[next].id) ? v : new Set(v).add(STUDIO_TYPES[next].id)));
    const tab = tabRefs.current[next];
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focus) tab?.focus();
    if (next !== index && !firedRef.current) {
      firedRef.current = true;
      onInteractRef.current?.();
    }
  }

  function onKeyDown(e, i) {
    const target = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: STUDIO_TYPES.length - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    select(target, true);
  }

  const imgSrc = studioTypeImagePath(item.id);
  const imgLoaded = loadedImgs.has(item.id);
  const imgFailed = failedImgs.has(item.id);

  return (
    <div className="lab stl">
      <div className="stl-bar">
        <div className="stl-tabs" role="tablist" aria-label="Studio types">
          {STUDIO_TYPES.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => (tabRefs.current[i] = el)}
              type="button"
              role="tab"
              id={`stl-tab-${t.id}`}
              aria-controls={`stl-panel-${t.id}`}
              aria-selected={i === index}
              tabIndex={i === index ? 0 : -1}
              className="stl-tab"
              onClick={() => select(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {t.tab}
              {viewed.has(t.id) && i !== index && <span className="stl-seen" aria-label="viewed" />}
            </button>
          ))}
        </div>
        <span className="stl-count" aria-live="polite">
          {viewed.size}/{STUDIO_TYPES.length} explored
        </span>
      </div>

      <section
        key={item.id}
        className="stl-panel stl-fade"
        role="tabpanel"
        id={`stl-panel-${item.id}`}
        aria-labelledby={`stl-tab-${item.id}`}
      >
        <div className="stl-media">
          {!imgFailed && (
            <img
              src={imgSrc}
              alt={item.title}
              style={imgLoaded ? undefined : { visibility: "hidden" }}
              onLoad={() => setLoadedImgs((s) => new Set(s).add(item.id))}
              onError={() => setFailedImgs((s) => new Set(s).add(item.id))}
            />
          )}
          {!imgLoaded && (
            <div className="stl-ph">
              <span className="stl-ph-label">Image</span>
              <span className="stl-ph-path">{`public${imgSrc}`}</span>
            </div>
          )}
        </div>

        <h3 className="stl-title">{item.title}</h3>
        <p className="stl-lead">{item.lead}</p>
        <dl className="stl-facts">
          <dt>Layout</dt>
          <dd>{item.layout}</dd>
          <dt>Acoustics &amp; Build</dt>
          <dd>{item.build}</dd>
          <dt>Key Use Case</dt>
          <dd>{item.use}</dd>
        </dl>
      </section>
    </div>
  );
}

export default StudioTypesLab;
