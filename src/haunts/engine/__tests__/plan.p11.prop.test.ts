import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  MAX_FADE_OUT_MS,
  MIN_FADE_IN_MS,
  MIN_FADE_IN_REDUCED_MS,
  planFadeIn,
  planFadeOut,
} from '../gate/plan';
import { fadeMsArb } from './arbitraries';

const NUM_RUNS = 300;

/**
 * The shared fadeMsArb has few values inside the bounds (about 1 in 100), so it is
 * mixed with an in-range integer to make "within the bounds" a common case.
 */
const requestedArb: fc.Arbitrary<number | undefined> = fc.oneof(
  { weight: 3, arbitrary: fadeMsArb },
  { weight: 1, arbitrary: fc.integer({ min: 50, max: 1000 }) },
);

const inputArb = fc.tuple(requestedArb, fc.boolean());

describe('Safety_Gate fade planning: fade durations respect their bounds', () => {
  // Feature: haunt-feature, Property 11: Fade durations respect their bounds
  // **Validates: Requirements 2.2, 6.3, 6.4, 6.8, 6.9, 7.2, 13.5, 13.6, 14.9, 15.6**
  it('Property 11: planFadeIn is at least 300 ms, and at least 1000 ms under reduced motion', () => {
    fc.assert(
      fc.property(inputArb, ([requested, reduced]) => {
        const out = planFadeIn(requested, reduced);
        expect(Number.isFinite(out)).toBe(true);
        expect(out).toBeGreaterThanOrEqual(reduced ? MIN_FADE_IN_REDUCED_MS : MIN_FADE_IN_MS);
        expect(out).toBeGreaterThanOrEqual(MIN_FADE_IN_MS);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 11: Fade durations respect their bounds
  // **Validates: Requirements 2.2, 6.3, 6.4, 6.8, 6.9, 7.2, 13.5, 13.6, 14.9, 15.6**
  it('Property 11: planFadeOut is at most 800 ms in every mode', () => {
    fc.assert(
      fc.property(requestedArb, (requested) => {
        const out = planFadeOut(requested);
        expect(Number.isFinite(out)).toBe(true);
        expect(out).toBeLessThanOrEqual(MAX_FADE_OUT_MS);
        expect(out).toBeGreaterThan(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 11: Fade durations respect their bounds
  // **Validates: Requirements 2.2, 6.3, 6.4, 6.8, 6.9, 7.2, 13.5, 13.6, 14.9, 15.6**
  it('Property 11: a usable request above the minimum is kept for fade-in, and one inside the range is kept for fade-out', () => {
    fc.assert(
      fc.property(inputArb, ([requested, reduced]) => {
        const min = reduced ? MIN_FADE_IN_REDUCED_MS : MIN_FADE_IN_MS;
        if (requested !== undefined && Number.isFinite(requested) && requested >= min) {
          expect(planFadeIn(requested, reduced)).toBe(requested);
        }
        if (requested !== undefined && requested >= 50 && requested <= MAX_FADE_OUT_MS) {
          expect(planFadeOut(requested)).toBe(requested);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 11: Fade durations respect their bounds
  // **Validates: Requirements 2.2, 6.3, 6.4, 6.8, 6.9, 7.2, 13.5, 13.6, 14.9, 15.6**
  it('Property 11: generated inputs cover reduced motion on/off and requests below, within, above the bounds, undefined, NaN and infinite', () => {
    const seen = {
      runs: 0,
      reducedOn: 0,
      reducedOff: 0,
      undef: 0,
      nan: 0,
      infinite: 0,
      belowIn: 0,
      withinIn: 0,
      aboveIn: 0,
      belowOut: 0,
      withinOut: 0,
      aboveOut: 0,
    };
    fc.assert(
      fc.property(inputArb, ([requested, reduced]) => {
        seen.runs++;
        if (reduced) seen.reducedOn++;
        else seen.reducedOff++;
        if (requested === undefined) {
          seen.undef++;
          return;
        }
        if (Number.isNaN(requested)) {
          seen.nan++;
          return;
        }
        if (!Number.isFinite(requested)) {
          seen.infinite++;
          return;
        }
        const min = reduced ? MIN_FADE_IN_REDUCED_MS : MIN_FADE_IN_MS;
        if (requested < min) seen.belowIn++;
        else if (requested <= min + 700) seen.withinIn++;
        else seen.aboveIn++;
        if (requested < 50) seen.belowOut++;
        else if (requested <= MAX_FADE_OUT_MS) seen.withinOut++;
        else seen.aboveOut++;
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
