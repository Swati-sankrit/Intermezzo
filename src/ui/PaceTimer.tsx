import './PaceTimer.css';

interface PaceTimerProps {
  enabled: boolean;
  suggestedSeconds: number;
}

/** Shows the suggested time for the current paragraph. Purely informational: it never blocks advancing. */
export function PaceTimer({ enabled, suggestedSeconds }: PaceTimerProps) {
  if (!enabled) return null;
  return (
    <div className="pace-timer" role="status" aria-label={`Suggested time ${suggestedSeconds} seconds`}>
      <svg
        className="pace-timer__icon"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5" />
        <path d="M9 2h6" />
      </svg>
      <span>{suggestedSeconds}s</span>
    </div>
  );
}
