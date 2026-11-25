import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { EMPTY_PLAN, planReturn, type ReturnInput } from '../returnPlanner';
import { ghostDistance } from '../ghostDistance';
import type { ReturnPlan } from '../../returnTypes';
import { classify, plannerInputArb, referencePlan, refAway } from './plannerReference';
import { returnRollsArb } from './arbitraries';

const NUM_RUNS = 300;
const TIMEOUT_MS = 20_000;
const SAMPLE_SIZE = NUM_RUNS;
/**
 * Floors per 300 inputs. Measured over 300 batches of coverageSample() (mean / SD / min); z = (mean - floor) / SD.
 * Every floor is at least 6.5 SD below its mean; the positional counts have SD 0.
 *   mode:* 100 each, exact (floors 65/63/74)       reduced:on / off 150 each, exact (floors 108 / 104)
 *   history:empty 120 (floor 83), history:full 180 (floor 168), both exact
 *   away:9999   72.8 / 3.3 / 65  (floor 42, z 9.3)    away:10000 102.7 / 3.2 / 95 (floor 36, z 20.8)
 *   away:10001 102.7 / 3.0 / 92  (floor 39, z 21.2)
 *   qualifying 146.7 / 2.9 / 137 (floor 78, z 23.7)   not-qualifying 153.3 / 2.9 / 146 (floor 119, z 11.9)
 *   jump:classic 49.4 / 4.2 / 38 (floor 8, z 9.9)     jump:nightmare 57.7 / 3.7 / 45 (floor 29, z 7.7)
 *   jump:reduced 53.4 / 4.2 / 42 (floor 8, z 10.8)
 *   falsecalm:present 54.7 / 6.1 / 41 (floor 7, z 7.8)  falsecalm:absent 52.4 / 5.9 / 36 (floor 13, z 6.7)
 *   dirty 219.9 / 7.9 / 191 (floor 169, z 6.5)
 * Mode, history and reduced motion cannot reach z >= 4.5 with independent draws: the history floors 83 and
 * 168 together take 84% of the sample, and a third of 300 has SD 8 against floor 74. So coverageSample()
 * sets mode, history shape, reduced motion and the boundary away values by position; the rest is drawn.
 */
const FLOORS: Record<string, number> = {
  'mode:gentle': 65,
  'mode:classic': 63,
  'mode:nightmare': 74,
  'reduced:on': 108,
  'reduced:off': 104,
  qualifying: 78,
  'not-qualifying': 119,
  'away:9999': 42,
  'away:10000': 36,
  'away:10001': 39,
  'jump:classic': 8,
  'jump:nightmare': 29,
  'jump:reduced': 8,
  'falsecalm:present': 7,
  'falsecalm:absent': 13,
  'history:empty': 83,
  'history:full': 168,
  dirty: 169,
};

const MODES = ['gentle', 'classic', 'nightmare'] as const;
/** Ten away slots: 9999 x2, 10000 x3, 10001 x3, and two drawn from the generator. null means "use the drawn value". */
const AWAY_SLOTS = [9999, 9999, 10_000, 10_000, 10_000, 10_001, 10_001, 10_001, null, null] as const;
/** Calm rolls with more values at or above 0.75, so a Jumpscare without a False_Calm is common enough. */
const calmCoverageArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(0.75, 0.999999, 0.9, 0.8) },
  { weight: 3, arbitrary: fc.double({ min: 0, max: 0.999999, noNaN: true }) },
  { weight: 2, arbitrary: fc.constantFrom(NaN, -1, 1, 1.5, Infinity, -Infinity) },
);

/** SAMPLE_SIZE inputs. Mode, history shape, reduced motion and the boundary away values are set by position to cut variance. */
function coverageSample(): ReturnInput[] {
  const drawn = fc.sample(fc.tuple(plannerInputArb, calmCoverageArb, fc.integer({ min: 2, max: 4 })), SAMPLE_SIZE);
  return drawn.map(([input, calm, fullLen], i): ReturnInput => {
    // Two in five histories are empty, the other three in five hold at least two entries.
    const history = i % 5 < 2 ? [] : input.history.length >= 2 ? input.history : Array<boolean>(fullLen).fill(false);
    return {
      ...input,
      mode: MODES[i % 3],
      awayMs: AWAY_SLOTS[i % AWAY_SLOTS.length] ?? input.awayMs,
      history,
      reducedMotion: Math.floor(i / 3) % 2 === 0,
      rolls: { ...input.rolls, calm: i % 4 === 0 ? input.rolls.calm : calm },
    };
  });
}

