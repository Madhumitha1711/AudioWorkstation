// The glass-door entry animation shared by LoginPage and SignupPage. It is
// purely visual/decorative (aria-hidden) — the real form lives in the panel
// next to it. `phase` drives every stage of the sequence:
//   idle       → door closed, panel waiting
//   verifying  → a scan beam sweeps the glass while credentials "check"
//   granted    → interior comes into focus, LED strip fills with light
//   opening    → the door swings open on its hinge
function StudioDoor({ phase, sublabel }) {
  const inFocus = phase === "granted" || phase === "opening";
  const opening = phase === "opening";
  const scanning = phase === "verifying";

  return (
    <div className="door-unit" aria-hidden="true">
      <div className="jamb" />
      <div className={`door-opening${inFocus ? " clear" : ""}`}>
        <div className="interior" />
        {/* Same equalizer-bar wave as the landing page hero (.eq-decor),
            scaled down and living behind the glass. It's its own layer
            (not nested in .interior) so it can carry a lighter blur that
            sharpens into a real waveform on unlock, instead of washing
            out under the interior's heavier ambient-glow blur. */}
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
