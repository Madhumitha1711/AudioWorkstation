import { useEffect, useRef, useState } from "react";
import { Tabs, TabPanel, TabPager } from "../../../../../components/Tabs";
import { FlipCard } from "../../../../../components/FlipCard";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../../shared/labs.css";
import "./LifeBeforeDawLab.css";
import { LIFE_BEFORE_DAW_TABS as TABS, lifeBeforeDawImagePath } from "./lifeBeforeDawData";

// "Life Before the DAW" — Ch.12 (Computer & DAW). Shows the four jobs a
// DAW now does in one box, as they were done with dedicated hardware:
//   Recording → Editing → Processing → Routing.
// Same look as SubwooferLab (standard Tabs + TabPager, lead,
// labelled facts, FlipCards two per row, key points, orange accent) but
// with no top image: the then → now card photos carry the visuals. The
// cards are "then → now" pairs: the old tool's photo + caption on the
// front (WhatIsMixerLab card face), Then / In a DAW facts on the back.
//
// onInteract fires on the first tab change (as SubwooferLab / BriefingTabs).

const TAB_ITEMS = TABS.map((t) => ({ id: t.id, label: t.tab }));

// The photo on the front of a then → now FlipCard.
function LbdImage({ id, title }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = lifeBeforeDawImagePath(id);
  return (
    <div className="lbd-media">
      {!failed && (
        <img
          src={src}
          alt={title}
          style={loaded ? undefined : { visibility: "hidden" }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {!loaded && (
        <div className="lbd-ph">
          <svg className="lbd-ph-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" />
          </svg>
          <span className="lbd-ph-label">Image coming soon</span>
          <span className="lbd-ph-path">{`public${src}`}</span>
        </div>
      )}
    </div>
  );
}

function LifeBeforeDawLab({ onInteract }) {
  const [active, setActive] = useState(TABS[0].id);
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  const index = Math.max(0, TABS.findIndex((t) => t.id === active));
  const tab = TABS[index];

  function onChange(id) {
    setActive(id);
    if (!firedRef.current) {
      firedRef.current = true;
      onInteractRef.current?.();
    }
  }

  return (
    <div className="lab lbd">
      <Tabs items={TAB_ITEMS} value={tab.id} onChange={onChange} ariaLabel="Life before the DAW" idPrefix="lbd" />

      <TabPanel idPrefix="lbd" value={tab.id} index={index} innerClassName="lbd-panel">
        <p className="lbd-lead">{tab.lead}</p>

        <dl className="lbd-facts">
          {tab.facts.map((f) => (
            <div key={f.label} className="lbd-fact">
              <dt>{f.label}</dt>
              <dd>{f.text}</dd>
            </div>
          ))}
        </dl>

        <h4 className="lbd-subhead">Then → now</h4>
        <p className="lbd-hint">Flip each card to see how a DAW does the same job.</p>
        <div className="lbd-examples">
          {tab.pairs.map((p) => (
            <FlipCard
              key={p.id}
              label={`${p.then}: flip to see the DAW equivalent, ${p.now}`}
              className="lbd-card"
              front={
                <>
                  <LbdImage id={p.id} title={p.then} />
                  <div className="lbd-card-cap">
                    <span className="lbd-card-cap-kicker">Then</span>
                    <span className="lbd-card-cap-name">{p.then}</span>
                  </div>
                </>
              }
              back={
                <div className="lbd-card-body">
                  <h4 className="lbd-card-kicker">
                    <span className="lbd-card-then">{p.then}</span>
                    <span className="lbd-card-arrow" aria-hidden="true">→</span>
                    <span className="lbd-card-now">{p.now}</span>
                  </h4>
                  <dl className="lbd-facts lbd-card-facts">
                    <div className="lbd-fact">
                      <dt>Then</dt>
                      <dd>{p.thenText}</dd>
                    </div>
                    <div className="lbd-fact">
                      <dt>In a DAW</dt>
                      <dd>{p.nowText}</dd>
                    </div>
                  </dl>
                </div>
              }
            />
          ))}
        </div>

        <KeyPoints key={`points-${tab.id}`} points={tab.points} />
      </TabPanel>

      <TabPager items={TAB_ITEMS} value={tab.id} onChange={onChange} />
    </div>
  );
}

export default LifeBeforeDawLab;
