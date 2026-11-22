import './NoticeBanner.css';

interface NoticeBannerProps {
  /** Notice text or camera-off error text, supplied by the caller. Null hides the banner. */
  text: string | null;
  /** True only for the camera-off error; switches the border and icon to --danger. */
  isError: boolean;
  onDismiss: () => void;
}

/**
 * One status line with a Dismiss button. It holds no wording of its own: the
 * caller passes the text from `notices.ts` (status.notice.text or
 * status.cameraOffError).
 */
export function NoticeBanner({ text, isError, onDismiss }: NoticeBannerProps) {
  if (text === null) return null;
  const className = isError ? 'notice-banner notice-banner--error' : 'notice-banner';
  return (
    <div className={className} role="status">
      <svg
        className="notice-banner__icon"
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
        <path d="M12 11v6" />
        <path d="M12 7.5v.5" />
      </svg>
      <span className="notice-banner__text">{text}</span>
      <button type="button" className="notice-banner__button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
