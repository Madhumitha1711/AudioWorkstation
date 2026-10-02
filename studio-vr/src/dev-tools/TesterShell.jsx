const panelStyle = {
  position: "absolute", top: "16px", left: "16px", width: "240px", background: "rgba(20,20,20,0.85)",
  color: "#fff", fontFamily: "var(--font-sans)", padding: "14px 16px", borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.15)", zIndex: 10, pointerEvents: "auto",
};
const uploadButtonStyle = {
  display: "inline-block", padding: "9px 14px", background: "#22ff55", color: "#0a0a0a",
  borderRadius: "6px", fontWeight: 700, fontSize: "12.5px", cursor: "pointer",
};
const overlayCenterStyle = {
  position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "#fff",
  fontFamily: "var(--font-sans)", fontSize: "15px", textAlign: "center", pointerEvents: "none",
};
const helpStyle = {
  marginTop: "14px", fontSize: "11px", lineHeight: 1.6, opacity: 0.6,
  borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: "10px",
};

export function TesterShell({ containerRef, onFile, title, buttonLabel, accept, hint, fileName, info, footer, status, emptyText, errorMsg }) {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", background: "#111", isolation: "isolate" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files?.[0]);
        }}
      />
      <div style={panelStyle}>
        <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "10px" }}>{title}</div>
        <label style={uploadButtonStyle}>
          {buttonLabel}
          <input type="file" accept={accept} onChange={(e) => onFile(e.target.files?.[0])} style={{ display: "none" }} />
        </label>
        <div style={{ fontSize: "11px", opacity: 0.55, marginTop: "8px" }}>{hint}</div>
        {fileName && (
          <div style={{ marginTop: "14px", fontSize: "12px", lineHeight: 1.6 }}>
            <div style={{ opacity: 0.7 }}>{fileName}</div>
            {info}
          </div>
        )}
        {footer}
      </div>
      {status === "empty" && <div style={overlayCenterStyle}>{emptyText}</div>}
      {status === "error" && <div style={{ ...overlayCenterStyle, color: "#f66", maxWidth: "360px" }}>{errorMsg}</div>}
    </div>
  );
}

export function HelpText({ style, children }) {
  return <div style={{ ...helpStyle, ...style }}>{children}</div>;
}
