import { Tabs, TabPanel, TabPager } from "../../../../../../components/Tabs";
import { KeyPoints } from "../../../../../../components/KeyPoints";
import MicStage3D from "./MicStage3D";
import { Rich } from "./MicLabControls";

export function MicGuideFrame({ tabs, value, onChange, ariaLabel, idPrefix, stageProps, renderCard }) {
  const items = tabs.map((t) => ({ id: t.id, label: t.tab }));
  const index = tabs.findIndex((t) => t.id === value);
  const tab = tabs[index];
  return (
    <div className="lab ltb mic-lab">
      <Tabs items={items} value={value} onChange={onChange} ariaLabel={ariaLabel} idPrefix={idPrefix} />
      <TabPanel idPrefix={idPrefix} value={tab.id} index={index} innerClassName="ltb-panel">
        <div className="ml-row">
          <MicStage3D {...stageProps} />
          <div className="ltb-listen">{renderCard(tab.id)}</div>
        </div>
        <div className="ltb-desc">
          <h3>{tab.title}</h3>
          {tab.body.map((p, i) => (
            <p key={i}>
              <Rich text={p} />
            </p>
          ))}
          <KeyPoints key={tab.id} points={tab.points} />
        </div>
      </TabPanel>
      <TabPager items={items} value={tab.id} onChange={onChange} />
    </div>
  );
}
