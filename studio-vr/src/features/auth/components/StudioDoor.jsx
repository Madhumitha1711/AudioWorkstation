import { useEffect, useRef } from "react";

// On narrow screens (<=820px, same breakpoint as AuthPage.css) the door
// stacks ABOVE the form, so by the time someone taps "Unlock door" /
// "Request access" they've usually scrolled down to the button and the
// door is off-screen — they'd miss the scan → unlock → swing-open
// sequence entirely. When verification starts, scroll the page's own
// scroll container (.svr-auth) back to the top so the door (and the
// "Door's unlocked" welcome overlay, which covers that same top area)
// is in view for the whole animation.
const STACKED_QUERY = "(max-width: 820px)";

function StudioDoor({ phase, sublabel }) {
  const unitRef = useRef(null);
  useEffect(() => {
    if (phase !== "verifying") return;
    if (!window.matchMedia?.(STACKED_QUERY).matches) return;
    const scroller = unitRef.current?.closest(".svr-auth");
    if (!scroller || scroller.scrollTop === 0) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [phase]);

  const inFocus = phase === "granted" || phase === "opening";
  const opening = phase === "opening";
  const scanning = phase === "verifying";

  return (
    <div className="door-unit" aria-hidden="true" ref={unitRef}>
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
