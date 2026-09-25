import { GoogleLogin } from "@react-oauth/google";

// VITE_GOOGLE_CLIENT_ID must match GOOGLE_CLIENT_ID in studio-backend/.env
// (see .env.example in both projects) — GoogleOAuthProvider in main.jsx is
// given the same value.
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// Renders Google's own "Sign in with Google" button once VITE_GOOGLE_CLIENT_ID
// is set. Until then it shows a disabled placeholder instead of letting
// @react-oauth/google throw on a missing client id, so an unconfigured dev
// environment still renders the rest of the auth page cleanly.
//
// onCredential receives the raw Google ID token string to hand to the
// backend's POST /auth/google (see src/api/auth.js googleAuth()).
function GoogleAuthButton({ onCredential, onError, disabled }) {
  if (!clientId) {
    return (
      <button
        type="button"
        className="auth-google-btn"
        disabled
        title="Set VITE_GOOGLE_CLIENT_ID in studio-vr/.env to enable Google Sign-In"
      >
        Continue with Google
      </button>
    );
  }

  return (
    <div className={`auth-google-wrap${disabled ? " is-disabled" : ""}`}>
      <GoogleLogin
        onSuccess={(credentialResponse) => {
          if (credentialResponse.credential) {
            onCredential(credentialResponse.credential);
          } else {
            onError("Google didn't return a credential. Please try again.");
          }
        }}
        onError={() => onError("Google Sign-In failed. Please try again.")}
        theme="filled_black"
        shape="pill"
        width="252"
      />
    </div>
  );
}

export default GoogleAuthButton;
