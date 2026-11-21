/**
 * Property 4: Return is prompt, stamped by the first Facing sample, and away
 * persists until then.
 *
 * **Validates: Requirements 4.5, 4.7, 5.9, 10.2, 10.3**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decide, initialDecisionState, isAwaySample, stepDecision } from '../decision';
import type { AttentionSignal, DecisionConfig, PoseSample } from '../types';
import { arbPoseSample, arbRunSequence, arbThresholds } from './arbitraries';

const NUM_RUNS = 500;

const arbConfig: fc.Arbitrary<DecisionConfig> = fc.record({
  thresholds: arbThresholds,
  debounceMs: fc.integer({ min: 500, max: 5000 }),
  returnMs: fc.integer({ min: 1, max: 1000 }),
});

/** A sequence with in-order or out-of-order timestamps, plus its config. */
const arbCase = fc
  .tuple(arbConfig, fc.boolean())
  .chain(([cfg, outOfOrder]) =>
    fc.record({
      cfg: fc.constant(cfg),
      samples: arbPoseSample({ outOfOrder, thresholds: cfg.thresholds, maxLength: 60 }),
    }),
  );

/** Run-structured sequences that reliably reach `away` and then return. */
const arbRuns = arbConfig.chain((cfg) =>
  arbRunSequence(cfg.debounceMs, 'mixed', cfg.thresholds).map((seq) => ({
    cfg,
    samples: seq.samples,
  })),
);

interface Trace {
  readonly before: AttentionSignal;
  readonly after: AttentionSignal;
  readonly sample: PoseSample;
  readonly accepted: boolean;
}

/** Steps the real stepDecision and records each transition. */
function trace(samples: readonly PoseSample[], cfg: DecisionConfig): Trace[] {
  let state = initialDecisionState(0);
  let lastT: number | null = null;
  const out: Trace[] = [];
  for (const sample of samples) {
    const accepted = Number.isFinite(sample.t) && (lastT === null || sample.t >= lastT);
    const before = state.signal;
    state = stepDecision(state, sample, cfg);
    if (accepted) lastT = sample.t;
    out.push({ before, after: state.signal, sample, accepted });
  }
  return out;
}

function checkReturn(samples: readonly PoseSample[], cfg: DecisionConfig): void {
  const steps = trace(samples, cfg);
  let sawAway = false;
  for (const { before, after, sample, accepted } of steps) {
    if (!accepted) {
      expect(after).toEqual(before);
      continue;
    }
    if (before.value === 'away') {
      sawAway = true;
      if (isAwaySample(sample, cfg.thresholds)) {
        // persists, same value and timestamp, through every Away_Sample
        expect(after).toEqual(before);
      } else {
        // first Facing_Sample: present, stamped with exactly that sample's t
        expect(after).toEqual({ value: 'present', timestamp: sample.t });
      }
    }
    if (after.value === 'away') sawAway = true;
  }
  if (sawAway) {
    // last accepted sample decides the final value once an away has occurred
    const lastAccepted = [...steps].reverse().find((s) => s.accepted);
    const final = steps[steps.length - 1].after;
    if (lastAccepted && !isAwaySample(lastAccepted.sample, cfg.thresholds)) {
      expect(final.value).toBe('present');
      // and decide() agrees with the step fold
      expect(decide(samples, cfg)).toEqual(final);
    }
  }
}

describe('Property 4: prompt return, stamped by the first Facing sample', () => {
  it('away persists through Away samples and ends at the first Facing sample (random sequences)', () => {
    fc.assert(
      fc.property(arbCase, ({ cfg, samples }) => checkReturn(samples, cfg)),
      { numRuns: NUM_RUNS },
    );
  });

  it('away persists through Away samples and ends at the first Facing sample (run-structured sequences)', () => {
    fc.assert(
      fc.property(arbRuns, ({ cfg, samples }) => checkReturn(samples, cfg)),
      { numRuns: NUM_RUNS },
    );
  });

  it('a sequence reaching away then ending in a Facing sample finishes present at that sample', () => {
    const arbReturn = arbConfig.chain((cfg) =>
      fc
        .tuple(
          arbRunSequence(cfg.debounceMs, 'above', cfg.thresholds),
          fc.integer({ min: 1, max: 500 }),
        )
        .map(([seq, gap]) => ({ cfg, seq, gap })),
    );
    fc.assert(
      fc.property(arbReturn, ({ cfg, seq, gap }) => {
        const lastAway = [...seq.runs].reverse().find((r) => r.kind === 'away');
        fc.pre(lastAway !== undefined);
        const th = cfg.thresholds;
        const tail: PoseSample = {
          t: seq.samples[seq.samples.length - 1].t + gap,
          faceFound: true,
          tabActive: true,
          yaw: th.baselineYaw,
          pitch: th.baselinePitch,
        };
        const all = [...seq.samples, tail];
        const steps = trace(all, cfg);
        // Only meaningful when an away was actually produced.
        fc.pre(steps.some((s) => s.after.value === 'away'));
        // The sequence may already have returned on a Facing sample before the
        // tail. The stamp is that of the first Facing sample after the last away.
        let lastAwayIdx = -1;
        steps.forEach((s, i) => {
          if (s.after.value === 'away') lastAwayIdx = i;
        });
        const first = steps.slice(lastAwayIdx + 1).find((s) => s.accepted);
        expect(first).toBeDefined();
        expect(decide(all, cfg)).toEqual({ value: 'present', timestamp: first!.sample.t });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
