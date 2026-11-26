import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { focusScore } from '../ledgerCalculator';

/**
 * Feature: haunted-shell, Property 1: Focus_Score is bounded, and undefined exactly when there
 * is no data
 * **Validates: Requirements 8.2, 8.3**
 *
 * Runs the real focusScore. Any input that is not a non-negative finite number counts as 0.
 */

const NUM_RUNS = 500;

const validSeconds = fc.oneof(
  fc.nat({ max: 10_000_000 }),
  fc.double({ min: 0, max: 1e7, noNaN: true }),
  fc.constant(0),
);
const junkSeconds = fc.oneof(
  fc.double({ max: -Number.MIN_VALUE, noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(NaN, Infinity, -Infinity, -1, -0.5),
);
const anySeconds = fc.oneof(validSeconds, validSeconds, junkSeconds);

const clean = (n: number) => (Number.isFinite(n) && n >= 0 ? n : 0);

describe('Property 1: Focus_Score bounds', () => {
  it('is an integer in 0-100, and undefined exactly when cleaned active + away is 0', () => {
    fc.assert(
      fc.property(anySeconds, anySeconds, (active, away) => {
        const score = focusScore(active, away);
        const noData = clean(active) + clean(away) === 0;
        if (noData) {
          expect(score).toBeUndefined();
        } else {
          expect(score).toBeDefined();
          expect(Number.isInteger(score)).toBe(true);
          expect(score! >= 0 && score! <= 100).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('is 100 when away is 0 and active > 0', () => {
    fc.assert(
      fc.property(
        validSeconds.filter((n) => n > 0),
        fc.constantFrom(0, -0, -1, NaN, -Infinity, Infinity),
        (active, away) => {
          expect(focusScore(active, away)).toBe(100);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('is 0 when active is 0 and away > 0', () => {
    fc.assert(
      fc.property(
        validSeconds.filter((n) => n > 0),
        fc.constantFrom(0, -0, -1, NaN, -Infinity, Infinity),
        (away, active) => {
          expect(focusScore(active, away) === 0).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('example: both zero gives undefined, 30 active and 10 away gives 75', () => {
    expect(focusScore(0, 0)).toBeUndefined();
    expect(focusScore(30, 10)).toBe(75);
  });
});
