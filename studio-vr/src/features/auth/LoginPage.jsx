import { useState } from "react";
import { Link } from "react-router-dom";
import { logIn } from "../../api/auth";
import { DoorAuthPage, SwitchLink } from "./components/DoorAuthPage";
import { useDoorAuth, emailName } from "./components/useDoorAuth";
import { AuthField } from "./components/AuthFrame";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const auth = useDoorAuth();
  const { busy, location } = auth;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (busy) return;
    auth.authenticate(() => logIn({ email, password }), "Couldn't sign in. Check your email and passcode.", () => emailName(email));
  };

  return (
    <DoorAuthPage
      auth={auth}
      sublabel="Member entry"
      sub={location.state?.justReset ? "Passcode updated — sign in with your new passcode." : "Sign in to step back into the studio."}
      onSubmit={handleSubmit}
      submitLabel="Unlock door →"
      verifyingText="Verifying credentials…"
      googleFailMsg="Google sign-in failed. Please try again."
      welcomeTitle="Door’s unlocked."
      footer={<>New to Studio VR? <SwitchLink to="/signup" location={location}>Create an account</SwitchLink></>}
    >
      <AuthField id="login-email" label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} autoFocus />
      <AuthField id="login-password" label="Passcode" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
      <div className="auth-forgot-row">
        <Link to="/forgot-password" className="auth-link-inline">
          Forgot your passcode?
        </Link>
      </div>
    </DoorAuthPage>
  );
}

export default LoginPage;
