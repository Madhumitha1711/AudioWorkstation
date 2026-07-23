import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { setEmail, setFullName, PRICE } from "../store/checkoutSlice";
import { setStudentName, setHasPaid, markPaid } from "../store/sessionSlice";
import { createOrder, verifyPayment, getPaymentStatus } from "../api/payments";
import { initAudio, resumeAudio } from "../audio/spatialAudioEngine";
import { ThemeToggle } from "../theme/ThemeToggle";
import "./PaymentPage.css";

const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

// Razorpay Checkout only exposes `window.Razorpay` once its script tag has
// loaded — this loads it on demand (once) rather than unconditionally on
// every page, since a Stripe-configured backend never needs it at all.
let razorpayScriptPromise = null;
function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load the payment widget. Check your connection and try again."));
    document.body.appendChild(script);
  });
  return razorpayScriptPromise;
}

function PaymentPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { email, fullName } = useSelector((state) => state.checkout);
  const { token, studentName, email: sessionEmail, hasPaid } = useSelector(
    (state) => state.session,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Where to send the student once payment completes — set by RequireAuth
  // when it bounced them here, or forwarded through by LoginPage/SignupPage
  // when a freshly-authenticated-but-unpaid student lands here directly.
  const from = location.state?.from?.pathname || "/studio";

  useEffect(() => {
    // No session at all — checkout needs an authenticated request to
    // create-order/verify, so there's nothing to do here without one.
    if (!token) {
      navigate("/login", { state: { from: location.state?.from }, replace: true });
      return;
    }
    // First visit after signup/login — nothing typed yet, so prefill from
    // the account instead of leaving these fields blank.
    if (!email && sessionEmail) dispatch(setEmail(sessionEmail));
    if (!fullName && studentName) dispatch(setFullName(studentName));
    // Defensive re-check against the backend rather than trusting the
    // locally-persisted flag — covers "paid on another device/tab" or a
    // stale localStorage entry. The real gate is still server-side
    // (JwtAuthGuard); this just avoids showing checkout to someone who
    // doesn't need it.
    let cancelled = false;
    getPaymentStatus(token)
      .then((status) => {
        if (cancelled) return;
        dispatch(setHasPaid(status.hasPaid));
        if (status.hasPaid) navigate(from, { replace: true });
      })
      .catch(() => {
        // If the check itself fails (offline, token just expired, etc.)
        // just let them attempt checkout — worst case create-order 401s
        // and they see a clear error instead of a silent redirect loop.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (hasPaid) return null; // navigating away this render, avoid a flash of the form

  const goBack = () => navigate("/");

  const handleContinue = async (e) => {
    e.preventDefault();
    if (busy) return;

    // Payment submit is a real user gesture — the safest place to unlock
    // the spatial audio context for the studio experience that follows.
    initAudio();
    resumeAudio();
    dispatch(setStudentName(fullName.trim() || email.split("@")[0] || "Student"));

    setError("");
    setBusy(true);
    try {
      const order = await createOrder(token, from);

      if (order.gateway === "razorpay") {
        await loadRazorpayScript();
        const checkout = new window.Razorpay({
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amount,
          currency: order.currency,
          name: "Studio VR",
          description: "Full course access — lifetime",
          prefill: { email, name: fullName },
          theme: { color: "#17c76a" },
          handler: async (response) => {
            try {
              await verifyPayment(token, {
                gatewayOrderId: response.razorpay_order_id,
                gatewayPaymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              });
              dispatch(markPaid());
              navigate(from, { replace: true });
            } catch (err) {
              setError(err.message || "We couldn't confirm your payment. If you were charged, contact support.");
              setBusy(false);
            }
          },
          modal: {
            // Razorpay's own modal was dismissed without completing —
            // not an error, just let the student try again.
            ondismiss: () => setBusy(false),
          },
        });
        checkout.on("payment.failed", (resp) => {
          setError(resp?.error?.description || "Payment failed. Please try again.");
          setBusy(false);
        });
        checkout.open();
        return; // busy stays true until the modal's handler/ondismiss fires
      }

      if (order.gateway === "stripe" && order.checkoutUrl) {
        // Full page redirect to Stripe's hosted Checkout — the browser
        // leaves this app entirely until Stripe sends it back to
        // /payment/complete (see PaymentCompletePage), so there's nothing
        // more to do here on success; only the busy/error state matters if
        // the redirect itself fails to happen.
        window.location.href = order.checkoutUrl;
        return;
      }

      throw new Error("Payment gateway returned an unexpected response.");
    } catch (err) {
      setError(err.message || "Couldn't start checkout. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="svr-payment">
      <div className="pay-topbar">
        <button className="btn-ghost" onClick={goBack}>
          ← Back
        </button>
        <div className="pay-steps">
          <span className="on">Account</span>
          <span className="dot" />
          <span className="on">Payment</span>
          <span className="dot" />
          <span>Start course</span>
        </div>
        <div className="pay-topbar-right">
          <ThemeToggle className="theme-toggle-btn" />
          <span className="brand-mark">◎</span>
        </div>
      </div>

      <div className="pay-wrap">
        <div className="order-card">
          <div className="order-thumb">
            <span className="tag">Full access</span>
            <img src="/paranoma.png" alt="" />
          </div>
          <h3>Studio VR — Audio Engineering</h3>
          <div className="sub">8 lessons · 360° VR studio tour · lifetime access</div>
          <ul className="includes">
            <li>Full curriculum, all 8 hotspot lessons</li>
            <li>Narrated audio for every lesson</li>
            <li>360° interactive VR studio tour</li>
            <li>Progress tracking across chapters</li>
          </ul>
          <div className="order-line">
            <span>Course access</span>
            <span>${PRICE.toFixed(2)}</span>
          </div>
          <div className="order-line">
            <span>Tax</span>
            <span>$0.00</span>
          </div>
          <div className="order-line total">
            <span>Total</span>
            <span>${PRICE.toFixed(2)}</span>
          </div>
        </div>

        <form className="pay-form" onSubmit={handleContinue}>
          <h2>Confirm your details</h2>

          <label className="form-label">Email</label>
          <input
            className="field"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => dispatch(setEmail(e.target.value))}
            disabled={busy}
            required
          />

          <label className="form-label">Full name</label>
          <input
            className="field"
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => dispatch(setFullName(e.target.value))}
            disabled={busy}
            required
          />

          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? "Opening secure checkout…" : `Continue to payment — $${PRICE.toFixed(2)} →`}
          </button>
          {error && <div className="pay-error">{error}</div>}
          <div className="secure-note">🔒 You'll complete payment on our secure checkout.</div>
        </form>
      </div>
    </div>
  );
}

export default PaymentPage;
