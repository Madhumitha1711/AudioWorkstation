import { createSlice } from "@reduxjs/toolkit";

// Screens: "landing" | "payment" | "course" | "login" | "studio"
const initialState = {
  screen: "landing",
  // Set when something outside the course screen (e.g. clicking "Start
  // course" on a hotspot in the VR tour) wants the course screen to open
  // directly on a specific topic instead of the default first one.
  pendingTopicId: null,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setScreen(state, action) {
      state.screen = action.payload;
    },
    setPendingTopic(state, action) {
      state.pendingTopicId = action.payload;
    },
  },
});

export const { setScreen, setPendingTopic } = uiSlice.actions;
export default uiSlice.reducer;
