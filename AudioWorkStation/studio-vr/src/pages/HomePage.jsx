function HomePage({ onEnter }) {
  return (
    <div style={containerStyle}>
      <style>{homeStyles}</style>

      <img src="/paranoma.png" alt="" style={backgroundImageStyle} />
      <div style={vignetteStyle} />

      <div style={contentStyle}>
        <div style={eyebrowStyle}>An interactive audio engineering course</div>
        <h1 style={titleStyle}>Step into the studio</h1>
        <p style={subtitleStyle}>Explore a real recording studio in 360°.</p>

        <button
          onClick={onEnter}
          style={doorButtonStyle}
          aria-label="Enter the studio"
        >
          <span className="home-door">
            <img src="/paranoma.png" alt="" className="home-door__image" />
            <span className="home-door__glow" />
          </span>
          <span style={ctaLabelStyle}>Enter the studio →</span>
        </button>
      </div>
    </div>
  );
}

const homeStyles = `
  .home-door {
    position: relative;
    display: block;
    width: 220px;
    height: 300px;
    margin: 0 auto 22px;
    border-radius: 110px 110px 8px 8px;
    overflow: hidden;
    border: 2px solid rgba(58, 255, 140, 0.55);
    box-shadow:
      0 0 0 6px rgba(0,0,0,0.35),
      0 0 40px rgba(34, 255, 130, 0.35);
    transition: transform 0.25s ease, box-shadow 0.25s ease;
  }
  .home-door__image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 45% 40%;
    filter: brightness(0.85) saturate(1.05);
    transform: scale(1.35);
  }
  .home-door__glow {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(0,0,0,0) 55%,
      rgba(0,0,0,0.55) 100%
    );
  }
  button:hover .home-door {
    transform: translateY(-4px) scale(1.02);
    box-shadow:
      0 0 0 6px rgba(0,0,0,0.35),
      0 0 55px rgba(34, 255, 130, 0.55);
  }
`;

const containerStyle = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  background: "#050507",
};

const backgroundImageStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  filter: "blur(14px) brightness(0.35) saturate(0.8)",
  transform: "scale(1.1)",
};

const vignetteStyle = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(ellipse at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.75) 100%)",
};

const contentStyle = {
  position: "relative",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  padding: "24px",
  fontFamily: "sans-serif",
  color: "#fff",
};

const eyebrowStyle = {
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontSize: "12px",
  fontWeight: 600,
  color: "#7dffb8",
  marginBottom: "14px",
};

const titleStyle = {
  fontSize: "clamp(32px, 6vw, 56px)",
  fontWeight: 700,
  margin: "0 0 14px",
  letterSpacing: "-0.02em",
};

const subtitleStyle = {
  fontSize: "15px",
  lineHeight: 1.6,
  opacity: 0.75,
  maxWidth: "440px",
  margin: "0 0 32px",
};

const doorButtonStyle = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: 0,
  color: "#fff",
  fontFamily: "sans-serif",
};

const ctaLabelStyle = {
  display: "inline-block",
  padding: "12px 28px",
  background: "radial-gradient(circle at 32% 28%, #7dffb8, #17c76a 70%)",
  color: "#04160a",
  borderRadius: "999px",
  fontWeight: 700,
  fontSize: "14px",
};

export default HomePage;
