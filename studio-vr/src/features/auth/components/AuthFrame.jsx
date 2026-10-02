import { Link } from "react-router-dom";
import "../AuthPage.css";

export function AuthFrame({ backTo = "/", backLabel = "Back to home", door, statusClass = "", sub, children, after }) {
  return (
    <div className="svr-auth">
      <div className="auth-backdrop" />
      <div className="auth-grain" />
      <Link to={backTo} className="auth-back" aria-label={backLabel} title={backLabel}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      </Link>
      <div className={`auth-stage${door ? "" : " auth-stage-solo"}`}>
        {door}
        <div className="auth-panel">
          <div className="auth-panel-top">
            <div className="auth-panel-title">
              Studio<span>VR</span>
            </div>
            <div className={`status-dot${statusClass}`} />
          </div>
          <p className="auth-panel-sub">{sub}</p>
          {children}
        </div>
      </div>
      {after}
    </div>
  );
}

export function AuthField({ id, label, className = "", ...props }) {
  return (
    <>
      <label className="auth-field-label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className={`auth-field ${className}`.trim()} {...props} />
    </>
  );
}
