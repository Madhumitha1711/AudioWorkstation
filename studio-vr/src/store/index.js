import { configureStore } from "@reduxjs/toolkit";
import checkoutReducer from "./checkoutSlice";
import sessionReducer from "./sessionSlice";
import controlRoomReducer from "./controlRoomSlice";

export const store = configureStore({
  reducer: {
    checkout: checkoutReducer,
    session: sessionReducer,
    controlRoom: controlRoomReducer,
  },
});
