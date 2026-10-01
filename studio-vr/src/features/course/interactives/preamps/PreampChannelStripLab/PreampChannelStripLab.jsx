import { useEffect, useRef, useState } from "react";
import { Tabs, TabPanel, TabPager } from "../../../../../components/Tabs";
import { FlipCard } from "../../../../../components/FlipCard";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../../shared/labs.css";
import "./PreampChannelStripLab.css";
import { PREAMP_STRIP_TABS as TABS, preampStripImagePath } from "./preampChannelStripData";

// "Preamps / Channel Strips" (Outboard Gear) — the rack-mounted versions
// of the first stages of a console channel. Same look and structure as
// SubwooferLab (lead, labelled facts, FlipCard examples two per row with a
// full-width `wide` card, key points; same orange accent) so the Ch.10
// labs read as one series. Four topics behind the standard Tabs + TabPager:
//   Mic preamp → Channel strip → Classic preamps → Channel strips.
// Mic preamp and Channel strip open with a full-width image (`image` in the
// data, public/outboard-preamps/<id>.jpg, placeholder until the file
// exists). The two example tabs have no top image: their FlipCard photos
// cover it.
//
// onInteract fires on the first tab change (as BriefingTabs does).

const TAB_ITEMS = TABS.map((t) => ({ id: t.id, label: t.tab }));

// `hero` = the full-width image at the top of a tab; otherwise
// the photo on the front of an example FlipCard.
function ExampleImage({ id, title, hero = false }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = preampStripImagePath(id);
  return (
    <div className={`pcsl-media${hero ? " pcsl-media--hero" : ""}`}>
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
        <div className="pcsl-ph">
          <svg className="pcsl-ph-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" />
          </svg>
          <span className="pcsl-ph-label">Image coming soon</span>
          <span className="pcsl-ph-path">{`public${src}`}</span>
        </div>
      )}
    </div>
  );
}

function PreampChannelStripLab({ onInteract }) {
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
    <div className="lab pcsl">
      <Tabs items={TAB_ITEMS} value={tab.id} onChange={onChange} ariaLabel="Preamp and channel strip topics" idPrefix="pcsl" />

      <TabPanel idPrefix="pcsl" value={tab.id} index={index} innerClassName="pcsl-panel">
        {/* Keys are namespaced ("hero-…", "points-…") so an image id that
            matches a tab id can't collide as duplicate sibling keys (that
            made React leave the hero behind in SubwooferLab). */}
        {tab.image ? <ExampleImage key={`hero-${tab.image}`} id={tab.image} title={tab.tab} hero /> : null}

        <p className="pcsl-lead">{tab.lead}</p>

        <dl className="pcsl-facts">
          {tab.facts.map((f) => (
            <div key={f.label} className="pcsl-fact">
              <dt>{f.label}</dt>
              <dd>{f.text}</dd>
            </div>
          ))}
        </dl>

        {tab.examples?.length > 0 && (
          <>
            <h4 className="pcsl-subhead">{tab.subhead || "Examples"}</h4>
            <div className="pcsl-examples">
              {tab.examples.map((ex) => (
                <FlipCard
                  key={ex.id}
                  label={ex.title}
                  className={`pcsl-card${ex.wide ? " pcsl-card--wide" : ""}`}
                  front={
                    <>
                      <ExampleImage id={ex.id} title={ex.title} />
                      <div className="pcsl-card-front">
                        <h4 className="pcsl-card-title">{ex.title}</h4>
                      </div>
                    </>
                  }
                  back={
                    <div className="pcsl-card-body">
                      <h4 className="pcsl-card-kicker">{ex.title}</h4>
                      <p className="pcsl-card-lead">{ex.lead}</p>
                      <dl className="pcsl-facts pcsl-card-facts">
                        {ex.facts.map((f) => (
                          <div key={f.label} className="pcsl-fact">
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

export default PreampChannelStripLab;
