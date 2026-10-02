import { createSlice } from "@reduxjs/toolkit";

export const PRICE = 199;

const initialState = {
  email: "",
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
