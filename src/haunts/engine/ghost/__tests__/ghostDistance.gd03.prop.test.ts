import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ghostDistance } from '../ghostDistance';

const NUM_RUNS = 300;

/** Independent reference: NaN and anything below 1 give 0, 4 and above give 4, else the whole part. */
function reference(count: number): number {
  if (!(count >= 1)) return 0;
  if (count >= 4) return 4;
  return Math.trunc(count);
}

/** Counts of every awkward kind: NaN, infinities, negative zero, negatives, fractions, above 4. */
const countArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 2, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, -0, 0, 0.5, 0.999, 1, 3.5, 3.999999, 4, 4.0001, 5) },
  { weight: 6, arbitrary: fc.constantFrom(NaN, NaN, Infinity, -Infinity, 1, 1.5, 2, 2.5, 2.9, 3) },
  { weight: 3, arbitrary: fc.integer({ min: -10, max: 12 }) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 5 }) },
  { weight: 3, arbitrary: fc.double({ min: -10, max: 12, noNaN: true }) },
  { weight: 2, arbitrary: fc.double() },
  { weight: 1, arbitrary: fc.constantFrom(Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER) },
);

describe('ghostDistance (ghost-dread)', () => {
  // Feature: ghost-dread, Property 3: Ghost_Distance is bounded and non-decreasing
  // **Validates: Requirements 2.5, 11.15**
  it('Property 3: returns an integer from 0 to 4 for any number, and matches the reference', () => {
    fc.assert(
      fc.property(countArb, (count) => {
        const step = ghostDistance(count);
        expect(Number.isInteger(step)).toBe(true);
        expect(step).toBeGreaterThanOrEqual(0);
        expect(step).toBeLessThanOrEqual(4);
        expect(step).toBe(reference(count));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 3: Ghost_Distance is bounded and non-decreasing
  // **Validates: Requirements 2.5, 11.15**
  it('Property 3: a count a <= b never gives a larger step for a than for b', () => {
    fc.assert(
      fc.property(
        countArb.filter((n) => !Number.isNaN(n)),
        countArb.filter((n) => !Number.isNaN(n)),
        (x, y) => {
          const a = Math.min(x, y);
          const b = Math.max(x, y);
          expect(ghostDistance(a)).toBeLessThanOrEqual(ghostDistance(b));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 3: Ghost_Distance is bounded and non-decreasing
  // **Validates: Requirements 2.5, 11.15**
  it('Property 3: a non-negative integer count gives min(count, 4)', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ min: 0, max: 12 }), fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER })),
        (count) => {
          expect(ghostDistance(count)).toBe(Math.min(count, 4));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 3: Ghost_Distance is bounded and non-decreasing
  // **Validates: Requirements 2.5, 11.15**
  it('Property 3: -0, NaN and values in (-1, 1) give +0, never -0', () => {
    for (const count of [-0, 0, NaN, -Number.MIN_VALUE, -0.5, 0.5, 0.999]) {
      expect(Object.is(ghostDistance(count), 0), `count ${count}`).toBe(true);
    }
  });

  // Feature: ghost-dread, Property 3: Ghost_Distance is bounded and non-decreasing
  // **Validates: Requirements 2.5, 11.15**
  it('Property 3: the generator reaches NaN, negatives, infinities, fractions and counts above 4', () => {
    const seen = { runs: 0, nan: 0, negative: 0, infinite: 0, fraction: 0, above4: 0, each: [0, 0, 0, 0, 0] };
    fc.assert(
      fc.property(countArb, (count) => {
        seen.runs++;
        if (Number.isNaN(count)) seen.nan++;
        else if (count < 0) seen.negative++;
        if (!Number.isFinite(count) && !Number.isNaN(count)) seen.infinite++;
        if (Number.isFinite(count) && !Number.isInteger(count)) seen.fraction++;
        if (count > 4) seen.above4++;
        seen.each[ghostDistance(count)]++;
      }),
      { numRuns: 1000 },
    );
    const msg = JSON.stringify(seen);
    expect(seen.nan >= seen.runs * 0.01, `nan: ${msg}`).toBe(true);
    for (const key of ['negative', 'infinite', 'fraction', 'above4'] as const) {
      expect(seen[key] >= seen.runs * 0.02, `${key}: ${msg}`).toBe(true);
    }
    for (const n of seen.each) expect(n >= seen.runs * 0.02, msg).toBe(true);
  });
});
