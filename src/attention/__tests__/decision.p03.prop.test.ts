/**
 * Feature: attention-signal, Property 3: Short Away runs never produce away
 *
 * **Validates: Requirements 4.4, 4.15, 10.1, 10.5**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_THRESHOLDS } from '../config';
import { decide, initialDecisionState, stepDecision } from '../decision';
import type { DecisionConfig, PoseSample, Thresholds } from '../types';
import { arbPoseSample, arbRunSequence, arbThresholds } from './arbitraries';

const NUM_RUNS = 500;

const arbDebounce = fc.integer({ min: 500, max: 5000 });

/** Independent oracle for "not Facing" (does not use the code under test). */
function isAway(s: PoseSample, th: Thresholds): boolean {
  if (!s.tabActive || !s.faceFound) return true;
  if (!Number.isFinite(s.yaw) || !Number.isFinite(s.pitch)) return true;
  return (
    Math.abs(s.yaw - th.baselineYaw) > th.yawLimit ||
    Math.abs(s.pitch - th.baselinePitch) > th.pitchLimit
  );
}

/** Longest continuous Away run: last t minus first t of the run. */
function longestAwayRun(samples: readonly PoseSample[], th: Thresholds): number {
  let longest = 0;
  let start: number | null = null;
  for (const s of samples) {
    if (isAway(s, th)) {
      start ??= s.t;
      longest = Math.max(longest, s.t - start);
    } else {
      start = null;
    }
  }
  return longest;
}

/** Every intermediate signal of the fold (initial state included). */
function intermediateValues(
  samples: readonly PoseSample[],
  cfg: DecisionConfig,
  startT: number,
): string[] {
  let state = initialDecisionState(startT);
  const values = [state.signal.value];
  for (const s of samples) {
    state = stepDecision(state, s, cfg);
    values.push(state.signal.value);
  }
  return values;
}

describe('Property 3: Short Away runs never produce away', () => {
  it('run sequences with every Away run at or below the debounce time stay present', () => {
    const arbCase = fc.tuple(arbDebounce, arbThresholds).chain(([d, th]) =>
      fc.tuple(
        fc.constant(d),
        fc.constant(th),
        fc.oneof(arbRunSequence(d, 'below', th), arbRunSequence(d, 'at', th)),
      ),
    );
    fc.assert(
      fc.property(arbCase, ([debounceMs, thresholds, seq]) => {
        const cfg: DecisionConfig = { thresholds, debounceMs, returnMs: 1000 };
        for (const run of seq.runs) {
          if (run.kind === 'away') expect(run.durationMs).toBeLessThanOrEqual(debounceMs);
        }
        expect(longestAwayRun(seq.samples, thresholds)).toBeLessThanOrEqual(debounceMs);
        const values = intermediateValues(seq.samples, cfg, 0);
        expect(values.every((v) => v === 'present')).toBe(true);
        expect(decide(seq.samples, cfg, 0).value).toBe('present');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('arbitrary pose walks whose longest Away run is within the debounce time stay present', () => {
    const arbCase = fc.tuple(arbDebounce, arbThresholds).chain(([d, th]) =>
      fc.tuple(
        fc.constant(d),
        fc.constant(th),
        arbPoseSample({ thresholds: th, maxLength: 12 }),
        fc.integer({ min: 0, max: 100_000 }),
      ),
    );
    fc.assert(
      fc.property(arbCase, ([debounceMs, thresholds, samples, startT]) => {
        fc.pre(longestAwayRun(samples, thresholds) <= debounceMs);
        const cfg: DecisionConfig = { thresholds, debounceMs, returnMs: 1000 };
        const values = intermediateValues(samples, cfg, startT);
        expect(values.every((v) => v === 'present')).toBe(true);
        expect(decide(samples, cfg, startT).value).toBe('present');
      }),
      { numRuns: NUM_RUNS, maxSkipsPerRun: 1000 },
    );
  });

  it('empty and single-sample sequences are present', () => {
    const arbCase = fc.tuple(arbDebounce, arbThresholds).chain(([d, th]) =>
      fc.tuple(
        fc.constant(d),
        fc.constant(th),
        fc.oneof(
          fc.constant<PoseSample[]>([]),
          arbPoseSample({ thresholds: th, maxLength: 1 }),
        ),
        fc.integer({ min: 0, max: 100_000 }),
      ),
    );
    fc.assert(
      fc.property(arbCase, ([debounceMs, thresholds, samples, startT]) => {
        expect(samples.length).toBeLessThanOrEqual(1);
        const cfg: DecisionConfig = { thresholds, debounceMs, returnMs: 1000 };
        expect(decide(samples, cfg, startT).value).toBe('present');
        expect(intermediateValues(samples, cfg, startT).every((v) => v === 'present')).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('examples: empty sequence and a lone Away sample', () => {
    expect(decide([], {}, 7)).toEqual({ value: 'present', timestamp: 7 });
    const lone: PoseSample = { t: 9000, faceFound: false, yaw: 0, pitch: 0, tabActive: false };
    expect(decide([lone], { thresholds: DEFAULT_THRESHOLDS }, 0).value).toBe('present');
  });
});
