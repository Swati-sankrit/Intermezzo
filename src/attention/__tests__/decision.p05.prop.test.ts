/**
 * Property 5: Signal timestamps never decrease and stale samples are ignored.
 * **Validates: Requirements 4.6, 4.13**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { initialDecisionState, stepDecision } from '../decision';
import type { DecisionState } from '../decision';
import type { DecisionConfig, PoseSample } from '../types';
import { arbPoseBody, arbPoseSample, arbThresholds } from './arbitraries';

const arbConfig: fc.Arbitrary<DecisionConfig> = fc.record({
  thresholds: arbThresholds,
  debounceMs: fc.integer({ min: 0, max: 5000 }),
  returnMs: fc.integer({ min: 0, max: 5000 }),
});

/** Out-of-order samples, with some timestamps replaced by non-finite values. */
const arbMessySamples: fc.Arbitrary<PoseSample[]> = fc
  .tuple(
    arbPoseSample({ outOfOrder: true }),
    fc.array(fc.constantFrom(NaN, Infinity, -Infinity), { maxLength: 4 }),
    fc.array(fc.nat(), { maxLength: 4 }),
  )
  .map(([samples, bad, where]) => {
    const out = [...samples];
    bad.forEach((t, i) => {
      if (out.length > 0) {
        const k = (where[i] ?? 0) % out.length;
        out[k] = { ...out[k], t };
      }
    });
    return out;
  });

function fold(samples: readonly PoseSample[], cfg: DecisionConfig): DecisionState[] {
  const states: DecisionState[] = [];
  let state = initialDecisionState(0);
  states.push(state);
  for (const s of samples) {
    state = stepDecision(state, s, cfg);
    states.push(state);
  }
  return states;
}

describe('Property 5: timestamps and stale samples', () => {
  it('signal timestamps never decrease across the fold', () => {
    fc.assert(
      fc.property(arbMessySamples, arbConfig, (samples, cfg) => {
        const stamps = fold(samples, cfg).map((s) => s.signal.timestamp);
        for (let i = 1; i < stamps.length; i++) {
          expect(stamps[i]).toBeGreaterThanOrEqual(stamps[i - 1]);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('inserting a sample older than the latest accepted one changes nothing', () => {
    const arbCase = fc.tuple(
      arbPoseSample({ outOfOrder: true }),
      arbConfig,
      fc.nat(),
      fc.integer({ min: 1, max: 100_000 }),
      arbPoseBody(),
    );
    fc.assert(
      fc.property(arbCase, ([samples, cfg, pos, back, body]) => {
        const at = samples.length === 0 ? 0 : pos % (samples.length + 1);
        const prefixState = fold(samples.slice(0, at), cfg).at(-1)!;
        fc.pre(prefixState.lastT !== null);
        const stale: PoseSample = { t: prefixState.lastT! - back, ...body };
        const withStale = [...samples.slice(0, at), stale, ...samples.slice(at)];
        expect(fold(withStale, cfg).at(-1)).toEqual(fold(samples, cfg).at(-1));
      }),
      { numRuns: 500 },
    );
  });

  it('non-finite timestamps are ignored', () => {
    const arbCase = fc.tuple(
      arbPoseSample({ outOfOrder: true }),
      arbConfig,
      fc.nat(),
      fc.constantFrom(NaN, Infinity, -Infinity),
      arbPoseBody(),
    );
    fc.assert(
      fc.property(arbCase, ([samples, cfg, pos, t, body]) => {
        const at = samples.length === 0 ? 0 : pos % (samples.length + 1);
        const withBad = [...samples.slice(0, at), { t, ...body }, ...samples.slice(at)];
        expect(fold(withBad, cfg).at(-1)).toEqual(fold(samples, cfg).at(-1));
      }),
      { numRuns: 300 },
    );
  });
});