type ReturnMode = 'classic' | 'nightmare';
const isReturnMode = (input: ReturnInput): input is ReturnInput & { mode: ReturnMode } => input.mode !== 'gentle';

/** Non-Gentle inputs only. */
const returnInputArb = plannerInputArb.filter(isReturnMode);
const gentleInputArb = plannerInputArb.map((input): ReturnInput => ({ ...input, mode: 'gentle' }));

/** The plan fields the reference model covers. */
const view = (plan: ReturnPlan) => ({
  durationMs: plan.durationMs,
  qualifying: plan.qualifying,
  ambientFadeMs: plan.ambientFadeMs,
  falseCalmMs: plan.falseCalmMs,
  jumpscare: plan.jumpscare,
  fade: plan.fade,
  glitch: plan.glitch,
  evidence: plan.evidence,
  spoiler: plan.spoiler,
});

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Every timed part of a plan as [name, start, end]. */
function parts(plan: ReturnPlan): Array<[string, number, number]> {
  const out: Array<[string, number, number]> = [];
  if (plan.falseCalmMs !== null) out.push(['falseCalm', 0, plan.falseCalmMs]);
  if (plan.jumpscare !== null) out.push(['jumpscare', plan.jumpscare.startMs, plan.jumpscare.startMs + plan.jumpscare.durationMs]);
  if (plan.fade !== null) out.push(['fade', plan.fade.startMs, plan.fade.startMs + plan.fade.durationMs]);
  return out;
}

