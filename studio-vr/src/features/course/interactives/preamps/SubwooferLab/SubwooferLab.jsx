import { useEffect, useRef, useState } from "react";
import { Tabs, TabPanel, TabPager } from "../../../../../components/Tabs";
import { FlipCard } from "../../../../../components/FlipCard";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../../shared/labs.css";
import "./SubwooferLab.css";
import { SUBWOOFER_TABS as TABS, subwooferImagePath } from "./subwooferData";

// "Subwoofer" — follows "Active Speaker" in the amplification run and
// reuses its look (lead, labelled facts, FlipCard examples two per row with
// a full-width `wide` card, key points; same orange accent) so the speaker
// labs read as one series. Unlike ActiveSpeakerLab it has four distinct
// topics, so they sit behind the standard Tabs + TabPager:
//   Subwoofer → Subwoofer + LFE → Pro audio → Home theatre.
// Subwoofer and Subwoofer + LFE open with a full-width image (`image` in the data,
// public/subwoofer/<id>.jpg, placeholder until the file exists). Pro audio
// and Home theatre have no top image: their example FlipCard photos cover it.
//
// onInteract fires on the first tab change (as BriefingTabs does).

const TAB_ITEMS = TABS.map((t) => ({ id: t.id, label: t.tab }));

// `hero` = the full-width image at the top of a tab (Subwoofer); otherwise
// the photo on the front of an example FlipCard.
function ExampleImage({ id, title, hero = false }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = subwooferImagePath(id);
  return (
    <div className={`subl-media${hero ? " subl-media--hero" : ""}`}>
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
        <div className="subl-ph">
          <svg className="subl-ph-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" />
          </svg>
          <span className="subl-ph-label">Image coming soon</span>
          <span className="subl-ph-path">{`public${src}`}</span>
        </div>
      )}
    </div>
  );
}

function SubwooferLab({ onInteract }) {
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
    <div className="lab subl">
      <Tabs items={TAB_ITEMS} value={tab.id} onChange={onChange} ariaLabel="Subwoofer topics" idPrefix="subl" />

      <TabPanel idPrefix="subl" value={tab.id} index={index} innerClassName="subl-panel">
        {/* Keys are namespaced ("hero-…", "points-…"): the Subwoofer tab's
            image id and tab id are both "subwoofer", and duplicate sibling
            keys made React leave the hero behind on every other tab. */}
        {tab.image ? <ExampleImage key={`hero-${tab.image}`} id={tab.image} title={tab.tab} hero /> : null}

        <p className="subl-lead">{tab.lead}</p>

        <dl className="subl-facts">
          {tab.facts.map((f) => (
            <div key={f.label} className="subl-fact">
              <dt>{f.label}</dt>
              <dd>{f.text}</dd>
            </div>
          ))}
        </dl>

        {tab.examples?.length > 0 && (
          <>
            <h4 className="subl-subhead">{tab.subhead || "Examples"}</h4>
            <div className="subl-examples">
              {tab.examples.map((ex) => (
                <FlipCard
                  key={ex.id}
                  label={ex.title}
                  className={`subl-card${ex.wide ? " subl-card--wide" : ""}`}
                  front={
                    <>
                      <ExampleImage id={ex.id} title={ex.title} />
                      <div className="subl-card-front">
                        <h4 className="subl-card-title">{ex.title}</h4>
                      </div>
                    </>
                  }
                  back={
                    <div className="subl-card-body">
                      <h4 className="subl-card-kicker">{ex.title}</h4>
                      <p className="subl-card-lead">{ex.lead}</p>
                      <dl className="subl-facts subl-card-facts">
                        {ex.facts.map((f) => (
                          <div key={f.label} className="subl-fact">
                            <dt>{f.label}</dt>
                            <dd>{f.text}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  }
                />
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

export default SubwooferLab;
