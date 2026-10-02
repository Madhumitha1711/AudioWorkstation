import { useState } from "react";
import { Tabs, TabPanel, TabPager } from "../../../../../components/Tabs";
import { FlipCard } from "../../../../../components/FlipCard";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../../shared/labs.css";
import "./LifeBeforeDawLab.css";
import { LIFE_BEFORE_DAW_TABS as TABS, lifeBeforeDawImagePath } from "./lifeBeforeDawData";
import { LabImage, Facts } from "../../shared/LabParts";
import { useInteractOnce } from "../../shared/useInteractOnce";

const TAB_ITEMS = TABS.map((t) => ({ id: t.id, label: t.tab }));

function LbdImage({ id, title }) {
  return <LabImage prefix="lbd" src={lifeBeforeDawImagePath(id)} alt={title} />;
}

function LifeBeforeDawLab({ onInteract }) {
  const [active, setActive] = useState(TABS[0].id);
  const markInteracted = useInteractOnce(onInteract);

  const index = Math.max(0, TABS.findIndex((t) => t.id === active));
  const tab = TABS[index];

  function onChange(id) {
    setActive(id);
    markInteracted();
  }

  return (
    <div className="lab lbd">
      <Tabs items={TAB_ITEMS} value={tab.id} onChange={onChange} ariaLabel="Life before the DAW" idPrefix="lbd" />

      <TabPanel idPrefix="lbd" value={tab.id} index={index} innerClassName="lbd-panel">
        <p className="lbd-lead">{tab.lead}</p>

        <Facts prefix="lbd" items={tab.facts} />

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
