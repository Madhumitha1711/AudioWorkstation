import { useEffect, useRef, useState } from "react";
import "./WelcomeVideoDialog.css";

const DEFAULT_VIDEO_SRC = "/videos/welcome-tour.mp4";
const DEFAULT_POSTER_SRC = "/paranoma.png";

function WelcomeVideoDialog({
  open,
  onClose,
  videoSrc = DEFAULT_VIDEO_SRC,
  posterSrc = DEFAULT_POSTER_SRC,
}) {
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVideoFailed(false);
    const video = videoRef.current;
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {
      });
    }
  }, [open, videoSrc]);

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
                The walkthrough video isn't uploaded yet.
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
