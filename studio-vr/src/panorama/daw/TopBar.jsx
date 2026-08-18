import { clamp, fmtTime } from "./format";

// Top transport bar: exit, Arrange/Mixer view switch, transport buttons,
// timecode, the "previewing a portion" pill, Download Mix, and the master
// meter. Purely presentational — every callback is one of
// DawWorkstationScreen's own transport/track functions.
export function TopBar({
  onClose,
  viewMode,
  setViewMode,
  tracks,
  isPlaying,
  onRewind,
  onTogglePlay,
  onStop,
  loopOn,
  onToggleLoop,
  selectedRegionObj,
  onExitSelection,
  playhead,
  arrangementDuration,
  downloadingMix,
  onDownloadMix,
  meterLevel,
}) {
  return (
    <div className="daw-topbar">
      <button className="exit-btn" onClick={onClose}>
        ‹ Back to Control Room
      </button>
      <div className="topbar-divider" />
      <div className="app-id">
        <div className="name">STUDIO VR — SESSION</div>
        <div className="daw-crumb">
          STUDIO&nbsp;/&nbsp;CONTROL ROOM&nbsp;/&nbsp;<b>MIX WORKSTATION</b>
        </div>
      </div>
      <div className="topbar-divider" />
      <div className="view-switch" role="tablist" aria-label="View">
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "arrange"}
          className={"view-switch__btn" + (viewMode === "arrange" ? " is-active" : "")}
          onClick={() => setViewMode("arrange")}
          title="Arrange view"
        >
          Arrange
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === "mixer"}
          className={"view-switch__btn" + (viewMode === "mixer" ? " is-active" : "")}
          onClick={() => setViewMode("mixer")}
          title="Mixer view (X)"
        >
          Mixer
        </button>
      </div>
      <div className="topbar-divider" />
      <div className="transport">
        <button className="transport-btn" onClick={onRewind} disabled={tracks.length === 0} title="Return to start">
          ⏮
        </button>
        <button
          className={"transport-btn play" + (isPlaying ? " is-playing" : "")}
          onClick={onTogglePlay}
          disabled={tracks.length === 0}
          title="Play / Pause"
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <button className="transport-btn" onClick={onStop} disabled={tracks.length === 0} title="Stop">
          ■
        </button>
        <button
          className={"transport-btn loop" + (loopOn || selectedRegionObj ? " is-on" : "")}
          onClick={onToggleLoop}
          disabled={!!selectedRegionObj}
          title={selectedRegionObj ? "Loop is on automatically while previewing a portion" : "Loop the whole mix"}
        >
          ⟲
        </button>
      </div>
      <div className="timecode">
        <span className="big">{fmtTime(playhead)}</span>
        <span className="bars">/ {fmtTime(arrangementDuration)}</span>
      </div>
      {selectedRegionObj && (
        <div className="preview-pill" title="Play is scoped to this portion — Exit to play the whole arrangement again">
          Previewing {fmtTime(selectedRegionObj.start)}–{fmtTime(selectedRegionObj.end)}
          <button onClick={onExitSelection}>✕ Exit</button>
        </div>
      )}
      <div className="daw-topbar-right">
        <button
          className="daw-btn small"
          onClick={() => {
            void onDownloadMix();
          }}
          disabled={!tracks.some((t) => t.buffer) || downloadingMix}
          title="Render every track's own portions + volume + mute, summed together, and download the mix as one WAV"
        >
          {downloadingMix ? "Rendering…" : "Download Mix"}
        </button>
        <div>
          <div className="master-meter">
            {[0.5, 0.8, 1.05, 0.7].map((mul, i) => (
              <i key={i} style={{ height: `${clamp(meterLevel * mul * 220, 8, 100)}%` }} />
            ))}
          </div>
          <div className="master-label mono">MASTER</div>
        </div>
      </div>
    </div>
  );
}
