import { moonPhase, type MoonPhase } from '../../library/ledgerCalculator';
import type { DayStats } from '../../library/statsSelectors';
import { dateLabel, FULL_MOON_NOTE, PHASE_NAMES } from './ledgerText';

/** One still moon drawn with currentColor: an outline plus a lit part that grows with the phase. */
function Moon({ phase }: { phase: MoonPhase }) {
  const lit: Record<MoonPhase, string> = {
    new: '',
    crescent: 'M10 2a8 8 0 0 0 0 16a5 8 0 0 1 0 -16z',
    half: 'M10 2a8 8 0 0 0 0 16z',
    gibbous: 'M10 2a8 8 0 0 0 0 16a5 8 0 0 0 0 -16z',
    full: '',
  };
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8" fill={phase === 'full' ? 'currentColor' : 'none'} stroke="currentColor" strokeOpacity="0.5" />
      {lit[phase] && <path d={lit[phase]} fill="currentColor" />}
    </svg>
  );
}

const PHASES: readonly MoonPhase[] = ['new', 'crescent', 'half', 'gibbous', 'full'];

/** The last 30 days, oldest first, today last. Each moon carries its date and phase name as text. */
export function MoonStrip({ days, goalMinutes }: { days: readonly DayStats[]; goalMinutes: number }) {
  return (
    <div>
      <ol className="ledger-moons" aria-label="The last 30 days, oldest first">
        {days.map(({ date, stats }, index) => {
          const phase = moonPhase(stats.activeReadingSeconds, goalMinutes);
          const isToday = index === days.length - 1;
          return (
            <li
              key={date}
              className={isToday ? 'ledger-moons__day ledger-moons__day--today' : 'ledger-moons__day'}
              aria-current={isToday ? 'date' : undefined}
            >
              <Moon phase={phase} />
              <span className="ledger-visually-hidden">
                {`${dateLabel(date)}: ${PHASE_NAMES[phase]}`}
                {isToday ? ' (today)' : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <ul className="ledger-moons__legend" aria-label="Moon phases">
        {PHASES.map((phase) => (
          <li key={phase} className="ledger-moons__key">
            <Moon phase={phase} />
            <span>{PHASE_NAMES[phase]}</span>
          </li>
        ))}
        <li className="ledger-moons__key">
          <span className="ledger-moons__ring" aria-hidden="true" />
          <span>today</span>
        </li>
      </ul>
      <p className="ledger-note">{FULL_MOON_NOTE}</p>
    </div>
  );
}
