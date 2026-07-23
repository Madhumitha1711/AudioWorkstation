import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { setSession } from "../store/sessionSlice";
import { initAudio, resumeAudio } from "../audio/spatialAudioEngine";
import { logIn, googleAuth } from "../api/auth";
import StudioDoor from "../components/StudioDoor";
import GoogleAuthButton from "../components/GoogleAuthButton";
import "./AuthPage.css";

// Sequence timings (ms) for the unlock → door-open → welcome → navigate
// chain. Kept in one place so LoginPage and SignupPage stay in lockstep.
// MIN_VERIFY_MS is a floor, not a fixed delay: the real API call runs
// alongside it (see runVerify below), so a slow network still shows
// "Verifying credentials…" for as long as it actually takes, while a fast
// local response still gets to play the same minimum beat of animation.
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

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | verifying | granted | opening
  const [showWelcome, setShowWelcome] = useState(false);
  const [error, setError] = useState("");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // RequireAuth (see components/RequireAuth.jsx) redirects here with
  // `state: { from: location }` when an unauthenticated visit to a
  // member-only route (e.g. /studio) gets bounced — landing back on the
  // page the student actually wanted instead of always dropping them at
  // /studio.
  const from = location.state?.from?.pathname || "/studio";

  // Runs the shared unlock → open → welcome beats once credentials (or a
  // Google credential) have actually been accepted by the server, then
  // hands the resolved session off to the caller to dispatch + navigate.
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

  const finishLogin = (result, fallbackName) => {
    dispatch(
      setSession({
        studentName: result.user.username || fallbackName,
        token: result.token,
      }),
    );
    navigate(from, { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (phase !== "idle") return;

    // Browsers only allow audio to start from within a real user gesture —
    // this click is the most reliable place to unlock it for the whole app.
    initAudio();
    resumeAudio();

    setError("");
    setPhase("verifying");

    let result;
    try {
      [result] = await Promise.all([logIn({ email, password }), sleep(MIN_VERIFY_MS)]);
    } catch (err) {
      if (mounted.current) {
        setError(err.message || "Couldn't sign in. Check your email and passcode.");
        setPhase("idle");
      }
      return;
    }

    const ok = await runUnlockSequence();
    if (!ok) return;
    finishLogin(result, email.split("@")[0] || "Student");
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
        setError(err.message || "Google sign-in failed. Please try again.");
        setPhase("idle");
      }
      return;
    }

    const ok = await runUnlockSequence();
    if (!ok) return;
    finishLogin(result, result.user.email.split("@")[0] || "Student");
  };

  const handleGoogleError = (message) => {
    setError(message);
  };

  const busy = phase !== "idle";
  const justReset = location.state?.justReset;

  return (
    <div className="svr-auth">
      <div className="auth-backdrop" />
      <div className="auth-grain" />

      <Link to="/" className="auth-back" aria-label="Back to home" title="Back to home">
        <BackIcon />
      </Link>

      <div className="auth-stage">
        <StudioDoor phase={phase} sublabel="Member entry" />

        <div className="auth-panel">
          <div className="auth-panel-top">
            <div className="auth-panel-title">
              Studio<span>VR</span>
            </div>
            <div className={`status-dot${phase === "verifying" ? " pending" : ""}${phase === "granted" || phase === "opening" ? " granted" : ""}`} />
          </div>
          <p className="auth-panel-sub">
            {justReset ? "Passcode updated — sign in with your new passcode." : "Sign in to step back into the studio."}
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <label className="auth-field-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              className="auth-field"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              autoFocus
            />

            <label className="auth-field-label" htmlFor="login-password">
              Passcode
            </label>
            <input
              id="login-password"
              className="auth-field"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />

            <div className="auth-forgot-row">
              <Link to="/forgot-password" className="auth-link-inline">
                Forgot your passcode?
              </Link>
            </div>

            <button className="auth-unlock-btn" type="submit" disabled={busy}>
              {busy ? "Unlocking…" : "Unlock door →"}
            </button>

            <div className={`auth-readout${error ? " error" : ""}${phase === "granted" || phase === "opening" ? " success" : ""}`}>
              {phase === "idle" && (error || "Panel ready")}
              {phase === "verifying" && "Verifying credentials…"}
              {(phase === "granted" || phase === "opening") && "Access granted"}
            </div>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <GoogleAuthButton onCredential={handleGoogleCredential} onError={handleGoogleError} disabled={busy} />

          <div className="auth-fineprint">
            New to Studio VR?{" "}
            <Link to="/signup" state={location.state?.from ? { from: location.state.from } : undefined}>
              Create an account
            </Link>
          </div>
        </div>
      </div>

      <div className={`auth-welcome${showWelcome ? " show" : ""}`}>
        <h1>Door&rsquo;s unlocked.</h1>
        <p>Entering the studio →</p>
      </div>
    </div>
  );
}

export default LoginPage;
