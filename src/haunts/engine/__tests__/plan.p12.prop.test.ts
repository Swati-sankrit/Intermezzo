import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MAX_FLASHES_PER_SEC, allocateFlashRates, sweepRate } from '../gate/plan';
import { rateRequestsArb } from './arbitraries';

const NUM_RUNS = 300;
const TOLERANCE = 1e-9;

/** Any sweep period: ordinary, tiny, negative, zero, huge, NaN, infinite. */
const periodArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 10_000 }) },
  { weight: 2, arbitrary: fc.double({ noDefaultInfinity: true, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, -0, 0, -1, 1, 1999, 2000) },
);

/** Rate requests plus sweep-derived requests (keys cannot clash with the generated keys). */
const mixedRequestsArb = fc
  .tuple(
    rateRequestsArb,
    fc.array(periodArb, { maxLength: 4 }),
    // Input shaping: shared rateRequestsArb makes NaN rare (about 4.7%), so one bad rate is added to about 1 set in 4.
    fc.oneof(
      { weight: 3, arbitrary: fc.constant(null) },
      { weight: 1, arbitrary: fc.constantFrom(NaN, NaN, Infinity, -Infinity, -1) },
    ),
  )
  .map(([base, periods, bad]) => [
    ...base,
    ...periods.map((p, i) => ({ key: `~sweep${i}`, rate: sweepRate(p) })),
    ...(bad === null ? [] : [{ key: '~bad', rate: bad }]),
  ]);

const inputArb = fc.tuple(mixedRequestsArb, fc.boolean());

const sum = (xs: readonly { rate: number }[]): number => xs.reduce((a, r) => a + r.rate, 0);

describe('Safety_Gate flash budget: combined rate is at most 3 per second', () => {
  // Feature: haunt-feature, Property 12: Combined flash rate is at most 3 per second, and zero under reduced motion
  // **Validates: Requirements 6.5, 6.7, 6.10, 6.17**
  it('Property 12: every allocated rate is finite and at least 0, and the sum is at most 3 (within 1e-9)', () => {
    fc.assert(
      fc.property(inputArb, ([requests, reduced]) => {
        const out = allocateFlashRates(requests, reduced);
        expect(out.length).toBe(requests.length);
        out.forEach((r, i) => {
          expect(r.key).toBe(requests[i].key);
          expect(Number.isFinite(r.rate)).toBe(true);
          expect(r.rate).toBeGreaterThanOrEqual(0);
          expect(r.rate).toBeLessThanOrEqual(MAX_FLASHES_PER_SEC + TOLERANCE);
        });
        expect(sum(out)).toBeLessThanOrEqual(MAX_FLASHES_PER_SEC + TOLERANCE);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 12: Combined flash rate is at most 3 per second, and zero under reduced motion
  // **Validates: Requirements 6.5, 6.7, 6.10, 6.17**
  it('Property 12: requests that already fit are unchanged', () => {
    fc.assert(
      fc.property(inputArb, ([requests]) => {
        const fits =
          requests.every((r) => Number.isFinite(r.rate) && r.rate >= 0 && r.rate <= MAX_FLASHES_PER_SEC) &&
          sum(requests) <= MAX_FLASHES_PER_SEC;
        if (!fits) return;
        const out = allocateFlashRates(requests, false);
        // Numeric equality, so a requested -0 and an allocated 0 count as the same rate.
        out.forEach((r, i) => expect(r.rate === requests[i].rate).toBe(true));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 12: Combined flash rate is at most 3 per second, and zero under reduced motion
  // **Validates: Requirements 6.5, 6.7, 6.10, 6.17**
  it('Property 12: with reduced motion on, every allocated rate is 0', () => {
    fc.assert(
      fc.property(mixedRequestsArb, (requests) => {
        const out = allocateFlashRates(requests, true);
        expect(out.length).toBe(requests.length);
        out.forEach((r, i) => {
          expect(r.key).toBe(requests[i].key);
          expect(r.rate === 0).toBe(true);
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 12: Combined flash rate is at most 3 per second, and zero under reduced motion
  // **Validates: Requirements 6.5, 6.7, 6.10, 6.17**
  it('Property 12: sweepRate is finite, positive and at most 0.5 for any period', () => {
    fc.assert(
      fc.property(periodArb, (period) => {
        const rate = sweepRate(period);
        expect(Number.isFinite(rate)).toBe(true);
        expect(rate).toBeGreaterThan(0);
        expect(rate).toBeLessThanOrEqual(0.5);
        if (Number.isFinite(period) && period >= 2000) expect(rate).toBe(1000 / period);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 12: Combined flash rate is at most 3 per second, and zero under reduced motion
  // **Validates: Requirements 6.5, 6.7, 6.10, 6.17**
  it('Property 12: generated inputs cover over-budget and within-budget sets, reduced motion on/off, and NaN, infinite and negative rates', () => {
    const seen = {
      runs: 0,
      reducedOn: 0,
      reducedOff: 0,
      overBudget: 0,
      withinBudget: 0,
      nan: 0,
      infinite: 0,
      negative: 0,
    };
    fc.assert(
      fc.property(inputArb, ([requests, reduced]) => {
        seen.runs++;
        if (reduced) seen.reducedOn++;
        else seen.reducedOff++;
        const clamped = requests.map((r) =>
          Number.isFinite(r.rate) && r.rate > 0 ? Math.min(r.rate, MAX_FLASHES_PER_SEC) : 0,
        );
        if (clamped.reduce((a, b) => a + b, 0) > MAX_FLASHES_PER_SEC) seen.overBudget++;
        else seen.withinBudget++;
        if (requests.some((r) => Number.isNaN(r.rate))) seen.nan++;
        if (requests.some((r) => r.rate === Infinity || r.rate === -Infinity)) seen.infinite++;
        if (requests.some((r) => r.rate < 0)) seen.negative++;
      }),
      { numRuns: NUM_RUNS },
    );
    const msg = JSON.stringify(seen);
    const floor = seen.runs * 0.05;
    for (const key of Object.keys(seen) as (keyof typeof seen)[]) {
      if (key === 'runs') continue;
      expect(seen[key], `${key}: ${msg}`).toBeGreaterThanOrEqual(floor);
    }
  });
});
