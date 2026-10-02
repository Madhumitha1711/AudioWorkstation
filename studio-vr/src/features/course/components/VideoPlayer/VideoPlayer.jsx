import "./VideoPlayer.css";

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

function VideoPlayer({ video, fallbackDuration, posterSrc = "/paranoma.png", title }) {
  const playbackToken = video?.playbackToken;
  const durationLabel = formatDuration(video?.durationSeconds) ?? fallbackDuration ?? null;

  if (!playbackToken) {
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
      <div className="video-player">
        <iframe
          key={playbackToken}
          src={`https://iframe.cloudflarestream.com/${playbackToken}${posterParam}`}
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
