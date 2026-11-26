import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { AWAY_CAP_SECONDS, changeTimer, IDLE_TIMER, tickTimer, type TimerState } from '../statsTimer';

/**
 * Feature: haunted-shell, Property 9: Away seconds recorded per look-away never exceed 120
 * **Validates: Requirements 21.1, 21.2, 21.3, 21.4, 21.5**
 *
 * Mirrors useStatsRecorder: a signal change calls changeTimer(state, value, now), the periodic
 * flush calls tickTimer(state, now), and the real functions run here with no mocks. One look-away is
 * a change to 'away', then any mix of ticks and repeated 'away' signals, then a change to 'present'.
 * Part of a present second can be carried into the away period (the carried `rest`), so the exact
 * expected value is floor((rest at the start of the look-away + duration) / 1000), capped at 120.
 */

type Op = { readonly kind: 'tick' | 'signal'; readonly dt: number };

/** A gap in ms: often 0, often small, sometimes very long (beyond the cap by far). */
const gapMs = fc.oneof(
  { weight: 2, arbitrary: fc.constant(0) },
  { weight: 4, arbitrary: fc.integer({ min: 1, max: 5_000 }) },
  { weight: 3, arbitrary: fc.integer({ min: 5_000, max: 200_000 }) },
  { weight: 1, arbitrary: fc.integer({ min: 200_000, max: 5_000_000_000 }) },
);

const op: fc.Arbitrary<Op> = fc.record({ kind: fc.constantFrom('tick', 'signal'), dt: gapMs });

interface LookAway {
  readonly presentMs: number;
  readonly ops: readonly Op[];
  readonly finalDt: number;
}

const lookAway: fc.Arbitrary<LookAway> = fc.record({
  presentMs: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 3_000_000 })),
  ops: fc.array(op, { maxLength: 12 }),
  finalDt: gapMs,
});

interface Outcome {
  readonly recorded: number;
  readonly expected: number;
  readonly lookAways: number;
}

/** Runs one look-away and returns the away seconds credited and the exact expected value. */
function runLookAway(start: TimerState, now: number, la: LookAway): { end: TimerState; now: number } & Outcome {
  let t = now + la.presentMs;
  let step = changeTimer(start, 'away', t);
  let lookAways = step.lookAway;
  let recorded = step.away; // 0: nothing was away yet
  const rest0 = step.state.rest;
  let duration = 0;
  for (const o of la.ops) {
    t += o.dt;
    duration += o.dt;
    step = o.kind === 'tick' ? tickTimer(step.state, t) : changeTimer(step.state, 'away', t);
    lookAways += step.lookAway;
    recorded += step.away;
  }
  t += la.finalDt;
  duration += la.finalDt;
  step = changeTimer(step.state, 'present', t);
  recorded += step.away;
  const expected = Math.min(Math.floor((rest0 + duration) / 1000), AWAY_CAP_SECONDS);
  return { end: step.state, now: t, recorded, expected, lookAways };
}

describe('Property 9: away seconds recorded per look-away never exceed 120', () => {
  it('each look-away records min(whole seconds, 120), however it is split, and gets a fresh cap', () => {
    fc.assert(
      fc.property(fc.array(lookAway, { minLength: 1, maxLength: 5 }), (list) => {
        let state = changeTimer(IDLE_TIMER, 'present', 0).state;
        let now = 0;
        let total = 0;
        let sumOfCaps = 0;
        for (const la of list) {
          const r = runLookAway(state, now, la);
          expect(r.recorded).toBeLessThanOrEqual(AWAY_CAP_SECONDS);
          expect(r.recorded).toBe(r.expected);
          expect(r.lookAways).toBe(1);
          total += r.recorded;
          sumOfCaps += r.expected;
          state = r.end;
          now = r.now;
        }
        expect(total).toBe(sumOfCaps);
      }),
      { numRuns: 500 },
    );
  });

  it('a look-away of 120 s or less is exact and a longer one records exactly 120', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400_000 }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { maxLength: 8 }),
        fc.constantFrom('tick', 'signal'),
        (durationMs, cuts, kind) => {
          // Split one away period of durationMs into pieces at the sorted cut points.
          const points = [...cuts.map((c) => Math.floor(c * durationMs)), durationMs].sort((a, b) => a - b);
          let step = changeTimer(changeTimer(IDLE_TIMER, 'present', 0).state, 'away', 0);
          let recorded = step.away;
          for (const p of points.slice(0, -1)) {
            step = kind === 'tick' ? tickTimer(step.state, p) : changeTimer(step.state, 'away', p);
            recorded += step.away;
          }
          step = changeTimer(step.state, 'present', durationMs);
          recorded += step.away;
          expect(recorded).toBe(Math.min(Math.floor(durationMs / 1000), AWAY_CAP_SECONDS));
        },
      ),
      { numRuns: 300 },
    );
  });

  it('present time is not capped', () => {
    fc.assert(
      fc.property(fc.array(gapMs, { minLength: 1, maxLength: 12 }), (gaps) => {
        let step = changeTimer(IDLE_TIMER, 'present', 0);
        let t = 0;
        let active = 0;
        for (const g of gaps) {
          t += g;
          step = tickTimer(step.state, t);
          active += step.active;
          expect(step.away).toBe(0);
        }
        expect(active).toBe(Math.floor(t / 1000));
      }),
      { numRuns: 200 },
    );
  });

  it('example: 130 s away records 120, then a new look-away starts at 0', () => {
    const first = changeTimer(changeTimer(IDLE_TIMER, 'present', 0).state, 'away', 0);
    const mid = tickTimer(first.state, 130_000);
    expect(mid.away).toBe(120);
    const back = changeTimer(mid.state, 'present', 131_000);
    const again = changeTimer(back.state, 'away', 132_000);
    expect(again.lookAway).toBe(1);
    expect(tickTimer(again.state, 135_000).away).toBe(3);
  });
});
