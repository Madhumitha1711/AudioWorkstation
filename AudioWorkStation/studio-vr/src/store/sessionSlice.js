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
  },
});

export const { setStudentName, markPaid } = sessionSlice.actions;
export default sessionSlice.reducer;
