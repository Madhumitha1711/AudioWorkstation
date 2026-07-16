import { configureStore } from "@reduxjs/toolkit";
import uiReducer from "./uiSlice";
import checkoutReducer from "./checkoutSlice";
import sessionReducer from "./sessionSlice";

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    checkout: checkoutReducer,
    session: sessionReducer,
  },
});
