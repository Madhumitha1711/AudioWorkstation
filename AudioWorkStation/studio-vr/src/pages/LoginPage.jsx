import { useState } from "react";
import { initAudio, resumeAudio } from "../audio/spatialAudioEngine";

function LoginPage({ onLogin, onBack }) {
  const [name, setName] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // Browsers only allow audio to start from within a real user gesture —
    // this click is the most reliable place to unlock it for the whole app.
    initAudio();
    resumeAudio();
    onLogin(name.trim() || "Student");
  };

  return (
    <div style={containerStyle}>
      <button onClick={onBack} style={backButtonStyle}>
        ← Back
      </button>

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
  background:
    "radial-gradient(ellipse at center, #16181d 0%, #08090b 100%)",
  fontFamily: "sans-serif",
};

const backButtonStyle = {
  position: "absolute",
  top: "20px",
  left: "20px",
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.6)",
  fontSize: "13px",
  cursor: "pointer",
};

const cardStyle = {
  width: "320px",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "14px",
  padding: "32px 28px",
  textAlign: "center",
  color: "#fff",
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  background: "radial-gradient(circle at 32% 28%, #7dffb8, #17c76a 70%)",
  color: "#04160a",
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
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "14px",
  outline: "none",
};

const submitButtonStyle = {
  width: "100%",
  padding: "11px 0",
  background: "radial-gradient(circle at 32% 28%, #7dffb8, #17c76a 70%)",
  color: "#04160a",
  border: "none",
  borderRadius: "999px",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

export default LoginPage;
