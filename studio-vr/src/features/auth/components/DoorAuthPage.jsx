import { Link } from "react-router-dom";
import { googleAuth } from "../../../api/auth";
import StudioDoor from "./StudioDoor";
import GoogleAuthButton from "./GoogleAuthButton";
import { AuthFrame } from "./AuthFrame";
import { emailName } from "./useDoorAuth";

export function DoorAuthPage({ auth, sublabel, sub, onSubmit, submitLabel, verifyingText, googleFailMsg, welcomeTitle, footer, children }) {
  const { phase, busy, error, setError, showWelcome, authenticate } = auth;
  const unlocked = phase === "granted" || phase === "opening";

  const handleGoogleCredential = (idToken) => {
    if (busy) return;
    authenticate(() => googleAuth(idToken), googleFailMsg, (r) => emailName(r.user.email));
  };

  return (
    <AuthFrame
      door={<StudioDoor phase={phase} sublabel={sublabel} />}
      stageClass={unlocked ? "is-unlocked" : ""}
      statusClass={`${phase === "verifying" ? " pending" : ""}${unlocked ? " granted" : ""}`}
      sub={sub}
      after={
        <div className={`auth-welcome${showWelcome ? " show" : ""}`}>
          <h1>{welcomeTitle}</h1>
          <p>Entering the studio →</p>
        </div>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        {children}
        <button className="auth-unlock-btn" type="submit" disabled={busy}>
          {busy ? "Unlocking…" : submitLabel}
        </button>
        <div className={`auth-readout${error ? " error" : ""}${unlocked ? " success" : ""}`}>
          {phase === "idle" && (error || "Panel ready")}
          {phase === "verifying" && verifyingText}
          {unlocked && "Access granted"}
        </div>
      </form>

      <div className="auth-divider">
        <span>or</span>
      </div>

      <GoogleAuthButton onCredential={handleGoogleCredential} onError={setError} disabled={busy} />

      <div className="auth-fineprint">{footer}</div>
    </AuthFrame>
  );
}

export function SwitchLink({ to, location, children }) {
  return (
    <Link to={to} state={location.state?.from ? { from: location.state.from } : undefined}>
      {children}
    </Link>
  );
}
