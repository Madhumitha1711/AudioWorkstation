import { useCallback, useEffect, useRef } from "react";

export function useInteractOnce(onInteract) {
  const firedRef = useRef(false);
  const onInteractRef = useRef(onInteract);
  useEffect(() => {
    onInteractRef.current = onInteract;
  }, [onInteract]);
  return useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onInteractRef.current?.();
  }, []);
}

export function useInteractOnView(ref, onInteract, threshold) {
  const interact = useInteractOnce(onInteract);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return interact();
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          interact();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, interact, threshold]);
}
