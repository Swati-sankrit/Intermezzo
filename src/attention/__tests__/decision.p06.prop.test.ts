/**
 * Property 6: Duplicate samples do not change the result.
 * **Validates: Requirements 4.9**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decide, initialDecisionState, stepDecision } from '../decision';
import type { DecisionState } from '../decision';
import type { DecisionConfig, PoseSample } from '../types';
import { arbPoseSample, arbThresholds } from './arbitraries';

const arbConfig: fc.Arbitrary<DecisionConfig> = fc.record({
  thresholds: arbThresholds,
  debounceMs: fc.integer({ min: 0, max: 5000 }),
  returnMs: fc.integer({ min: 0, max: 5000 }),
});

/** Same timestamp, face presence, yaw, pitch and tab state (NaN equals NaN). */
function sameSample(a: PoseSample, b: PoseSample): boolean {
  return (
    Object.is(a.t, b.t) &&
    a.faceFound === b.faceFound &&
    Object.is(a.yaw, b.yaw) &&
    Object.is(a.pitch, b.pitch) &&
    a.tabActive === b.tabActive
  );
}

function removeConsecutiveDuplicates(samples: readonly PoseSample[]): PoseSample[] {
  return samples.filter((s, i) => i === 0 || !sameSample(s, samples[i - 1]));
}

/** Out-of-order sequence where each sample is repeated 1..4 times in a row. */
const arbCase = fc
  .tuple(arbPoseSample({ outOfOrder: true }), arbConfig, fc.array(fc.integer({ min: 0, max: 3 }), { maxLength: 40 }), fc.integer({ min: 0, max: 100_000 }))
  .map(([base, cfg, extra, startT]) => {
    const withDuplicates = base.flatMap((s, i) => Array<PoseSample>(1 + (extra[i] ?? 0)).fill(s));
    return { withDuplicates, cfg, startT };
  });

function fold(samples: readonly PoseSample[], cfg: DecisionConfig, startT: number): DecisionState {
  let state = initialDecisionState(startT);
  for (const s of samples) state = stepDecision(state, s, cfg);
  return state;
}

describe('Property 6: duplicate samples', () => {
  it('removing consecutive duplicates gives the same final signal', () => {
    fc.assert(
      fc.property(arbCase, ({ withDuplicates, cfg, startT }) => {
        const deduped = removeConsecutiveDuplicates(withDuplicates);
        expect(decide(deduped, cfg, startT)).toEqual(decide(withDuplicates, cfg, startT));
      }),
      { numRuns: 500 },
    );
  });

  it('removing consecutive duplicates gives the same final decision state', () => {
    fc.assert(
      fc.property(arbCase, ({ withDuplicates, cfg, startT }) => {
        const deduped = removeConsecutiveDuplicates(withDuplicates);
        expect(fold(deduped, cfg, startT)).toEqual(fold(withDuplicates, cfg, startT));
      }),
      { numRuns: 500 },
    );
  });
});
