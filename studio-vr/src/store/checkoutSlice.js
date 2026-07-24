import { createSlice } from "@reduxjs/toolkit";

// Single lifetime-access price. Card capture is intentionally not handled
// here — checkout hands off to an external payment gateway.
export const PRICE = 199;

const initialState = {
  email: "gautamnivas@gmail.com",
  fullName: "",
};

const checkoutSlice = createSlice({
  name: "checkout",
  initialState,
  reducers: {
    setEmail(state, action) {
      state.email = action.payload;
    },
    setFullName(state, action) {
      state.fullName = action.payload;
    },
  },
});

export const { setEmail, setFullName } = checkoutSlice.actions;
export default checkoutSlice.reducer;
