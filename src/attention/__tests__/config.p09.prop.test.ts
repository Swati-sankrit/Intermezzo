/**
 * Property 9: Config clamping.
 * **Validates: Requirements 4.10, 4.11, 6.10, 6.11, 6.12**
 *
 * Design: clampDebounce(x) is within [500, 5000], equals x inside that range,
 * and equals the nearest bound otherwise. clampIdleLimit(x, previous) equals
 * max(x, 60000) for finite x and `previous` for non-finite x. DecisionConfig
 * says Return_Time is greater than 0 and at most 1000; at or below 0 or
 * non-finite gives 1000 (design.md, DecisionConfig).
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_RETURN_MS,
  MAX_DEBOUNCE_MS,
  MAX_RETURN_MS,
  MIN_DEBOUNCE_MS,
  MIN_IDLE_LIMIT_MS,
  clampDebounce,
  clampIdleLimit,
  clampReturnTime,
} from '../config';

const NUM_RUNS = 300;

const arbNumber = fc.oneof(
  fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }),
  fc.integer({ min: -10_000, max: 130_000 }),
  fc.constantFrom(NaN, Infinity, -Infinity, 0, -0, -1, 500, 5000, 1000, 60_000),
  fc.constantFrom(499.999, 500.001, 4999.999, 5000.001, 999.999, 1000.001, 59_999.999, 60_000.001),
);

describe('Property 9: config clamping', () => {
  it('clampDebounce stays in [500, 5000], keeps in-range values, snaps to the nearest bound', () => {
    fc.assert(
      fc.property(arbNumber, (x) => {
        const r = clampDebounce(x);
        expect(r).toBeGreaterThanOrEqual(MIN_DEBOUNCE_MS);
        expect(r).toBeLessThanOrEqual(MAX_DEBOUNCE_MS);
        if (Number.isFinite(x)) {
          if (x >= MIN_DEBOUNCE_MS && x <= MAX_DEBOUNCE_MS) expect(r).toBe(x);
          else if (x < MIN_DEBOUNCE_MS) expect(r).toBe(MIN_DEBOUNCE_MS);
          else expect(r).toBe(MAX_DEBOUNCE_MS);
        } else {
          expect(r).toBe(DEFAULT_DEBOUNCE_MS);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('clampDebounce handles the exact bounds', () => {
    expect(clampDebounce(500)).toBe(500);
    expect(clampDebounce(5000)).toBe(5000);
    expect(clampDebounce(499)).toBe(500);
    expect(clampDebounce(5001)).toBe(5000);
  });

  it('clampIdleLimit is max(x, 60000) for finite x and previous otherwise', () => {
    fc.assert(
      fc.property(arbNumber, arbNumber, (x, previous) => {
        const r = clampIdleLimit(x, previous);
        if (Number.isFinite(x)) {
          expect(r).toBe(Math.max(x, MIN_IDLE_LIMIT_MS));
          expect(r).toBeGreaterThanOrEqual(MIN_IDLE_LIMIT_MS);
        } else {
          expect(Object.is(r, previous)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('clampReturnTime returns a value in (0, 1000]: keeps (0, 1000], caps above, and uses 1000 for <= 0 or non-finite', () => {
    const arbReturn = fc.oneof(
      fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom(0, -0, -1, 1000, 1001, NaN, Infinity, -Infinity),
    );
    fc.assert(
      fc.property(arbReturn, (x) => {
        const r = clampReturnTime(x);
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThanOrEqual(MAX_RETURN_MS);
        if (!Number.isFinite(x)) expect(r).toBe(DEFAULT_RETURN_MS);
        else if (x <= 0) expect(r).toBe(DEFAULT_RETURN_MS);
        else if (x <= MAX_RETURN_MS) expect(r).toBe(x);
        else expect(r).toBe(MAX_RETURN_MS);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
