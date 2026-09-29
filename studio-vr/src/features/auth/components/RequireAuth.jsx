import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";

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
