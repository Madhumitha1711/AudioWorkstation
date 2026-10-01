import { useEffect, useRef, useState } from "react";
import { Tabs, TabPanel, TabPager } from "../../../../../components/Tabs";
import { KeyPoints } from "../../../../../components/KeyPoints";
import "../../shared/labs.css";
import { ClipPlayer } from "../../shared/ListenTabs";
import { useClipAudio } from "../../shared/useClipAudio";
import { Choices, MicStage3D, Note, Rich } from "../shared/MicLab";
import { CLIPS, ENSEMBLES, MONO_FIXED, SOURCES, STEREO_FIXED, TABS, pairById } from "./micTechniqueGuideData";
import { LAYERS } from "../shared/MicLab/micLabData";

// "Microphone Techniques" (Ch.7) — a short refresher on which technique
// suits which source: Mono → Stereo → Ensemble. Each tab has ONE choice
// (the source, or the ensemble type) and the 3D stage (shared MicStage3D)
// shows the mic(s) at the one standard position for it — nothing to drag
// or move. Trying positions, pairs and mic layers is the Microphone
// Placement lab's job (MicPlacementGuideLab).
//
//     [ 3D stage ] [ card: choice + note + player ]
//     title, explanation, KeyPoints
//     TabPager
//
// Each source / ensemble has a clip slot (clipPath →
// public/audio/mic-techniques/); switching while a clip plays carries on at
// the same point in the new clip, or stops if that clip doesn't exist yet.
// onInteract fires on the student's first play or change.

const ITEMS = TABS.map((t) => ({ id: t.id, label: t.tab }));
const SOURCE_LABEL = Object.fromEntries(SOURCES.map((x) => [x.id, x.label]));

function MicTechniqueGuideLab({ onInteract }) {
  const [s, setS] = useState({ tab: "mono", source: { mono: "voice", stereo: "drums" }, ens: "band" });
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);

  const markInteracted = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  };

  const audio = useClipAudio({ items: CLIPS, onFirstPlay: markInteracted });
  const clipOf = (st) => (st.tab === "ensemble" ? `ensemble-${st.ens}` : `${st.tab}-${st.source[st.tab]}`);

  // Apply a change, keeping playback going at the same spot when possible.
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

  const index = TABS.findIndex((t) => t.id === s.tab);
  const tab = TABS[index];

  return (
    <div className="lab ltb mic-lab">
      <Tabs items={ITEMS} value={s.tab} onChange={(id) => update({ tab: id })} ariaLabel="Microphone techniques" idPrefix="mtg-tab" />
      <TabPanel idPrefix="mtg-tab" value={tab.id} index={index} innerClassName="ltb-panel">
        <div className="ml-row">
          <MicStage3D view={view} />
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
      <TabPager items={ITEMS} value={tab.id} onChange={(id) => update({ tab: id })} />
    </div>
  );
}

export default MicTechniqueGuideLab;
