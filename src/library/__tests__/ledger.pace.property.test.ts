import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { measuredPace, PACE_THRESHOLD_SECONDS, type PaceInput } from '../ledgerCalculator';

/**
 * Feature: haunted-shell, Property 5: Measured_Pace is derived only from Pace_Days, is a positive
 * whole number or absent, and is unaffected by zero-Words_Read days
 * **Validates: Requirements 8.10, 8.11, 8.13**
 *
 * Runs the real measuredPace. Any value that is not a non-negative finite number counts as 0.
 */

const NUM_RUNS = 500;

const validAmount = fc.oneof(
  fc.nat({ max: 1_000_000 }),
  fc.double({ min: 0, max: 1e6, noNaN: true }),
  fc.constant(0),
);
const junkAmount = fc.constantFrom(NaN, Infinity, -Infinity, -1, -0.5, -1e9);
const anyAmount = fc.oneof(validAmount, validAmount, junkAmount);

const dayArb: fc.Arbitrary<PaceInput> = fc.record({
  wordsRead: anyAmount,
  activeReadingSeconds: anyAmount,
});
const daysArb = fc.array(dayArb, { maxLength: 30 });

const zeroWordsDayArb: fc.Arbitrary<PaceInput> = fc.record({
  wordsRead: fc.constantFrom(0, NaN, -1, -Infinity, Infinity * 0),
  activeReadingSeconds: anyAmount,
});
const zeroDaysArb = fc.array(zeroWordsDayArb, { maxLength: 30 });

const clean = (n: number) => (Number.isFinite(n) && n >= 0 ? n : 0);

function reference(days: readonly PaceInput[]) {
  let words = 0;
  let seconds = 0;
  for (const d of days) {
    const w = clean(d.wordsRead);
    if (w > 0) {
      words += w;
      seconds += clean(d.activeReadingSeconds);
    }
  }
  return { words, seconds };
}

describe('Property 5: Measured_Pace', () => {
  it('is undefined or a whole number >= 1, never NaN, Infinity, zero or negative', () => {
    fc.assert(
      fc.property(daysArb, (days) => {
        const p = measuredPace(days);
        if (p === undefined) return;
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(p)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('is undefined when the summed active seconds of Pace_Days are under the threshold', () => {
    fc.assert(
      fc.property(daysArb, (days) => {
        const { seconds } = reference(days);
        if (seconds < PACE_THRESHOLD_SECONDS) expect(measuredPace(days)).toBeUndefined();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('equals round(sumWords / (sumActive / 60)) over Pace_Days when present', () => {
    fc.assert(
      fc.property(daysArb, (days) => {
        const { words, seconds } = reference(days);
        const p = measuredPace(days);
        if (seconds < PACE_THRESHOLD_SECONDS) return;
        const expected = Math.round(words / (seconds / 60));
        if (expected >= 1) expect(p).toBe(expected);
        else expect(p).toBeUndefined();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('is unchanged by adding days with zero (or junk) wordsRead, whatever their seconds', () => {
    fc.assert(
      fc.property(daysArb, zeroDaysArb, zeroDaysArb, (days, extraA, extraB) => {
        const before = measuredPace(days);
        expect(measuredPace([...days, ...extraA])).toBe(before);
        expect(measuredPace([...extraA, ...days, ...extraB])).toBe(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('example: 300 words in 120 s over one Pace_Day is 150 wpm; a zero-word day changes nothing', () => {
    const days = [{ wordsRead: 300, activeReadingSeconds: 120 }];
    expect(measuredPace(days)).toBe(150);
    expect(measuredPace([...days, { wordsRead: 0, activeReadingSeconds: 5000 }])).toBe(150);
    expect(measuredPace([{ wordsRead: 300, activeReadingSeconds: 119 }])).toBeUndefined();
  });
});
