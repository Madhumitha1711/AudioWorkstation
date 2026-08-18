import { createSlice } from "@reduxjs/toolkit";
import { logOff } from "./sessionSlice";

// Whether the Control Room rig is powered up. Lives in Redux — rather than
// component state or a ref inside StudioHotspotsPanel — specifically so it
// survives everything a purely local flag wouldn't: walking between rooms,
// Game/Classic mode toggles, and even navigating away to /course or
// /discussion and back (which unmounts/remounts PanoramaTour entirely,
// wiping any local state or ref it held). Once `powered` is true it's meant
// to stay true everywhere in the app until the visitor explicitly hits
// "Power down" (see powerDown below) or logs off (see the logOff case in
// extraReducers) — those are the only two things allowed to turn it back
// off.
//
// Toggling Game mode on/off does NOT dispatch either action here — Game
// mode only changes what's *shown* (the rig visually powers down for the
// shuffle challenge, then back up again on toggling out, since this flag
// never moved while Game mode was on). See StudioHotspotsPanel's
// toggleGameMode for that half of the behavior.
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
    // Logging off ends the session the same way an explicit Power down
    // would — the rig shouldn't still read as powered for whoever signs in
    // next.
    builder.addCase(logOff, (state) => {
      state.powered = false;
    });
  },
});

export const { powerUp, powerDown } = controlRoomSlice.actions;
export default controlRoomSlice.reducer;
