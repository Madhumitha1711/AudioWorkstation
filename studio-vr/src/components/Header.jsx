import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { logOff } from "../store/sessionSlice";
import { ThemeToggle } from "../theme/ThemeToggle";
import "./Header.css";

// Pages that share the "studio" nav chrome (section tabs + student greeting
// + log-off) rather than the plain tagline shown on login/tester pages.
const STUDIO_NAV_PATHS = ["/course", "/studio", "/discussion"];

const NAV_ITEMS = [
  { path: "/course", label: "Course", Icon: CourseIcon },
  { path: "/studio", label: "Studio", Icon: StudioIcon },
  { path: "/discussion", label: "Discussion", Icon: DiscussionIcon },
];

function CourseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z" />
      <path d="M22 4.5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function StudioIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8.5" y1="22" x2="15.5" y2="22" />
    </svg>
  );
}

function DiscussionIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function LogOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function Header({ pathname, studentName }) {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // Landing and payment pages ship their own headers, so the shared app
  // chrome only needs to appear for login, the course page, the studio
  // tour, and the discussion board.
  if (pathname === "/" || pathname === "/payment") {
    return null;
  }

  const isStudioArea = STUDIO_NAV_PATHS.includes(pathname);

  const handleLogOff = () => {
    dispatch(logOff());
    navigate("/");
  };

  return (
    <header className="svr-shell-header">
      <button
        type="button"
        className="shell-brand"
        onClick={() => navigate("/")}
        aria-label="Studio VR home"
      >
        <span className="shell-logo-mark">◎</span>
        <span className="shell-brand-name">Studio VR</span>
      </button>

      <div className="shell-header-right">
        {isStudioArea ? (
          <>
            {studentName && (
              <span className="shell-greeting">Hi, {studentName}</span>
            )}
            <nav className="shell-nav" aria-label="Primary">
              {NAV_ITEMS.map(({ path, label, Icon }) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => navigate(path)}
                  className={`shell-nav-link${pathname === path ? " active" : ""}`}
                  aria-current={pathname === path ? "page" : undefined}
                >
                  <Icon />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={handleLogOff}
              className="shell-icon-btn"
              aria-label="Log off"
              title="Log off"
            >
              <LogOffIcon />
            </button>
          </>
        ) : (
          <span className="shell-tagline">Learn audio engineering in 360°</span>
        )}
        <ThemeToggle className="shell-icon-btn" />
      </div>
    </header>
  );
}

export default Header;
