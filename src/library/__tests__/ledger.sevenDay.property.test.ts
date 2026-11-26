import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { focusScore, sevenDayFocusScore } from '../ledgerCalculator';
import type { DayStats } from '../statsSelectors';

/**
 * Feature: haunted-shell, Property 2: Seven-day Focus_Score uses summed seconds, not an average
 * of daily scores
 * **Validates: Requirements 8.4**
 *
 * Runs the real sevenDayFocusScore and focusScore with no mocks.
 */

const NUM_RUNS = 300;

const seconds = fc.nat({ max: 100_000 });

const dayStats = (active: number, away: number, other: number): DayStats['stats'] => ({
  paragraphsRead: other,
  chaptersFinished: other % 5,
  activeReadingSeconds: active,
  lookAwayCount: other % 7,
  sessionCount: other % 3,
  awaySeconds: away,
  wordsRead: other * 10,
});

const dayArb = fc
  .record({ active: seconds, away: seconds, other: fc.nat({ max: 1000 }) })
  .map(({ active, away, other }): DayStats => ({
    date: '2026-01-15',
    stats: dayStats(active, away, other),
  }));

/** A day with real data most of the time, and an all-zero (no data) day often. */
const mixedDayArb = fc.oneof(
  dayArb,
  fc.constant<DayStats>({ date: '2026-01-01', stats: dayStats(0, 0, 0) }),
);

const sevenDays = fc.array(mixedDayArb, { minLength: 7, maxLength: 7 });

const sum = (days: DayStats[], key: 'activeReadingSeconds' | 'awaySeconds') =>
  days.reduce((n, d) => n + d.stats[key], 0);

describe('Property 2: seven-day Focus_Score uses summed seconds', () => {
  it('equals focusScore(sum of active, sum of away) over the seven days', () => {
    fc.assert(
      fc.property(sevenDays, (days) => {
        const expected = focusScore(sum(days, 'activeReadingSeconds'), sum(days, 'awaySeconds'));
        expect(sevenDayFocusScore(days)).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('is an integer 0-100, and undefined exactly when total seconds are 0', () => {
    fc.assert(
      fc.property(sevenDays, (days) => {
        const total = sum(days, 'activeReadingSeconds') + sum(days, 'awaySeconds');
        const score = sevenDayFocusScore(days);
        if (total === 0) {
          expect(score).toBeUndefined();
        } else {
          expect(Number.isInteger(score)).toBe(true);
          expect(score! >= 0 && score! <= 100).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('adding an all-zero day anywhere changes nothing', () => {
    fc.assert(
      fc.property(
        fc.array(dayArb, { minLength: 6, maxLength: 6 }),
        fc.integer({ min: 0, max: 6 }),
        fc.nat({ max: 1000 }),
        (six, at, other) => {
          const empty: DayStats = { date: '2026-02-01', stats: dayStats(0, 0, other) };
          const withEmpty = [...six.slice(0, at), empty, ...six.slice(at)];
          expect(sevenDayFocusScore(withEmpty)).toBe(sevenDayFocusScore(six));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('weighs a high-volume day more than a low-volume day, unlike an average of daily scores', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 3, max: 100 }),
        fc.integer({ min: 0, max: 5 }),
        (low, factor, emptyCount) => {
          const high = low * factor;
          // Low day: all active (daily score 100). High day: all away (daily score 0).
          const lowDay: DayStats = { date: '2026-03-01', stats: dayStats(low, 0, 1) };
          const highDay: DayStats = { date: '2026-03-02', stats: dayStats(0, high, 1) };
          const empties = Array.from(
            { length: emptyCount },
            (_, i): DayStats => ({ date: `2026-03-${10 + i}`, stats: dayStats(0, 0, 0) }),
          );
          const days = [lowDay, highDay, ...empties];

          const dailyMean = (focusScore(low, 0)! + focusScore(0, high)!) / 2; // always 50
          const summed = sevenDayFocusScore(days);

          expect(dailyMean).toBe(50);
          expect(summed).toBe(focusScore(low, high));
          expect(summed!).toBeLessThan(dailyMean);
          expect(summed!).toBeLessThanOrEqual(25);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('example: 10 s active in one day and 90 s away in another gives 10, not the mean of 100 and 0', () => {
    const days: DayStats[] = [
      { date: '2026-03-01', stats: dayStats(10, 0, 0) },
      { date: '2026-03-02', stats: dayStats(0, 90, 0) },
      { date: '2026-03-03', stats: dayStats(0, 0, 0) },
    ];
    expect(sevenDayFocusScore(days)).toBe(10);
    expect(sevenDayFocusScore([])).toBeUndefined();
  });
});
