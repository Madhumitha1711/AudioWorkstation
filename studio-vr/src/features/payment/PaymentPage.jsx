import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { setEmail, setFullName, PRICE } from "../../store/checkoutSlice";
import { setStudentName, setHasPaid, markPaid } from "../../store/sessionSlice";
import { createOrder, verifyPayment, getPaymentStatus } from "../../api/payments";
import { initAudio, resumeAudio } from "../../audio/spatialAudioEngine";
import { ThemeToggle } from "../../theme/ThemeToggle";
import { PaletteSwitcher } from "../../theme/PaletteSwitcher";
import "./PaymentPage.css";

const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

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

  const from = location.state?.from?.pathname || "/studio";

  useEffect(() => {
    if (!token) {
      navigate("/login", { state: { from: location.state?.from }, replace: true });
      return;
    }
    if (!email && sessionEmail) dispatch(setEmail(sessionEmail));
    if (!fullName && studentName) dispatch(setFullName(studentName));
    let cancelled = false;
    getPaymentStatus(token)
      .then((status) => {
        if (cancelled) return;
        dispatch(setHasPaid(status.hasPaid));
        if (status.hasPaid) navigate(from, { replace: true });
      })
      .catch(() => {
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (hasPaid) return null;

  const goBack = () => navigate("/");

  const handleContinue = async (e) => {
    e.preventDefault();
    if (busy) return;

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
            ondismiss: () => setBusy(false),
          },
        });
        checkout.on("payment.failed", (resp) => {
          setError(resp?.error?.description || "Payment failed. Please try again.");
          setBusy(false);
        });
        checkout.open();
        return;
      }

      if (order.gateway === "stripe" && order.checkoutUrl) {
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
          <PaletteSwitcher />
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
