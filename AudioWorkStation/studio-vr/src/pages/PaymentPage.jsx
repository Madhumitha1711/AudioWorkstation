import { useDispatch, useSelector } from "react-redux";
import { setScreen } from "../store/uiSlice";
import { setEmail, setFullName, PRICE } from "../store/checkoutSlice";
import { setStudentName, markPaid } from "../store/sessionSlice";
import { initAudio, resumeAudio } from "../audio/spatialAudioEngine";
import "./PaymentPage.css";

function PaymentPage() {
  const dispatch = useDispatch();
  const { email, fullName } = useSelector((state) => state.checkout);

  const goBack = () => dispatch(setScreen("landing"));

  const handleContinue = (e) => {
    e.preventDefault();
    // Payment submit is a real user gesture — the safest place to unlock
    // the spatial audio context for the studio experience that follows.
    initAudio();
    resumeAudio();
    dispatch(setStudentName(fullName.trim() || email.split("@")[0] || "Student"));

    // Card capture lives with the external payment gateway, not here.
    // Once that integration is wired up, this is the hand-off point:
    // redirect/open the gateway with { email, fullName, amount: PRICE },
    // then call markPaid() + setScreen("course") from its success callback
    // instead of doing it immediately below.
    dispatch(markPaid());
    dispatch(setScreen("course"));
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
        <span className="brand-mark">◎</span>
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
          <h2>Create your account</h2>

          <label className="form-label">Email</label>
          <input
            className="field"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => dispatch(setEmail(e.target.value))}
            required
          />

          <label className="form-label">Full name</label>
          <input
            className="field"
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => dispatch(setFullName(e.target.value))}
            required
          />

          <button className="btn-primary" type="submit">
            Continue to payment — ${PRICE.toFixed(2)} →
          </button>
          <div className="secure-note">🔒 You'll complete payment on our secure checkout.</div>
        </form>
      </div>
    </div>
  );
}

export default PaymentPage;
