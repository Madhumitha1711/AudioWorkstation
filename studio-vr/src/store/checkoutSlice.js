import { createSlice } from "@reduxjs/toolkit";

// Single lifetime-access price. Card capture is intentionally not handled
// here — checkout hands off to an external payment gateway.
export const PRICE = 199;

const initialState = {
  // Prefilled from the signed-in student's account (see PaymentPage,
  // which reads state.session.email) once they land here — a visitor no
  // longer creates an account at checkout, they've already signed
  // up/logged in before reaching /payment (see RequireAuth,
  // LoginPage/SignupPage's post-auth redirect).
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
