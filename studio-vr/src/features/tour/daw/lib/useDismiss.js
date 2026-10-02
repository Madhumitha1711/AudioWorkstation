import { useEffect, useRef } from "react";

export function useDismiss(open, isInside, close) {
  const ref = useRef({ isInside, close });
  useEffect(() => {
    ref.current = { isInside, close };
  });
  useEffect(() => {
    if (!open) return;
    const dismiss = () => ref.current.close();
    const onPointerDown = (e) => {
      if (!ref.current.isInside(e.target)) dismiss();
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);
}
