function Header({ screen, studentName, onNavigateHome }) {
  // Landing, payment, and course screens ship their own headers, so the
  // shared app chrome only needs to appear for login and the studio itself.
  if (screen === "landing" || screen === "payment" || screen === "course") {
    return null;
  }

  return (
    <header style={containerStyle}>
      <div style={brandStyle}>
        <span style={logoMarkStyle}>◎</span>
      </div>

      <div style={rightStyle}>
        {screen === "studio" && (
          <>
            {studentName && (
              <span style={greetingStyle}>Hi, {studentName}</span>
            )}
            <button onClick={onNavigateHome} style={exitButtonStyle}>
              Exit to home
            </button>
          </>
        )}
        {screen !== "studio" && (
          <span style={taglineStyle}>Learn audio engineering in 360°</span>
        )}
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
  background: "rgba(8, 9, 12, 0.92)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  fontFamily: "sans-serif",
  color: "#fff",
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
  background: "radial-gradient(circle at 32% 28%, #7dffb8, #17c76a 70%)",
  color: "#04160a",
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
  background: "rgba(255,255,255,0.08)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: "999px",
  fontSize: "12.5px",
  fontWeight: 600,
  cursor: "pointer",
};

export default Header;
