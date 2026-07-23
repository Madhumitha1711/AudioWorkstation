// Thin fetch wrapper shared by every auth API call (src/api/auth.js): JSON
// in/out, attaches a bearer token when one is passed, and throws an Error
// whose `.message` is the backend's own error message — Nest's default
// exception filter puts that in `message` (a string, or an array of
// class-validator messages for a failed DTO) — so callers can show it
// directly instead of a generic "something went wrong".
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

export async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message;
    throw new Error(message || `Request failed (${res.status})`);
  }

  return data;
}

export default request;
