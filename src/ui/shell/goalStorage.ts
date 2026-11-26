/**
 * Persistence for the Daily_Goal (`rod_daily_goal`). Every storage call is guarded:
 * a missing, unreadable or invalid value reads as 15 minutes.
 */
import {
  clampDailyGoalMinutes,
  DEFAULT_DAILY_GOAL_MINUTES,
  MAX_DAILY_GOAL_MINUTES,
  MIN_DAILY_GOAL_MINUTES,
} from '../../library/ledgerCalculator';

export const GOAL_STORAGE_KEY = 'rod_daily_goal';

/** The saved goal when it is a whole number from 1 to 240, else 15. */
export function loadDailyGoal(): number {
  try {
    const raw = localStorage.getItem(GOAL_STORAGE_KEY);
    if (raw === null || !/^\d+$/.test(raw)) return DEFAULT_DAILY_GOAL_MINUTES;
    const n = Number(raw);
    return n >= MIN_DAILY_GOAL_MINUTES && n <= MAX_DAILY_GOAL_MINUTES ? n : DEFAULT_DAILY_GOAL_MINUTES;
  } catch {
    return DEFAULT_DAILY_GOAL_MINUTES;
  }
}

/** Clamps and saves the goal. Returns the clamped value and whether the write worked. */
export function saveDailyGoal(minutes: number): { value: number; saved: boolean } {
  const value = clampDailyGoalMinutes(minutes);
  try {
    localStorage.setItem(GOAL_STORAGE_KEY, String(value));
    return { value, saved: true };
  } catch {
    return { value, saved: false };
  }
}
