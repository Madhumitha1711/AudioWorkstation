import { clamp, fmtTime, fmtRulerMark } from "./format";

// Right-hand pane: the time ruler, each track's waveform/clip lane (with its
// portions and the in-progress draft region), and the draggable playhead.
// Scroll-synced with TrackList on the left (see onArrangementScroll/
// rowSlotHeights in DawWorkstationScreen.jsx). Every drag gesture
// (move a clip, draw/select a portion, scrub the playhead) is one of that
// container's own handlers, passed straight through.
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
  onPlayheadPointerMove,
  endPlayheadDrag,
  playhead,
}) {
  return (
    <div className="arrangement" ref={arrangementRef} onScroll={onArrangementScroll}>
      <div className="ruler">
        {rulerMarks.map((s) => (
          <span key={s} className="ruler-mark" style={{ left: `${(s / Math.max(arrangementDuration, 1)) * 100}%` }}>
            {fmtRulerMark(s)}
          </span>
        ))}
      </div>
      <div className="arr-rows">
        {tracks.map((track) => (
          <div
            key={track.id}
            className="arr-row"
            style={rowSlotHeights[track.id] ? { height: `${rowSlotHeights[track.id]}px` } : undefined}
          >
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
                  title="Drag on the waveform to select a portion, then add a signal chain to it"
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
              <div className="arr-row-empty">Upload or use demo</div>
            )}
          </div>
        ))}
        <div className="arr-row add-track-row-spacer" />
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
      {tracks.length === 0 && <div className="mixer-empty-hint">No tracks yet — click + Add Track on the left to get started.</div>}
    </div>
  );
}
