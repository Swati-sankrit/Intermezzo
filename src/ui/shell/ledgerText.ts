/** Plain-text helpers for the Ledger: fixed wording, pace comparison, tally grouping, phase names. */
import type { MoonPhase } from '../../library/ledgerCalculator';

export const TYPICAL_SPEEDS_TEXT = 'Typical adult: 238 wpm (non-fiction), 260 wpm (fiction)';
export const PACE_SOURCE =
  'Brysbaert, M. (2019). How many words do we read per minute? A review and meta-analysis of reading rate. Journal of Memory and Language, 109, 104047.';
export const PACE_FALLBACK = 'Read a little longer to see your pace.';
export const EMPTY_LEDGER_TEXT = 'The ledger is blank. Read a page and the candle will remember.';
export const FOCUS_STATEMENT =
  'The goal here is finishing with focus, not reading faster. Nothing in this app claims to make anyone read faster.';
export const GOAL_NOT_SAVED = 'Your goal may not be remembered after a reload.';
export const FULL_MOON_NOTE = 'A full moon means the daily goal was met.';

export const TALLY_CAP = 20;
export const PACE_BELOW = 214;
export const PACE_ABOVE = 286;

export const PHASE_NAMES: Record<MoonPhase, string> = {
  new: 'new moon',
  crescent: 'crescent moon',
  half: 'half moon',
  gibbous: 'gibbous moon',
  full: 'full moon',
};

/** A plain description of a pace against the typical speeds. Never advice. */
export function paceSentence(wpm: number): string {
  if (wpm < PACE_BELOW) return 'Your pace is below the typical adult speeds.';
  if (wpm > PACE_ABOVE) return 'Your pace is above the typical adult speeds.';
  return 'Your pace is near the typical adult speeds.';
}

/** Marks drawn for a count: at most 20. The full number is always written as text. */
export function drawnTally(count: number): number {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return Math.min(TALLY_CAP, n);
}

/** Group sizes in fives: 12 gives [5, 5, 2]. */
export function tallyGroups(drawn: number): number[] {
  const groups: number[] = [];
  for (let left = drawn; left > 0; left -= 5) groups.push(Math.min(5, left));
  return groups;
}

/** "Mon 3 Mar"-style label from YYYY-MM-DD, falling back to the raw date. */
export function dateLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function minutesText(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / 60);
}
