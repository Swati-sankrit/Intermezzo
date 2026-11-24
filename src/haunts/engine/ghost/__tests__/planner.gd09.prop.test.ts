// Feature: ghost-dread, Property 9: Gentle plans are empty
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { EMPTY_PLAN, planReturn, type ReturnInput, type ReturnRolls } from '../returnPlanner';
import { resolveMode, type HauntMode } from '../mode';
import { plannerInputArb } from './plannerReference';

const NUM_RUNS = 300;
const TIMEOUT_MS = 20_000;
const SAMPLE_SIZE = 300;

/**
 * Floors per 300 inputs: floor(mean - 4 SD) over 10 batches, measured after shaping the generator
 * (see the shaping in `gentleInputArb`). Measured min / mean / SD over 10 batches:
 * away 220 / 235.0 / 8.06; history 96 / 106.6 / 8.80; scare 113 / 124.2 / 8.83;
 * reduced 138 / 152.3 / 8.81; dirty 149 / 164.2 / 8.90.
 */
export const FLOORS: Record<string, number> = {
  'away:qualifying': 202,
  'history:full': 71,
  'rolls:would-scare-in-nightmare': 88,
  'reduced:on': 117,
  dirty: 128,
};

const ZERO_ROLLS: ReturnRolls = {
  jump: 0, calm: 0, calmLen: 0, jumpLen: 0, glitchLen: 0, flickers: 0,
  evidence: 0, evidenceMsg: 0, evidenceRun: 0, spoiler: 0,
};

type Shape = 'as-is' | 'full-history' | 'max-away' | 'zero-rolls' | 'worst';

/**
 * Any input with mode Gentle. Most inputs are the shared planner generator; the others force
 * the cases most likely to scare in Nightmare: a history full of `true`, the largest `awayMs`,
 * every roll at 0, or all three together.
 */
export const gentleInputArb: fc.Arbitrary<ReturnInput> = fc
  .tuple(
    plannerInputArb,
    fc.constantFrom<Shape>('as-is', 'as-is', 'full-history', 'max-away', 'zero-rolls', 'worst'),
    fc.integer({ min: 2, max: 8 }),
    fc.constantFrom(Number.MAX_VALUE, Infinity, Number.MAX_SAFE_INTEGER),
  )
  .map(([base, shape, trues, maxAway]): ReturnInput => {
    const history = shape === 'full-history' || shape === 'worst' ? Array<boolean>(trues).fill(true) : base.history;
    const awayMs = shape === 'max-away' || shape === 'worst' ? maxAway : base.awayMs;
    const rolls = shape === 'zero-rolls' || shape === 'worst' ? ZERO_ROLLS : base.rolls;
    return { ...base, mode: 'gentle', history, awayMs, rolls };
  });

const isClean = (x: number): boolean => x >= 0 && x < 1;

/** Labels for the coverage floors, taken from the input and from what Nightmare would do with it. */
export function gentleTags(input: ReturnInput): readonly string[] {
  const tags: string[] = [];
  const nightmare = planReturn({ ...input, mode: 'nightmare' });
  if (nightmare.qualifying) tags.push('away:qualifying');
  if (input.history.length >= 2 && input.history.slice(-2).every((h) => h === true)) tags.push('history:full');
  if (nightmare.jumpscare !== null) tags.push('rolls:would-scare-in-nightmare');
  if (input.reducedMotion) tags.push('reduced:on');
  const away = input.awayMs;
  if (!(Number.isFinite(away) && away >= 0) || !Object.values(input.rolls).every(isClean)) tags.push('dirty');
  return tags;
}

