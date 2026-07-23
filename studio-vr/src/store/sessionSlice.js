import { createSlice } from "@reduxjs/toolkit";

const STORAGE_KEY = "svr-session";

// Reads the persisted session (see the store.subscribe() call in
// store/index.js) so a page reload doesn't drop a signed-in student back to
// "logged out" — previously nothing here survived a reload since the whole
// auth flow was simulated client-side with no real token to keep around.
function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const persisted = loadPersisted();

const initialState = {
  studentName: persisted?.studentName || "",
  email: persisted?.email || "",
  // Mirrors studio-backend's User.hasPaid (see /auth/me, /auth/login,
  // /auth/signup, /auth/google — all now return it on the `user` object).
  // This flag only drives frontend routing/UX (RequireAuth, the
  // login/signup redirect target) — it is NOT what keeps the API safe.
  // Every request is still checked against the real hasPaid column on the
  // backend by JwtAuthGuard, so tampering with this in devtools doesn't
  // unlock anything real; it would just send someone to a screen whose
  // API calls then fail with 403 PAYMENT_REQUIRED.
  hasPaid: persisted?.hasPaid || false,
  // JWT returned by studio-backend on signup/login/Google sign-in — sent as
  // an Authorization: Bearer header by src/api/client.js for any endpoint
  // that needs it.
  token: persisted?.token || null,
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setStudentName(state, action) {
      state.studentName = action.payload;
    },
    // Sets the signed-in student, their auth token, and their payment
    // status together — dispatched once after a successful
    // signup/login/Google API call (see AuthResult.user.hasPaid on the
    // backend).
    setSession(state, action) {
      state.studentName = action.payload.studentName;
      state.email = action.payload.email ?? state.email;
      state.token = action.payload.token;
      state.hasPaid = Boolean(action.payload.hasPaid);
    },
    markPaid(state) {
      state.hasPaid = true;
    },
    // Reconciles the local flag with whatever the backend just reported
    // (e.g. GET /payments/status on PaymentPage mount) — a plain boolean
    // rather than always-true like markPaid, since this can also correct a
    // stale "true" back to "false" if that ever happens.
    setHasPaid(state, action) {
      state.hasPaid = Boolean(action.payload);
    },
    logOff(state) {
      // Clears the active student session (nav bar's log-off icon). Purchase
      // status stays put — logging off just ends the current sign-in, it
      // doesn't undo access — so returning to /login picks up where they
      // left off instead of asking them to pay again.
      state.studentName = "";
      state.token = null;
    },
  },
});

export const { setStudentName, setSession, markPaid, setHasPaid, logOff } =
  sessionSlice.actions;
export default sessionSlice.reducer;
