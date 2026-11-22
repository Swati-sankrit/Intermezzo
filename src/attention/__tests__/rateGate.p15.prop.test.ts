/**
 * Property 15: Detection rate gate.
 * **Validates: Requirements 11.1, 11.2, 11.6**
 */
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { canStartDetection, MIN_DETECTION_GAP_MS } from '../rateGate';

const NUM_RUNS = 300;
const arbTime = fc.integer({ min: 0, max: 1_000_000 });

describe('Property 15: Detection rate gate', () => {
  it('the gap constant is 100 ms', () => {
    expect(MIN_DETECTION_GAP_MS).toBe(100);
  });

  it('a hidden tab never allows detection', () => {
    fc.assert(
      fc.property(arbTime, fc.option(arbTime, { nil: null }), (now, last) => {
        expect(canStartDetection(now, last, false)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('a visible tab with no previous start always allows detection', () => {
    fc.assert(
      fc.property(arbTime, (now) => {
        expect(canStartDetection(now, null, true)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('visible with a previous start: allowed iff now - last >= 100', () => {
    fc.assert(
      fc.property(arbTime, arbTime, (now, last) => {
        expect(canStartDetection(now, last, true)).toBe(now - last >= 100);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('boundary: gaps of 99 deny, 100 and 101 allow', () => {
    fc.assert(
      fc.property(arbTime, (last) => {
        expect(canStartDetection(last + 99, last, true)).toBe(false);
        expect(canStartDetection(last + 100, last, true)).toBe(true);
        expect(canStartDetection(last + 101, last, true)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('simulated frame callbacks: accepted starts are >= 100 ms apart and never while hidden', () => {
    const arbFrames = fc.array(
      fc.record({
        dt: fc.constantFrom(0, 1, 5, 16, 17, 33, 50, 99, 100, 101, 250),
        visible: fc.boolean(),
      }),
      { maxLength: 200 },
    );
    fc.assert(
      fc.property(arbTime, arbFrames, (start, frames) => {
        let now = start;
        let last: number | null = null;
        const accepted: number[] = [];
        for (const f of frames) {
          now += f.dt;
          if (canStartDetection(now, last, f.visible)) {
            expect(f.visible).toBe(true);
            accepted.push(now);
            last = now;
          }
        }
        for (let i = 1; i < accepted.length; i++) {
          expect(accepted[i] - accepted[i - 1]).toBeGreaterThanOrEqual(100);
        }
        // At most 10 starts in any 1000 ms window (half-open).
        for (let i = 0; i + 10 < accepted.length; i++) {
          expect(accepted[i + 10] - accepted[i]).toBeGreaterThanOrEqual(1000);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
