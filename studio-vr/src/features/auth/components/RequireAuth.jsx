import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";

// Gates a route behind a signed-in, *paid* session (see App.jsx: wraps
// /studio, /course, /discussion). Visiting one of these URLs directly —
// typed in, bookmarked, or via back/forward — bounces to /login (no
// token) or /payment (token but hasPaid is false), remembering where the
// student was headed in `location.state.from` so LoginPage/SignupPage/
// PaymentPage can send them straight back afterwards instead of always
// landing on /studio.
//
// This only checks the locally-held token/hasPaid flags, not whether
// they're still accurate — an expired token or a hasPaid that's gone
// stale gets caught by the backend on the first API call that needs it
// (JwtAuthGuard: 401 for a bad/expired token, 403 PAYMENT_REQUIRED for
// hasPaid actually being false server-side). That backend check is the
// real gate; this one is just routing so the UI doesn't render a broken
// page while waiting to find that out. It can't be used to bypass
// payment — only to *reach* a route whose API calls will then fail.
function RequireAuth({ children }) {
  const token = useSelector((state) => state.session.token);
  const hasPaid = useSelector((state) => state.session.hasPaid);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasPaid) {
    return <Navigate to="/payment" state={{ from: location }} replace />;
  }

  return children;
}

export default RequireAuth;
