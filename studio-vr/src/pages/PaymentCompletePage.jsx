import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { markPaid } from "../store/sessionSlice";
import { verifyPayment } from "../api/payments";
import "./PaymentPage.css";

// Stripe's Checkout success_url lands here after a redirect-based payment
// (see StripeGateway.createOrder on the backend) — Razorpay never uses
// this page since its modal resolves without leaving /payment. `session_id`
// is the Checkout Session id Stripe appends to the URL itself;
// `returnTo` is the route we asked Stripe to carry through (see
// PaymentPage's `from`).
function PaymentCompletePage() {
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((state) => state.session.token);
  const [status, setStatus] = useState("verifying"); // verifying | failed
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode double-invoke guard — don't verify twice
    ran.current = true;

    const sessionId = searchParams.get("session_id");
    const returnTo = searchParams.get("returnTo") || "/studio";

    if (!token || !sessionId) {
      setStatus("failed");
      return;
    }

    verifyPayment(token, { gatewayOrderId: sessionId })
      .then(() => {
        dispatch(markPaid());
        navigate(returnTo, { replace: true });
      })
      .catch(() => setStatus("failed"));
  }, [dispatch, navigate, searchParams, token]);

  return (
    <div className="svr-payment">
      <div className="pay-wrap" style={{ gridTemplateColumns: "1fr", maxWidth: 480, textAlign: "center", marginTop: 120 }}>
        <div className="pay-form">
          {status === "verifying" ? (
            <>
              <h2>Confirming your payment…</h2>
              <div className="secure-note">Hang tight, this only takes a moment.</div>
            </>
          ) : (
            <>
              <h2>We couldn't confirm that payment</h2>
              <div className="pay-error">
                If Stripe charged you, this is usually a delayed confirmation — try refreshing in a minute, or{" "}
                <Link to="/payment">return to checkout</Link> to try again.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PaymentCompletePage;
