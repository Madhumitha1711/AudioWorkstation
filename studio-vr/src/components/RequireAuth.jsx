import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";

// Gates a route behind a signed-in session (see App.jsx: wraps /studio,
// /course, /discussion). Visiting one of these URLs directly — typed in,
// bookmarked, or via back/forward — without a token bounces to /login,
// remembering where the student was headed in `location.state.from` so
// LoginPage/SignupPage can send them straight back after signing in
// instead of always landing on /studio.
//
// This only checks whether a token exists, not whether it's still valid —
// an expired/invalid token gets caught by the backend on the first API
// call that needs it, which is enough for now without adding a round-trip
// to /auth/me just to render a route.
function RequireAuth({ children }) {
  const token = useSelector((state) => state.session.token);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default RequireAuth;
