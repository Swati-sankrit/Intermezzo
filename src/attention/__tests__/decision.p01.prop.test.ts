/**
 * Property 1: Decision_Function is deterministic and always valid.
 * **Validates: Requirements 4.1, 4.8, 4.14**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { decide } from '../decision';
import type { DecisionConfig, PoseSample } from '../types';
import { arbPoseSample, arbThresholds } from './arbitraries';

const NUM_RUNS = 300;

// Any number, including out-of-range and non-finite values, so clamping is exercised.
const arbMs = fc.oneof(
  fc.integer({ min: -1000, max: 10_000 }),
  fc.double({ min: -1e6, max: 1e6, noNaN: true }),
  fc.constantFrom(NaN, Infinity, -Infinity),
);

const arbConfig: fc.Arbitrary<Partial<DecisionConfig>> = fc.record(
  {
    thresholds: arbThresholds,
    debounceMs: arbMs,
    returnMs: arbMs,
  },
  { requiredKeys: [] },
);

const arbSamples = fc.oneof(
  { weight: 1, arbitrary: fc.constant<PoseSample[]>([]) },
  { weight: 4, arbitrary: arbPoseSample() },
  { weight: 2, arbitrary: arbPoseSample({ outOfOrder: true }) },
);

const arbStartT = fc.integer({ min: 0, max: 100_000 });

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('Property 1: decide is deterministic and always valid', () => {
  it('repeated calls agree, inputs are not mutated, and the result is present or away', () => {
    fc.assert(
      fc.property(arbSamples, arbConfig, arbStartT, (samples, cfg, startT) => {
        const samplesBefore = structuredClone(samples);
        const cfgBefore = structuredClone(cfg);
        // Frozen inputs throw in strict mode if `decide` tries to write to them.
        deepFreeze(samples);
        deepFreeze(cfg);

        const first = decide(samples, cfg, startT);
        const second = decide(samples, cfg, startT);

        expect(second).toEqual(first);
        expect(samples).toEqual(samplesBefore);
        expect(cfg).toEqual(cfgBefore);
        expect(['present', 'away']).toContain(first.value);
        expect(Number.isFinite(first.timestamp)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('the empty sequence returns present stamped with the start time', () => {
    fc.assert(
      fc.property(arbConfig, arbStartT, (cfg, startT) => {
        expect(decide([], cfg, startT)).toEqual({ value: 'present', timestamp: startT });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
