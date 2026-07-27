import { clamp } from "./format";
import { TRACK_CHAIN_SCOPE, VOLUME_FADER_SPEC, PAN_KNOB_SPEC } from "./constants";
import { TrackIcon } from "./icons";
import { InsertRack } from "./InsertRack";
import { SendRack } from "./SendRack";
import { Fader } from "../../components/Fader";
import { Knob } from "../../components/Knob";

// Mixer view — Logic-style vertical channel strips: one per track, each with
// its own insert rack (the same InsertRack as the dock/tracklist, just bound
// to that track's whole-track chain), pan knob, volume fader + meter, and
// solo/mute — everything the dock+tracklist expose already, laid out the
// way a real mixing console groups it. `chainActions`/`sendActions` bundle
// the InsertRack/SendRack wiring functions shared with TrackList/EditorDock
// (see DawWorkstationScreen's own render for how they're built).
export function MixerView({ tracks, selectedTrackId, setSelectedTrackId, anySoloed, trackLevels, chainActions, sendActions, setTrackPan, setTrackVolume, toggleTrackSolo, toggleTrackMute }) {
  if (tracks.length === 0) {
    return <div className="mixer-empty-hint">No tracks yet — switch to Arrange and click + Add Track to get started.</div>;
  }
  return (
    <div className="mixer-view">
      {tracks.map((track, trackIndex) => {
        const level = trackLevels[track.id] ?? 0;
        return (
          <div
            key={track.id}
            className={
              "mixer-strip" +
              (track.id === selectedTrackId ? " is-selected" : "") +
              (track.solo ? " is-soloed" : "") +
              (anySoloed && !track.solo ? " is-dimmed" : "")
            }
            style={{ "--track-color": `var(--${track.color})` }}
            onClick={() => setSelectedTrackId(track.id)}
          >
            <div className="mixer-strip__head">
              <span className="track-num mono">{trackIndex + 1}</span>
              <div className="track-swatch">
                <TrackIcon ikey={track.icon} />
              </div>
            </div>
            <div className="mixer-strip__name" title={track.name}>
              {track.name}
            </div>

            <InsertRack
              compact
              chain={track.chain}
              onAddPlugin={(def) => chainActions.addOrSelectPlugin(track.id, TRACK_CHAIN_SCOPE, def)}
              onOpenSlot={(key) => chainActions.setActiveEditor({ trackId: track.id, regionId: TRACK_CHAIN_SCOPE, key })}
              onToggleBypass={(key) => chainActions.toggleBypass(track.id, TRACK_CHAIN_SCOPE, key)}
              onMove={(key, dir) => chainActions.movePlugin(track.id, TRACK_CHAIN_SCOPE, key, dir)}
              onRemove={(key) => chainActions.removePlugin(track.id, TRACK_CHAIN_SCOPE, key)}
              onReorder={(fromKey, toKey) => chainActions.reorderPlugin(track.id, TRACK_CHAIN_SCOPE, fromKey, toKey)}
              draggingKey={chainActions.draggingKey}
              setDraggingKey={chainActions.setDraggingKey}
            />

            <SendRack
              compact
              sends={track.sends || []}
              auxOptions={tracks
                .filter((t) => t.kind === "aux" && t.id !== track.id && !(t.sends || []).some((s) => s.busId === track.id))
                .map((t) => ({ id: t.id, name: t.name, color: t.color }))}
              onAddSend={(busId) => sendActions.addSend(track.id, busId)}
              onCreateAux={(name) => sendActions.createAux({ kind: "aux", name })}
              onRemoveSend={(sendId) => sendActions.removeSend(track.id, sendId)}
              onUpdateSend={(sendId, patch) => sendActions.updateSend(track.id, sendId, patch)}
              onSetPrePost={(sendId, prePost) => sendActions.setSendPrePost(track.id, sendId, prePost)}
              trackId={track.id}
              trackName={track.name}
              trackPan={track.pan ?? 0}
              trackSolo={!!track.solo}
              onToggleTrackSolo={() => toggleTrackSolo(track.id)}
              getSendMeter={(sendId) => sendActions.getSendMeterLevel(track.id, sendId)}
            />

            <div className="mixer-strip__pan" onClick={(e) => e.stopPropagation()}>
              <Knob spec={PAN_KNOB_SPEC} value={track.pan ?? 0} onChange={(v) => setTrackPan(track.id, v)} size={40} />
            </div>

            <div className="mixer-strip__fader-row" onClick={(e) => e.stopPropagation()}>
              <div className="mixer-strip__meter" title="Post-fader level">
                <i style={{ height: `${clamp(level * 260, 2, 100)}%` }} />
              </div>
              <Fader spec={VOLUME_FADER_SPEC} value={track.volume} onChange={(v) => setTrackVolume(track.id, v)} height={120} />
            </div>

            <div className="mixer-strip__btns" onClick={(e) => e.stopPropagation()}>
              <button className={"tbtn s" + (track.solo ? " is-on" : "")} title={track.solo ? "Unsolo track" : "Solo track (S)"} onClick={() => toggleTrackSolo(track.id)}>
                S
              </button>
              <button className={"tbtn m" + (track.muted ? " is-on" : "")} title={track.muted ? "Unmute track" : "Mute track (M)"} onClick={() => toggleTrackMute(track.id)}>
                M
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
