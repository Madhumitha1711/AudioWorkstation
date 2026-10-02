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

const SESSION_STORAGE_KEY = "svr-session";
let lastPersisted;
store.subscribe(() => {
  const { studentName, hasPaid, token } = store.getState().session;
  const next = JSON.stringify({ studentName, hasPaid, token });
  if (next === lastPersisted) return;
  lastPersisted = next;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, next);
  } catch {
  }
});
