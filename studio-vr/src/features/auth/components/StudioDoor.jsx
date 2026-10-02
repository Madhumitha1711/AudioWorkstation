function StudioDoor({ phase, sublabel }) {
  const inFocus = phase === "granted" || phase === "opening";
  const opening = phase === "opening";
  const scanning = phase === "verifying";

  return (
    <div className="door-unit" aria-hidden="true">
      <div className="jamb" />
      <div className={`door-opening${inFocus ? " clear" : ""}`}>
        <div className="interior" />
        <div className="door-eq">
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} style={{ "--i": i }} />
          ))}
        </div>
        <div className={`door${opening ? " opening" : ""}${scanning ? " scanning" : ""}`}>
          <div className="glass" />
          <div className="patch top" />
          <div className="patch bottom" />
          <div className="decal">
            <div className="word">
              STUDIO<span>VR</span>
            </div>
            <div className="sub">{sublabel}</div>
          </div>
          <div className={`led-strip${inFocus ? " granted" : ""}`}>
            <div className="fill" />
          </div>
        </div>
        <div className="floor-shadow" />
      </div>
      <div className="jamb right" />
    </div>
  );
}

export default StudioDoor;
