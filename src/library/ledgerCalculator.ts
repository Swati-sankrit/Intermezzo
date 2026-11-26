/**
 * Pure Ledger calculations: Focus_Score, Moon_Phase, Goal_Progress, Measured_Pace and book counts.
 * No DOM access and no clock; `today` is always passed in by the caller.
 * Any Stats field that is not a non-negative finite number counts as 0.
 */
import type { DataModel } from './model';
import type { DayStats } from './statsSelectors';

export type MoonPhase = 'new' | 'crescent' | 'half' | 'gibbous' | 'full';

export const PACE_THRESHOLD_SECONDS = 120;
export const DEFAULT_DAILY_GOAL_MINUTES = 15;
export const MIN_DAILY_GOAL_MINUTES = 1;
export const MAX_DAILY_GOAL_MINUTES = 240;

function safeAmount(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Whole-minute goal in seconds, clamped to 1-240. */
function goalSeconds(dailyGoalMinutes: number): number {
  return clampDailyGoalMinutes(dailyGoalMinutes) * 60;
}

/** 0-100, or undefined when active plus away seconds is 0. */
export function focusScore(activeSeconds: number, awaySeconds: number): number | undefined {
  const a = safeAmount(activeSeconds);
  const w = safeAmount(awaySeconds);
  const sum = a + w;
  if (sum === 0) return undefined;
  return Math.round((a / sum) * 100);
}

/** Sums seconds over the days first, then divides. Not an average of daily scores. */
export function sevenDayFocusScore(days: readonly DayStats[]): number | undefined {
  let a = 0;
  let w = 0;
  for (const d of days) {
    a += safeAmount(d.stats.activeReadingSeconds);
    w += safeAmount(d.stats.awaySeconds);
  }
  return focusScore(a, w);
}

export function moonPhase(activeSeconds: number, dailyGoalMinutes: number): MoonPhase {
  const a = safeAmount(activeSeconds);
  if (a === 0) return 'new';
  const ratio = a / goalSeconds(dailyGoalMinutes);
  if (ratio < 0.5) return 'crescent';
  if (ratio < 0.75) return 'half';
  if (ratio < 1) return 'gibbous';
  return 'full';
}

/** Whole number 0-100, rounded and capped. */
export function goalProgress(todayActiveSeconds: number, dailyGoalMinutes: number): number {
  const pct = (safeAmount(todayActiveSeconds) / goalSeconds(dailyGoalMinutes)) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

export interface PaceInput {
  wordsRead: number;
  activeReadingSeconds: number;
}

/**
 * Words per minute from Pace_Days only (days with wordsRead > 0). Undefined when the summed
 * active seconds of those days are under the threshold or the pace rounds below 1.
 */
export function measuredPace(days: readonly PaceInput[]): number | undefined {
  let words = 0;
  let seconds = 0;
  for (const d of days) {
    const w = safeAmount(d.wordsRead);
    if (w <= 0) continue;
    words += w;
    seconds += safeAmount(d.activeReadingSeconds);
  }
  if (seconds < PACE_THRESHOLD_SECONDS) return undefined;
  const wpm = Math.round(words / (seconds / 60));
  return Number.isFinite(wpm) && wpm >= 1 ? wpm : undefined;
}

/** Rounds to a whole minute and clamps to 1-240. Non-finite input gives the default of 15. */
export function clampDailyGoalMinutes(n: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_DAILY_GOAL_MINUTES;
  return Math.min(MAX_DAILY_GOAL_MINUTES, Math.max(MIN_DAILY_GOAL_MINUTES, Math.round(n)));
}

export interface BookCounts {
  finished: number;
  inProgress: number;
}

/** Counts Book_Ids on the `finished` and `reading` shelves that have a Book_Entry. */
export function bookCounts(model: Pick<DataModel, 'shelves' | 'books'>): BookCounts {
  const has = (id: string) => Object.prototype.hasOwnProperty.call(model.books, id);
  return {
    finished: model.shelves.finished.filter(has).length,
    inProgress: model.shelves.reading.filter(has).length,
  };
}
