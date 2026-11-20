import './ProgressBar.css';

interface ProgressBarProps {
  progress: number;
}

export function ProgressBar({ progress }: ProgressBarProps) {
  const safe = Number.isFinite(progress) ? progress : 0;
  const value = Math.min(100, Math.max(0, Math.floor(safe)));
  return (
    <div
      className="progress-bar"
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
    >
      <div className="progress-bar__track" aria-hidden="true">
        <div className="progress-bar__fill" style={{ width: `${value}%` }} />
      </div>
      <span className="progress-bar__label">{value}%</span>
    </div>
  );
}
