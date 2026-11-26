import type { DayStats } from '../../library/statsSelectors';
import { dateLabel, drawnTally, tallyGroups, TALLY_CAP } from './ledgerText';

function Group({ size }: { size: number }) {
  const w = 5 * 5 + 4;
  return (
    <svg viewBox={`0 0 ${w} 18`} width={w} height="18" aria-hidden="true" focusable="false">
      {Array.from({ length: Math.min(size, 4) }, (_, i) => (
        <line key={i} x1={3 + i * 6} y1="2" x2={3 + i * 6} y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ))}
      {size === 5 && <line x1="0" y1="14" x2={w} y2="4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

/** Look-aways for the last 7 days as ghostly strokes in fives, each count also written out. */
export function TallyMarks({ days }: { days: readonly DayStats[] }) {
  return (
    <ul className="ledger-tally" aria-label="Look-aways in the last 7 days">
      {days.map(({ date, stats }) => {
        const count = stats.lookAwayCount;
        const drawn = drawnTally(count);
        const label = dateLabel(date);
        return (
          <li key={date} className="ledger-tally__row">
            <span className="ledger-tally__date">{label}</span>
            <span className="ledger-tally__marks" aria-hidden="true">
              {tallyGroups(drawn).map((size, i) => <Group key={i} size={size} />)}
            </span>
            <span className="ledger-tally__count">
              {count === 1 ? '1 look-away' : `${count} look-aways`}
              {count > TALLY_CAP ? ` (${TALLY_CAP} marks shown)` : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
