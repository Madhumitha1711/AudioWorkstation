import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { forgotPassword, resetPassword } from "../../api/auth";
import { AuthFrame, AuthField } from "./components/AuthFrame";

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
    <AuthFrame
      backTo="/login"
      backLabel="Back to sign in"
      statusClass={busy ? " pending" : ""}
      sub={step === "request"
        ? "Enter your account email and we'll send a 6-digit verification code."
        : "Enter the code we emailed you and choose a new passcode."}
    >
      {step === "request" ? (
        <form onSubmit={handleRequestCode} noValidate>
          <AuthField id="fp-email" label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} autoFocus required />
          <button className="auth-unlock-btn" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send code →"}
          </button>
          <div className={`auth-readout${error ? " error" : ""}`}>{readout}</div>
        </form>
      ) : (
        <form onSubmit={handleReset} noValidate>
          <AuthField id="fp-code" label="6-digit code" className="auth-code-field" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} autoFocus required />
          <AuthField id="fp-new-password" label="New passcode" type="password" placeholder="At least 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={busy} required />
          <AuthField id="fp-confirm-password" label="Confirm new passcode" type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} required />
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
    </AuthFrame>
  );
}

export default ForgotPasswordPage;
