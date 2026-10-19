import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clamp, fmtTime, fmtRulerMark, pickRulerGrid } from "../lib/format";
import { NEW_TRACK_DROP } from "../lib/fileDrop";
import { RULER_MIN_TICK_PX, TIMELINE_TAIL_SEC, ZOOM_MIN_PPS, ZOOM_MAX_PPS } from "../lib/constants";

const OVERSCAN_PX = 240;

// one <path> per clip instead of one <line> per peak: peak count now scales
// with clip length, and a single node keeps long clips cheap to render
const Waveform = memo(function Waveform({ peaks }) {
  const d = useMemo(() => {
    const parts = new Array(peaks.length);
    for (let i = 0; i < peaks.length; i++) {
      const [min, max] = peaks[i];
      const y1 = 50 - max * 48;
      const y2 = Math.max(50 - min * 48, y1 + 0.6);
      parts[i] = `M${i + 0.5} ${y1.toFixed(2)}V${y2.toFixed(2)}`;
    }
    return parts.join("");
  }, [peaks]);
  return (
    <svg viewBox={`0 0 ${peaks.length} 100`} preserveAspectRatio="none" className="wave-svg">
      <path d={d} />
    </svg>
  );
});

// Ruler + background grid. Only the ticks/lines inside the visible window
// (plus some overscan) are rendered, and this component tracks the scroll
// position itself, so horizontal scrolling never re-renders the waveforms.
// The scroll container is found from the ruler's own element: a child's
// layout effect runs before the parent's ref is attached.
function TimeScale({ pxPerSec, contentWidth, playhead, showPlayhead, rulerHandlers }) {
  const rulerRef = useRef(null);
  const [view, setView] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = rulerRef.current?.closest(".arrangement");
    if (!el) return undefined;
    let frame = 0;
    const read = () => {
      frame = 0;
      setView((v) => (v.left === el.scrollLeft && v.width === el.clientWidth ? v : { left: el.scrollLeft, width: el.clientWidth }));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const { major, minor } = pickRulerGrid(pxPerSec);
  const showMinor = minor * pxPerSec >= RULER_MIN_TICK_PX;
  const unit = showMinor ? minor : major;
  const majorEvery = Math.max(1, Math.round(major / unit));
  const halfEvery = majorEvery % 2 === 0 ? majorEvery / 2 : 0;
  const fromPx = Math.max(0, view.left - OVERSCAN_PX);
  const toPx = Math.min(contentWidth, view.left + Math.max(view.width, 1) + OVERSCAN_PX);
  const ticks = [];
  for (let i = Math.floor(fromPx / pxPerSec / unit); i * unit * pxPerSec <= toPx; i++) {
    ticks.push({ i, t: i * unit, kind: i % majorEvery === 0 ? "major" : halfEvery && i % halfEvery === 0 ? "half" : "minor" });
  }

  return (
    <>
      <div className="arr-grid" aria-hidden="true">
        {ticks.map(({ i, t, kind }) =>
          kind === "minor" ? null : (
            <span key={i} className={"arr-grid-line" + (kind === "major" ? " is-major" : "")} style={{ left: `${t * pxPerSec}px` }} />
          ),
        )}
      </div>
      <div
        ref={rulerRef}
        className="ruler"
        style={{ width: `${contentWidth}px` }}
        title="Click to move the playhead here — hold and drag to scrub. Ctrl/⌘ + scroll to zoom"
        {...rulerHandlers}
      >
        {ticks.map(({ i, t, kind }) => (
          <span key={i} className={"ruler-tick is-" + kind} style={{ left: `${t * pxPerSec}px` }}>
            {kind === "major" && <span className="ruler-label">{fmtRulerMark(t, major)}</span>}
          </span>
        ))}
        {showPlayhead && <span className="ruler-playhead" style={{ left: `${playhead * pxPerSec}px` }} />}
      </div>
    </>
  );
}

const ZOOM_SLIDER_MAX = 1000;
const ppsToSlider = (pps) => Math.round((Math.log(pps / ZOOM_MIN_PPS) / Math.log(ZOOM_MAX_PPS / ZOOM_MIN_PPS)) * ZOOM_SLIDER_MAX);
const sliderToPps = (v) => ZOOM_MIN_PPS * Math.pow(ZOOM_MAX_PPS / ZOOM_MIN_PPS, v / ZOOM_SLIDER_MAX);

function ZoomControls({ zoom, arrangementDuration }) {
  return (
    <div className="arr-zoom" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="arr-zoom__btn" title="Zoom out (−)" onClick={zoom.zoomOut}>
        −
      </button>
      <input
        type="range"
        className="arr-zoom__slider"
        min={0}
        max={ZOOM_SLIDER_MAX}
        value={ppsToSlider(zoom.pxPerSec)}
        title="Timeline zoom"
        aria-label="Timeline zoom"
        onChange={(e) => zoom.zoomTo(sliderToPps(Number(e.target.value)))}
      />
      <button type="button" className="arr-zoom__btn" title="Zoom in (+)" onClick={zoom.zoomIn}>
        +
      </button>
      <button type="button" className="arr-zoom__btn arr-zoom__btn--fit" title="Fit the whole song in view" onClick={() => zoom.zoomFit(arrangementDuration)}>
        Fit
      </button>
    </div>
  );
}

export function Arrangement({
  arrangementRef,
  onArrangementScroll,
  zoom,
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
  const { pxPerSec, pxPerSecRef, zoomTo } = zoom;

  const [viewportWidth, setViewportWidth] = useState(0);
  useLayoutEffect(() => {
    const el = arrangementRef.current;
    if (!el) return undefined;
    const measure = () => setViewportWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [arrangementRef]);

  const contentWidth = Math.max(viewportWidth, Math.ceil((arrangementDuration + TIMELINE_TAIL_SEC) * pxPerSec));

  // ctrl/cmd + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms
  // around the pointer; plain wheel / shift+wheel / trackpad swipes scroll
  useEffect(() => {
    const el = arrangementRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const dy = Math.max(-60, Math.min(60, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY));
      const rect = el.getBoundingClientRect();
      zoomTo(pxPerSecRef.current * Math.exp(-dy * 0.01), e.clientX - rect.left - el.clientLeft);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [arrangementRef, zoomTo, pxPerSecRef]);

  // keep the playhead in view: page forward when it runs off the right edge
  // during playback, follow loop wrap-arounds, and jump back on rewind.
  // Scrolling away by hand while playing is respected until it re-enters.
  const prevPlayheadRef = useRef(playhead);
  useEffect(() => {
    const el = arrangementRef.current;
    const prev = prevPlayheadRef.current;
    prevPlayheadRef.current = playhead;
    if (!el || prev === playhead) return;
    const x = playhead * pxPerSec;
    const prevX = prev * pxPerSec;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    const margin = Math.min(48, el.clientWidth * 0.1);
    const inView = x >= left && x <= right - margin;
    if (inView) return;
    if (isPlayingRef.current) {
      const wasInView = prevX >= left - 1 && prevX <= right + 1;
      if (wasInView && x > prevX) el.scrollLeft = x - margin;
      else if (x < prevX) el.scrollLeft = Math.max(0, x - margin);
    } else if (playhead === 0) {
      el.scrollLeft = 0;
    }
  }, [playhead, pxPerSec, arrangementRef, isPlayingRef]);

  return (
    <div className="arrangement-wrap">
    <div
      className={"arrangement" + (dropTargetId === NEW_TRACK_DROP ? " is-drop-new" : "")}
      ref={arrangementRef}
      onScroll={onArrangementScroll}
      onDragOver={(e) => onFileDragOver(e, NEW_TRACK_DROP)}
      onDragLeave={(e) => onFileDragLeave(e, NEW_TRACK_DROP)}
      onDrop={(e) => onFileDrop(e, NEW_TRACK_DROP)}
    >
      <div className="arr-content" style={{ width: `${contentWidth}px` }}>
      <TimeScale
        pxPerSec={pxPerSec}
        contentWidth={contentWidth}
        playhead={playhead}
        showPlayhead={arrangementDuration > 0}
        rulerHandlers={{
          onPointerDown: beginSeekAt,
          onPointerMove: onPlayheadPointerMove,
          onPointerUp: endPlayheadDrag,
          onPointerCancel: endPlayheadDrag,
        }}
      />
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
                  left: `${(track.startAt ?? 0) * pxPerSec}px`,
                  width: `${Math.max(track.duration * pxPerSec, 2)}px`,
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
                  <Waveform peaks={track.peaks} />
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
          style={{ left: `${Math.max(0, playhead) * pxPerSec}px` }}
          onPointerDown={beginPlayheadDrag}
          onPointerMove={onPlayheadPointerMove}
          onPointerUp={endPlayheadDrag}
          onPointerCancel={endPlayheadDrag}
        />
      )}
      </div>
      {tracks.length === 0 && <div className="mixer-empty-hint">No tracks yet — click + Add Track on the left, or drop audio files here.</div>}
    </div>
    <ZoomControls zoom={zoom} arrangementDuration={arrangementDuration} />
    </div>
  );
}
