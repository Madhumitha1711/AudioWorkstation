import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { clamp } from "./format";
import { ZOOM_DEFAULT_PPS, ZOOM_MIN_PPS, ZOOM_MAX_PPS, ZOOM_STEP } from "./constants";

// Fixed-scale timeline zoom (pixels per second) for the arrangement.
// Zooming keeps one moment of the song under the same screen x: the pointer
// for ctrl/cmd+wheel, otherwise the playhead when it's on screen, else the
// left edge. The scroll correction is applied after React has resized the
// timeline, in a layout effect, so there's no visible jump.
export function useTimelineZoom(scrollRef, getPlayhead) {
  const [pxPerSec, setPxPerSec] = useState(ZOOM_DEFAULT_PPS);
  const pxPerSecRef = useRef(pxPerSec);
  const pendingRef = useRef(null);

  const zoomTo = useCallback(
    (nextPps, anchorX) => {
      const prev = pxPerSecRef.current;
      const next = clamp(nextPps, ZOOM_MIN_PPS, ZOOM_MAX_PPS);
      if (Math.abs(next - prev) < 1e-6) return;
      const el = scrollRef.current;
      if (el) {
        let ax = anchorX;
        if (ax == null) {
          const x = (getPlayhead?.() ?? 0) * prev - el.scrollLeft;
          ax = x >= 0 && x <= el.clientWidth ? x : 0;
        }
        pendingRef.current = { time: (el.scrollLeft + ax) / prev, ax };
      }
      pxPerSecRef.current = next;
      setPxPerSec(next);
    },
    [scrollRef, getPlayhead],
  );

  const zoomIn = useCallback(() => zoomTo(pxPerSecRef.current * ZOOM_STEP), [zoomTo]);
  const zoomOut = useCallback(() => zoomTo(pxPerSecRef.current / ZOOM_STEP), [zoomTo]);
  const zoomFit = useCallback(
    (durationSec) => {
      const el = scrollRef.current;
      if (!el) return;
      const fit = (el.clientWidth - 24) / Math.max(durationSec, 1);
      pendingRef.current = { time: 0, ax: 0 };
      const next = clamp(fit, ZOOM_MIN_PPS, ZOOM_MAX_PPS);
      if (Math.abs(next - pxPerSecRef.current) < 1e-6) {
        pendingRef.current = null;
        el.scrollLeft = 0;
        return;
      }
      pxPerSecRef.current = next;
      setPxPerSec(next);
    },
    [scrollRef],
  );

  useLayoutEffect(() => {
    const p = pendingRef.current;
    const el = scrollRef.current;
    if (!p || !el) return;
    pendingRef.current = null;
    el.scrollLeft = Math.max(0, p.time * pxPerSec - p.ax);
  }, [pxPerSec, scrollRef]);

  return { pxPerSec, pxPerSecRef, zoomTo, zoomIn, zoomOut, zoomFit };
}
