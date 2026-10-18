import { clamp, fmtTime, fmtRulerMark } from "../lib/format";
import { NEW_TRACK_DROP } from "../lib/fileDrop";

export function Arrangement({
  arrangementRef,
  onArrangementScroll,
  rulerMarks,
  arrangementDuration,
  tracks,
  rowSlotHeights,
  beginClipDrag,
  onClipPointerMove,
  endClipDrag,
  setTrackStartAt,
  isPlayingRef,
  playFrom,
  currentOffset,
  beginRegionDrag,
  onRegionPointerMove,
  endRegionDrag,
  selectedRegion,
  selectRegion,
  removeRegion,
  draftRegion,
  beginPlayheadDrag,
  beginSeekAt,
  onPlayheadPointerMove,
  endPlayheadDrag,
  playhead,
  fileDrop,
}) {
  const { dropTargetId, onFileDragOver, onFileDragLeave, onFileDrop } = fileDrop;
  return (
    <div
      className={"arrangement" + (dropTargetId === NEW_TRACK_DROP ? " is-drop-new" : "")}
      ref={arrangementRef}
      onScroll={onArrangementScroll}
      onDragOver={(e) => onFileDragOver(e, NEW_TRACK_DROP)}
      onDragLeave={(e) => onFileDragLeave(e, NEW_TRACK_DROP)}
      onDrop={(e) => onFileDrop(e, NEW_TRACK_DROP)}
    >
      <div
        className="ruler"
        title="Click to move the playhead here — hold and drag to scrub"
        onPointerDown={beginSeekAt}
        onPointerMove={onPlayheadPointerMove}
        onPointerUp={endPlayheadDrag}
        onPointerCancel={endPlayheadDrag}
      >
        {rulerMarks.map((s) => (
          <span key={s} className="ruler-mark" style={{ left: `${(s / Math.max(arrangementDuration, 1)) * 100}%` }}>
            {fmtRulerMark(s)}
          </span>
        ))}
      </div>
      <div
        className="arr-rows"
        onPointerDown={beginSeekAt}
        onPointerMove={onPlayheadPointerMove}
        onPointerUp={endPlayheadDrag}
        onPointerCancel={endPlayheadDrag}
      >
        {tracks.map((track) => (
          <div
            key={track.id}
            className={"arr-row" + (dropTargetId === track.id ? " is-drop-target" : "")}
            style={{
              ...(rowSlotHeights[track.id] ? { height: `${rowSlotHeights[track.id]}px` } : null),
              ...(dropTargetId === track.id ? { "--track-color": `var(--${track.color})` } : null),
            }}
            onDragOver={(e) => onFileDragOver(e, track.id)}
            onDragLeave={(e) => onFileDragLeave(e, track.id)}
            onDrop={(e) => onFileDrop(e, track.id)}
          >
            {dropTargetId === track.id && (
              <div className="arr-drop-hint">{track.buffer ? `Drop to replace audio on ${track.name}` : `Drop to load onto ${track.name}`}</div>
            )}
            {track.peaks ? (
              <div
                className="clip"
                style={{
                  "--track-color": `var(--${track.color})`,
                  left: `${clamp(((track.startAt ?? 0) / Math.max(arrangementDuration, 0.001)) * 100, 0, 100)}%`,
                  width: `${clamp((track.duration / Math.max(arrangementDuration, 0.001)) * 100, 0, 100)}%`,
                }}
              >
                <div
                  className="clip-header"
                  title="Drag to move this track's start position — double-click to reset to 0:00"
                  onPointerDown={(e) => beginClipDrag(e, track)}
                  onPointerMove={onClipPointerMove}
                  onPointerUp={endClipDrag}
                  onPointerCancel={endClipDrag}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setTrackStartAt(track.id, 0);
                    if (isPlayingRef.current) playFrom(currentOffset());
                  }}
                />
                <div
                  className="clip-body"
                  title="Click to move the playhead here — drag on the waveform to select a portion, then add a signal chain to it"
                  onPointerDown={(e) => beginRegionDrag(e, track)}
                  onPointerMove={onRegionPointerMove}
                  onPointerUp={endRegionDrag}
                  onPointerCancel={endRegionDrag}
                >
                  <svg viewBox={`0 0 ${track.peaks.length} 100`} preserveAspectRatio="none" className="wave-svg">
                    {track.peaks.map(([min, max], i) => {
                      const y1 = 50 - max * 48;
                      const y2 = 50 - min * 48;
                      return <line key={i} x1={i} x2={i} y1={y1} y2={Math.max(y2, y1 + 0.6)} />;
                    })}
                  </svg>
                  {track.regions.map((region) => {
                    const isSelected = selectedRegion?.trackId === track.id && selectedRegion?.regionId === region.id;
                    const outerCount = region.outerCustomized ? region.outerChain?.length || 0 : track.chain.length;
                    const totalCount = region.chain.length + outerCount;
                    return (
                      <div
                        key={region.id}
                        className={"clip-region" + (isSelected ? " is-selected" : "")}
                        style={{
                          left: `${clamp((region.start / Math.max(track.duration, 0.001)) * 100, 0, 100)}%`,
                          width: `${clamp(((region.end - region.start) / Math.max(track.duration, 0.001)) * 100, 0, 100)}%`,
                        }}
                        title={`Portion ${fmtTime(region.start)}–${fmtTime(region.end)} · ${region.chain.length} plugin${region.chain.length === 1 ? "" : "s"}${outerCount ? ` + ${outerCount} outer${region.outerCustomized ? "" : " (inherited)"}` : ""} — click to edit its chain`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectRegion(track.id, region.id);
                        }}
                      >
                        <button
                          className="clip-region__remove"
                          title="Delete this portion"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRegion(track.id, region.id);
                          }}
                        >
                          ×
                        </button>
                        {totalCount > 0 && <span className="clip-region__count mono">{totalCount}</span>}
                      </div>
                    );
                  })}
                  {draftRegion && draftRegion.trackId === track.id && (
                    <div
                      className="clip-region is-draft"
                      style={{
                        left: `${clamp((draftRegion.start / Math.max(track.duration, 0.001)) * 100, 0, 100)}%`,
                        width: `${clamp(((draftRegion.end - draftRegion.start) / Math.max(track.duration, 0.001)) * 100, 0, 100)}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            ) : track.kind === "aux" ? (
              <div className="arr-row-empty arr-row-empty--aux" title="An Aux bus has no audio of its own — route other tracks' Sends at it (see the Sends rack in the dock or Mixer view)">
                Aux bus — receives Sends
              </div>
            ) : (
              <div className="arr-row-empty">Upload, drop an audio file here, or use demo</div>
            )}
          </div>
        ))}
        <div className="arr-row add-track-row-spacer">
          {dropTargetId === NEW_TRACK_DROP && <div className="arr-drop-hint arr-drop-hint--new">Drop to add as new track</div>}
        </div>
      </div>
      {arrangementDuration > 0 && (
        <div
          className="playhead"
          title="Drag to seek to any position"
          style={{ left: `${clamp((playhead / arrangementDuration) * 100, 0, 100)}%` }}
          onPointerDown={beginPlayheadDrag}
          onPointerMove={onPlayheadPointerMove}
          onPointerUp={endPlayheadDrag}
          onPointerCancel={endPlayheadDrag}
        />
      )}
      {tracks.length === 0 && <div className="mixer-empty-hint">No tracks yet — click + Add Track on the left, or drop audio files here.</div>}
    </div>
  );
}