describe('planReturn Gentle (ghost-dread)', () => {
  // Feature: ghost-dread, Property 9: Gentle plans are empty
  // **Validates: Requirements 5.2, 11.5**
  it('Property 9: every Gentle input gives a plan deep-equal to EMPTY_PLAN', () => {
    fc.assert(
      fc.property(gentleInputArb, (input) => {
        const plan = planReturn(input);
        expect(plan).toEqual(EMPTY_PLAN);
        expect(plan.jumpscare).toBeNull();
        expect(plan.falseCalmMs).toBeNull();
        expect(plan.glitch).toBeNull();
        expect(plan.fade).toBeNull();
        expect(plan.evidence).toBeNull();
        expect(plan.spoiler).toBeNull();
        expect(plan.durationMs).toBe(0);
        expect(plan.ghostLingerMs).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 9: Gentle plans are empty
  // **Validates: Requirements 5.2, 11.5**
  it('Property 9: the Gentle plan is the same for every input, and reduced motion does not change it', () => {
    fc.assert(
      fc.property(gentleInputArb, gentleInputArb, fc.boolean(), (a, b, reduced) => {
        const planA = planReturn({ ...a, reducedMotion: reduced });
        const planB = planReturn({ ...b, reducedMotion: !reduced });
        expect(planA).toEqual(planB);
        expect(planA).toEqual(EMPTY_PLAN);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 9: Gentle plans are empty
  // **Validates: Requirements 5.2, 11.5**
  it('Property 9: the worst case for scares (long away, history of true, rolls 0) still gives the empty plan', () => {
    for (const awayMs of [10_000, 60_000, Number.MAX_VALUE, Infinity]) {
      for (const reducedMotion of [false, true]) {
        const input: ReturnInput = {
          mode: 'gentle', awayMs, history: [true, true, true, true], rolls: ZERO_ROLLS, reducedMotion,
          paragraph: 'A quiet paragraph.', lookAwayCount: 4, spoiler: null, messages: ['Hello'],
        };
        expect(planReturn(input)).toEqual(EMPTY_PLAN);
        // The same input in Nightmare does scare, so the empty plan comes from the mode alone.
        expect(planReturn({ ...input, mode: 'nightmare', history: [] }).jumpscare).not.toBeNull();
      }
    }
  });

  // Feature: ghost-dread, Property 9: Gentle plans are empty
  // **Validates: Requirements 11.5**
  it('Property 9: an unknown or differently cased mode string at runtime gets the empty plan', () => {
    const base = fc.sample(gentleInputArb, 1)[0];
    for (const mode of ['Gentle', 'GENTLE', 'Classic', 'NIGHTMARE', ' gentle', 'gentle ', '', 'unknown']) {
      const plan = planReturn({ ...base, mode: mode as unknown as HauntMode, awayMs: 60_000, rolls: ZERO_ROLLS, history: [] });
      expect(plan, mode).toEqual(EMPTY_PLAN);
    }
    fc.assert(
      fc.property(
        fc.string().filter((s) => !['gentle', 'classic', 'nightmare'].includes(s)),
        gentleInputArb,
        (mode, input) => {
          expect(planReturn({ ...input, mode: mode as unknown as HauntMode })).toEqual(EMPTY_PLAN);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 9: Gentle plans are empty
  // **Validates: Requirements 5.2, 11.5**
  it('Property 9: after resolveMode, only the exact string "gentle" gives the empty plan', () => {
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom('gentle', 'Gentle', 'GENTLE', 'classic', 'nightmare', ''), fc.string()), (raw) => {
        const mode = resolveMode(raw, null);
        const input: ReturnInput = {
          mode, awayMs: 60_000, history: [], rolls: ZERO_ROLLS, reducedMotion: false,
          paragraph: 'p', lookAwayCount: 0, spoiler: null, messages: [],
        };
        const plan = planReturn(input);
        if (raw === 'gentle') expect(plan).toEqual(EMPTY_PLAN);
        else expect(plan.durationMs).toBeGreaterThanOrEqual(2000);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Coverage of the input space: the generator must reach each shape often enough.
  it('Property 9 coverage: Gentle inputs reach qualifying away, full history, scaring rolls, reduced motion and dirty values', () => {
    const counts = new Map<string, number>();
    for (const input of fc.sample(gentleInputArb, SAMPLE_SIZE)) {
      for (const tag of gentleTags(input)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    for (const [tag, floor] of Object.entries(FLOORS)) {
      expect(counts.get(tag) ?? 0, tag).toBeGreaterThanOrEqual(floor);
    }
  }, TIMEOUT_MS);
});
