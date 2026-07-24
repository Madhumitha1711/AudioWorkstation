import { configureStore } from "@reduxjs/toolkit";
import checkoutReducer from "./checkoutSlice";
import sessionReducer from "./sessionSlice";

export const store = configureStore({
  reducer: {
    checkout: checkoutReducer,
    session: sessionReducer,
  },
});
