import request from "./client";

// Every call resolves to { token, user } on success (matching studio-backend's
// AuthService.AuthResult), or throws an Error with a user-facing message on
// failure — see client.js.

export function signUp({ email, password, username }) {
  return request("/auth/signup", { method: "POST", body: { email, password, username } });
}

export function logIn({ email, password }) {
  return request("/auth/login", { method: "POST", body: { email, password } });
}

// idToken is the Google ID token (a JWT) handed back by Google Identity
// Services after the user picks an account — see GoogleAuthButton.
export function googleAuth(idToken) {
  return request("/auth/google", { method: "POST", body: { idToken } });
}

// Resolves to { message } regardless of whether the email is registered —
// see the backend's AuthService.forgotPassword for why.
export function forgotPassword(email) {
  return request("/auth/forgot-password", { method: "POST", body: { email } });
}

export function resetPassword({ email, code, newPassword }) {
  return request("/auth/reset-password", {
    method: "POST",
    body: { email, code, newPassword },
  });
}
