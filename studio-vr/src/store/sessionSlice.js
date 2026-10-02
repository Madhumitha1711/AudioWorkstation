import { createSlice } from "@reduxjs/toolkit";

const STORAGE_KEY = "svr-session";

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
  hasPaid: persisted?.hasPaid || false,
  token: persisted?.token || null,
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setStudentName(state, action) {
      state.studentName = action.payload;
    },
    setSession(state, action) {
      state.studentName = action.payload.studentName;
      state.email = action.payload.email ?? state.email;
      state.token = action.payload.token;
      state.hasPaid = Boolean(action.payload.hasPaid);
    },
    markPaid(state) {
      state.hasPaid = true;
    },
    setHasPaid(state, action) {
      state.hasPaid = Boolean(action.payload);
    },
    logOff(state) {
      state.studentName = "";
      state.token = null;
    },
  },
});

export const { setStudentName, setSession, markPaid, setHasPaid, logOff } =
  sessionSlice.actions;
export default sessionSlice.reducer;
