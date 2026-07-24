import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "../theme/ThemeToggle";
import "./LandingPage.css";

const TOPICS = [
  { num: "01", title: "Studio Monitors", desc: "Nearfield vs midfield, ported vs sealed design, crossovers." },
  { num: "02", title: "Mixing Console", desc: "Channel strips, analog summing, bus routing, talkback." },
  { num: "03", title: "DAW Workstation", desc: "Recall, non-destructive editing, plugins vs outboard gear." },
  { num: "04", title: "Patch Bay", desc: "Normalled routing, balanced cabling, recall speed." },
  { num: "05", title: "Preamp Rack", desc: "Gain staging, transformer vs solid-state coloration." },
  { num: "06", title: "Acoustic Diffuser", desc: "Absorption vs diffusion, the reflection-free zone." },
  { num: "07", title: "LF Emitter", desc: "Room modes, subwoofer placement, bass management." },
  { num: "08", title: "Sound Card", desc: "A/D conversion, sample rate & bit depth, clocking." },
];

const HOW_STEPS = [
  { step: "1", title: "Preview free", desc: "Watch the intro video and browse the curriculum before signing up." },
  { step: "2", title: "Get access", desc: "Sign up and check out to unlock every lesson and the full VR tour." },
  { step: "3", title: "Explore & learn", desc: "Work through chapters at your pace, then step into the studio in 360°." },
];

function LandingPage() {
  const navigate = useNavigate();
  const [videoOpen, setVideoOpen] = useState(false);
  const rootRef = useRef(null);

  // Sign up now opens the studio door (a short account-creation moment)
  // before handing off to checkout, instead of jumping straight to payment.
  const goToSignUp = () => navigate("/signup");
  const goToSignIn = () => navigate("/login");

  const scrollToCurriculum = () => {
    document.getElementById("curriculum")?.scrollIntoView({ behavior: "smooth" });
  };

  // Fade/slide elements into view the first time they cross into the viewport.
  useEffect(() => {
    const targets = rootRef.current?.querySelectorAll(".reveal") ?? [];
    if (!targets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="svr-landing" ref={rootRef}>
      <header className="land-header">
        <div className="brand">
          <span className="mark">◎</span> Studio VR
        </div>
        <div className="land-nav">
          <button className="btn-ghost" onClick={scrollToCurriculum}>
            Curriculum
          </button>
          <button className="btn-ghost" onClick={goToSignIn}>
            Sign in
          </button>
          <button className="btn-primary" onClick={goToSignUp}>
            Sign up
          </button>
          <ThemeToggle className="theme-toggle-btn" />
        </div>
      </header>

      <section className="hero">
        <div className="eq-decor" aria-hidden="true">
          {Array.from({ length: 32 }).map((_, i) => (
            <span key={i} style={{ "--i": i }} />
          ))}
        </div>
        <div className="hero-inner">
          <div className="eyebrow">An interactive audio engineering course</div>
          <h1>
            Learn a real recording studio by <span>walking through it.</span>
          </h1>
          <p className="lede">
            Explore a fully modeled control room in 360°. Click any piece of gear — the
            console, monitors, patch bay — and get a short lesson exactly where it lives
            in the room.
          </p>
          <div className="hero-ctas">
            <button className="btn-primary" onClick={goToSignUp}>
              Sign up — get access →
            </button>
            <button className="btn-secondary" onClick={goToSignIn}>
              Sign in
            </button>
          </div>
          <div className="hero-meta">
            <span>
              <b>8</b> interactive hotspots
            </span>
            <span>
              <b>2</b> rooms
            </span>
            <span>
              <b>360°</b> VR tour
            </span>
            <span>
              <b>Self-paced</b>
            </span>
          </div>
        </div>

        <div className="preview-card">
          <div className="video-frame" onClick={() => setVideoOpen(true)}>
            <img src="/paranoma.png" alt="Studio preview" />
            <div className="scrim" />
            <div className="play-btn" />
            <div className="vlabel">
              Watch the 90-second preview <span className="dur">· 1:30</span>
            </div>
          </div>
          <div className="preview-caption">See what a lesson looks like before you sign up</div>
        </div>
      </section>

      <section className="section" id="curriculum">
        <div className="section-head reveal">
          <div className="eyebrow" style={{ textAlign: "center" }}>
            What you'll explore
          </div>
          <h2>One control room. Eight real lessons.</h2>
          <p>
            Every hotspot below is a short lesson tied to real gear — walk up to it in
            the 360° tour and it opens automatically.
          </p>
        </div>
        <div className="curriculum-grid">
          {TOPICS.map((topic, i) => (
            <div
              className="topic-card reveal"
              key={topic.num}
              style={{ transitionDelay: `${(i % 4) * 70}ms` }}
            >
              <div className="num">{topic.num}</div>
              <div className="lock">🔒</div>
              <h3>{topic.title}</h3>
              <p>{topic.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="section-head reveal">
          <h2>How it works</h2>
        </div>
        <div className="how-grid">
          {HOW_STEPS.map((s, i) => (
            <div className="how-step reveal" key={s.step} style={{ transitionDelay: `${i * 90}ms` }}>
              <div className="step-mark">{s.step}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="cta-band reveal">
        <h2>Ready to step into the studio?</h2>
        <p>Full curriculum, narrated lessons, and the 360° tour — all in one sign up.</p>
        <button className="btn-primary" onClick={goToSignUp}>
          Sign up — get access →
        </button>
      </div>

      <div className="land-footer">© 2026 Studio VR. An interactive audio engineering course.</div>

      {videoOpen && (
        <div className="modal-backdrop" onClick={() => setVideoOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setVideoOpen(false)}>
              ✕
            </button>
            <div className="video-modal-body">
              <img src="/paranoma.png" alt="" />
              <div className="center-note">
                <div className="play-btn" style={{ position: "static" }} />
                <p>90-second preview of the studio tour and a sample lesson would play here.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LandingPage;
