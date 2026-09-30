import { useEffect, useRef, useState } from "react";
import { Tabs, TabPanel, TabPager, useTabTransition } from "../../../../../components/Tabs";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../../shared/labs.css";
import "./wiringBriefing.css";

// Three-level briefing used by the Ch.8 wiring labs (ConnectorsLab,
// CablesLab). Same layout and motion as Foundations' StudioComponentsLab:
//
//   row 1  family labels (Analog / Digital …) over the category tabs
//   row 2  segmented item tabs for the active category (icon + name)
//   row 3  image on top, title / lead / description / key points below
//   row 4  prev / next pager that walks every item across all categories
//
// Everything is data-driven — a lab passes `sections` shaped like:
//   [{ n, family, type, short?, tone, items: [{ id, name, lead, body[], points[] }] }]
// (`short` is the category label shown instead of `type` on phones, where
// five full labels don't fit one row.)
// plus an ICONS map (24×24 stroke SVG bodies keyed by item id) and an
// `imagePath(id)` for the photo. Until a photo exists in public/ the frame
// shows the item's icon and the expected path, same as StudioComponentsLab.
//
// Unlike StudioComponentsLab (which assumes two rooms with two areas each),
// families here can hold different numbers of categories, so the family
// label row is laid out with fr units proportional to each family's
// category count and the dividers are placed at the cumulative fractions —
// that keeps each label centred over its own tabs.

function renderRich(text) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

function Icon({ icons, id, className }) {
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
      dangerouslySetInnerHTML={{ __html: icons[id] ?? "" }}
    />
  );
}

function WiringBriefing({ sections, icons, imagePath, idPrefix, ariaLabel, onInteract }) {
  const [all] = useState(() => sections.flatMap((section) => section.items.map((item) => ({ ...item, section }))));
  const [families] = useState(() =>
    sections.reduce((acc, s) => {
      const last = acc[acc.length - 1];
      if (last && last.name === s.family) last.ids.push(s.n);
      else acc.push({ name: s.family, ids: [s.n] });
      return acc;
    }, []),
  );
  const [selectedId, setSelectedId] = useState(all[0].id);
  const [viewed, setViewed] = useState(() => new Set([all[0].id]));
  const [loadedImgs, setLoadedImgs] = useState(() => new Set());
  const [failedImgs, setFailedImgs] = useState(() => new Set());
  const railRef = useRef(null);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  const index = all.findIndex((c) => c.id === selectedId);
  const item = all[index];
  const section = item.section;
  const sectionIndex = sections.indexOf(section);

  useTabTransition(railRef, section.n, sectionIndex);

  function select(id) {
    if (id === selectedId || !all.some((c) => c.id === id)) return;
    setSelectedId(id);
    setViewed((v) => (v.has(id) ? v : new Set(v).add(id)));
    if (!firedRef.current) {
      firedRef.current = true;
      onInteractRef.current?.();
    }
  }

  function selectSection(n) {
    const s = sections.find((x) => x.n === n);
    if (!s) return;
    select((s.items.find((it) => !viewed.has(it.id)) || s.items[0]).id);
  }

  const sectionTabs = sections.map((s) => ({ id: s.n, label: s.type, short: s.short, ariaLabel: `${s.family} — ${s.type}` }));
  const total = sections.length;
  const dividers = families.slice(0, -1).reduce((acc, f) => {
    const prevCount = acc.length ? acc[acc.length - 1] : 0;
    acc.push(prevCount + f.ids.length);
    return acc;
  }, []);

  const imgSrc = imagePath(item.id);
  const imgLoaded = loadedImgs.has(item.id);
  const imgFailed = failedImgs.has(item.id);

  return (
    <div className="lab wbl">
      {/* ---------- row 1: families + categories ---------- */}
      <div className="wbl-areas-wrap">
        <div
          className="wbl-families"
          aria-hidden="true"
          style={{ gridTemplateColumns: families.map((f) => `${f.ids.length}fr`).join(" ") }}
        >
          {families.map((f) => (
            <span key={f.name} className={`wbl-family${f.ids.includes(section.n) ? " is-active" : ""}`}>
              {f.name}
            </span>
          ))}
        </div>
        <Tabs
          items={sectionTabs}
          value={section.n}
          onChange={selectSection}
          ariaLabel={ariaLabel}
          idPrefix={`${idPrefix}-sec`}
          className="wbl-areas"
          fill
          showCount={false}
          renderTab={(t) => (
            <>
              <span className={`wbl-area-type${t.short ? " has-short" : ""}`}>{t.label}</span>
              {t.short && <span className="wbl-area-short">{t.short}</span>}
            </>
          )}
        />
        {dividers.map((d) => (
          <span key={d} className="wbl-divider" aria-hidden="true" style={{ left: `${(d / total) * 100}%` }} />
        ))}
      </div>

      {/* ---------- row 2: items of the active category ---------- */}
      <div ref={railRef} className="wbl-rail">
        <Tabs
          key={section.n}
          variant="segmented"
          size="sm"
          items={section.items.map((it) => ({ id: it.id, label: it.name }))}
          value={item.id}
          onChange={select}
          visited={section.items.filter((it) => viewed.has(it.id)).map((it) => it.id)}
          ariaLabel={`${section.family} — ${section.type}`}
          idPrefix={`${idPrefix}-item`}
          renderTab={(t) => (
            <>
              <Icon icons={icons} id={t.id} className="wbl-rail-ic" />
              <span>{t.label}</span>
            </>
          )}
        />
      </div>

      {/* ---------- row 3: detail ---------- */}
      <TabPanel
        idPrefix={`${idPrefix}-item`}
        value={item.id}
        index={index}
        innerClassName={`wbl-panel wbl-tone-${section.tone}`}
      >
        <div className="wbl-grid">
          <figure className="wbl-media">
            <div className="wbl-frame">
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
                <div className="wbl-ph">
                  <Icon icons={icons} id={item.id} />
                  <span>{`public${imgSrc}`}</span>
                </div>
              )}
            </div>
            <figcaption className="wbl-caption">
              {item.name} · {section.family} · {section.type}
            </figcaption>
          </figure>

          <div className="wbl-text">
            <h3 className="wbl-title">{item.name}</h3>
            <p className="wbl-lead">{item.lead}</p>
            {item.body.map((p, i) => (
              <p key={i} className="wbl-body">
                {renderRich(p)}
              </p>
            ))}
            <KeyPoints key={item.id} points={item.points} />
          </div>
        </div>
      </TabPanel>

      {/* ---------- row 4: pager (walks every item across categories) ---------- */}
      <TabPager items={all.map((c) => ({ id: c.id, label: c.name }))} value={item.id} onChange={select} />
    </div>
  );
}

export default WiringBriefing;
