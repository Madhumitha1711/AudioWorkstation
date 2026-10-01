import { useEffect, useRef, useState } from "react";
import { Tabs, TabPanel, TabPager } from "../../../../../components/Tabs";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../labs.css";
import "./briefingTabs.css";

// Single-row image-over-description tabs: tab bar → image → title / lead /
// labelled facts → KeyPoints → Prev/Next pager. Shared across chapters —
// Foundations' StudioRoomsLab + StudioTypesLab. (Moved here from
// foundations/shared/ so other chapters can use it.) Items: [{ id, tab, title, lead?, image?, facts?:
// [{ label, text }], points? }].

function BriefingTabs({ items, ariaLabel, idPrefix, onInteract, className = "" }) {
  const [active, setActive] = useState(items[0].id);
  const [loaded, setLoaded] = useState(() => new Set());
  const [failed, setFailed] = useState(() => new Set());
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  const index = Math.max(0, items.findIndex((t) => t.id === active));
  const item = items[index];

  function onChange(id) {
    setActive(id);
    if (!firedRef.current) {
      firedRef.current = true;
      onInteractRef.current?.();
    }
  }

  const imgLoaded = loaded.has(item.id);
  const showImg = item.image && !failed.has(item.id);

  return (
    <div className={`lab brt ${className}`.trim()}>
      <Tabs
        items={items.map((t) => ({ id: t.id, label: t.tab }))}
        value={active}
        onChange={onChange}
        ariaLabel={ariaLabel}
        idPrefix={idPrefix}
      />

      <TabPanel idPrefix={idPrefix} value={item.id} index={index} innerClassName="brt-panel">
        <div className="brt-media">
          {showImg && (
            <img
              key={item.id}
              src={item.image}
              alt={item.title}
              style={imgLoaded ? undefined : { visibility: "hidden" }}
              onLoad={() => setLoaded((s) => new Set(s).add(item.id))}
              onError={() => setFailed((s) => new Set(s).add(item.id))}
            />
          )}
          {!imgLoaded && (
            <div className="brt-ph">
              <svg className="brt-ph-icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="9" cy="10" r="2" />
                <path d="M21 16l-5-5-9 9" />
              </svg>
              <span className="brt-ph-label">{item.title} — image coming soon</span>
              {item.image && <span className="brt-ph-path">{`public${item.image}`}</span>}
            </div>
          )}
        </div>

        <h3 className="brt-title">{item.title}</h3>
        {item.lead && <p className="brt-lead">{item.lead}</p>}
        {item.facts?.length > 0 && (
          <dl className="brt-facts">
            {item.facts.map((f) => (
              <div key={f.label} className="brt-fact">
                <dt>{f.label}</dt>
                <dd>{f.text}</dd>
              </div>
            ))}
          </dl>
        )}
        <KeyPoints key={item.id} points={item.points} />
      </TabPanel>

      <TabPager items={items.map((t) => ({ id: t.id, label: t.tab }))} value={item.id} onChange={onChange} />
    </div>
  );
}

export default BriefingTabs;
