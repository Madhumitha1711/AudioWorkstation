import { GoogleLogin } from "@react-oauth/google";

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

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
