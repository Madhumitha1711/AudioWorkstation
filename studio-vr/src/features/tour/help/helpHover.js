export function quickHelpHoverProps(onQuickHelp, text) {
  if (!onQuickHelp || !text) return {};
  return {
    onMouseEnter: () => onQuickHelp(text),
    onMouseLeave: () => onQuickHelp(null),
    onFocus: () => onQuickHelp(text),
    onBlur: () => onQuickHelp(null),
  };
}
