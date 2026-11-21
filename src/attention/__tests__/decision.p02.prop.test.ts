/**
 * Property 2: A long Away run yields away at the right timestamp.
 * **Validates: Requirements 4.3, 4.16, 11.5**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decide, initialDecisionState, stepDecision } from '../decision';
import type { DecisionConfig, PoseSample } from '../types';
import { arbRunSequence, arbThresholds } from './arbitraries';

const NUM_RUNS = 300;
const arbDebounce = fc.integer({ min: 500, max: 5000 });

/** First sample in [from, to] more than debounceMs after the sample at `from`. */
function expectedAwayT(samples: PoseSample[], from: number, to: number, debounceMs: number) {
  const startT = samples[from].t;
  for (let i = from; i <= to; i++) if (samples[i].t - startT > debounceMs) return samples[i].t;
  return undefined;
}

describe('Property 2: long Away run yields away at the right timestamp', () => {
  it('first run longer than debounce, after only facing runs, gives away at the first sample past debounce', () => {
    fc.assert(
      fc.property(
        arbDebounce.chain((d) =>
          fc.tuple(fc.constant(d), arbThresholds.chain((th) =>
            fc.tuple(fc.constant(th), arbRunSequence(d, 'above', th)),
          )),
        ),
        ([debounceMs, [thresholds, seq]]) => {
          const run = seq.runs.find((r) => r.kind === 'away');
          fc.pre(run !== undefined); // a lone facing run has no Away run
          if (!run) return;
          // Everything before the first Away run is Facing, so the signal is present at its start.
          const prefix = seq.samples.slice(0, run.lastIndex + 1);
          const cfg: Partial<DecisionConfig> = { debounceMs, thresholds };
          const startT = seq.samples[0].t;
          const want = expectedAwayT(seq.samples, run.firstIndex, run.lastIndex, debounceMs);
          expect(want).toBeDefined();
          expect(decide(prefix, cfg, startT)).toEqual({ value: 'away', timestamp: want });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('the away signal appears at the first qualifying sample and not at an earlier one (stepwise)', () => {
    fc.assert(
      fc.property(
        arbDebounce.chain((d) => fc.tuple(fc.constant(d), arbRunSequence(d, 'above'))),
        ([debounceMs, seq]) => {
          const run = seq.runs.find((r) => r.kind === 'away');
          fc.pre(run !== undefined);
          if (!run) return;
          const cfg: DecisionConfig = {
            thresholds: seq.thresholds,
            debounceMs,
            returnMs: 1000,
          };
          let state = initialDecisionState(seq.samples[0].t);
          const want = expectedAwayT(seq.samples, run.firstIndex, run.lastIndex, debounceMs)!;
          for (let i = 0; i <= run.lastIndex; i++) {
            state = stepDecision(state, seq.samples[i], cfg);
            const shouldBeAway = i >= run.firstIndex && seq.samples[i].t >= want;
            expect(state.signal.value).toBe(shouldBeAway ? 'away' : 'present');
          }
          expect(state.signal.timestamp).toBe(want);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('Tab_Active false with a face found and angles inside the limits still yields away (4.16, 11.5)', () => {
    fc.assert(
      fc.property(
        arbDebounce,
        arbThresholds,
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 1, max: 3000 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.constantFrom(1, -1),
        (debounceMs, th, startT, extra, yawPct, pitchPct, sign) => {
          const total = debounceMs + extra; // run strictly longer than debounce
          const samples: PoseSample[] = [];
          for (let o = 0; o < total; o += 100) samples.push(hiddenSample(o));
          samples.push(hiddenSample(total));
          function hiddenSample(o: number): PoseSample {
            return {
              t: startT + o,
              faceFound: true,
              tabActive: false,
              yaw: th.baselineYaw + sign * (yawPct / 100) * th.yawLimit,
              pitch: th.baselinePitch + sign * (pitchPct / 100) * th.pitchLimit,
            };
          }
          const want = samples.find((s) => s.t - startT > debounceMs)!.t;
          expect(decide(samples, { debounceMs, thresholds: th }, startT)).toEqual({
            value: 'away',
            timestamp: want,
          });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
