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
import { arbPoseBody, arbPoseSample, arbRunSequence, arbThresholds } from './arbitraries';

const NUM_RUNS = 500;

const arbConfig: fc.Arbitrary<DecisionConfig> = fc.record({
  thresholds: arbThresholds,
  debounceMs: fc.integer({ min: 500, max: 5000 }),
  returnMs: fc.integer({ min: 1, max: 1000 }),
});

/**
 * A session start for `samples`: 0 (nothing stale) one time in five, otherwise
 * anywhere from the first sample time to just past the last one, so most cases
 * contain samples earlier than the start (stale) and some contain only stale ones.
 */
function arbStartFor(samples: readonly PoseSample[]): fc.Arbitrary<number> {
  if (samples.length === 0) return fc.constant(0);
  const times = samples.map((s) => s.t);
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  return fc.oneof(
    { weight: 1, arbitrary: fc.constant(0) },
    { weight: 4, arbitrary: fc.integer({ min: lo, max: hi + 500 }) },
  );
}

interface Case {
  readonly cfg: DecisionConfig;
  readonly samples: PoseSample[];
  readonly startT: number;
}

function withStart(cfg: DecisionConfig, samples: PoseSample[]): fc.Arbitrary<Case> {
  return arbStartFor(samples).map((startT) => ({ cfg, samples, startT }));
}

/** A sequence with in-order or out-of-order timestamps, plus its config and session start. */
const arbCase: fc.Arbitrary<Case> = fc
  .tuple(arbConfig, fc.boolean())
  .chain(([cfg, outOfOrder]) =>
    arbPoseSample({ outOfOrder, thresholds: cfg.thresholds, maxLength: 60 }).chain((samples) =>
      withStart(cfg, samples),
    ),
  );

/** Run-structured sequences that reliably reach `away` and then return. */
const arbRuns: fc.Arbitrary<Case> = arbConfig.chain((cfg) =>
  arbRunSequence(cfg.debounceMs, 'mixed', cfg.thresholds).chain((seq) =>
    withStart(cfg, seq.samples),
  ),
);

/** True when some sample has a finite time before the session start. */
const hasPreStart = (samples: readonly PoseSample[], startT: number): boolean =>
  samples.some((s) => Number.isFinite(s.t) && s.t < startT);

interface Trace {
  readonly before: AttentionSignal;
  readonly after: AttentionSignal;
  readonly sample: PoseSample;
  readonly accepted: boolean;
}

/**
 * Steps the real stepDecision and records each transition. Acceptance comes
 * from this independent model: the session starts with lastT = startT, and a
 * sample is accepted only if t is finite and t >= lastT (earlier ones are stale).
 */
function trace(samples: readonly PoseSample[], cfg: DecisionConfig, startT: number): Trace[] {
  let state = initialDecisionState(startT);
  let lastT = startT;
  const out: Trace[] = [];
  for (const sample of samples) {
    const accepted = Number.isFinite(sample.t) && sample.t >= lastT;
    const before = state.signal;
    state = stepDecision(state, sample, cfg);
    if (accepted) lastT = sample.t;
    out.push({ before, after: state.signal, sample, accepted });
  }
  return out;
}

function checkReturn(samples: readonly PoseSample[], cfg: DecisionConfig, startT: number): void {
  const steps = trace(samples, cfg, startT);
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
      expect(decide(samples, cfg, startT)).toEqual(final);
    }
  }
}

describe('Property 4: prompt return, stamped by the first Facing sample', () => {
  it('away persists through Away samples and ends at the first Facing sample (random sequences)', () => {
    let withPre = 0;
    fc.assert(
      fc.property(arbCase, ({ cfg, samples, startT }) => {
        if (hasPreStart(samples, startT)) withPre++;
        checkReturn(samples, cfg, startT);
      }),
      { numRuns: NUM_RUNS },
    );
    // Non-vacuity: at least 40% of cases contain a stale (pre-start) sample.
    expect(withPre).toBeGreaterThanOrEqual(NUM_RUNS * 0.4);
  });

  it('away persists through Away samples and ends at the first Facing sample (run-structured sequences)', () => {
    let withPre = 0;
    fc.assert(
      fc.property(arbRuns, ({ cfg, samples, startT }) => {
        if (hasPreStart(samples, startT)) withPre++;
        checkReturn(samples, cfg, startT);
      }),
      { numRuns: NUM_RUNS },
    );
    // Non-vacuity: at least 40% of cases contain a stale (pre-start) sample.
    expect(withPre).toBeGreaterThanOrEqual(NUM_RUNS * 0.4);
  });

  it('samples earlier than the session start leave the state unchanged', () => {
    const arbStale = fc
      .tuple(
        arbConfig,
        fc.integer({ min: 1000, max: 200_000 }),
        fc.array(fc.tuple(fc.integer({ min: 1, max: 5000 }), arbPoseBody()), {
          minLength: 1,
          maxLength: 40,
        }),
      )
      .map(([cfg, startT, steps]) => ({
        cfg,
        startT,
        samples: steps.map(([off, body]): PoseSample => ({ t: startT - off, ...body })),
      }));
    fc.assert(
      fc.property(arbStale, ({ cfg, startT, samples }) => {
        const initial = initialDecisionState(startT);
        let state = initial;
        for (const s of samples) state = stepDecision(state, s, cfg);
        expect(state.signal).toEqual({ value: 'present', timestamp: startT });
        expect(state.lastT).toBe(startT);
        expect(state.awayRunStart).toBeNull();
        expect(state).toEqual(initial);
        expect(decide(samples, cfg, startT)).toEqual({ value: 'present', timestamp: startT });
      }),
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
        .chain(([seq, gap]) => withStart(cfg, seq.samples).map(({ startT }) => ({ cfg, seq, gap, startT }))),
    );
    fc.assert(
      fc.property(arbReturn, ({ cfg, seq, gap, startT }) => {
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
        const steps = trace(all, cfg, startT);
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
        expect(decide(all, cfg, startT)).toEqual({ value: 'present', timestamp: first!.sample.t });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
