import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { setStudentName } from "../store/sessionSlice";
import { setEmail as setCheckoutEmail, setFullName } from "../store/checkoutSlice";
import { initAudio, resumeAudio } from "../audio/spatialAudioEngine";
import StudioDoor from "../components/StudioDoor";
import "./AuthPage.css";

// Same sequence timings as LoginPage, kept in lockstep so both doors feel
// like one consistent mechanism.
const VERIFY_MS = 900;
const OPEN_MS = 550;
const WELCOME_MS = 1050;
const NAVIGATE_MS = 900;

// The header's own nav already carries a theme toggle on this route, so
// this page only needs a way back — rendered as a proper icon button
// (rather than a plain "← Back" text link) to match the rest of the
// shell's circular icon buttons (theme toggle, log-off).
function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | verifying | granted | opening
  const [showWelcome, setShowWelcome] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (phase !== "idle") return;

    // Browsers only allow audio to start from within a real user gesture —
    // this click is the most reliable place to unlock it for the whole app.
    initAudio();
    resumeAudio();

    setPhase("verifying");
    let t = VERIFY_MS;
    timers.current.push(setTimeout(() => setPhase("granted"), t));
    t += OPEN_MS;
    timers.current.push(setTimeout(() => setPhase("opening"), t));
    t += WELCOME_MS;
    timers.current.push(setTimeout(() => setShowWelcome(true), t));
    t += NAVIGATE_MS;
    timers.current.push(
      setTimeout(() => {
        const trimmedName = name.trim();
        dispatch(setStudentName(trimmedName || email.split("@")[0] || "Student"));
        // Hand the new account details to checkout so PaymentPage opens
        // pre-filled instead of asking the person to type them twice.
        dispatch(setFullName(trimmedName));
        dispatch(setCheckoutEmail(email));
        navigate("/payment");
      }, t)
    );
  };

  const busy = phase !== "idle";

  return (
    <div className="svr-auth">
      <div className="auth-backdrop" />
      <div className="auth-grain" />

      <Link to="/" className="auth-back" aria-label="Back to home" title="Back to home">
        <BackIcon />
      </Link>

      <div className="auth-stage">
        <StudioDoor phase={phase} sublabel="New account" />

        <div className="auth-panel">
          <div className="auth-panel-top">
            <div className="auth-panel-title">
              Studio<span>VR</span>
            </div>
            <div className={`status-dot${phase === "verifying" ? " pending" : ""}${phase === "granted" || phase === "opening" ? " granted" : ""}`} />
          </div>
          <p className="auth-panel-sub">Create a membership to get your own key to the studio.</p>

          <form onSubmit={handleSubmit} noValidate>
            <label className="auth-field-label" htmlFor="signup-name">
              Full name
            </label>
            <input
              id="signup-name"
              className="auth-field"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              autoFocus
            />

            <label className="auth-field-label" htmlFor="signup-email">
              Email
            </label>
            <input
              id="signup-email"
              className="auth-field"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />

            <label className="auth-field-label" htmlFor="signup-password">
              Passcode
            </label>
            <input
              id="signup-password"
              className="auth-field"
              type="password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />

            <label className="auth-field-label" htmlFor="signup-confirm">
              Confirm passcode
            </label>
            <input
              id="signup-confirm"
              className="auth-field"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />

            <button className="auth-unlock-btn" type="submit" disabled={busy}>
              {busy ? "Unlocking…" : "Request access →"}
            </button>

            <div className={`auth-readout${phase === "granted" || phase === "opening" ? " success" : ""}`}>
              {phase === "idle" && "Panel ready"}
              {phase === "verifying" && "Creating your key…"}
              {(phase === "granted" || phase === "opening") && "Access granted"}
            </div>
          </form>

          <div className="auth-fineprint">
            Already a member? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>

      <div className={`auth-welcome${showWelcome ? " show" : ""}`}>
        <h1>Welcome to Studio VR.</h1>
        <p>Continuing to checkout →</p>
      </div>
    </div>
  );
}

export default SignupPage;
