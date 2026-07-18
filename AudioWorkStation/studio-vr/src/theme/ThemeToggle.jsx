import { useTheme } from "./ThemeContext";
import "./ThemeToggle.css";

// Small icon button that flips light/dark. Deliberately unstyled beyond
// layout/sizing so it can drop into any header (landing, course, payment,
// login/studio) and pick up that header's own button look via className.
function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

export function ThemeToggle({ className = "", style, showLabel = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`svr-theme-toggle ${className}`.trim()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        cursor: "pointer",
        ...style,
      }}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {/* key={theme} forces a remount on every toggle so the CSS entrance
          animation (svr-theme-icon-in) replays each time, instead of only
          on first mount. */}
      <span className="svr-theme-toggle-icon" key={theme}>
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
      {showLabel && <span>{isDark ? "Light" : "Dark"}</span>}
    </button>
  );
}
