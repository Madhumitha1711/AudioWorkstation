import { createSlice } from "@reduxjs/toolkit";
import { logOff } from "./sessionSlice";

const initialState = {
  powered: false,
};

const controlRoomSlice = createSlice({
  name: "controlRoom",
  initialState,
  reducers: {
    powerUp(state) {
      state.powered = true;
    },
    powerDown(state) {
      state.powered = false;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(logOff, (state) => {
      state.powered = false;
    });
  },
});

export const { powerUp, powerDown } = controlRoomSlice.actions;
export default controlRoomSlice.reducer;
