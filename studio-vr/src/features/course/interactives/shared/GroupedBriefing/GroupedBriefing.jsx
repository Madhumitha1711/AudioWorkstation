import { useRef, useState } from "react";
import { Tabs, TabPanel, TabPager, useTabTransition } from "../../../../../components/Tabs";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../labs.css";
import "./groupedBriefing.css";
import { useInteractOnce } from "../useInteractOnce";

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

function GroupedBriefing({ sections, icons, imagePath, idPrefix, ariaLabel, caption, onInteract }) {
  const [all] = useState(() => sections.flatMap((section) => section.items.map((item) => ({ ...item, section }))));
  const [selectedId, setSelectedId] = useState(all[0].id);
  const [viewed, setViewed] = useState(() => new Set([all[0].id]));
  const [loadedImgs, setLoadedImgs] = useState(() => new Set());
  const [failedImgs, setFailedImgs] = useState(() => new Set());
  const railRef = useRef(null);
  const markInteracted = useInteractOnce(onInteract);

  const index = all.findIndex((c) => c.id === selectedId);
  const item = all[index];
  const section = item.section;
  const sectionIndex = sections.indexOf(section);

  useTabTransition(railRef, section.n, sectionIndex);

  function select(id) {
    if (id === selectedId || !all.some((c) => c.id === id)) return;
    setSelectedId(id);
    setViewed((v) => (v.has(id) ? v : new Set(v).add(id)));
    markInteracted();
  }

  function selectSection(n) {
    const s = sections.find((x) => x.n === n);
    if (!s) return;
    select((s.items.find((it) => !viewed.has(it.id)) || s.items[0]).id);
  }

  const sectionTabs = sections.map((s) => ({ id: s.n, label: s.type, short: s.short }));

  const imgSrc = imagePath(item.id);
  const imgLoaded = loadedImgs.has(item.id);
  const imgFailed = failedImgs.has(item.id);

  return (
    <div className="lab wbl">
      <div className="wbl-areas-wrap">
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
      </div>

      <div ref={railRef} className="wbl-rail">
        <Tabs
          key={section.n}
          variant="segmented"
          size="sm"
          items={section.items.map((it) => ({ id: it.id, label: it.name }))}
          value={item.id}
          onChange={select}
          visited={section.items.filter((it) => viewed.has(it.id)).map((it) => it.id)}
          ariaLabel={section.type}
          idPrefix={`${idPrefix}-item`}
          renderTab={(t) => (
            <>
              <Icon icons={icons} id={t.id} className="wbl-rail-ic" />
              <span>{t.label}</span>
            </>
          )}
        />
      </div>

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
              {[item.name, section.type, caption].filter(Boolean).join(" · ")}
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

      <TabPager items={all.map((c) => ({ id: c.id, label: c.name }))} value={item.id} onChange={select} />
    </div>
  );
}

export default GroupedBriefing;
