import "./VideoPlayer.css";

// mm:ss for a Cloudflare-reported duration; courseData/CMS `duration` strings
// ("4 min") are used as the fallback when Stream hasn't reported one yet.
function formatDuration(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const STATUS_LABEL = {
  pending: "Video processing…",
  processing: "Video processing…",
  error: "Video encoding failed — check Cloudflare Stream",
};

/**
 * Renders a lesson/section's Cloudflare Stream video — see studio-cms's
 * `shared.cloudflare-video` component (STRAPI_SCHEMA_NOTES.md) and
 * studio-backend's `CourseVideo` shape (course.types.ts), which is what
 * `video` here is: `{ videoUid, durationSeconds, thumbnailUrl, captionsUrl,
 * status }`.
 *
 * Uses Cloudflare's own Stream Player embed
 * (https://iframe.cloudflarestream.com/<uid>) rather than a custom
 * hls.js/<video> player — it already handles adaptive bitrate, a poster
 * frame, fullscreen/PiP, and Cloudflare's own "still encoding" state, so
 * there's no need to reimplement that here. `video.status` (kept in sync by
 * studio-cms's `GET /api/sections/:documentId/video/status` route) only
 * drives the small badge text below — the embed itself is left to render
 * regardless, since Cloudflare's player already degrades gracefully while a
 * fresh upload is still processing.
 *
 * Most sections don't have a video yet — `video`/`video.videoUid` is
 * undefined until a content editor uploads one via the CMS admin's "Upload
 * video" button (or `POST /api/sections/:documentId/video` directly) — so
 * the common case is the "coming soon" placeholder below, not the embed.
 */
function VideoPlayer({ video, fallbackDuration, posterSrc = "/paranoma.png", title }) {
  const videoUid = video?.videoUid;
  const durationLabel = formatDuration(video?.durationSeconds) ?? fallbackDuration ?? null;

  if (!videoUid) {
    return (
      <div className="video-player-wrap">
        <div className="video-player-empty">
          <img src={posterSrc} alt="" />
          <div className="vp-empty-badge">Video coming soon</div>
          {durationLabel && <div className="vtag">Lesson video · {durationLabel}</div>}
        </div>
      </div>
    );
  }

  const posterParam = video?.thumbnailUrl
    ? `?poster=${encodeURIComponent(video.thumbnailUrl)}`
    : "";
  const statusLabel = video?.status && video.status !== "ready" ? STATUS_LABEL[video.status] : null;
  const hasMetaRow = Boolean(durationLabel || statusLabel || video?.captionsUrl);

  return (
    <div className="video-player-wrap">
      {/* Cloudflare's Stream Player draws its own control bar (play/scrub/
          fullscreen) along the bottom edge of the iframe — nothing of ours
          can be absolutely positioned over the video itself without
          colliding with it, unlike the static placeholder below. So the
          duration/status/captions row lives outside the frame, not overlaid
          on it. */}
      <div className="video-player">
        <iframe
          key={videoUid}
          src={`https://iframe.cloudflarestream.com/${videoUid}${posterParam}`}
          title={title ? `${title} — lesson video` : "Lesson video"}
          loading="lazy"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
        />
      </div>
      {hasMetaRow && (
        <div className="video-player-meta">
          {durationLabel && <span className="vp-duration">Lesson video · {durationLabel}</span>}
          {statusLabel && <span className="vp-status-badge">{statusLabel}</span>}
        </div>
      )}
    </div>
  );
}

export default VideoPlayer;
