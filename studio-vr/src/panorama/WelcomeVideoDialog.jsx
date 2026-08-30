import { useEffect, useRef, useState } from "react";
import "./welcomeVideoDialog.css";

// Provision for a first-landing "how to use this app" walkthrough video.
// There's no recording yet, so this ships the plumbing ahead of the actual
// clip: drop the file in at public/videos/welcome-tour.mp4 (and, optionally,
// a poster frame at the path below) and it starts playing automatically —
// nothing else here needs to change. Until that file exists the <video>
// below simply fails to load, and onError swaps in a plain "not uploaded
// yet" placeholder instead of a broken/blank player.
const DEFAULT_VIDEO_SRC = "/videos/welcome-tour.mp4";
// Reuses an existing panorama still as a poster frame so the dialog never
// looks like a blank black box before the real video (or the placeholder
// above) has had a chance to render.
const DEFAULT_POSTER_SRC = "/paranoma.png";

// Shown once, the first time a visitor reaches the studio tour (see the
// svr-welcome-video-seen localStorage flag in PanoramaTour.jsx), and
// re-openable any time after via the toolbar's "🎬" button. Sized at 80% of
// the *studio's* own width/height (its overlay covers the whole
// PanoramaTour root, not the browser viewport — see welcomeVideoDialog.css)
// with the studio blurred behind it while the video plays.
function WelcomeVideoDialog({
  open,
  onClose,
  videoSrc = DEFAULT_VIDEO_SRC,
  posterSrc = DEFAULT_POSTER_SRC,
}) {
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false);

  // Reset failure/playback state every time the dialog (re)opens, so a
  // replay after closing never inherits a stale "failed to load" flag or
  // resumes mid-clip instead of starting over.
  useEffect(() => {
    if (!open) return;
    setVideoFailed(false);
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {
        // Autoplay is commonly blocked without a prior user gesture (and
        // this fires the instant the studio loads, so there rarely is
        // one) — that's fine, the native controls let the visitor just
        // press play themselves instead of this erroring out.
      });
    }
  }, [open, videoSrc]);

  // Escape closes the dialog, same as clicking the backdrop or the close
  // button. The video's own native controls already handle space/arrow
  // keys internally, so there's no keyboard trap to worry about beyond this.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleClose = () => {
    videoRef.current?.pause();
    onClose();
  };

  return (
    <div
      className="svr-welcome-overlay"
      // Clicking the dimmed/blurred backdrop dismisses the dialog, same as
      // the close button — but not clicks inside the card itself
      // (stopPropagation below), so using the video/controls never
      // accidentally closes it.
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="svr-welcome-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="svr-welcome-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="svr-welcome-dialog__head">
          <div>
            <div className="svr-welcome-dialog__kicker">Welcome to Studio VR</div>
            <h2 id="svr-welcome-title" className="svr-welcome-dialog__title">
              How to use this studio
            </h2>
          </div>
          <button
            type="button"
            className="svr-welcome-dialog__close"
            onClick={handleClose}
            aria-label="Close welcome video"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="svr-welcome-dialog__video-wrap">
          {videoFailed ? (
            <div className="svr-welcome-dialog__placeholder">
              <div className="svr-welcome-dialog__placeholder-icon" aria-hidden="true">
                🎬
              </div>
              <p>
                The walkthrough video isn't uploaded yet — drop it in at{" "}
                <code>public/videos/welcome-tour.mp4</code> and it'll play
                here automatically.
              </p>
            </div>
          ) : (
            <video
              ref={videoRef}
              className="svr-welcome-dialog__video"
              src={videoSrc}
              poster={posterSrc}
              controls
              playsInline
              onError={() => setVideoFailed(true)}
              onEnded={handleClose}
            >
              Sorry, your browser doesn't support embedded video.
            </video>
          )}
        </div>

        <div className="svr-welcome-dialog__footer">
          <p className="svr-welcome-dialog__hint">
          </p>
          <button
            type="button"
            className="svr-tour-btn svr-tour-btn-primary"
            onClick={handleClose}
          >
            Got it, let's start
          </button>
        </div>
      </div>
    </div>
  );
}

export default WelcomeVideoDialog;
