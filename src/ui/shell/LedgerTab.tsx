import { useState } from 'react';
import type { DataModel } from '../../library/model';
import {
  bookCounts,
  focusScore,
  measuredPace,
  sevenDayFocusScore,
} from '../../library/ledgerCalculator';
import { overallStats, statsForDate, statsForLastDays } from '../../library/statsSelectors';
import { Skeleton } from '../Skeleton';
import { CandleGauge } from './CandleGauge';
import { GoalSection } from './GoalSection';
import { loadDailyGoal } from './goalStorage';
import { EMPTY_LEDGER_TEXT, FOCUS_STATEMENT } from './ledgerText';
import { MoonStrip } from './MoonStrip';
import { PaceSection } from './PaceSection';
import { StatTiles } from './StatTiles';
import { TallyMarks } from './TallyMarks';
import './LedgerTab.css';

export interface LedgerTabProps {
  /** The loaded Data_Model, or undefined while it loads. */
  model: DataModel | undefined;
  /** Today's Local_Date (YYYY-MM-DD). The calculator never reads the clock. */
  today: string;
}

function LedgerSkeleton() {
  return (
    <div className="ledger" aria-busy="true">
      <p className="ledger-visually-hidden" role="status">Opening the ledger…</p>
      <Skeleton className="ledger-skeleton ledger-skeleton--tall" />
      <Skeleton className="ledger-skeleton" />
      <Skeleton className="ledger-skeleton" />
    </div>
  );
}

/** The Ledger: focus, look-aways, moons, totals, pace and the daily goal. */
export function LedgerTab({ model, today }: LedgerTabProps) {
  const [goal, setGoal] = useState(loadDailyGoal);
  if (!model) return <LedgerSkeleton />;

  const todayStats = statsForDate(model, today);
  const totals = overallStats(model);
  const books = bookCounts(model);
  const blank =
    totals.activeReadingSeconds === 0 && totals.paragraphsRead === 0 && books.finished === 0 && books.inProgress === 0;

  if (blank) {
    return (
      <div className="ledger">
        <p className="ledger-empty">{EMPTY_LEDGER_TEXT}</p>
        <GoalSection goal={goal} onGoalChange={setGoal} />
      </div>
    );
  }

  const week = statsForLastDays(model, today, 7);
  const month = statsForLastDays(model, today, 30);
  const pace = measuredPace(Object.values(model.daily));

  return (
    <div className="ledger">
      <div className="ledger__top">
        <section className="ledger-card" aria-labelledby="ledger-focus-h">
          <h3 id="ledger-focus-h">Focus</h3>
          <div className="ledger-gauges">
            <CandleGauge
              size="large"
              label="Today"
              score={focusScore(todayStats.activeReadingSeconds, todayStats.awaySeconds)}
            />
            <CandleGauge size="large" label="Last 7 days" score={sevenDayFocusScore(week)} />
          </div>
        </section>
        <PaceSection pace={pace} />
        <GoalSection goal={goal} onGoalChange={setGoal} todaySeconds={todayStats.activeReadingSeconds} />
      </div>
      <section className="ledger-card" aria-labelledby="ledger-tally-h">
        <h3 id="ledger-tally-h">Look-aways</h3>
        <TallyMarks days={week} />
      </section>
      <section className="ledger-card" aria-labelledby="ledger-moons-h">
        <h3 id="ledger-moons-h">The last 30 days</h3>
        <MoonStrip days={month} goalMinutes={goal} />
      </section>
      <StatTiles
        booksFinished={books.finished}
        booksInProgress={books.inProgress}
        paragraphsRead={totals.paragraphsRead}
        chaptersRead={totals.chaptersFinished}
      />
      <p className="ledger-note">{FOCUS_STATEMENT}</p>
    </div>
  );
}
