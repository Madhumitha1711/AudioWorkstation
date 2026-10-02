import { useState } from "react";
import { Tabs, TabPanel, TabPager } from "../../../../../components/Tabs";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "./listenTabs.css";

function MediaImage({ item, placeholderArt }) {
  const [state, setState] = useState({});
  const s = state[item.id];
  const mark = (v) => setState((p) => ({ ...p, [item.id]: v }));
  return (
    <div className="ltb-media">
      {item.image && s !== "failed" && (
        <img
          key={item.id}
          src={item.image}
          alt={item.title}
          style={s === "loaded" ? undefined : { visibility: "hidden" }}
          onLoad={() => mark("loaded")}
          onError={() => mark("failed")}
        />
      )}
      {s !== "loaded" && (
        <div className="ltb-ph">
          {placeholderArt ? (
            <span className="ltb-ph-art">{placeholderArt(item)}</span>
          ) : (
            <svg className="ltb-ph-icon" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="2" />
              <path d="M21 16l-5-5-9 9" />
            </svg>
          )}
          <span className="ltb-ph-label">Image coming soon</span>
          {item.image && <span className="ltb-ph-path">{`public${item.image}`}</span>}
        </div>
      )}
    </div>
  );
}

function ListenTabs({ items, value, onChange, ariaLabel, idPrefix, renderListen, renderBody, placeholderArt, renderMedia }) {
  const index = Math.max(0, items.findIndex((it) => it.id === value));
  const item = items[index];

  return (
    <div className="ltb">
      <Tabs
        items={items.map((it) => ({ id: it.id, label: it.tab }))}
        value={item.id}
        onChange={onChange}
        ariaLabel={ariaLabel}
        idPrefix={idPrefix}
      />
      <TabPanel idPrefix={idPrefix} value={item.id} index={index} innerClassName="ltb-panel">
        <div className="ltb-row">
          {renderMedia ? (
            <div className="ltb-media ltb-media--custom">{renderMedia(item)}</div>
          ) : (
            <MediaImage item={item} placeholderArt={placeholderArt} />
          )}
          <div className="ltb-listen">{renderListen(item)}</div>
        </div>
        <div className="ltb-desc">
          <h3>{item.title}</h3>
          {renderBody(item)}
          <KeyPoints key={item.id} points={item.points} />
        </div>
      </TabPanel>
      <TabPager items={items.map((it) => ({ id: it.id, label: it.tab }))} value={item.id} onChange={onChange} />
    </div>
  );
}

export default ListenTabs;
