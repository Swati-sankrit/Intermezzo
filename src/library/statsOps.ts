/** Pure, additive reading-stats operations. Never reads the clock; `today` is injected. */
import type { DataModel, Stats } from './model';

export const DAILY_KEEP_DAYS = 90;

export const ZERO_STATS: Stats = {
  paragraphsRead: 0,
  chaptersFinished: 0,
  activeReadingSeconds: 0,
  lookAwayCount: 0,
  sessionCount: 0,
  awaySeconds: 0,
};

export type StatEvent =
  | { kind: 'paragraphs'; count: number }
  | { kind: 'chapter' }
  | { kind: 'active'; seconds: number }
  | { kind: 'away'; seconds: number }
  | { kind: 'lookAway' }
  | { kind: 'session' };

/** A usable amount is a non-negative whole number (rejects NaN, Infinity, fractions, negatives). */
function isAmount(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

export function recordParagraphsRead(stats: Stats, count: number): Stats {
  return isAmount(count) ? { ...stats, paragraphsRead: stats.paragraphsRead + count } : stats;
}

export function recordChapterFinished(stats: Stats): Stats {
  return { ...stats, chaptersFinished: stats.chaptersFinished + 1 };
}

export function addActiveSeconds(stats: Stats, seconds: number): Stats {
  return isAmount(seconds)
    ? { ...stats, activeReadingSeconds: stats.activeReadingSeconds + seconds }
    : stats;
}

export function addAwaySeconds(stats: Stats, seconds: number): Stats {
  return isAmount(seconds) ? { ...stats, awaySeconds: stats.awaySeconds + seconds } : stats;
}

export function recordLookAway(stats: Stats): Stats {
  return { ...stats, lookAwayCount: stats.lookAwayCount + 1 };
}

export function recordSession(stats: Stats): Stats {
  return { ...stats, sessionCount: stats.sessionCount + 1 };
}

/** Sum of all six fields over every per-book Stats in the model. Zeros when none. */
export function overallStats(model: Pick<DataModel, 'stats'>): Stats {
  let total: Stats = { ...ZERO_STATS };
  for (const s of Object.values(model.stats)) {
    total = {
      paragraphsRead: total.paragraphsRead + s.paragraphsRead,
      chaptersFinished: total.chaptersFinished + s.chaptersFinished,
      activeReadingSeconds: total.activeReadingSeconds + s.activeReadingSeconds,
      lookAwayCount: total.lookAwayCount + s.lookAwayCount,
      sessionCount: total.sessionCount + s.sessionCount,
      awaySeconds: total.awaySeconds + s.awaySeconds,
    };
  }
  return total;
}

function applyEvent(stats: Stats, event: StatEvent): Stats {
  switch (event.kind) {
    case 'paragraphs':
      return recordParagraphsRead(stats, event.count);
    case 'chapter':
      return recordChapterFinished(stats);
    case 'active':
      return addActiveSeconds(stats, event.seconds);
    case 'away':
      return addAwaySeconds(stats, event.seconds);
    case 'lookAway':
      return recordLookAway(stats);
    case 'session':
      return recordSession(stats);
    default:
      return stats;
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whole days since the epoch for a real YYYY-MM-DD date, or null. */
function dayNumber(date: string): number | null {
  const m = DATE_RE.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(0);
  t.setUTCFullYear(y, mo - 1, d);
  t.setUTCHours(0, 0, 0, 0);
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return Math.round(t.getTime() / 86_400_000);
}

/**
 * Drops only records more than 90 days before `today`. Keeps everything within 90 days,
 * including future dates and keys it cannot read. Returns the input untouched if `today`
 * is not a real date.
 */
export function pruneDaily(daily: Record<string, Stats>, today: string): Record<string, Stats> {
  const now = dayNumber(today);
  if (now === null) return daily;
  const out: Record<string, Stats> = {};
  for (const [date, s] of Object.entries(daily)) {
    const n = dayNumber(date);
    if (n !== null && now - n > DAILY_KEEP_DAYS) continue;
    out[date] = s;
  }
  return out;
}

/**
 * Adds one event to stats[bookId] and daily[today], then prunes old days.
 * Returns the model unchanged for an unknown book, a bad `today`, or a bad amount.
 */
export function recordEvent(
  model: DataModel,
  bookId: string,
  event: StatEvent,
  today: string,
): DataModel {
  if (!Object.prototype.hasOwnProperty.call(model.books, bookId)) return model;
  if (dayNumber(today) === null) return model;
  if (event.kind === 'paragraphs' && !isAmount(event.count)) return model;
  if ((event.kind === 'active' || event.kind === 'away') && !isAmount(event.seconds)) return model;

  const book = Object.prototype.hasOwnProperty.call(model.stats, bookId)
    ? model.stats[bookId]
    : ZERO_STATS;
  const day = Object.prototype.hasOwnProperty.call(model.daily, today)
    ? model.daily[today]
    : ZERO_STATS;

  return {
    ...model,
    stats: { ...model.stats, [bookId]: applyEvent(book, event) },
    daily: pruneDaily({ ...model.daily, [today]: applyEvent(day, event) }, today),
  };
}
