// Small shared helper for wiring an element's hover / keyboard-focus into
// the Quick Help popup (see QuickHelpPanel.jsx). `onQuickHelp` is just a
// setState function (e.g. PanoramaTour's `setHelpMessage`) — called with
// `text` on hover/focus and `null` on leave/blur.
//
// Spreading the returned object onto any element is always safe, whether
// or not help mode is currently on: the Quick Help popup only ever renders
// while help mode is on (see PanoramaTour.jsx), so a call made while it's
// off just updates state nothing is reading yet — no extra `helpModeOn`
// check is needed at every call site.
export function quickHelpHoverProps(onQuickHelp, text) {
  if (!onQuickHelp || !text) return {};
  return {
    onMouseEnter: () => onQuickHelp(text),
    onMouseLeave: () => onQuickHelp(null),
    onFocus: () => onQuickHelp(text),
    onBlur: () => onQuickHelp(null),
  };
}
