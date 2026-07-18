import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  studentName: "",
  hasPaid: false,
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    setStudentName(state, action) {
      state.studentName = action.payload;
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
    },
  },
});

export const { setStudentName, markPaid, logOff } = sessionSlice.actions;
export default sessionSlice.reducer;
