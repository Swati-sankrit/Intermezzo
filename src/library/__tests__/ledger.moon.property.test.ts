import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { clampDailyGoalMinutes, moonPhase, type MoonPhase } from '../ledgerCalculator';

/**
 * Feature: haunted-shell, Property 3: Moon_Phase is always exactly one of five phases and never
 * regresses as reading time rises
 * **Validates: Requirements 8.6, 8.7**
 *
 * Runs the real moonPhase. Seconds that are not non-negative finite numbers count as 0; goals are
 * clamped to 1-240 minutes (non-finite goals use the default).
 */

const NUM_RUNS = 500;
const ORDER: readonly MoonPhase[] = ['new', 'crescent', 'half', 'gibbous', 'full'];
const idx = (p: MoonPhase) => ORDER.indexOf(p);

const junkNumber = fc.constantFrom(NaN, Infinity, -Infinity, -1, -0.5, -1e9);
const seconds = fc.oneof(
  fc.nat({ max: 20_000_000 }),
  fc.double({ min: 0, max: 1e7, noNaN: true }),
  fc.constant(0),
  junkNumber,
);
const validSeconds = fc.oneof(fc.nat({ max: 20_000_000 }), fc.double({ min: 0, max: 1e7, noNaN: true }));
const goal = fc.oneof(
  fc.integer({ min: 1, max: 240 }),
  fc.double({ min: -50, max: 400, noNaN: true }),
  junkNumber,
  fc.constantFrom(0, 241, 1000),
);

const cleanSeconds = (n: number) => (Number.isFinite(n) && n >= 0 ? n : 0);

describe('Property 3: Moon_Phase', () => {
  it('is always one of the five phases, for any input including junk', () => {
    fc.assert(
      fc.property(seconds, goal, (s, g) => {
        expect(ORDER).toContain(moonPhase(s, g));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('is new exactly when cleaned seconds are 0, and full exactly when seconds reach the goal', () => {
    fc.assert(
      fc.property(seconds, goal, (s, g) => {
        const a = cleanSeconds(s);
        const goalSeconds = clampDailyGoalMinutes(g) * 60;
        const phase = moonPhase(s, g);
        expect(phase === 'new').toBe(a === 0);
        expect(phase === 'full').toBe(a >= goalSeconds);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('uses the 50% / 75% / 100% boundaries between new and full', () => {
    fc.assert(
      fc.property(validSeconds, goal, (s, g) => {
        const a = cleanSeconds(s);
        fc.pre(a > 0);
        const ratio = a / (clampDailyGoalMinutes(g) * 60);
        const expected: MoonPhase =
          ratio < 0.5 ? 'crescent' : ratio < 0.75 ? 'half' : ratio < 1 ? 'gibbous' : 'full';
        expect(moonPhase(s, g)).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('never regresses as reading seconds rise', () => {
    fc.assert(
      fc.property(validSeconds, validSeconds, goal, (x, y, g) => {
        const lo = Math.min(x, y);
        const hi = Math.max(x, y);
        expect(idx(moonPhase(lo, g))).toBeLessThanOrEqual(idx(moonPhase(hi, g)));
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
