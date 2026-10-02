import "./KeyPoints.css";

function renderRich(text) {
  return String(text)
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

export function KeyPoints({ points, title = "Key points", className = "" }) {
  if (!points?.length) return null;
  return (
    <section className={`ui-keypoints ${className}`.trim()} aria-label={title}>
      <h4 className="ui-keypoints__head">
        <span className="ui-keypoints__label">{title}</span>
      </h4>
      <ul className="ui-keypoints__list">
        {points.map((p, i) => (
          <li key={i} className="ui-keypoints__item" style={{ "--kp-i": i }}>
            <span className="ui-keypoints__bullet" aria-hidden="true" />
            <span className="ui-keypoints__text">{renderRich(p)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
