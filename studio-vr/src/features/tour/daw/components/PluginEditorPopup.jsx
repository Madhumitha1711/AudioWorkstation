import { GateEditorPanel } from "../../../gear-studio/NoiseGate";
import { DeEsserEditorPanel } from "../../../gear-studio/DeEsser";
import { CompressorEditorPanel } from "../../../gear-studio/Compressor";
import { LimiterEditorPanel } from "../../../gear-studio/Limiter";
import { DelayEditorPanel } from "../../../gear-studio/Delay";
import { ReverbEditorPanel } from "../../../gear-studio/Reverb";
import { EqualizerEditorPanel } from "../../../gear-studio/Equalizer";
import { fmtTime } from "../lib/format";
import { PluginIcon } from "./icons";

export function PluginEditorPopup({
  activeSlot,
  activeTrack,
  activeRegion,
  activeIsPortionOuter,
  activeEditor,
  isPlaying,
  gateIsOpen,
  setGateIsOpen,
  onProcess,
  onApply,
  onCancel,
  toggleBypass,
  removePlugin,
  updateSlot,
  compSelectedBand,
  setCompSelectedBand,
  setLimiterGainReduction,
  delayLink,
  setDelayLink,
  eqSelectedBandId,
  setEqSelectedBandId,
  eqAnalyserRef,
  eqDryAnalyserRef,
  eqSampleRate,
  eqLiveDynGainRef,
  meters,
}) {
  if (!activeSlot || !activeTrack) return null;
  const setter = (key, field) => (updater) =>
    updateSlot(activeTrack.id, activeEditor.regionId, key, (s) => ({ [field]: typeof updater === "function" ? updater(s[field]) : updater }));
  const { getGateLevels, getDeEsserInputDb, getDeEsserGainReductionDb, getCompLevels, getLimiterLevels, getDelayInputPeak, getDelayOutputPeak, getReverbInputPeak, getReverbOutputPeak, getNow } = meters;

  return (
    <div className="plugin-popup-overlay" onClick={onCancel}>
      <div className="plugin-popup" style={{ "--pc": `var(--${activeSlot.color})` }} onClick={(e) => e.stopPropagation()}>
        <div className="plugin-popup__head">
          <PluginIcon pkey={activeSlot.key} />
          <div className="plugin-popup__titles">
            <div className="plugin-popup__name">
              {activeTrack.name} · {activeSlot.name}
            </div>
            <div className="plugin-popup__tag mono">
              {activeSlot.tag} ·{" "}
              {activeRegion
                ? activeIsPortionOuter
                  ? `applied to ${fmtTime(activeRegion.start)}–${fmtTime(activeRegion.end)} only, before that portion's own chain${
                      activeRegion.outerCustomized ? "" : " (inherited from track — editing forks a private copy)"
                    }`
                  : `applied to ${fmtTime(activeRegion.start)}–${fmtTime(activeRegion.end)}, after the track's own chain`
                : "applied to the whole track"}
              {activeSlot.key === "gate" && activeSlot.status === "ready" && (
                <> · {isPlaying ? (gateIsOpen ? "● OPEN" : "● CLOSED") : "○ IDLE"}</>
              )}
            </div>
          </div>
          <button className="daw-btn small" onClick={onProcess} title="Start/restart the preview loop so you can hear this track">
            {isPlaying ? "Processing…" : "▶ Process"}
          </button>
          <button className="daw-btn small primary" onClick={onApply} title="Keep this plugin in the chain, push it into the playing mix, and close">
            Apply
          </button>
          <button className="daw-btn small" onClick={onCancel} title="Close without changes">
            Cancel
          </button>
          <label className="daw-pill-toggle">
            <input
              type="checkbox"
              checked={activeSlot.bypassed}
              onChange={() => toggleBypass(activeTrack.id, activeEditor.regionId, activeSlot.key)}
            />
            Bypass
          </label>
          <button className="daw-btn small danger" onClick={() => removePlugin(activeTrack.id, activeEditor.regionId, activeSlot.key)}>
            Remove
          </button>
          <button className="plugin-popup__close" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <div className="plugin-popup__body">
          {activeSlot.status === "loading" && <div className="daw-status">Loading Faust engine…</div>}
          {activeSlot.status === "error" && <div className="daw-error">Failed to load this plugin.</div>}
          {activeSlot.status === "ready" && activeSlot.key === "gate" && (
            <GateEditorPanel
              params={activeSlot.params}
              setParams={setter("gate", "params")}
              sidechain={activeSlot.sidechain}
              setSidechain={setter("gate", "sidechain")}
              bypass={activeSlot.bypassed}
              isPlaying={isPlaying}
              getLevels={getGateLevels}
              getNow={getNow}
              onOpenChange={setGateIsOpen}
            />
          )}
          {activeSlot.status === "ready" && activeSlot.key === "deess" && (
            <DeEsserEditorPanel
              params={activeSlot.params}
              setParams={setter("deess", "params")}
              bypass={activeSlot.bypassed}
              isPlaying={isPlaying}
              getInputDb={getDeEsserInputDb}
              getGainReductionDb={getDeEsserGainReductionDb}
              getNow={getNow}
            />
          )}
          {activeSlot.status === "ready" && activeSlot.key === "comp" && (
            <CompressorEditorPanel
              bands={activeSlot.bands}
              setBands={setter("comp", "bands")}
              crossover={activeSlot.crossover}
              setCrossover={setter("comp", "crossover")}
              sidechain={activeSlot.sidechain}
              setSidechain={setter("comp", "sidechain")}
              outputGainDb={activeSlot.outputGainDb}
              setOutputGainDb={setter("comp", "outputGainDb")}
              selectedBand={compSelectedBand}
              setSelectedBand={setCompSelectedBand}
              multibandEnabled={activeSlot.multiband}
              setMultibandEnabled={setter("comp", "multiband")}
              bypass={activeSlot.bypassed}
              isPlaying={isPlaying}
              getLevels={getCompLevels}
              getNow={getNow}
            />
          )}
          {activeSlot.status === "ready" && activeSlot.key === "limiter" && (
            <LimiterEditorPanel
              params={activeSlot.params}
              setParams={setter("limiter", "params")}
              bypass={activeSlot.bypassed}
              isPlaying={isPlaying}
              getLevels={getLimiterLevels}
              getNow={getNow}
              onGainReductionChange={setLimiterGainReduction}
            />
          )}
          {activeSlot.status === "ready" && activeSlot.key === "delay" && (
            <DelayEditorPanel
              params={activeSlot.params}
              setParams={setter("delay", "params")}
              sync={activeSlot.sync}
              setSync={setter("delay", "sync")}
              link={delayLink}
              setLink={setDelayLink}
              isPlaying={isPlaying}
              getInputPeak={getDelayInputPeak}
              getOutputPeak={getDelayOutputPeak}
              getNow={getNow}
            />
          )}
          {activeSlot.status === "ready" && activeSlot.key === "reverb" && (
            <ReverbEditorPanel
              params={activeSlot.params}
              setParams={setter("reverb", "params")}
              preset={activeSlot.preset}
              setPreset={setter("reverb", "preset")}
              isPlaying={isPlaying}
              getInputPeak={getReverbInputPeak}
              getOutputPeak={getReverbOutputPeak}
              getNow={getNow}
            />
          )}
          {activeSlot.status === "ready" && activeSlot.key === "eq" && (
            <EqualizerEditorPanel
              bands={activeSlot.bands}
              setBands={setter("eq", "bands")}
              selectedBandId={eqSelectedBandId}
              setSelectedBandId={setEqSelectedBandId}
              outputGainDb={activeSlot.outputGainDb}
              setOutputGainDb={setter("eq", "outputGainDb")}
              analyserRef={eqAnalyserRef}
              dryAnalyserRef={eqDryAnalyserRef}
              analyserActive={isPlaying}
              sampleRate={eqSampleRate}
              liveDynGainRef={eqLiveDynGainRef}
              liveDynGainActive={isPlaying}
            />
          )}
        </div>
      </div>
    </div>
  );
}
