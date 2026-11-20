import './ErrorBanner.css';

interface ErrorBannerProps {
  error: string | null;
}

export function ErrorBanner({ error }: ErrorBannerProps) {
  if (error === null) return null;
  return (
    <div className="error-banner" role="alert">
      <svg
        className="error-banner__icon"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6" />
        <path d="M12 16.5v.5" />
      </svg>
      <span>{error}</span>
    </div>
  );
}
