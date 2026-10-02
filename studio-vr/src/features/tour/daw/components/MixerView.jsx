import { clamp } from "../lib/format";
import { VOLUME_FADER_SPEC, PAN_KNOB_SPEC } from "../lib/constants";
import { TrackIcon } from "./icons";
import { TrackInsertRack, TrackSendRack } from "./TrackRacks";
import { Fader } from "../../../../components/controls/Fader";
import { Knob } from "../../../../components/controls/Knob";

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

            <TrackInsertRack compact track={track} chainActions={chainActions} />

            <TrackSendRack compact track={track} tracks={tracks} sendActions={sendActions} toggleTrackSolo={toggleTrackSolo} />

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
