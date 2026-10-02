import request from "./client";

export function signUp({ email, password, username }) {
  return request("/auth/signup", { method: "POST", body: { email, password, username } });
}

export function logIn({ email, password }) {
  return request("/auth/login", { method: "POST", body: { email, password } });
}

export function googleAuth(idToken) {
  return request("/auth/google", { method: "POST", body: { idToken } });
}

export function forgotPassword(email) {
  return request("/auth/forgot-password", { method: "POST", body: { email } });
}

export function resetPassword({ email, code, newPassword }) {
  return request("/auth/reset-password", {
    method: "POST",
    body: { email, code, newPassword },
  });
}
