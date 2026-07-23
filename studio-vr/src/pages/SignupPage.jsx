import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { setSession, markPaid } from "../store/sessionSlice";
import { initAudio, resumeAudio } from "../audio/spatialAudioEngine";
import { signUp, googleAuth } from "../api/auth";
import StudioDoor from "../components/StudioDoor";
import GoogleAuthButton from "../components/GoogleAuthButton";
import "./AuthPage.css";

// Same sequence timings as LoginPage, kept in lockstep so both doors feel
// like one consistent mechanism. See LoginPage.jsx for why MIN_VERIFY_MS is
// a floor raced against the real signup API call rather than a fixed delay.
const MIN_VERIFY_MS = 900;
const OPEN_MS = 550;
const WELCOME_MS = 1050;
const NAVIGATE_MS = 900;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const [error, setError] = useState("");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const runUnlockSequence = async () => {
    setPhase("granted");
    await sleep(OPEN_MS);
    if (!mounted.current) return false;
    setPhase("opening");
    await sleep(WELCOME_MS);
    if (!mounted.current) return false;
    setShowWelcome(true);
    await sleep(NAVIGATE_MS);
    return mounted.current;
  };

  // Payment is out of scope for now (see PaymentPage.jsx's checkout
  // hand-off comment) — a new account goes straight into the studio with
  // full access instead of being routed through checkout first.
  const finishSignup = (result, fallbackName) => {
    dispatch(
      setSession({
        studentName: result.user.username || fallbackName,
        token: result.token,
      }),
    );
    dispatch(markPaid());
    navigate("/studio");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (phase !== "idle") return;

    setError("");

    if (password.length < 6) {
      setError("Passcode must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passcodes don't match.");
      return;
    }

    // Browsers only allow audio to start from within a real user gesture —
    // this click is the most reliable place to unlock it for the whole app.
    initAudio();
    resumeAudio();

    setPhase("verifying");

    const trimmedName = name.trim();
    let result;
    try {
      [result] = await Promise.all([
        signUp({ email, password, username: trimmedName || undefined }),
        sleep(MIN_VERIFY_MS),
      ]);
    } catch (err) {
      if (mounted.current) {
        // studio-backend's AuthService rejects a duplicate email with
        // "User already in database" — surfaced here verbatim.
        setError(err.message || "Couldn't create your account. Please try again.");
        setPhase("idle");
      }
      return;
    }

    const ok = await runUnlockSequence();
    if (!ok) return;
    finishSignup(result, trimmedName || email.split("@")[0] || "Student");
  };

  const handleGoogleCredential = async (idToken) => {
    if (phase !== "idle") return;
    initAudio();
    resumeAudio();
    setError("");
    setPhase("verifying");

    let result;
    try {
      [result] = await Promise.all([googleAuth(idToken), sleep(MIN_VERIFY_MS)]);
    } catch (err) {
      if (mounted.current) {
        setError(err.message || "Google sign-up failed. Please try again.");
        setPhase("idle");
      }
      return;
    }

    const ok = await runUnlockSequence();
    if (!ok) return;
    finishSignup(result, result.user.email.split("@")[0] || "Student");
  };

  const handleGoogleError = (message) => {
    setError(message);
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
              Username (optional)
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

            <div className={`auth-readout${error ? " error" : ""}${phase === "granted" || phase === "opening" ? " success" : ""}`}>
              {phase === "idle" && (error || "Panel ready")}
              {phase === "verifying" && "Creating your key…"}
              {(phase === "granted" || phase === "opening") && "Access granted"}
            </div>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <GoogleAuthButton onCredential={handleGoogleCredential} onError={handleGoogleError} disabled={busy} />

          <div className="auth-fineprint">
            Already a member? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>

      <div className={`auth-welcome${showWelcome ? " show" : ""}`}>
        <h1>Welcome to Studio VR.</h1>
        <p>Entering the studio →</p>
      </div>
    </div>
  );
}

export default SignupPage;
