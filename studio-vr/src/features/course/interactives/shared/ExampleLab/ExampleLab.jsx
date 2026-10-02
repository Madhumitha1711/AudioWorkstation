import { useRef, useState } from "react";
import { Tabs, TabPanel, TabPager } from "../../../../../components/Tabs";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../labs.css";
import "./ExampleLab.css";
import { LabImage, Facts, ExampleCard } from "../LabParts";
import { useInteractOnce, useInteractOnView } from "../useInteractOnce";

export function TopicTabsLab({ tabs: TABS, imagePath, ariaLabel, onInteract }) {
  const TAB_ITEMS = TABS.map((t) => ({ id: t.id, label: t.tab }));
  const [active, setActive] = useState(TABS[0].id);
  const markInteracted = useInteractOnce(onInteract);

  const index = Math.max(0, TABS.findIndex((t) => t.id === active));
  const tab = TABS[index];

  function onChange(id) {
    setActive(id);
    markInteracted();
  }

  return (
    <div className="lab exl">
      <Tabs items={TAB_ITEMS} value={tab.id} onChange={onChange} ariaLabel={ariaLabel} idPrefix="exl" />

      <TabPanel idPrefix="exl" value={tab.id} index={index} innerClassName="exl-panel">
        {tab.image ? <LabImage key={`hero-${tab.image}`} prefix="exl" src={imagePath(tab.image)} alt={tab.tab} hero /> : null}

        <p className="exl-lead">{tab.lead}</p>

        <Facts prefix="exl" items={tab.facts} />

        {tab.examples?.length > 0 && (
          <>
            <h4 className="exl-subhead">{tab.subhead || "Examples"}</h4>
            <div className="exl-examples">
              {tab.examples.map((ex) => (
                <ExampleCard key={ex.id} ex={ex} prefix="exl" image={<LabImage prefix="exl" src={imagePath(ex.id)} alt={ex.title} />} />
              ))}
            </div>
          </>
        )}

        <KeyPoints key={`points-${tab.id}`} points={tab.points} />
      </TabPanel>

      <TabPager items={TAB_ITEMS} value={tab.id} onChange={onChange} />
    </div>
  );
}

export function ExampleLab({ lab, imagePath, onInteract }) {
  const examplesRef = useRef(null);
  useInteractOnView(examplesRef, onInteract, 0.3);
  return (
    <div className="lab exl">
      <p className="exl-lead">{lab.lead}</p>
      <Facts prefix="exl" items={lab.basics} />
      <h4 className="exl-subhead">Examples</h4>
      <div ref={examplesRef} className="exl-examples">
        {lab.examples.map((ex) => (
          <ExampleCard key={ex.id} ex={ex} prefix="exl" image={<LabImage prefix="exl" src={imagePath(ex.id)} alt={ex.title} />} />
        ))}
      </div>
      <KeyPoints points={lab.points} />
    </div>
  );
}
