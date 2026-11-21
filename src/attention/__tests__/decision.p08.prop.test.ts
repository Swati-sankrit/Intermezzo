/**
 * Property 8: Baseline-relative boundary is strict and defaults apply.
 * **Validates: Requirements 4.17, 4.18**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, isBeyond } from '../config';
import { decide, isAwaySample } from '../decision';
import type { PoseSample } from '../types';
import { arbPoseSample, arbThresholds } from './arbitraries';

const NUM_RUNS = 300;
const STEP = 0.25;
const sign = fc.constantFrom<1 | -1>(1, -1);
const axis = fc.constantFrom<'yaw' | 'pitch'>('yaw', 'pitch');

function sampleAt(yaw: number, pitch: number, t = 0): PoseSample {
  return { t, faceFound: true, tabActive: true, yaw, pitch };
}

/** Offset from the baseline, in quarter degrees, in 0..limit (limit itself included). */
function arbInside(limit: number): fc.Arbitrary<number> {
  return fc.oneof(fc.constant(limit), fc.integer({ min: 0, max: Math.round(limit * 4) }).map((n) => n * STEP));
}

/** Thresholds with a pose that is inside or exactly on both limits, plus the side signs. */
const arbFacingCase = arbThresholds.chain((th) =>
  fc
    .tuple(arbInside(th.yawLimit), arbInside(th.pitchLimit), sign, sign)
    .map(([dy, dp, sy, sp]) => ({
      th,
      yaw: th.baselineYaw + sy * dy,
      pitch: th.baselinePitch + sp * dp,
    })),
);

/** Thresholds with a pose strictly past one limit (by 0.25 or more), other axis anywhere inside. */
const arbAwayCase = fc
  .tuple(arbThresholds, axis, sign, fc.integer({ min: 1, max: 80 }), sign, fc.double({ min: 0, max: 1, noNaN: true }))
  .map(([th, ax, s, beyond, s2, frac]) => {
    const otherLimit = ax === 'yaw' ? th.pitchLimit : th.yawLimit;
    const other = s2 * Math.round(frac * otherLimit * 4) * STEP;
    const past = s * (ax === 'yaw' ? th.yawLimit : th.pitchLimit) + s * beyond * STEP;
    return ax === 'yaw'
      ? { th, yaw: th.baselineYaw + past, pitch: th.baselinePitch + other }
      : { th, yaw: th.baselineYaw + other, pitch: th.baselinePitch + past };
  });

describe('Property 8: strict baseline-relative boundary', () => {
  it('angles inside or exactly on baseline +- limit are Facing', () => {
    fc.assert(
      fc.property(arbFacingCase, ({ th, yaw, pitch }) => {
        expect(isAwaySample(sampleAt(yaw, pitch), th)).toBe(false);
        expect(isBeyond(yaw, pitch, th)).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('any step past a limit, either side, yaw or pitch, is Away', () => {
    fc.assert(
      fc.property(arbAwayCase, ({ th, yaw, pitch }) => {
        expect(isAwaySample(sampleAt(yaw, pitch), th)).toBe(true);
        expect(isBeyond(yaw, pitch, th)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('exactly on a limit never goes away through decide; one step past does', () => {
    const arbRun = fc.tuple(arbFacingCase, axis, sign, fc.integer({ min: 0, max: 50_000 }));
    fc.assert(
      fc.property(arbRun, ([facing, ax, s, startT]) => {
        const { th } = facing;
        const onLimit =
          ax === 'yaw'
            ? [th.baselineYaw + s * th.yawLimit, facing.pitch]
            : [facing.yaw, th.baselinePitch + s * th.pitchLimit];
        const pastLimit =
          ax === 'yaw'
            ? [onLimit[0] + s * STEP, onLimit[1]]
            : [onLimit[0], onLimit[1] + s * STEP];
        // 10 s of samples, far above the largest debounce time.
        const run = (pose: number[]): PoseSample[] =>
          [0, 5000, 10_000].map((o) => sampleAt(pose[0], pose[1], startT + o));
        const cfg = { thresholds: th, debounceMs: 1500 };
        expect(decide(run(onLimit), cfg, startT)).toEqual({ value: 'present', timestamp: startT });
        expect(decide(run(pastLimit), cfg, startT)).toEqual({ value: 'away', timestamp: startT + 5000 });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('Property 8: defaults apply when Thresholds are missing', () => {
  it('decide without Thresholds equals decide with DEFAULT_THRESHOLDS for any sequence', () => {
    const arbCase = fc.tuple(
      arbPoseSample({ outOfOrder: true }),
      fc.integer({ min: 0, max: 5000 }),
      fc.integer({ min: 0, max: 100_000 }),
    );
    fc.assert(
      fc.property(arbCase, ([samples, debounceMs, startT]) => {
        const expected = decide(samples, { thresholds: DEFAULT_THRESHOLDS, debounceMs }, startT);
        expect(decide(samples, { debounceMs }, startT)).toEqual(expected);
        expect(decide(samples, { debounceMs, thresholds: undefined }, startT)).toEqual(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('defaults are baseline 0/0, yaw limit 25, pitch limit 20 (boundary exact, one step past is Away)', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ baselineYaw: 0, baselinePitch: 0, yawLimit: 25, pitchLimit: 20 });
    const arbCase = fc.tuple(axis, sign, fc.boolean(), fc.integer({ min: 0, max: 50_000 }));
    fc.assert(
      fc.property(arbCase, ([ax, s, pastIt, startT]) => {
        const limit = ax === 'yaw' ? 25 : 20;
        const v = s * (limit + (pastIt ? STEP : 0));
        const yaw = ax === 'yaw' ? v : 0;
        const pitch = ax === 'pitch' ? v : 0;
        const samples = [0, 5000, 10_000].map((o) => sampleAt(yaw, pitch, startT + o));
        const result = decide(samples, {}, startT);
        expect(result).toEqual(
          pastIt ? { value: 'away', timestamp: startT + 5000 } : { value: 'present', timestamp: startT },
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
