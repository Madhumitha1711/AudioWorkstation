import { configureStore } from "@reduxjs/toolkit";
import checkoutReducer from "./checkoutSlice";
import sessionReducer from "./sessionSlice";

export const store = configureStore({
  reducer: {
    checkout: checkoutReducer,
    session: sessionReducer,
  },
});

// Persists just the bits that need to survive a page reload (sign-in token,
// display name, purchase flag) — everything else (the in-progress checkout
// form, theme) is either transient or already persisted separately (theme
// uses its own localStorage key, see ThemeContext). sessionSlice.js reads
// this same key back on load.
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
    // Storage can fail in private browsing / storage-full situations —
    // the session just won't survive a reload in that case, not fatal.
  }
});
