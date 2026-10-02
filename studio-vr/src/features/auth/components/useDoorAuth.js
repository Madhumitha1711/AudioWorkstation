import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useLocation } from "react-router-dom";
import { setSession } from "../../../store/sessionSlice";
import { initAudio, resumeAudio } from "../../../audio/spatialAudioEngine";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const emailName = (email) => email.split("@")[0] || "Student";

export function useDoorAuth() {
  const [phase, setPhase] = useState("idle");
  const [showWelcome, setShowWelcome] = useState(false);
  const [error, setError] = useState("");
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const authenticate = async (request, failMsg, fallbackName) => {
    initAudio();
    resumeAudio();
    setError("");
    setPhase("verifying");
    let result;
    try {
      [result] = await Promise.all([request(), sleep(900)]);
    } catch (err) {
      if (mounted.current) {
        setError(err.message || failMsg);
        setPhase("idle");
      }
      return;
    }
    for (const [next, ms] of [["granted", 550], ["opening", 1050], ["welcome", 900]]) {
      if (next === "welcome") setShowWelcome(true);
      else setPhase(next);
      await sleep(ms);
      if (!mounted.current) return;
    }
    dispatch(
      setSession({
        studentName: result.user.username || fallbackName(result),
        email: result.user.email,
        token: result.token,
        hasPaid: result.user.hasPaid,
      }),
    );
    if (!result.user.hasPaid) navigate("/payment", { replace: true, state: { from: location.state?.from } });
    else navigate(location.state?.from?.pathname || "/studio", { replace: true });
  };

  return { phase, busy: phase !== "idle", error, setError, showWelcome, authenticate, location };
}
