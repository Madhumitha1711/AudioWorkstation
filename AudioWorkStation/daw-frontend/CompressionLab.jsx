import { useState, useRef, useEffect } from "react";

/* ─────────────────────────────────────────────────────
   Color tokens (matching SoundCraft Academy palette)
───────────────────────────────────────────────────── */
const C = {
  black:        "#0D0D0F",
  con:          "#141418",
  panel:        "#1A1A22",
  surface:      "#22222E",
  border:       "#2E2E3D",
  borderBright: "#3D3D52",
  amber:        "#F5A623",
  amberDim:     "rgba(245,166,35,0.15)",
  green:        "#00FF87",
  blue:         "#4D9EFF",
  red:          "#FF4D6A",
  purple:       "#A78BFA",
  purpleDim:    "rgba(167,139,250,0.15)",
  text:         "#E8E8EC",
  dim:          "#8A8A9A",
  faint:        "#4A4A5A",
};

/* ─────────────────────────────────────────────────────
   Knob  — drag vertically or scroll to change value
   - SVG arc track (270° range, like a real hardware knob)
   - Glow filter on active arc + indicator dot
   - Mouse drag + wheel + touch support
───────────────────────────────────────────────────── */
function Knob({ id, value, min, max, onChange, label, displayValue, color = C.purple, flat = false }) {
  const svgRef  = useRef(null);
  // Keep a ref so closures inside imperative listeners always see current values
  const live    = useRef({ value, onChange, min, max });
  useEffect(() => { live.current = { value, onChange, min, max }; });

  const norm  = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const CX = 30, CY = 30, R = 22;

  // Convert "degrees from 12-o'clock" → SVG [x, y] at radius r
  function polar(deg, r = R) {
    const rad = (deg - 90) * Math.PI / 180;
    return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
  }

  // SVG arc path from a1° to a2° (clockwise sweep)
  function arc(a1, a2) {
    const [sx, sy] = polar(a1);
    const [ex, ey] = polar(a2);
    const large    = (a2 - a1) > 180 ? 1 : 0;
    return `M${sx.toFixed(2)} ${sy.toFixed(2)} A${R} ${R} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  }

  const angleCur       = -135 + norm * 270;
  const [indX, indY]   = polar(angleCur, 15);
  const tickAngles     = [-135, -67.5, 0, 67.5, 135];

  // ── Mouse drag ──
  function onMouseDown(e) {
    e.preventDefault();
    const startY   = e.clientY;
    const startVal = live.current.value;
    function onMove(ev) {
      const { onChange, min, max } = live.current;
      const dy = startY - ev.clientY; // up = increase
      onChange(Math.max(min, Math.min(max, startVal + (dy / 130) * (max - min))));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }

  // ── Touch drag ──
  function onTouchStart(e) {
    const startY   = e.touches[0].clientY;
    const startVal = live.current.value;
    function onMove(ev) {
      ev.preventDefault();
      const { onChange, min, max } = live.current;
      const dy = startY - ev.touches[0].clientY;
      onChange(Math.max(min, Math.min(max, startVal + (dy / 130) * (max - min))));
    }
    function onEnd() {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend",  onEnd);
    }
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend",  onEnd);
  }

  // ── Wheel (must be imperative to call preventDefault on a passive root) ──
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    function onWheel(e) {
      e.preventDefault();
      const { value, onChange, min, max } = live.current;
      const dir  = e.deltaY < 0 ? 1 : -1;
      const step = (max - min) / 80;
      onChange(Math.max(min, Math.min(max, value + dir * step)));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []); // stable — reads via live ref

  const glowId = `glow_${id}`;
  const gradId = `grad_${id}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg
        ref={svgRef}
        width="68" height="68" viewBox="0 0 60 60"
        style={{ cursor: "ns-resize", userSelect: "none", overflow: "visible", touchAction: "none" }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        <defs>
          <radialGradient id={gradId} cx="35%" cy="28%">
            <stop offset="0%"   stopColor="#2C2C40" />
            <stop offset="60%"  stopColor="#18181F" />
            <stop offset="100%" stopColor="#0C0C12" />
          </radialGradient>
          <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Drop shadow */}
        {!flat && <circle cx={CX} cy={CY + 2.5} r={27} fill="rgba(0,0,0,0.55)" />}

        {/* Knob body */}
        <circle cx={CX} cy={CY} r={27} fill={flat ? C.surface : `url(#${gradId})`} />

        {/* Bevel rim */}
        <circle cx={CX} cy={CY} r={27} fill="none" stroke={C.borderBright} strokeWidth="1.5" />
        {!flat && <circle cx={CX} cy={CY} r={26} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />}

        {/* Specular glint */}
        {!flat && (
          <ellipse cx={CX - 6} cy={CY - 9} rx={7} ry={4}
            fill="rgba(255,255,255,0.045)" />
        )}

        {/* Tick marks */}
        {tickAngles.map(a => {
          const [x1, y1] = polar(a, 19);
          const [x2, y2] = polar(a, 22.5);
          return (
            <line key={a}
              x1={x1.toFixed(2)} y1={y1.toFixed(2)}
              x2={x2.toFixed(2)} y2={y2.toFixed(2)}
              stroke={C.faint} strokeWidth="1" />
          );
        })}

        {/* Track background arc */}
        <path d={arc(-135, 135)} fill="none" stroke={C.surface}
          strokeWidth="4.5" strokeLinecap="round" />

        {/* Value arc (glowing) */}
        {!flat && norm > 0.005 && (
          <path d={arc(-135, angleCur)} fill="none" stroke={color}
            strokeWidth="4.5" strokeLinecap="round"
            filter={`url(#${glowId})`} opacity="0.92" />
        )}

        {/* Indicator line */}
        <line
          x1={CX} y1={CY}
          x2={indX.toFixed(2)} y2={indY.toFixed(2)}
          stroke={color} strokeWidth="2.5" strokeLinecap="round"
          filter={`url(#${glowId})`}
        />

        {/* Indicator dot */}
        <circle cx={indX.toFixed(2)} cy={indY.toFixed(2)} r="2.8"
          fill={color} filter={`url(#${glowId})`} />

        {/* Center cap */}
        <circle cx={CX} cy={CY} r="6" fill={C.con} stroke={C.borderBright} strokeWidth="1" />
        <circle cx={CX - 2} cy={CY - 2} r="2" fill="rgba(255,255,255,0.04)" />
      </svg>

      <div style={{
        fontFamily: "monospace", fontSize: "0.58rem", color: C.dim,
        letterSpacing: "0.08em", textTransform: "uppercase",
        textAlign: "center", lineHeight: 1.3
      }}>{label}</div>

      <div style={{
        fontFamily: "monospace", fontSize: "0.73rem",
        color, fontWeight: 600, letterSpacing: "0.02em"
      }}>{displayValue}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   Transfer Function Graph — live SVG, updates on knob changes
───────────────────────────────────────────────────── */
function TransferGraph({ threshold, ratio, knee }) {
  // Map a dBFS value (-60..0) to SVG coordinate (0..200)
  const dbToX = db => ((db + 60) / 60) * 200;
  const dbToY = db => 200 - ((db + 60) / 60) * 200;

  // Compression transfer function with soft/hard knee
  function outLevel(db) {
    const kh = knee / 2;
    if (knee <= 0.1) {
      return db <= threshold ? db : threshold + (db - threshold) / ratio;
    }
    if (db <= threshold - kh) return db;
    if (db >= threshold + kh) return threshold + (db - threshold) / ratio;
    // Quadratic soft-knee interpolation
    const t = (db - threshold + kh) / knee;
    return db + (1 / ratio - 1) * t * (db - threshold + kh) / 2;
  }

  // Build polyline points across full input range
  const pts = [];
  for (let db = -60; db <= 0; db += 0.5) {
    pts.push(`${dbToX(db).toFixed(1)},${dbToY(outLevel(db)).toFixed(1)}`);
  }

  // Operating point — fixed example signal at −12 dBFS
  const opIn  = -12;
  const opOut = outLevel(opIn);
  const opX   = dbToX(opIn);
  const opY   = dbToY(opOut);

  // Threshold position
  const thX = dbToX(threshold);
  const thY = dbToY(threshold);

  // Closed fill path
  const fillD = `M0,200 L${pts.join(" L")} L200,200 Z`;

  return (
    <div style={{
      background: C.black, border: `1px solid ${C.border}`,
      borderRadius: 4, height: 200, position: "relative", overflow: "hidden"
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: [
          "repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.025) 40px)",
          "repeating-linear-gradient(0deg,  transparent, transparent 39px, rgba(255,255,255,0.025) 40px)",
        ].join(", ")
      }} />

      <svg width="100%" height="100%" viewBox="0 0 200 200"
        preserveAspectRatio="none" style={{ position: "absolute", inset: 0 }}>
        {/* Unity (1:1) reference */}
        <line x1="0" y1="200" x2="200" y2="0"
          stroke={C.border} strokeWidth="1" strokeDasharray="4,3" />

        {/* Threshold vertical marker */}
        <line x1={thX} y1="200" x2={thX} y2={thY}
          stroke={C.borderBright} strokeWidth="1" strokeDasharray="2,3" />
        <text x={thX + 3} y="193" fill={C.faint} fontSize="7.5" fontFamily="monospace">THR</text>

        {/* Area fill */}
        <path d={fillD} fill="rgba(167,139,250,0.07)" />

        {/* Transfer curve */}
        <polyline points={pts.join(" ")} fill="none"
          stroke={C.purple} strokeWidth="2.5" strokeLinejoin="round" />

        {/* Operating point crosshairs */}
        <line x1={opX} y1="200" x2={opX} y2={opY}
          stroke={C.purple} strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
        <line x1="0" y1={opY} x2={opX} y2={opY}
          stroke={C.purple} strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
        <circle cx={opX} cy={opY} r="4.5" fill={C.purple} opacity="0.9" />
        <circle cx={opX} cy={opY} r="7" fill="none" stroke={C.purple}
          strokeWidth="1" opacity="0.3" />
      </svg>

      <span style={{ position: "absolute", bottom: 4, right: 6, fontFamily: "monospace", fontSize: "0.5rem", color: C.faint }}>INPUT →</span>
      <span style={{ position: "absolute", top: 6,  left: 6,  fontFamily: "monospace", fontSize: "0.5rem", color: C.faint }}>↑ OUT</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   Waveform Compare — DRY vs compressed WET
───────────────────────────────────────────────────── */
function WaveformCompare({ ratio, bypass }) {
  // Deterministic waveform with realistic dynamics (mix of partials)
  const dryPts = Array.from({ length: 120 }, (_, i) => {
    const t = i / 120;
    return (
      Math.sin(t * Math.PI * 9)    * (0.35 + 0.55 * Math.abs(Math.sin(t * Math.PI * 1.8))) +
      Math.sin(t * Math.PI * 4.3)  * 0.22 +
      Math.sin(t * Math.PI * 17.1) * 0.12
    );
  });

  function compress(v) {
    if (bypass) return v;
    const thresh = 0.42;
    const absV   = Math.abs(v);
    if (absV <= thresh) return v;
    return Math.sign(v) * (thresh + (absV - thresh) / ratio);
  }

  function toPoints(data, h = 30) {
    return data.map((v, i) => {
      const x = (i / (data.length - 1)) * 300;
      const y = h / 2 - v * (h / 2 - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }

  const wetPts = dryPts.map(compress);

  function Row({ label, pts, color, borderColor }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          fontFamily: "monospace", fontSize: "0.55rem", color,
          width: 28, textAlign: "right", letterSpacing: "0.06em"
        }}>{label}</div>
        <div style={{
          flex: 1, height: 32, background: C.surface,
          border: `1px solid ${borderColor}`, borderRadius: 3, overflow: "hidden"
        }}>
          <svg width="100%" height="100%" viewBox="0 0 300 30" preserveAspectRatio="none">
            <line x1="0" y1="15" x2="300" y2="15"
              stroke={C.border} strokeWidth="0.5" />
            <polyline points={toPoints(pts)} fill="none"
              stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Row label="DRY" pts={dryPts} color={C.borderBright} borderColor={C.border} />
      <Row label="WET" pts={wetPts} color={C.purple}       borderColor="rgba(167,139,250,0.3)" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   Gain Reduction Meter
───────────────────────────────────────────────────── */
function GRMeter({ gr }) {
  const pct = Math.min(1, gr / 20);
  return (
    <div style={{
      background: C.black, border: `1px solid ${C.border}`,
      borderRadius: 4, padding: "0.75rem",
      display: "flex", alignItems: "center", gap: 12
    }}>
      <div style={{ fontFamily: "monospace", fontSize: "0.65rem", color: C.dim, whiteSpace: "nowrap" }}>0 dB</div>
      <div style={{ flex: 1, height: 8, background: C.surface, borderRadius: 4, position: "relative", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          background: "linear-gradient(90deg, #00FF87 0%, #F5A623 65%, #FF4D6A 100%)",
          borderRadius: 4,
          width: `${pct * 100}%`,
          transition: "width 0.15s ease"
        }} />
        {/* Needle */}
        <div style={{
          position: "absolute", top: 0, bottom: 0,
          right: `${(1 - pct) * 100}%`,
          width: 2, background: C.text,
          boxShadow: `0 0 4px ${C.text}`,
          transition: "right 0.15s ease"
        }} />
      </div>
      <div style={{ fontFamily: "monospace", fontSize: "0.65rem", color: C.dim, whiteSpace: "nowrap" }}>
        GR: <span style={{ color: C.purple }}>{gr > 0.05 ? `-${gr.toFixed(1)}` : "0.0"} dB</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   Toggle Button
───────────────────────────────────────────────────── */
function Toggle({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "0.35rem 0.75rem",
      border: `1px solid ${active ? C.purple : C.border}`,
      borderRadius: 3,
      background: active ? C.purpleDim : C.surface,
      fontFamily: "monospace", fontSize: "0.6rem",
      color: active ? C.purple : C.dim,
      cursor: "pointer", letterSpacing: "0.06em",
      transition: "all 0.15s",
    }}>{label}</button>
  );
}

/* ─────────────────────────────────────────────────────
   Main — Compression Lab
───────────────────────────────────────────────────── */
export default function CompressionLab() {
  const [threshold,   setThreshold]   = useState(-18); // -60 to 0 dBFS
  const [ratio,       setRatio]       = useState(4);   // 1 to 20
  const [attack,      setAttack]      = useState(10);  // 0.1 to 200 ms
  const [release,     setRelease]     = useState(200); // 10 to 2000 ms
  const [knee,        setKnee]        = useState(5);   // 0 = hard … 10 = smooth
  const [makeupGain,  setMakeupGain]  = useState(4);   // 0 to 20 dB

  const [bypass,    setBypass]    = useState(false);
  const [sidechain, setSidechain] = useState(false);
  const [lookahead, setLookahead] = useState(false);

  // Simulate GR: assume a signal peaking at −12 dBFS
  const signalIn = -12;
  const grAmount = bypass
    ? 0
    : Math.max(0, (signalIn - threshold) * (1 - 1 / ratio));

  // Knee display label
  const kneeLabel = knee < 1.5 ? "HARD" : knee < 6 ? "SOFT" : "SMOOTH";

  // Dynamic concept text
  const conceptText = ratio >= 10
    ? "That's heavy limiting — peaks are nearly clamped."
    : ratio <= 1.5
    ? "Very gentle — barely touching the dynamics."
    : `For every ${ratio.toFixed(1)} dB above threshold, only 1 dB passes through.`;

  // Task auto-completion
  const tasks = [
    { label: "Set threshold",        done: threshold < 0 },
    { label: "Set ratio to 4:1",     done: Math.abs(ratio - 4) < 0.3 },
    { label: "Dial in attack/release", done: attack <= 60 && release >= 80 },
    { label: "Apply makeup gain",    done: makeupGain > 0 },
  ];

  // ── Shared style helpers
  const monoSm  = { fontFamily: "monospace", fontSize: "0.6rem", color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase" };
  const cardBox = { background: C.black, border: `1px solid ${C.border}`, borderRadius: 4 };

  return (
    <>
      {/* Inject Google Fonts + pulse keyframe */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.black}; }
      `}</style>

      <div style={{ fontFamily: "'Inter', sans-serif", background: C.black, minHeight: "100vh", color: C.text }}>

        {/* ── Chapter header ── */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "3rem 2rem 0" }}>
          <div style={{ ...monoSm, color: C.amber, marginBottom: "0.5rem" }}>
            Chapter 04 · Dynamics Processing
          </div>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(1.5rem, 3vw, 2.2rem)", fontWeight: 600, lineHeight: 1.2, marginBottom: "0.5rem" }}>
            Shape the Dynamic Range
          </h2>
          <p style={{ fontSize: "0.875rem", color: C.dim, maxWidth: 560, marginBottom: "2rem" }}>
            A compressor controls the loudest and softest moments of a recording. Dial in threshold, ratio, attack, and release — then compare the uncompressed vs. compressed waveform.
          </p>
          <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, marginBottom: "2.5rem" }} />
        </div>

        {/* ── Lab card ── */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 2rem 5rem" }}>
          <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>

            {/* Top bar */}
            <div style={{
              background: C.con, borderBottom: `1px solid ${C.border}`,
              padding: "0.75rem 1.25rem",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 8
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{
                  width: 28, height: 28, background: C.purpleDim,
                  border: "1px solid rgba(167,139,250,0.4)", borderRadius: 4,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem"
                }}>⬡</div>
                <div>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.875rem", fontWeight: 600 }}>
                    Compressor Studio
                  </div>
                  <div style={{ ...monoSm, color: C.dim }}>DYNAMICS</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                <Toggle label={bypass ? "BYPASS: ON" : "BYPASS: OFF"} active={!bypass} onClick={() => setBypass(b => !b)} />
                <Toggle label="SIDECHAIN" active={sidechain} onClick={() => setSidechain(s => !s)} />
                <Toggle label="LOOKAHEAD" active={lookahead} onClick={() => setLookahead(l => !l)} />
                <div style={{
                  display: "flex", alignItems: "center", gap: "0.4rem",
                  fontFamily: "monospace", fontSize: "0.65rem",
                  color: bypass ? C.dim : C.purple
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: bypass ? C.faint : C.purple,
                    boxShadow: bypass ? "none" : `0 0 6px ${C.purple}`,
                    animation: bypass ? "none" : "pulse 2s ease infinite"
                  }} />
                  {bypass ? "BYPASSED" : "ACTIVE"}
                </div>
              </div>
            </div>

            {/* Body: two columns */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>

              {/* ── Left: Controls ── */}
              <div style={{ padding: "1.25rem", borderRight: `1px solid ${C.border}` }}>
                <div style={{ ...monoSm, marginBottom: "1rem" }}>COMPRESSOR PARAMETERS</div>

                {/* Knob grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.5rem", marginBottom: "1.5rem" }}>
                  <Knob id="threshold" value={threshold} min={-60} max={0}
                    onChange={setThreshold} label="Threshold"
                    displayValue={`${threshold.toFixed(0)} dB`} />

                  <Knob id="ratio" value={ratio} min={1} max={20}
                    onChange={setRatio} label="Ratio"
                    displayValue={`${ratio.toFixed(1)} : 1`} />

                  <Knob id="attack" value={attack} min={0.1} max={200}
                    onChange={setAttack} label="Attack"
                    displayValue={attack < 1 ? `${(attack * 1000).toFixed(0)} μs` : `${attack.toFixed(1)} ms`} />

                  <Knob id="release" value={release} min={10} max={2000}
                    onChange={setRelease} label="Release"
                    displayValue={release >= 1000 ? `${(release / 1000).toFixed(2)} s` : `${release.toFixed(0)} ms`} />

                  <Knob id="knee" value={knee} min={0} max={10}
                    onChange={setKnee} label="Knee"
                    displayValue={kneeLabel} />

                  <Knob id="makeup" value={makeupGain} min={0} max={20}
                    onChange={setMakeupGain} label="Makeup Gain"
                    displayValue={`+${makeupGain.toFixed(1)} dB`} flat />
                </div>

                {/* Concept callout */}
                <div style={{
                  marginTop: "1rem", background: C.purpleDim,
                  border: "1px solid rgba(167,139,250,0.2)",
                  borderRadius: 4, padding: "0.75rem",
                  fontSize: "0.75rem", color: C.dim, lineHeight: 1.55
                }}>
                  <strong style={{ color: C.purple }}>Concept check: </strong>
                  A {ratio.toFixed(1)}:1 ratio — {conceptText}
                </div>
              </div>

              {/* ── Right: Visuals ── */}
              <div style={{ padding: "1.25rem" }}>
                <div style={{ ...monoSm, marginBottom: "0.75rem" }}>TRANSFER FUNCTION — INPUT vs OUTPUT</div>
                <TransferGraph
                  threshold={threshold}
                  ratio={bypass ? 1 : ratio}
                  knee={knee}
                />

                <div style={{ ...monoSm, marginTop: "1rem", marginBottom: "0.5rem" }}>BEFORE / AFTER WAVEFORM</div>
                <WaveformCompare ratio={bypass ? 1 : ratio} bypass={bypass} />

                <div style={{ ...monoSm, marginTop: "1rem", marginBottom: "0.5rem" }}>GAIN REDUCTION METER</div>
                <GRMeter gr={grAmount} />

                {/* Stats row */}
                <div style={{
                  marginTop: "1rem", display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8
                }}>
                  {[
                    { label: "GR",          val: grAmount > 0.05 ? `-${grAmount.toFixed(1)} dB` : "–",  color: C.purple },
                    { label: "Output",      val: `${(signalIn + makeupGain - grAmount).toFixed(1)} dB`, color: C.green  },
                    { label: "Makeup",      val: `+${makeupGain.toFixed(1)} dB`,                        color: C.amber  },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ ...cardBox, padding: "0.6rem 0.75rem", textAlign: "center" }}>
                      <div style={{ fontFamily: "monospace", fontSize: "0.9rem", color, fontWeight: 600 }}>{val}</div>
                      <div style={{ ...monoSm, marginTop: 2, color: C.faint }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              borderTop: `1px solid ${C.border}`, padding: "0.875rem 1.25rem",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: C.con, flexWrap: "wrap", gap: 12
            }}>
              {/* Task checklist */}
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {tasks.map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.78rem", color: C.dim }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: `1.5px solid ${t.done ? C.green : C.borderBright}`,
                      background: t.done ? "rgba(0,255,135,0.12)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.5rem", color: C.green,
                      transition: "all 0.2s"
                    }}>
                      {t.done ? "✓" : ""}
                    </div>
                    <span style={{ color: t.done ? C.text : C.dim }}>{t.label}</span>
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => { setThreshold(-18); setRatio(4); setAttack(10); setRelease(200); setKnee(5); setMakeupGain(4); setBypass(false); }}
                  style={{ padding: "0.5rem 1rem", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.dim, fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.75rem", fontWeight: 500, cursor: "pointer" }}>
                  A/B Compare
                </button>
                <button style={{ padding: "0.5rem 1.25rem", background: C.amber, border: "none", borderRadius: 4, color: C.black, fontFamily: "'Space Grotesk', sans-serif", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em" }}>
                  Submit & Continue →
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
