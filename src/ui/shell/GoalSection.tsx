import { useId, useState } from 'react';
import { goalProgress } from '../../library/ledgerCalculator';
import { saveDailyGoal } from './goalStorage';
import { GOAL_NOT_SAVED, minutesText } from './ledgerText';

interface GoalSectionProps {
  goal: number;
  onGoalChange: (minutes: number) => void;
  /** Today's active reading seconds. Omitted while loading. */
  todaySeconds?: number;
}

/** The Daily_Goal field, its save message and the Goal_Progress bar. */
export function GoalSection({ goal, onGoalChange, todaySeconds }: GoalSectionProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(goal));
  const [failed, setFailed] = useState(false);

  const change = (text: string) => {
    setDraft(text);
    if (text.trim() === '' || !Number.isFinite(Number(text))) return;
    const { value, saved } = saveDailyGoal(Number(text));
    setFailed(!saved);
    onGoalChange(value);
  };

  const showBar = todaySeconds !== undefined;
  const pct = showBar ? goalProgress(todaySeconds, goal) : 0;
  const minutes = showBar ? minutesText(todaySeconds) : 0;
  return (
    <section className="ledger-section" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>Daily goal</h3>
      <label className="ledger-goal__label" htmlFor={`${id}-in`}>Daily goal in minutes</label>
      <input
        id={`${id}-in`}
        className="ledger-goal__input"
        type="number"
        inputMode="numeric"
        min={1}
        max={240}
        step={1}
        value={draft}
        onChange={(e) => change(e.target.value)}
        onBlur={() => setDraft(String(goal))}
      />
      {failed && <p className="ledger-note" role="status">{GOAL_NOT_SAVED}</p>}
      {showBar && (
        <>
          <div
            className="ledger-progress"
            role="progressbar"
            aria-label="Progress toward today's goal"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${minutes} of ${goal} minutes`}
          >
            <div className="ledger-progress__fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="ledger-note">{`${minutes} of ${goal} minutes`}</p>
        </>
      )}
    </section>
  );
}
