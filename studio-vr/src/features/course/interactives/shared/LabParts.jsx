import { useState } from "react";
import { FlipCard } from "../../../../components/FlipCard";

export function LabImage({ src, alt, prefix, hero = false, lazy = false }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className={`${prefix}-media${hero ? ` ${prefix}-media--hero` : ""}`}>
      {!failed && (
        <img
          src={src}
          alt={alt}
          loading={lazy ? "lazy" : undefined}
          style={loaded ? undefined : { visibility: "hidden" }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {!loaded && (
        <div className={`${prefix}-ph`}>
          <svg className={`${prefix}-ph-icon`} viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="2" />
            <path d="M21 16l-5-5-9 9" />
          </svg>
          <span className={`${prefix}-ph-label`}>Image coming soon</span>
          <span className={`${prefix}-ph-path`}>{`public${src}`}</span>
        </div>
      )}
    </div>
  );
}

export function Facts({ items, prefix, card = false }) {
  return (
    <dl className={`${prefix}-facts${card ? ` ${prefix}-card-facts` : ""}`}>
      {items.map((f) => (
        <div key={f.label} className={`${prefix}-fact`}>
          <dt>{f.label}</dt>
          <dd>{f.text}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ExampleCard({ ex, prefix, image }) {
  return (
    <FlipCard
      label={ex.title}
      className={`${prefix}-card${ex.wide ? ` ${prefix}-card--wide` : ""}`}
      front={
        <>
          {image}
          <div className={`${prefix}-card-front`}>
            <h4 className={`${prefix}-card-title`}>{ex.title}</h4>
          </div>
        </>
      }
      back={
        <div className={`${prefix}-card-body`}>
          <h4 className={`${prefix}-card-kicker`}>{ex.title}</h4>
          <p className={`${prefix}-card-lead`}>{ex.lead}</p>
          <Facts prefix={prefix} items={ex.facts} card />
        </div>
      }
    />
  );
}
