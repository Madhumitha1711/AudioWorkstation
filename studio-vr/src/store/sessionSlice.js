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
    // Sets the signed-in student and their auth token together — dispatched
    // once after a successful signup/login/Google API call.
    setSession(state, action) {
      state.studentName = action.payload.studentName;
      state.token = action.payload.token;
    },
    markPaid(state) {
      state.hasPaid = true;
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

export const { setStudentName, setSession, markPaid, logOff } = sessionSlice.actions;
export default sessionSlice.reducer;
