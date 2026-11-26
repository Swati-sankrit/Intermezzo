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

/** "Mon" from the shared date label ("Mon 3 Mar"); the raw date if it cannot be read. */
function weekday(date: string): string {
  return dateLabel(date).split(/[ ,]/)[0];
}

/** Look-aways for the last 7 days: seven columns, oldest first, today last, marks in fives above the count. */
export function TallyMarks({ days }: { days: readonly DayStats[] }) {
  return (
    <ul className="ledger-tally" aria-label="Look-aways in the last 7 days">
      {days.map(({ date, stats }, index) => {
        const count = stats.lookAwayCount;
        const isToday = index === days.length - 1;
        return (
          <li
            key={date}
            className={isToday ? 'ledger-tally__day ledger-tally__day--today' : 'ledger-tally__day'}
            aria-current={isToday ? 'date' : undefined}
          >
            <span className="ledger-tally__marks" aria-hidden="true">
              {tallyGroups(drawnTally(count)).map((size, i) => <Group key={i} size={size} />)}
            </span>
            <span className="ledger-tally__count">
              {count === 1 ? '1 look-away' : `${count} look-aways`}
              {count > TALLY_CAP ? ` (${TALLY_CAP} marks shown)` : ''}
            </span>
            <span className="ledger-tally__date">
              {weekday(date)}
              {isToday && <span className="ledger-visually-hidden"> (today)</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
