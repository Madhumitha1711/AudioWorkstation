// Pulled out of MicTypeLab.jsx so the same five-transducer silhouette can
// be reused by any mic lab that needs it — MicTypeLab's own listen panel
// and MicTypeCompareLab's three comparison columns both render one of
// these.
//
// Body/detail/stand tones come from CSS classes (mic-art-*, micLabs.css)
// rather than hardcoded fills, so the silhouette follows the light/dark
// "screen" behind it; `color` (the accent outline) should already be the
// theme-resolved accent — see micAccent() in micLabShared.js.

function MicPortrait({ shape, color }) {
  const common = { fill: "none", stroke: color, strokeWidth: 2 };
  switch (shape) {
    case "condenser":
      return (
        <svg viewBox="0 0 60 100" {...common}>
          <rect x="16" y="6" width="28" height="58" rx="6" className="mic-art-body" />
          <circle cx="30" cy="20" r="9" className="mic-art-detail" />
          <line x1="30" y1="64" x2="30" y2="80" className="mic-art-stand" />
          <path d="M14 80 Q30 92 46 80" className="mic-art-stand" />
        </svg>
      );
    case "tube":
      return (
        <svg viewBox="0 0 60 100" {...common}>
          <rect x="14" y="4" width="32" height="64" rx="4" className="mic-art-body" />
          <circle cx="30" cy="18" r="10" className="mic-art-detail" />
          <rect x="26" y="52" width="8" height="10" fill="none" className="mic-art-detail" />
          <line x1="30" y1="68" x2="30" y2="80" className="mic-art-stand" />
          <path d="M12 80 Q30 94 48 80" className="mic-art-stand" />
        </svg>
      );
    case "ribbon":
      return (
        <svg viewBox="0 0 60 100" {...common}>
          <rect x="10" y="10" width="40" height="42" rx="8" className="mic-art-body" />
          <rect x="24" y="20" width="12" height="22" fill="none" className="mic-art-detail" />
          <line x1="30" y1="52" x2="30" y2="72" className="mic-art-stand" />
          <path d="M14 72 Q30 84 46 72" className="mic-art-stand" />
        </svg>
      );
    case "contact":
      return (
        <svg viewBox="0 0 60 100" {...common}>
          <circle cx="30" cy="30" r="16" className="mic-art-body" />
          <circle cx="30" cy="30" r="6" className="mic-art-detail" />
          <line x1="30" y1="46" x2="30" y2="70" className="mic-art-stand" strokeDasharray="3,3" />
          <path d="M10 82 h40" className="mic-art-stand" />
        </svg>
      );
    default: // "dynamic"
      return (
        <svg viewBox="0 0 60 100" {...common}>
          <rect x="18" y="8" width="24" height="46" rx="12" className="mic-art-body" />
          <circle cx="30" cy="18" r="6" className="mic-art-detail" />
          <line x1="30" y1="54" x2="30" y2="72" className="mic-art-stand" />
          <path d="M16 72 Q30 84 44 72" className="mic-art-stand" />
        </svg>
      );
  }
}

export default MicPortrait;
