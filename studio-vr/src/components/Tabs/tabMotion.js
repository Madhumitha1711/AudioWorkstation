import { useLayoutEffect, useRef } from "react";


export function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function tabDomIds(idPrefix, id) {
  return { tab: `${idPrefix}-tab-${id}`, panel: `${idPrefix}-panel-${id}` };
}

function motionTokens(el) {
  const cs = getComputedStyle(el);
  return {
    duration: parseFloat(cs.getPropertyValue("--motion-panel-duration")) || 440,
    easing: cs.getPropertyValue("--motion-ease-out").trim() || "cubic-bezier(0.16, 1, 0.3, 1)",
    shift: parseFloat(cs.getPropertyValue("--motion-panel-shift")) || 10,
  };
}

export function useTabTransition(ref, activeKey, index) {
  const prev = useRef({ key: activeKey, index });
  useLayoutEffect(() => {
    const p = prev.current;
    prev.current = { key: activeKey, index };
    if (p.key === activeKey) return;
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || prefersReducedMotion()) return;
    const { duration, easing, shift } = motionTokens(el);
    // Interrupted mid-animation → continue from where it visibly is.
    const running = el.getAnimations?.().filter((a) => a.id === "ui-tab-panel") || [];
    const fromOpacity = running.length ? Math.min(1, parseFloat(getComputedStyle(el).opacity) || 0) : 0;
    running.forEach((a) => a.cancel());
    const dir = index == null || p.index == null ? 0 : Math.sign(index - p.index);
    const anim = el.animate(
      [
        { opacity: fromOpacity, transform: `translate3d(${dir * shift}px, ${dir ? 0 : 6}px, 0)` },
        { opacity: 1, transform: "none" },
      ],
      { duration, easing },
    );
    anim.id = "ui-tab-panel";
  }, [ref, activeKey, index]);
}


export function useTabHeightTransition(ref, activeKey) {
  const last = useRef(null);
  const animating = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    last.current = el.offsetHeight;
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      if (!animating.current) last.current = el.offsetHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  const prevKey = useRef(activeKey);
  useLayoutEffect(() => {
    if (prevKey.current === activeKey) return;
    prevKey.current = activeKey;
    const el = ref.current;
    if (!el || typeof el.animate !== "function" || prefersReducedMotion()) return;
    const running = el.getAnimations?.().filter((a) => a.id === "ui-tab-height") || [];
    const from = running.length ? el.offsetHeight : last.current;
    running.forEach((a) => a.cancel());
    const to = el.offsetHeight;
    if (from == null || Math.abs(to - from) < 2) {
      last.current = to;
      return;
    }
    const { duration, easing } = motionTokens(el);
    animating.current = true;
    const prevOverflow = el.style.overflowY;
    el.style.overflowY = "hidden";
    const anim = el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration, easing });
    anim.id = "ui-tab-height";
    const done = () => {
      if (el.getAnimations?.().some((a) => a.id === "ui-tab-height" && a !== anim)) return;
      el.style.overflowY = prevOverflow;
      animating.current = false;
      last.current = el.offsetHeight;
    };
    anim.onfinish = done;
    anim.oncancel = done;
  }, [ref, activeKey]);
}
