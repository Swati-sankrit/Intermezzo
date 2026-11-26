const SCALE_MAX = 400;
const NON_FICTION = 238;
const FICTION = 260;

const pct = (wpm: number) => `${(Math.min(Math.max(wpm, 0), SCALE_MAX) / SCALE_MAX) * 100}%`;

interface PaceBarProps {
  /** The reader's Measured_Pace, or undefined when there is none (no reader marker). */
  pace: number | undefined;
}

/** A still horizontal scale, 0 to 400 wpm, with the two typical speeds and the reader's pace. */
export function PaceBar({ pace }: PaceBarProps) {
  const markers = `Typical adult markers at ${NON_FICTION} wpm (non-fiction) and ${FICTION} wpm (fiction).`;
  const alt =
    pace === undefined
      ? `Pace scale from 0 to ${SCALE_MAX} wpm. ${markers}`
      : `Your pace is ${pace} wpm on a scale from 0 to ${SCALE_MAX} wpm. ${markers}`;
  return (
    <div className="pace-bar" role="img" aria-label={alt}>
      <span className="pace-bar__label pace-bar__label--above" style={{ left: pct(NON_FICTION) }} aria-hidden="true">
        {`Non-fiction ${NON_FICTION}`}
      </span>
      <div className="pace-bar__track" aria-hidden="true">
        <span className="pace-bar__tick" style={{ left: pct(NON_FICTION) }} />
        <span className="pace-bar__tick" style={{ left: pct(FICTION) }} />
        {pace !== undefined && <span className="pace-bar__reader" style={{ left: pct(pace) }} />}
      </div>
      <span className="pace-bar__label pace-bar__label--below" style={{ left: pct(FICTION) }} aria-hidden="true">
        {`Fiction ${FICTION}`}
      </span>
      <span className="pace-bar__ends" aria-hidden="true">
        <span>0</span>
        <span>{SCALE_MAX}</span>
      </span>
    </div>
  );
}
