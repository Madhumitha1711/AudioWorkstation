import { ThemeToggle } from "../theme/ThemeToggle";

function Header({ pathname, studentName, onNavigateHome }) {
  // Landing, payment, and course pages ship their own headers, so the
  // shared app chrome only needs to appear for login and the studio itself.
  if (pathname === "/" || pathname === "/payment" || pathname === "/course") {
    return null;
  }

  const isStudio = pathname === "/studio";

  return (
    <header style={containerStyle}>
      <div style={brandStyle}>
        <span style={logoMarkStyle}>◎</span>
      </div>

      <div style={rightStyle}>
        {isStudio ? (
          <>
            {studentName && (
              <span style={greetingStyle}>Hi, {studentName}</span>
            )}
            <button onClick={onNavigateHome} style={exitButtonStyle}>
              Exit to home
            </button>
          </>
        ) : (
          <span style={taglineStyle}>Learn audio engineering in 360°</span>
        )}
        <ThemeToggle style={themeToggleStyle} />
      </div>
    </header>
  );
}

const containerStyle = {
  height: "56px",
  minHeight: "56px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 20px",
  background: "var(--shell-bg)",
  borderBottom: "1px solid var(--shell-border-soft)",
  fontFamily: "sans-serif",
  color: "var(--shell-text)",
  zIndex: 10,
  position: "relative",
};

const brandStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const logoMarkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "26px",
  height: "26px",
  borderRadius: "50%",
  background: "var(--shell-gradient-accent)",
  color: "var(--shell-accent-ink)",
  fontSize: "14px",
  fontWeight: 700,
};

const rightStyle = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
};

const greetingStyle = {
  fontSize: "13px",
  opacity: 0.75,
};

const taglineStyle = {
  fontSize: "12.5px",
  opacity: 0.55,
  letterSpacing: "0.01em",
};

const exitButtonStyle = {
  padding: "6px 14px",
  background: "var(--shell-panel)",
  color: "var(--shell-text)",
  border: "1px solid var(--shell-border)",
  borderRadius: "999px",
  fontSize: "12.5px",
  fontWeight: 600,
  cursor: "pointer",
};

const themeToggleStyle = {
  width: "30px",
  height: "30px",
  borderRadius: "50%",
  border: "1px solid var(--shell-border-soft)",
  background: "var(--shell-panel)",
  color: "var(--shell-text-dim)",
  justifyContent: "center",
  flexShrink: 0,
};

export default Header;
