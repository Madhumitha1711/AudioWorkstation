import { useCallback, useSyncExternalStore } from "react";

export const DRAWER_QUERY = "(max-width: 960px)";

export function useMediaQuery(query) {
  const subscribe = useCallback(
    (notify) => {
      const mq = window.matchMedia?.(query);
      if (!mq) return () => {};
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    [query],
  );
  const getSnapshot = () => !!window.matchMedia?.(query).matches;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
