import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { setStudentName } from "../store/sessionSlice";
import { initAudio, resumeAudio } from "../audio/spatialAudioEngine";
import { ThemeToggle } from "../theme/ThemeToggle";

function LoginPage() {
  const [name, setName] = useState("");
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    // Browsers only allow audio to start from within a real user gesture —
    // this click is the most reliable place to unlock it for the whole app.
    initAudio();
    resumeAudio();
    dispatch(setStudentName(name.trim() || "Student"));
    navigate("/studio");
  };

  return (
    <div style={containerStyle}>
      <button onClick={() => navigate("/")} style={backButtonStyle}>
        ← Back
      </button>
      <ThemeToggle style={themeToggleStyle} />

      <form onSubmit={handleSubmit} style={cardStyle}>
        <div style={badgeStyle}>◎</div>
        <h2 style={titleStyle}>Welcome</h2>
        <p style={subtitleStyle}>
          Enter your name to start exploring the studio.
        </p>

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          style={inputStyle}
        />

        <button type="submit" style={submitButtonStyle}>
          Continue to studio →
        </button>
      </form>
    </div>
  );
}

const containerStyle = {
  position: "relative",
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--shell-page-bg)",
  fontFamily: "sans-serif",
};

const backButtonStyle = {
  position: "absolute",
  top: "20px",
  left: "20px",
  background: "none",
  border: "none",
  color: "var(--shell-text-dim)",
  fontSize: "13px",
  cursor: "pointer",
};

const themeToggleStyle = {
  position: "absolute",
  top: "20px",
  right: "20px",
  width: "30px",
  height: "30px",
  borderRadius: "50%",
  border: "1px solid var(--shell-border-soft)",
  background: "var(--shell-panel)",
  color: "var(--shell-text-dim)",
  justifyContent: "center",
};

const cardStyle = {
  width: "320px",
  background: "var(--shell-panel)",
  border: "1px solid var(--shell-border)",
  borderRadius: "14px",
  padding: "32px 28px",
  textAlign: "center",
  color: "var(--shell-text)",
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  background: "var(--shell-gradient-accent)",
  color: "var(--shell-accent-ink)",
  fontSize: "22px",
  fontWeight: 700,
  marginBottom: "14px",
};

const titleStyle = {
  margin: "0 0 6px",
  fontSize: "20px",
};

const subtitleStyle = {
  margin: "0 0 20px",
  fontSize: "13px",
  opacity: 0.65,
  lineHeight: 1.5,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 14px",
  marginBottom: "16px",
  background: "var(--shell-panel-hover)",
  border: "1px solid var(--shell-border)",
  borderRadius: "8px",
  color: "var(--shell-text)",
  fontSize: "14px",
  outline: "none",
};

const submitButtonStyle = {
  width: "100%",
  padding: "11px 0",
  background: "var(--shell-gradient-accent)",
  color: "var(--shell-accent-ink)",
  border: "none",
  borderRadius: "999px",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

export default LoginPage;
