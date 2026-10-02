import { TRACK_CHAIN_SCOPE } from "../lib/constants";
import { InsertRack } from "./InsertRack";
import { SendRack } from "./SendRack";

export function TrackInsertRack({ track, chainActions: a, ...props }) {
  const id = track.id;
  return (
    <InsertRack
      {...props}
      chain={track.chain}
      onAddPlugin={(def) => a.addOrSelectPlugin(id, TRACK_CHAIN_SCOPE, def)}
      onOpenSlot={(key) => a.setActiveEditor({ trackId: id, regionId: TRACK_CHAIN_SCOPE, key })}
      onToggleBypass={(key) => a.toggleBypass(id, TRACK_CHAIN_SCOPE, key)}
      onMove={(key, dir) => a.movePlugin(id, TRACK_CHAIN_SCOPE, key, dir)}
      onRemove={(key) => a.removePlugin(id, TRACK_CHAIN_SCOPE, key)}
      onReorder={(fromKey, toKey) => a.reorderPlugin(id, TRACK_CHAIN_SCOPE, fromKey, toKey)}
      draggingKey={a.draggingKey}
      setDraggingKey={a.setDraggingKey}
    />
  );
}

export function TrackSendRack({ track, tracks, sendActions: a, toggleTrackSolo, ...props }) {
  const id = track.id;
  return (
    <SendRack
      {...props}
      sends={track.sends || []}
      auxOptions={tracks
        .filter((t) => t.kind === "aux" && t.id !== id && !(t.sends || []).some((s) => s.busId === id))
        .map((t) => ({ id: t.id, name: t.name, color: t.color }))}
      onAddSend={(busId) => a.addSend(id, busId)}
      onCreateAux={(name) => a.createAux({ kind: "aux", name })}
      onRemoveSend={(sendId) => a.removeSend(id, sendId)}
      onUpdateSend={(sendId, patch) => a.updateSend(id, sendId, patch)}
      onSetPrePost={(sendId, prePost) => a.setSendPrePost(id, sendId, prePost)}
      trackId={id}
      trackName={track.name}
      trackPan={track.pan ?? 0}
      trackSolo={!!track.solo}
      onToggleTrackSolo={() => toggleTrackSolo(id)}
      getSendMeter={(sendId) => a.getSendMeterLevel(id, sendId)}
    />
  );
}
