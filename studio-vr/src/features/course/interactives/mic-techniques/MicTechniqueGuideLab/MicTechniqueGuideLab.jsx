import { useState } from "react";
import "../../shared/labs.css";
import { ClipPlayer } from "../../shared/ListenTabs";
import { useClipAudio } from "../../shared/useClipAudio";
import { Choices, Note, MicGuideFrame } from "../shared/MicLab";
import { CLIPS, ENSEMBLES, MONO_FIXED, SOURCES, STEREO_FIXED, TABS, pairById } from "./micTechniqueGuideData";
import { LAYERS } from "../shared/MicLab/micLabData";
import { useInteractOnce } from "../../shared/useInteractOnce";

const SOURCE_LABEL = Object.fromEntries(SOURCES.map((x) => [x.id, x.label]));

function MicTechniqueGuideLab({ onInteract }) {
  const [s, setS] = useState({ tab: "mono", source: { mono: "voice", stereo: "drums" }, ens: "band" });
  const markInteracted = useInteractOnce(onInteract);

  const audio = useClipAudio({ items: CLIPS, onFirstPlay: markInteracted });
  const clipOf = (st) => (st.tab === "ensemble" ? `ensemble-${st.ens}` : `${st.tab}-${st.source[st.tab]}`);

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
  const setSource = (tab, id) => update({ source: { ...s.source, [tab]: id } });

  const ens = ENSEMBLES.find((e) => e.id === s.ens);
  const view =
    s.tab === "mono"
      ? {
          kind: "single",
          frame: "full",
          source: s.source.mono,
          spots: [{ id: "fixed", label: MONO_FIXED[s.source.mono].label, m: MONO_FIXED[s.source.mono].m }],
          current: "fixed",
        }
      : s.tab === "stereo"
        ? { kind: "stereo", source: s.source.stereo, pair: STEREO_FIXED[s.source.stereo] }
        : { kind: "ensemble", ens: s.ens, layers: ens.best, ghosts: false };

  function renderCard(tabId) {
    let controls;
    let label;
    if (tabId === "mono") {
      const src = s.source.mono;
      label = `Mono, ${SOURCE_LABEL[src]}`;
      controls = (
        <>
          <Choices label="Source" options={SOURCES} value={src} onPick={(id) => setSource("mono", id)} cols={3} />
        </>
      );
    } else if (tabId === "stereo") {
      const src = s.source.stereo;
      const p = pairById(STEREO_FIXED[src]);
      label = `Stereo, ${SOURCE_LABEL[src]}, ${p.label}`;
      controls = (
        <>
          <Choices label="Source" options={SOURCES} value={src} onPick={(id) => setSource("stereo", id)} cols={3} />
          <Note>
            <b>{p.label}.</b> {p.blurb}
          </Note>
        </>
      );
    } else {
      label = `Ensemble, ${ens.label}`;
      controls = (
        <>
          <Choices label="Ensemble" options={ENSEMBLES} value={s.ens} onPick={(id) => update({ ens: id })} cols={3} />
          <Note>
            <b>{ens.best.map((k) => LAYERS[k].label).join(" + ")}.</b> {ens.note}
          </Note>
        </>
      );
    }
    return (
      <>
        <div className="ltb-listen-label">Refresher</div>
        <p className="ltb-listen-hint">{TABS.find((t) => t.id === tabId).hint}</p>
        {controls}
        <ClipPlayer id={clipOf({ ...s, tab: tabId })} label={label} audio={audio} />
      </>
    );
  }

  return (
    <MicGuideFrame
      tabs={TABS}
      value={s.tab}
      onChange={(id) => update({ tab: id })}
      ariaLabel="Microphone techniques"
      idPrefix="mtg-tab"
      stageProps={{ view }}
      renderCard={renderCard}
    />
  );
}

export default MicTechniqueGuideLab;
