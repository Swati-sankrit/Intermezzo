import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { clampDailyGoalMinutes, goalProgress } from '../ledgerCalculator';

/**
 * Feature: haunted-shell, Property 4: Goal_Progress is bounded
 * **Validates: Requirements 8.9, 8.19**
 *
 * Runs the real goalProgress and clampDailyGoalMinutes. Seconds that are not non-negative finite
 * numbers count as 0; goals are clamped to 1-240 whole minutes (non-finite goals use 15).
 */

const NUM_RUNS = 500;

const junkNumber = fc.constantFrom(NaN, Infinity, -Infinity, -1, -0.5, -1e9);
const validSeconds = fc.oneof(
  fc.nat({ max: 20_000_000 }),
  fc.double({ min: 0, max: 1e7, noNaN: true }),
  fc.constant(0),
);
const seconds = fc.oneof(validSeconds, junkNumber);
const goal = fc.oneof(
  fc.integer({ min: 1, max: 240 }),
  fc.double({ min: -50, max: 400, noNaN: true }),
  junkNumber,
  fc.constantFrom(0, 241, 1000, 1e9),
);

const cleanSeconds = (n: number) => (Number.isFinite(n) && n >= 0 ? n : 0);

describe('Property 4: Goal_Progress', () => {
  it('is a whole number from 0 to 100 for any input, including junk', () => {
    fc.assert(
      fc.property(seconds, goal, (s, g) => {
        const p = goalProgress(s, g);
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('never decreases as reading seconds rise', () => {
    fc.assert(
      fc.property(validSeconds, validSeconds, goal, (x, y, g) => {
        const lo = Math.min(x, y);
        const hi = Math.max(x, y);
        expect(goalProgress(lo, g)).toBeLessThanOrEqual(goalProgress(hi, g));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('is 0 when there is no reading (zero or junk seconds)', () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(0), junkNumber), goal, (s, g) => {
        expect(goalProgress(s, g)).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('is 100 when seconds reach the goal in seconds', () => {
    fc.assert(
      fc.property(validSeconds, goal, (s, g) => {
        fc.pre(cleanSeconds(s) >= clampDailyGoalMinutes(g) * 60);
        expect(goalProgress(s, g)).toBe(100);
      }),
      { numRuns: NUM_RUNS },
    );
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 240 }), fc.nat({ max: 1_000_000 }), (m, extra) => {
        expect(goalProgress(m * 60 + extra, m)).toBe(100);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('is below 100 when seconds are clearly under the goal', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 240 }), (m) => {
        expect(goalProgress(m * 30, m)).toBe(50);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('Property 4 (clamp): clampDailyGoalMinutes', () => {
  it('always returns an integer from 1 to 240', () => {
    fc.assert(
      fc.property(goal, (g) => {
        const c = clampDailyGoalMinutes(g);
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(1);
        expect(c).toBeLessThanOrEqual(240);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('returns 15 for non-finite input', () => {
    for (const n of [NaN, Infinity, -Infinity]) expect(clampDailyGoalMinutes(n)).toBe(15);
  });

  it('keeps whole minutes from 1 to 240 unchanged', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 240 }), (m) => {
        expect(clampDailyGoalMinutes(m)).toBe(m);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
