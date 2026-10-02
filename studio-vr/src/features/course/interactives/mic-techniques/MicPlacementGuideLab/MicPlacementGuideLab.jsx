import { useState } from "react";
import "../../shared/labs.css";
import { ClipPlayer } from "../../shared/ListenTabs";
import { useClipAudio } from "../../shared/useClipAudio";
import { Choices, Note, Slider, Toggles, MicGuideFrame } from "../shared/MicLab";
import {
  CLIPS,
  CLOSE_BEST,
  CLOSE_SOURCES,
  CLOSE_SPOTS,
  DISTANT_SOURCES,
  DISTANT_SPOTS,
  ENSEMBLES,
  MULTI,
  SPOT_TARGETS,
  STEREO_SOURCES,
  TABS,
  multiClipId,
  pairsFor,
} from "./micPlacementGuideData";
import { useInteractOnce } from "../../shared/useInteractOnce";

const TAB = Object.fromEntries(TABS.map((t) => [t.id, t]));
const byId = (list, id) => list.find((x) => x.id === id);

function MicPlacementGuideLab({ onInteract }) {
  const [s, setS] = useState({
    tab: "close",
    close: { source: "voice", spot: "c15" },
    spot: { ens: "band", target: "vocal" },
    distant: { source: "drums", spot: "d2" },
    stereo: { source: "drums", pair: "xy", side: 0.6 },
    multi: { target: "snare", mics: { snare: ["top", "bottom"], kick: ["in", "out"], amp: ["on", "off", "room"] } },
  });
  const markInteracted = useInteractOnce(onInteract);

  const audio = useClipAudio({ items: CLIPS, onFirstPlay: markInteracted });

  const clipOf = (st, tab = st.tab) => {
    if (tab === "close") return `close-${st.close.source}-${st.close.spot}`;
    if (tab === "spot") return `spot-${st.spot.ens}-${st.spot.target}`;
    if (tab === "distant") return `distant-${st.distant.source}-${st.distant.spot}`;
    if (tab === "stereo") return `stereo-${st.stereo.source}-${st.stereo.pair}`;
    return multiClipId(st.multi.target, st.multi.mics[st.multi.target]);
  };

  function update(patch) {
    markInteracted();
    const next = { ...s, ...patch };
    const id = clipOf(next);
    if (audio.playing && id !== clipOf(s)) {
      if (audio.status[id] === "ready") audio.play(id, { keepPosition: true });
      else audio.stop();
    }
    setS(next);
  }
  const patchTab = (tab, p) => update({ [tab]: { ...s[tab], ...p } });

  function onHotspot(type, id) {
    if (type === "spot" && (s.tab === "close" || s.tab === "distant")) patchTab(s.tab, { spot: id });
    if (type === "target" && s.tab === "spot") patchTab("spot", { target: id });
  }

  function viewOf(tab) {
    if (tab === "close") {
      return { kind: "single", frame: "close", hotspots: true, source: s.close.source, spots: CLOSE_SPOTS, current: s.close.spot, best: CLOSE_BEST[s.close.source] };
    }
    if (tab === "distant") {
      return { kind: "single", frame: "full", hotspots: true, source: s.distant.source, spots: DISTANT_SPOTS, current: s.distant.spot };
    }
    if (tab === "spot") return { kind: "ensemble", ens: s.spot.ens, layers: ["main"], spot: s.spot.target };
    if (tab === "stereo") return { kind: "stereo", source: s.stereo.source, pair: s.stereo.pair, side: s.stereo.side };
    return { kind: "multi", target: s.multi.target, mics: s.multi.mics[s.multi.target] };
  }

  function renderCard(tab) {
    let controls;
    let label;
    if (tab === "close" || tab === "distant") {
      const sources = tab === "close" ? CLOSE_SOURCES : DISTANT_SOURCES;
      const spots = tab === "close" ? CLOSE_SPOTS : DISTANT_SPOTS;
      const cur = s[tab];
      const spot = byId(spots, cur.spot);
      const best = tab === "close" ? byId(spots, CLOSE_BEST[cur.source]) : null;
      label = `${TAB[tab].title}, ${byId(sources, cur.source).label}, ${spot.label}`;
      controls = (
        <>
          <Choices label="Source" options={sources} value={cur.source} onPick={(id) => patchTab(tab, { source: id })} cols={3} />
          <Choices label="Mic position" options={spots} value={cur.spot} onPick={(id) => patchTab(tab, { spot: id })} cols={4} />
          <Note>
            {spot.note}
            {best && (
              <>
                {" "}
                Usual spot for {byId(sources, cur.source).label.toLowerCase()}: <b>{best.label}</b> (green ring).
              </>
            )}
          </Note>
        </>
      );
    } else if (tab === "spot") {
      const e = byId(ENSEMBLES, s.spot.ens);
      const targets = SPOT_TARGETS[e.id];
      const t = byId(targets, s.spot.target);
      label = `Spot miking, ${e.label}, ${t.label}`;
      controls = (
        <>
          <Choices
            label="Ensemble"
            options={ENSEMBLES}
            value={e.id}
            onPick={(id) => patchTab("spot", { ens: id, target: SPOT_TARGETS[id][0].id })}
            cols={3}
          />
          <Choices label="Spot mic on" options={targets} value={t.id} onPick={(id) => patchTab("spot", { target: id })} cols={3} />
          <Note>
            The <b>main pair</b> captures the whole {e.label.toLowerCase()}; the <b>spot mic</b> lifts the {t.label.toLowerCase()} — blended low underneath it.
          </Note>
        </>
      );
    } else if (tab === "stereo") {
      const pairs = pairsFor(s.stereo.source);
      const p = byId(pairs, s.stereo.pair) || pairs[0];
      label = `Stereo, ${byId(STEREO_SOURCES, s.stereo.source).label}, ${p.label}`;
      controls = (
        <>
          <Choices
            label="Source"
            options={STEREO_SOURCES}
            value={s.stereo.source}
            onPick={(id) => patchTab("stereo", { source: id, pair: byId(pairsFor(id), s.stereo.pair) ? s.stereo.pair : "xy" })}
            cols={3}
          />
          <Choices label="Technique" options={pairs} value={p.id} onPick={(id) => patchTab("stereo", { pair: id })} cols={3} />
          {p.id === "ms" && (
            <Slider label="Side level" value={s.stereo.side} onChange={(v) => patchTab("stereo", { side: v })} ariaLabel="Mid-Side: Side level (stereo width)" />
          )}
          <Note>{p.blurb}</Note>
        </>
      );
    } else {
      const m = byId(MULTI, s.multi.target);
      const on = s.multi.mics[m.id];
      label = `Multi miking, ${m.label}, ${on.map((id) => byId(m.mics, id).label).join(", ") || "no mics"}`;
      controls = (
        <>
          <Choices label="Source" options={MULTI} value={m.id} onPick={(id) => patchTab("multi", { target: id })} cols={3} />
          <Toggles
            label="Mics"
            items={m.mics}
            on={on}
            onToggle={(id) =>
              patchTab("multi", { mics: { ...s.multi.mics, [m.id]: on.includes(id) ? on.filter((x) => x !== id) : [...on, id] } })
            }
          />
          <Note>{m.note}</Note>
        </>
      );
    }
    return (
      <>
        <div className="ltb-listen-label">Experiment</div>
        <p className="ltb-listen-hint">{TAB[tab].hint}</p>
        {controls}
        <ClipPlayer id={clipOf(s, tab)} label={label} audio={audio} />
      </>
    );
  }

  return (
    <MicGuideFrame
      tabs={TABS}
      value={s.tab}
      onChange={(id) => update({ tab: id })}
      ariaLabel="Microphone placement"
      idPrefix="mpg-tab"
      stageProps={{ view: viewOf(s.tab), onHotspot }}
      renderCard={renderCard}
    />
  );
}

export default MicPlacementGuideLab;
