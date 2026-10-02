import { useState } from "react";
import { signUp } from "../../api/auth";
import { DoorAuthPage, SwitchLink } from "./components/DoorAuthPage";
import { useDoorAuth, emailName } from "./components/useDoorAuth";
import { AuthField } from "./components/AuthFrame";

function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const auth = useDoorAuth();
  const { busy, location, setError } = auth;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (password.length < 6) return setError("Passcode must be at least 6 characters.");
    if (password !== confirm) return setError("Passcodes don't match.");
    const trimmedName = name.trim();
    auth.authenticate(
      () => signUp({ email, password, username: trimmedName || undefined }),
      "Couldn't create your account. Please try again.",
      () => trimmedName || emailName(email),
    );
  };

  return (
    <DoorAuthPage
      auth={auth}
      sublabel="New account"
      sub="Create a membership to get your own key to the studio."
      onSubmit={handleSubmit}
      submitLabel="Request access →"
      verifyingText="Creating your key…"
      googleFailMsg="Google sign-up failed. Please try again."
      welcomeTitle="Welcome to Studio VR."
      footer={<>Already a member? <SwitchLink to="/login" location={location}>Sign in</SwitchLink></>}
    >
      <AuthField id="signup-name" label="Username (optional)" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoFocus />
      <AuthField id="signup-email" label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
      <AuthField id="signup-password" label="Passcode" type="password" placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
      <AuthField id="signup-confirm" label="Confirm passcode" type="password" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} />
    </DoorAuthPage>
  );
}

export default SignupPage;
