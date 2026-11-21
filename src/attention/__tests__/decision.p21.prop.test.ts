/**
 * Property 21: Away classification is symmetric about the baseline.
 * **Validates: Requirements 4.18**
 */
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { isBeyond } from '../config';
import { decide, isAwaySample } from '../decision';
import type { PoseSample } from '../types';
import { arbThresholds } from './arbitraries';

const NUM_RUNS = 300;
/** Multiples of 0.25, so all sums and differences below are exact. */
const arbQuarter = (min: number, max: number) =>
  fc.integer({ min: min * 4, max: max * 4 }).map((n) => n / 4 + 0);
const arbDelta = arbQuarter(0, 200);
const arbAxis = fc.constantFrom<'yaw' | 'pitch'>('yaw', 'pitch');

function sample(yaw: number, pitch: number, t = 0): PoseSample {
  return { t, faceFound: true, tabActive: true, yaw, pitch };
}

describe('Property 21: Away classification is symmetric about the baseline', () => {
  it('baseline + delta and baseline - delta classify the same on either axis', () => {
    fc.assert(
      fc.property(arbThresholds, arbDelta, arbAxis, (th, delta, axis) => {
        const { baselineYaw: by, baselinePitch: bp } = th;
        const plus =
          axis === 'yaw' ? sample(by + delta, bp) : sample(by, bp + delta);
        const minus =
          axis === 'yaw' ? sample(by - delta, bp) : sample(by, bp - delta);
        expect(isAwaySample(plus, th)).toBe(isAwaySample(minus, th));
        // and the answer is the strict limit comparison
        const limit = axis === 'yaw' ? th.yawLimit : th.pitchLimit;
        expect(isAwaySample(plus, th)).toBe(delta > limit);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('mirrored sample runs give the same decide result', () => {
    fc.assert(
      fc.property(arbThresholds, arbDelta, arbAxis, (th, delta, axis) => {
        const run = (sign: 1 | -1): PoseSample[] =>
          Array.from({ length: 31 }, (_, i) =>
            axis === 'yaw'
              ? sample(th.baselineYaw + sign * delta, th.baselinePitch, i * 100)
              : sample(th.baselineYaw, th.baselinePitch + sign * delta, i * 100),
          );
        const cfg = { thresholds: th, debounceMs: 1500, returnMs: 1000 };
        expect(decide(run(1), cfg)).toEqual(decide(run(-1), cfg));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('shifting sample and baseline by the same amount keeps the classification', () => {
    fc.assert(
      fc.property(
        arbThresholds,
        arbQuarter(-200, 200),
        arbQuarter(-200, 200),
        arbQuarter(-100, 100),
        arbQuarter(-100, 100),
        (th, yaw, pitch, shiftYaw, shiftPitch) => {
          const shifted = {
            ...th,
            baselineYaw: th.baselineYaw + shiftYaw,
            baselinePitch: th.baselinePitch + shiftPitch,
          };
          expect(isAwaySample(sample(yaw + shiftYaw, pitch + shiftPitch), shifted)).toBe(
            isAwaySample(sample(yaw, pitch), th),
          );
          expect(isBeyond(yaw + shiftYaw, pitch + shiftPitch, shifted)).toBe(
            isBeyond(yaw, pitch, th),
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
