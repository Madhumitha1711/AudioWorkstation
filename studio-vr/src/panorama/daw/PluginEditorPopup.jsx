import { GateEditorPanel } from "../../chapters/NoiseGate";
import { DeEsserEditorPanel } from "../../chapters/DeEsser";
import { CompressorEditorPanel } from "../../chapters/Compressor";
import { LimiterEditorPanel } from "../../chapters/Limiter";
import { DelayEditorPanel } from "../../chapters/Delay";
import { ReverbEditorPanel } from "../../chapters/Reverb";
import { EqualizerEditorPanel } from "../../chapters/Equalizer";
import { fmtTime } from "./format";
import { PluginIcon } from "./icons";

// Plugin editor — a popup over everything else, per track/portion + plugin.
// Reuses each plugin's own standalone chapter lab's exact *EditorPanel
// component (the real controls/curves/meters/scope each lab already has),
// driven by DawWorkstationScreen's own per-track/per-scope/per-slot Faust
// node/audio graph via the getXLevels-style `meters` host callbacks and
// `updateSlot`. Purely presentational + dispatch — every value/callback
// comes from the container; this component owns no state of its own besides
// choosing which *EditorPanel to mount for `activeSlot.key`.
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
              setParams={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "gate", (s) => ({ params: typeof updater === "function" ? updater(s.params) : updater }))
              }
              sidechain={activeSlot.sidechain}
              setSidechain={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "gate", (s) => ({ sidechain: typeof updater === "function" ? updater(s.sidechain) : updater }))
              }
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
              setParams={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "deess", (s) => ({ params: typeof updater === "function" ? updater(s.params) : updater }))
              }
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
              setBands={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "comp", (s) => ({ bands: typeof updater === "function" ? updater(s.bands) : updater }))
              }
              crossover={activeSlot.crossover}
              setCrossover={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "comp", (s) => ({ crossover: typeof updater === "function" ? updater(s.crossover) : updater }))
              }
              sidechain={activeSlot.sidechain}
              setSidechain={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "comp", (s) => ({ sidechain: typeof updater === "function" ? updater(s.sidechain) : updater }))
              }
              outputGainDb={activeSlot.outputGainDb}
              setOutputGainDb={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "comp", (s) => ({
                  outputGainDb: typeof updater === "function" ? updater(s.outputGainDb) : updater,
                }))
              }
              selectedBand={compSelectedBand}
              setSelectedBand={setCompSelectedBand}
              multibandEnabled={activeSlot.multiband}
              setMultibandEnabled={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "comp", (s) => ({ multiband: typeof updater === "function" ? updater(s.multiband) : updater }))
              }
              bypass={activeSlot.bypassed}
              isPlaying={isPlaying}
              getLevels={getCompLevels}
              getNow={getNow}
            />
          )}
          {activeSlot.status === "ready" && activeSlot.key === "limiter" && (
            <LimiterEditorPanel
              params={activeSlot.params}
              setParams={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "limiter", (s) => ({ params: typeof updater === "function" ? updater(s.params) : updater }))
              }
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
              setParams={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "delay", (s) => ({ params: typeof updater === "function" ? updater(s.params) : updater }))
              }
              sync={activeSlot.sync}
              setSync={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "delay", (s) => ({ sync: typeof updater === "function" ? updater(s.sync) : updater }))
              }
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
              setParams={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "reverb", (s) => ({ params: typeof updater === "function" ? updater(s.params) : updater }))
              }
              preset={activeSlot.preset}
              setPreset={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "reverb", (s) => ({ preset: typeof updater === "function" ? updater(s.preset) : updater }))
              }
              isPlaying={isPlaying}
              getInputPeak={getReverbInputPeak}
              getOutputPeak={getReverbOutputPeak}
              getNow={getNow}
            />
          )}
          {activeSlot.status === "ready" && activeSlot.key === "eq" && (
            <EqualizerEditorPanel
              bands={activeSlot.bands}
              setBands={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "eq", (s) => ({ bands: typeof updater === "function" ? updater(s.bands) : updater }))
              }
              selectedBandId={eqSelectedBandId}
              setSelectedBandId={setEqSelectedBandId}
              outputGainDb={activeSlot.outputGainDb}
              setOutputGainDb={(updater) =>
                updateSlot(activeTrack.id, activeEditor.regionId, "eq", (s) => ({
                  outputGainDb: typeof updater === "function" ? updater(s.outputGainDb) : updater,
                }))
              }
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
