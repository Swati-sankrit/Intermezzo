import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { suggestedSeconds, ewmaUpdate, updateAveragePace, MIN_WPM, MAX_WPM } from '../paceCalc';

describe('pace properties', () => {
  // Feature: reader-core, Property 12: Suggested time is a positive integer
  /** **Validates: Requirements 7.2** */
  it('suggestedSeconds is an integer >= 1', () => {
    fc.assert(
      fc.property(fc.nat(), fc.integer({ min: 1, max: 2000 }), (wordCount, pace) => {
        const secs = suggestedSeconds(wordCount, pace);
        expect(Number.isInteger(secs)).toBe(true);
        expect(secs).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: reader-core, Property 13: Suggested time grows with word count
  /** **Validates: Requirements 7.2** */
  it('more words never means less suggested time', () => {
    fc.assert(
      fc.property(
        fc
          .tuple(fc.integer({ min: 1, max: 1_000_000 }), fc.integer({ min: 1, max: 1_000_000 }))
          .filter(([a, b]) => a !== b),
        fc.integer({ min: 1, max: 2000 }),
        ([a, b], pace) => {
          const w1 = Math.max(a, b);
          const w2 = Math.min(a, b);
          expect(suggestedSeconds(w1, pace)).toBeGreaterThanOrEqual(suggestedSeconds(w2, pace));
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: reader-core, Property 14: EWMA formula correctness
  /** **Validates: Requirements 7.6** */
  it('ewmaUpdate equals 0.8*prev + 0.2*actual within floating tolerance', () => {
    const wpm = fc.float({ min: 1, max: 2000, noNaN: true });
    fc.assert(
      fc.property(wpm, wpm, (prev, actual) => {
        const expected = 0.8 * prev + 0.2 * actual;
        const got = ewmaUpdate(prev, actual);
        expect(Math.abs(got - expected)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(expected)));
      }),
      { numRuns: 100 },
    );
  });

  // Feature: reader-core, Property 15: Average pace stays within bounds
  /** **Validates: Requirements 7.8** */
  it('pace stays within [50, 1000] after every event', () => {
    const event = fc.record({
      wordCount: fc.nat({ max: 5000 }),
      timeSeconds: fc.double({ min: 0, max: 1000, noNaN: true }),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: MIN_WPM, max: MAX_WPM }),
        fc.array(event, { maxLength: 50 }),
        (start, events) => {
          let pace = start;
          for (const e of events) {
            pace = updateAveragePace(pace, e.wordCount, e.timeSeconds);
            expect(pace).toBeGreaterThanOrEqual(MIN_WPM);
            expect(pace).toBeLessThanOrEqual(MAX_WPM);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
