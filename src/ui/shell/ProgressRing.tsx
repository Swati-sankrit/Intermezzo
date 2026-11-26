const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ProgressRingProps {
  /** 0-100. */
  percent: number;
  /** For example "9 of 15 minutes"; also the aria-valuetext. */
  valueText: string;
}

/** A still ring that fills clockwise from the top. The progress is also written as text beside it. */
export function ProgressRing({ percent, valueText }: ProgressRingProps) {
  const filled = (CIRCUMFERENCE * percent) / 100;
  return (
    <div className="progress-ring">
      <div
        className="progress-ring__wrap"
        role="progressbar"
        aria-label="Progress toward today's goal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={valueText}
      >
        <svg viewBox="0 0 100 100" width="96" height="96" focusable="false" aria-hidden="true">
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--text-dim)" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="8"
            strokeLinecap="butt"
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <span className="progress-ring__percent" aria-hidden="true">{`${percent}%`}</span>
      </div>
      <p className="ledger-note">{valueText}</p>
    </div>
  );
}
