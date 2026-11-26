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

/** The last 30 days, oldest first. Each moon carries its date and phase name as text. */
export function MoonStrip({ days, goalMinutes }: { days: readonly DayStats[]; goalMinutes: number }) {
  return (
    <div>
      <ol className="ledger-moons" aria-label="The last 30 days, oldest first">
        {days.map(({ date, stats }) => {
          const phase = moonPhase(stats.activeReadingSeconds, goalMinutes);
          return (
            <li key={date} className="ledger-moons__day">
              <Moon phase={phase} />
              <span className="ledger-visually-hidden">{`${dateLabel(date)}: ${PHASE_NAMES[phase]}`}</span>
            </li>
          );
        })}
      </ol>
      <p className="ledger-note">{FULL_MOON_NOTE}</p>
    </div>
  );
}
