import { fmtTime } from "./format";
import { TRACK_CHAIN_SCOPE, DEMO_CLIPS } from "./constants";
import { TrackIcon } from "./icons";
import { InsertRack } from "./InsertRack";
import { SendRack } from "./SendRack";

// Left-hand tracklist column — one row per track (channel-strip head +
// upload/demo/solo/mute/download/remove buttons + inline Inserts/Sends
// racks), plus the trailing "+ Add Track" row. Scroll-synced with the
// Arrangement pane on the right (see onTracklistScroll/rowSlotHeights in
// DawWorkstationScreen.jsx — trackRowRefs is populated here so that effect
// can measure each row's real height). `chainActions`/`sendActions` bundle
// the InsertRack/SendRack wiring functions shared with MixerView/EditorDock.
export function TrackList({
  tracklistRef,
  onTracklistScroll,
  trackRowRefs,
  tracks,
  selectedTrackId,
  setSelectedTrackId,
  selectedRegion,
  exitSelection,
  anySoloed,
  setTrackVolume,
  handleTrackFile,
  loadDemoForTrack,
  toggleTrackSolo,
  toggleTrackMute,
  downloadingTrackId,
  handleDownloadTrack,
  removeTrack,
  chainActions,
  sendActions,
  openAddTrackDialog,
}) {
  return (
    <div className="tracklist" ref={tracklistRef} onScroll={onTracklistScroll}>
      <div className="tracklist-head mono">TRACKS</div>
      {tracks.map((track, trackIndex) => (
        <div
          key={track.id}
          ref={(el) => {
            if (el) trackRowRefs.current.set(track.id, el);
            else trackRowRefs.current.delete(track.id);
          }}
          className={
            "track-row" +
            (track.kind === "aux" ? " is-aux" : "") +
            (track.id === selectedTrackId ? " is-selected" : "") +
            (track.solo ? " is-soloed" : "") +
            (anySoloed && !track.solo ? " is-dimmed" : "")
          }
          style={{ "--track-color": `var(--${track.color})` }}
          onClick={() => {
            setSelectedTrackId(track.id);
            if (selectedRegion && selectedRegion.trackId !== track.id) exitSelection();
          }}
        >
          <div className="track-row__head">
            <span className="track-num mono">{trackIndex + 1}</span>
            <div className="track-swatch">
              <TrackIcon ikey={track.icon} />
            </div>
            <div className="track-meta">
              <div className="track-name">{track.name}</div>
              <div className="track-sub-row">
                <div className="track-sub mono">
                  {track.loadError ? (
                    <span className="track-sub-error">{track.loadError}</span>
                  ) : track.kind === "aux" ? (
                    `Aux bus · ${track.chain.length} insert${track.chain.length === 1 ? "" : "s"} · ${
                      tracks.filter((t) => (t.sends || []).some((s) => s.busId === track.id)).length
                    } send${tracks.filter((t) => (t.sends || []).some((s) => s.busId === track.id)).length === 1 ? "" : "s"} in${track.muted ? " · Muted" : ""}${track.solo ? " · Solo" : ""}`
                  ) : track.buffer ? (
                    `${track.startAt ? `@${fmtTime(track.startAt)} · ` : ""}${fmtTime(track.duration)} · ${track.chain.length} on track · ${track.regions.length} portion${track.regions.length === 1 ? "" : "s"}${(track.sends || []).length ? ` · ${track.sends.length} send${track.sends.length === 1 ? "" : "s"}` : ""}${track.muted ? " · Muted" : ""}${track.solo ? " · Solo" : ""}`
                  ) : (
                    "No audio"
                  )}
                </div>
                <input
                  type="range"
                  className="track-vol track-vol--inline"
                  min="0"
                  max="1.5"
                  step="0.01"
                  value={track.volume}
                  title="Volume"
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setTrackVolume(track.id, parseFloat(e.target.value))}
                />
              </div>
            </div>
          </div>
          <div className="track-row__body">
            <div className="track-row__btn-col">
              <div className="track-btns">
                {track.kind !== "aux" && (
                  <>
                    <input
                      type="file"
                      accept="audio/*"
                      id={`daw-file-${track.id}`}
                      className="daw-file-input"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleTrackFile(track.id, e)}
                    />
                    <label htmlFor={`daw-file-${track.id}`} className="tbtn" title="Upload audio" onClick={(e) => e.stopPropagation()}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </label>
                    <div className="tbtn-select-wrap" onClick={(e) => e.stopPropagation()}>
                      <span className="tbtn" aria-hidden="true">
                        D
                      </span>
                      <select
                        className="tbtn-select"
                        value=""
                        title="Load a Hungarian Dance No. 5 stem onto this track"
                        aria-label="Load a demo clip onto this track"
                        onChange={(e) => {
                          const clip = DEMO_CLIPS.find((c) => c.id === e.target.value);
                          if (clip) loadDemoForTrack(track.id, clip);
                          e.target.value = "";
                        }}
                      >
                        <option value="" disabled>
                          Demo…
                        </option>
                        {DEMO_CLIPS.map((clip) => (
                          <option key={clip.id} value={clip.id}>
                            {clip.name.replace("Hungarian Dance No. 5 — ", "")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <button
                  className={"tbtn s" + (track.solo ? " is-on" : "")}
                  title={track.solo ? "Unsolo track" : "Solo track — silences every other track (S)"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTrackSolo(track.id);
                  }}
                >
                  S
                </button>
                <button
                  className={"tbtn m" + (track.muted ? " is-on" : "")}
                  title={track.muted ? "Unmute track" : "Mute track (M)"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTrackMute(track.id);
                  }}
                >
                  M
                </button>
                <button
                  className="tbtn"
                  title={
                    track.buffer
                      ? "Download this track (its own portions + volume) as a WAV"
                      : track.kind === "aux"
                        ? "Aux buses have nothing of their own to download — download the full mix instead"
                        : "Add audio to this track first"
                  }
                  disabled={!track.buffer || downloadingTrackId === track.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDownloadTrack(track.id);
                  }}
                >
                  {downloadingTrackId === track.id ? (
                    "…"
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 4v11M7.5 11.5 12 16l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M4 17v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <button
                  className="tbtn danger"
                  title="Remove track"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTrack(track.id);
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="track-row__racks">
              <div className="track-row__rack-row">
                <div className="track-row__rack-label mono">INS</div>
                <InsertRack
                  dense
                  fixedSlots={5}
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
              </div>
              <div className="track-row__rack-row">
                <div className="track-row__rack-label mono">SEND</div>
                <SendRack
                  dense
                  fixedSlots={5}
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
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="track-row add-track-row" onClick={openAddTrackDialog} title="New Track…">
        <span className="add-track-plus">+</span>
        <span>Add Track</span>
      </div>
    </div>
  );
}
