/** Pure stats selectors and the local-date helper. Never reads the clock; `today` is injected. */
import type { DataModel, Stats } from './model';
import { overallStats, ZERO_STATS } from './statsOps';

export { overallStats };

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** YYYY-MM-DD from the device's local time zone parts (not UTC). */
export function localDateString(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/** Stats for one book. Zeros (a fresh copy) when nothing is recorded. */
export function statsForBook(model: Pick<DataModel, 'stats'>, bookId: string): Stats {
  return has(model.stats, bookId) ? model.stats[bookId] : { ...ZERO_STATS };
}

/** Stats for one Local_Date. Zeros when nothing is recorded that day. */
export function statsForDate(model: Pick<DataModel, 'daily'>, date: string): Stats {
  return has(model.daily, date) ? model.daily[date] : { ...ZERO_STATS };
}

/** `date` shifted by whole calendar days, using pure calendar arithmetic (no zone or DST). */
function addDays(date: string, delta: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const t = new Date(0);
  t.setUTCFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + delta);
  t.setUTCHours(0, 0, 0, 0);
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1, 2)}-${pad(t.getUTCDate(), 2)}`;
}

export interface DayStats {
  date: string;
  stats: Stats;
}

/**
 * The last `days` days ending at `today` (inclusive), oldest first, with zeros for
 * missing days. Returns [] for a non-positive or non-integer count or a bad `today`.
 */
export function statsForLastDays(
  model: Pick<DataModel, 'daily'>,
  today: string,
  days: number,
): DayStats[] {
  if (!Number.isSafeInteger(days) || days <= 0) return [];
  const out: DayStats[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    if (date === null) return [];
    out.push({ date, stats: statsForDate(model, date) });
  }
  return out;
}