describe('planReturn (ghost-dread)', () => {
  // Feature: ghost-dread, Property 8: Return plan bounds and determinism
  // **Validates: Requirements 3.2, 3.3, 5.8, 11.4, 11.9, 11.16**
  it('Property 8: Classic and Nightmare plans keep every duration and part inside its bounds', () => {
    fc.assert(
      fc.property(returnInputArb, (input) => {
        const plan = planReturn(input);
        expect(plan.durationMs).toBeGreaterThanOrEqual(2000);
        expect(plan.durationMs).toBeLessThanOrEqual(3000);
        for (const [name, start, end] of parts(plan)) {
          expect(start, name).toBeGreaterThanOrEqual(0);
          expect(end, name).toBeLessThanOrEqual(plan.durationMs);
          expect(end, name).toBeLessThanOrEqual(3000);
        }
        if (plan.falseCalmMs !== null) {
          expect(plan.falseCalmMs).toBeGreaterThanOrEqual(300);
          expect(plan.falseCalmMs).toBeLessThanOrEqual(800);
        }
        if (plan.jumpscare !== null) {
          const j = plan.jumpscare;
          const [min, max] = input.reducedMotion ? [1000, 1400] : [700, 1200];
          expect(j.durationMs).toBeGreaterThanOrEqual(min);
          expect(j.durationMs).toBeLessThanOrEqual(max);
          expect(j.render).toBe(input.reducedMotion ? 'fade' : 'full');
          expect(j.startMs).toBe(plan.falseCalmMs ?? 0);
          expect(plan.ambientFadeMs).toBe(300);
          expect(plan.qualifying).toBe(true);
        } else {
          expect(plan.ambientFadeMs).toBe(600);
        }
        expect(plan.ghostLingerMs).toBeLessThanOrEqual(plan.durationMs);
        // Reduced motion: one 600 ms fade that starts where the Jumpscare ends, or at 0.
        if (input.reducedMotion) {
          const jumpEnd = plan.jumpscare === null ? 0 : plan.jumpscare.startMs + plan.jumpscare.durationMs;
          expect(plan.fade).toEqual({ startMs: jumpEnd, durationMs: 600 });
        } else {
          expect(plan.fade).toBeNull();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 8: Return plan bounds and determinism
  // **Validates: Requirements 5.8, 11.2, 11.4, 11.9, 11.16**
  it('Property 8: the plan equals an independent reference model, including for sanitised inputs', () => {
    fc.assert(
      fc.property(returnInputArb, (input) => {
        const plan = planReturn(input);
        const expected = referencePlan(input);
        expect(view(plan)).toEqual(expected);
        expect(plan.qualifying).toBe(refAway(input.awayMs) >= 10_000);
        expect(plan.ghostStep).toBe(ghostDistance(input.lookAwayCount));
        expect(plan.glitch).toBeNull();
        expect(plan.evidence).toBeNull();
        expect(plan.spoiler).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 8: Return plan bounds and determinism
  // **Validates: Requirements 11.2, 11.4**
  it('Property 8: equal inputs give deep-equal plans and the input is not changed', () => {
    fc.assert(
      fc.property(plannerInputArb, (input) => {
        const snapshot = structuredClone(input);
        const frozen = deepFreeze(structuredClone(input));
        const a = planReturn(frozen);
        const b = planReturn(frozen);
        const c = planReturn(structuredClone(input));
        expect(b).toEqual(a);
        expect(c).toEqual(a);
        expect(frozen).toEqual(snapshot);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 8: Return plan bounds and determinism
  // **Validates: Requirements 3.2, 11.4**
  it('Property 8: Gentle gives the empty plan, with no Return_Moment and no optional parts', () => {
    fc.assert(
      fc.property(gentleInputArb, (input) => {
        const plan = planReturn(input);
        expect(plan).toEqual(EMPTY_PLAN);
        expect(plan.durationMs).toBe(0);
        expect(plan.ambientFadeMs).toBe(600);
        expect(plan.jumpscare).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 8: Return plan bounds and determinism
  // **Validates: Requirements 5.8, 11.4**
  it('Property 8: qualifying flips exactly at 10000 ms away in both return modes', () => {
    const base = (mode: ReturnMode, awayMs: number): ReturnInput => ({
      mode,
      awayMs,
      history: [],
      rolls: { jump: 0.9, calm: 0, calmLen: 0, jumpLen: 0, glitchLen: 0, flickers: 0, evidence: 0, evidenceMsg: 0, evidenceRun: 0, spoiler: 0 },
      reducedMotion: false,
      paragraph: 'A quiet paragraph.',
      lookAwayCount: 0,
      spoiler: null,
      messages: [],
    });
    for (const mode of ['classic', 'nightmare'] as const) {
      expect(planReturn(base(mode, 9999)).qualifying).toBe(false);
      expect(planReturn(base(mode, 10_000)).qualifying).toBe(true);
      expect(planReturn(base(mode, 10_001)).qualifying).toBe(true);
      expect(planReturn(base(mode, NaN)).qualifying).toBe(false);
      expect(planReturn(base(mode, -20_000)).qualifying).toBe(false);
      expect(planReturn(base(mode, Number.MAX_VALUE)).qualifying).toBe(true);
    }
    // A low jump roll plans a Jumpscare only from 10000 ms.
    const low = { ...base('nightmare', 9999), rolls: { ...base('nightmare', 0).rolls, jump: 0 } };
    expect(planReturn(low).jumpscare).toBeNull();
    expect(planReturn({ ...low, awayMs: 10_000 }).jumpscare).not.toBeNull();
  });

  // Feature: ghost-dread, Property 8: Return plan bounds and determinism
  // **Validates: Requirements 3.2, 11.4**
  it('Property 8: sanitised rolls give a valid plan for any numbers', () => {
    const anyNumber = fc.oneof(fc.double({ noNaN: false }), fc.constantFrom(0, -0, 1, Infinity, -Infinity, NaN));
    fc.assert(
      fc.property(
        returnRollsArb,
        fc.record({ jump: anyNumber, calm: anyNumber, calmLen: anyNumber, jumpLen: anyNumber }),
        fc.boolean(),
        anyNumber,
        (clean, wild, reduced, away) => {
          const input: ReturnInput = {
            mode: 'nightmare',
            awayMs: away,
            history: [],
            rolls: { ...clean, ...wild },
            reducedMotion: reduced,
            paragraph: '',
            lookAwayCount: 0,
            spoiler: null,
            messages: [],
          };
          const plan = planReturn(input);
          expect(view(plan)).toEqual(referencePlan({ ...input, mode: 'nightmare' }));
          expect(plan.durationMs).toBeGreaterThanOrEqual(2000);
          expect(plan.durationMs).toBeLessThanOrEqual(3000);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Coverage of the input space: the generator must reach each case often enough.
  it('Property 8 coverage: the generator reaches every mode, boundary and plan shape', () => {
    const counts = new Map<string, number>();
    for (const input of coverageSample()) {
      for (const tag of classify(input, planReturn(input))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    for (const [tag, floor] of Object.entries(FLOORS)) {
      expect(counts.get(tag) ?? 0, tag).toBeGreaterThanOrEqual(floor);
    }
  }, TIMEOUT_MS);
});
