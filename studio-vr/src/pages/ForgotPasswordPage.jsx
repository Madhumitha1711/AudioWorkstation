import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { forgotPassword, resetPassword } from "../api/auth";
import "./AuthPage.css";

// Shared with LoginPage/SignupPage so the three auth pages read as one
// consistent icon-button back link.
function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

// Two-step forgot-password flow:
//   "request" — enter email, backend emails a 6-digit code (AWS SES; see
//               studio-backend's MailerService for the local-dev console
//               fallback when SES isn't configured).
//   "reset"   — enter that code plus a new passcode to complete the reset.
// No door animation here (unlike Login/SignupPage) — recovering an account
// isn't the "unlocking the studio" moment the door metaphor represents, so
// this page is just the entry panel on its own.
function ForgotPasswordPage() {
  const [step, setStep] = useState("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();

  const handleRequestCode = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      setNotice(`If ${email.trim()} is registered, a 6-digit code is on its way.`);
      setStep("reset");
    } catch (err) {
      setError(err.message || "Couldn't send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleResendCode = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await forgotPassword(email.trim());
      setNotice("Sent another code — check your inbox.");
    } catch (err) {
      setError(err.message || "Couldn't resend the code.");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");

    if (newPassword.length < 6) {
      setError("Passcode must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passcodes don't match.");
      return;
    }

    setBusy(true);
    try {
      await resetPassword({ email: email.trim(), code: code.trim(), newPassword });
      navigate("/login", { state: { justReset: true } });
    } catch (err) {
      setError(err.message || "Couldn't reset your passcode. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const readout = error || notice || "Panel ready";

  return (
    <div className="svr-auth">
      <div className="auth-backdrop" />
      <div className="auth-grain" />

      <Link to="/login" className="auth-back" aria-label="Back to sign in" title="Back to sign in">
        <BackIcon />
      </Link>

      <div className="auth-stage auth-stage-solo">
        <div className="auth-panel">
          <div className="auth-panel-top">
            <div className="auth-panel-title">
              Studio<span>VR</span>
            </div>
            <div className={`status-dot${busy ? " pending" : ""}`} />
          </div>
          <p className="auth-panel-sub">
            {step === "request"
              ? "Enter your account email and we'll send a 6-digit verification code."
              : "Enter the code we emailed you and choose a new passcode."}
          </p>

          {step === "request" ? (
            <form onSubmit={handleRequestCode} noValidate>
              <label className="auth-field-label" htmlFor="fp-email">
                Email
              </label>
              <input
                id="fp-email"
                className="auth-field"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                autoFocus
                required
              />

              <button className="auth-unlock-btn" type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send code →"}
              </button>

              <div className={`auth-readout${error ? " error" : ""}`}>{readout}</div>
            </form>
          ) : (
            <form onSubmit={handleReset} noValidate>
              <label className="auth-field-label" htmlFor="fp-code">
                6-digit code
              </label>
              <input
                id="fp-code"
                className="auth-field auth-code-field"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy}
                autoFocus
                required
              />

              <label className="auth-field-label" htmlFor="fp-new-password">
                New passcode
              </label>
              <input
                id="fp-new-password"
                className="auth-field"
                type="password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={busy}
                required
              />

              <label className="auth-field-label" htmlFor="fp-confirm-password">
                Confirm new passcode
              </label>
              <input
                id="fp-confirm-password"
                className="auth-field"
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={busy}
                required
              />

              <button className="auth-unlock-btn" type="submit" disabled={busy}>
                {busy ? "Updating…" : "Reset passcode →"}
              </button>

              <div className={`auth-readout${error ? " error" : ""}`}>{readout}</div>

              <div className="auth-fineprint">
                Didn&rsquo;t get a code?{" "}
                <button type="button" className="auth-link-btn" onClick={handleResendCode} disabled={busy}>
                  Resend
                </button>
              </div>
            </form>
          )}

          <div className="auth-fineprint">
            Remembered it? <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
