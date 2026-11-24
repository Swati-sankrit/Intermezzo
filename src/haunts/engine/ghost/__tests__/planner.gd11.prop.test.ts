// Feature: ghost-dread, Property 11: A Jumpscare needs a Qualifying_Return
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { planReturn, type ReturnInput } from '../returnPlanner';
import type { HauntMode } from '../mode';
import { modeArb } from '../../__tests__/arbitraries';
import { plannerInputArb, refAway, refRoll } from './plannerReference';

const NUM_RUNS = 500;
const TIMEOUT_MS = 30_000;
const SAMPLE_SIZE = 300;

type ScaryMode = 'classic' | 'nightmare';
const CHANCE: Record<ScaryMode, number> = { classic: 0.35, nightmare: 0.6 };
const LIMIT: Record<ScaryMode, number> = { classic: 1, nightmare: 2 };

/** Test-side rule from the design: fewer than LIMIT Jumpscares among the last two outcomes. */
const historyAllows = (mode: ScaryMode, history: readonly boolean[]): boolean =>
  history.slice(-2).filter((h) => h === true).length < LIMIT[mode];

const scaryModeArb = fc.constantFrom<ScaryMode>('classic', 'nightmare');
const tfArb = fc.boolean();

/** Histories the limit lets through, and histories it blocks, for one mode. */
function historyArb(mode: ScaryMode, allows: boolean): fc.Arbitrary<boolean[]> {
  const prefix = fc.array(tfArb, { minLength: 0, maxLength: 4 });
  if (allows) {
    if (mode === 'classic') {
      return fc.oneof(
        { weight: 1, arbitrary: fc.constant<boolean[]>([]) },
        { weight: 1, arbitrary: fc.constant<boolean[]>([false]) },
        { weight: 4, arbitrary: prefix.map((a) => [...a, false, false]) },
      );
    }
    return fc.oneof(
      { weight: 1, arbitrary: fc.constant<boolean[]>([]) },
      { weight: 1, arbitrary: fc.constantFrom<boolean[]>([true], [false]) },
      { weight: 4, arbitrary: fc.tuple(prefix, tfArb, tfArb).filter(([, a, b]) => !(a && b)).map(([p, a, b]) => [...p, a, b]) },
    );
  }
  if (mode === 'classic') {
    return fc.oneof(
      { weight: 1, arbitrary: fc.constant<boolean[]>([true]) },
      { weight: 4, arbitrary: fc.tuple(prefix, tfArb, tfArb).filter(([, a, b]) => a || b).map(([p, a, b]) => [...p, a, b]) },
    );
  }
  return prefix.map((a) => [...a, true, true]);
}

/** Jump rolls below the mode's probability, or at or above it. Dirty values map to 0 or just below 1. */
function jumpRollArb(mode: ScaryMode, below: boolean): fc.Arbitrary<number> {
  const p = CHANCE[mode];
  const top = Math.round(p * 1_000_000);
  if (below) {
    return fc.oneof(
      { weight: 6, arbitrary: fc.integer({ min: 0, max: top - 1 }).map((n) => n / 1_000_000) },
      { weight: 2, arbitrary: fc.constantFrom(0, p - 0.000001) },
      { weight: 1, arbitrary: fc.constantFrom(NaN, -1, -Infinity) },
    );
  }
  return fc.oneof(
    { weight: 6, arbitrary: fc.integer({ min: top, max: 999_999 }).map((n) => n / 1_000_000) },
    { weight: 2, arbitrary: fc.constantFrom(p, 0.999999) },
    { weight: 1, arbitrary: fc.constantFrom(1, 1.5, Infinity) },
  );
}

/** Away times whose sanitised value is below 10000: just below, NaN, negative, 0, and ordinary. */
const lowAwayArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(9999, 9999.5, 9999.999) },
  { weight: 3, arbitrary: fc.constantFrom(0, -0, 1, 5000) },
  { weight: 3, arbitrary: fc.constantFrom(NaN, -1, -10_000, -1e9, -Infinity, -0.5) },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 9999 }) },
);

/** Away times at or above 10000, including the exact boundary and very large values. */
const highAwayArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: fc.constant(10_000) },
  { weight: 2, arbitrary: fc.constantFrom(10_001, 10_000.5, 60_000) },
  { weight: 3, arbitrary: fc.integer({ min: 10_000, max: 200_000 }) },
  { weight: 1, arbitrary: fc.constantFrom(1e12, Number.MAX_VALUE, Infinity) },
);

const baseArb = plannerInputArb;
const withRollAndHistory = (
  base: ReturnInput, mode: HauntMode, awayMs: number, history: boolean[], jump: number,
): ReturnInput => ({ ...base, mode, awayMs, history, rolls: { ...base.rolls, jump } });

/** Inputs whose sanitised `awayMs` is below 10000, in any mode, any rolls and any history. */
export const nonQualifyingArb: fc.Arbitrary<ReturnInput> = fc.oneof(
  { weight: 2, arbitrary: fc.tuple(baseArb, lowAwayArb).map(([b, away]): ReturnInput => ({ ...b, awayMs: away })) },
  {
    // The case that would scare if it qualified: a scary mode, roll 0, empty history.
    weight: 2,
    arbitrary: fc.tuple(baseArb, scaryModeArb, lowAwayArb).map(([b, mode, away]) =>
      withRollAndHistory(b, mode, away, [], 0)),
  },
  {
    weight: 1,
    arbitrary: fc.tuple(baseArb, modeArb, lowAwayArb, fc.array(tfArb, { maxLength: 6 })).map(([b, mode, away, h]) =>
      withRollAndHistory(b, mode, away, h, 0)),
  },
);

/** Qualifying inputs in Classic or Nightmare, split by what the history and the roll say. */
export const qualifyingArb: fc.Arbitrary<ReturnInput> = fc.oneof(
  { weight: 2, arbitrary: fc.tuple(baseArb, scaryModeArb).map(([b, mode]): ReturnInput => ({ ...b, mode, awayMs: 10_000 })) },
  {
    // The history blocks it although the roll is below the probability.
    weight: 2,
    arbitrary: fc.tuple(baseArb, scaryModeArb, highAwayArb).chain(([b, mode, away]) =>
      fc.tuple(historyArb(mode, false), jumpRollArb(mode, true)).map(([h, r]) => withRollAndHistory(b, mode, away, h, r))),
  },
  {
    // The roll is too high although the history allows it.
    weight: 2,
    arbitrary: fc.tuple(baseArb, scaryModeArb, highAwayArb).chain(([b, mode, away]) =>
      fc.tuple(historyArb(mode, true), jumpRollArb(mode, false)).map(([h, r]) => withRollAndHistory(b, mode, away, h, r))),
  },
  {
    // The history allows it and the roll is below the probability: a Jumpscare is planned.
    weight: 2,
    arbitrary: fc.tuple(baseArb, scaryModeArb, highAwayArb).chain(([b, mode, away]) =>
      fc.tuple(historyArb(mode, true), jumpRollArb(mode, true)).map(([h, r]) => withRollAndHistory(b, mode, away, h, r))),
  },
);

/** Both kinds together, for the coverage count. */
export const caseArb: fc.Arbitrary<ReturnInput> = fc.oneof(
  { weight: 5, arbitrary: nonQualifyingArb },
  { weight: 8, arbitrary: qualifyingArb },
);

/**
 * Floors per 300 inputs: floor(mean - 4 SD) over 10 batches. Measured min / mean / SD:
 * just below 10000: 25 / 33.9 / 4.58; exactly 10000: 92 / 105.9 / 7.87;
 * non-qualifying would-scare: 32 / 46.3 / 7.59; blocked by history: 47 / 53.0 / 3.92;
 * blocked by roll: 45 / 57.0 / 5.33; scares: 66 / 76.5 / 4.90.
 */
export const FLOORS: Record<string, number> = {
  'away:just-below-10000': 15,
  'away:exactly-10000': 74,
  'nonqualifying:would-scare': 15,
  'qualifying:blocked-by-history': 37,
  'qualifying:blocked-by-roll': 35,
  'qualifying:scares': 56,
};

/** Labels for the coverage floors, taken from the input alone. */
export function caseTags(input: ReturnInput): readonly string[] {
  const tags: string[] = [];
  const away = refAway(input.awayMs);
  if (input.awayMs >= 9999 && input.awayMs < 10_000) tags.push('away:just-below-10000');
  if (input.awayMs === 10_000) tags.push('away:exactly-10000');
  const scary = input.mode === 'classic' || input.mode === 'nightmare';
  if (!scary) return tags;
  const lowRoll = refRoll(input.rolls.jump) < CHANCE[input.mode];
  if (away < 10_000 && input.rolls.jump === 0 && input.history.length === 0) tags.push('nonqualifying:would-scare');
  if (away >= 10_000) {
    const ok = historyAllows(input.mode, input.history);
    if (!ok && lowRoll) tags.push('qualifying:blocked-by-history');
    if (ok && !lowRoll) tags.push('qualifying:blocked-by-roll');
    if (ok && lowRoll) tags.push('qualifying:scares');
  }
  return tags;
}

describe('planReturn Jumpscare needs a Qualifying_Return (ghost-dread)', () => {
  // Feature: ghost-dread, Property 11: A Jumpscare needs a Qualifying_Return
  // **Validates: Requirements 5.1, 11.6**
  it('Property 11: sanitised awayMs below 10000 gives no Jumpscare and qualifying false, in every mode', () => {
    fc.assert(
      fc.property(nonQualifyingArb, (input) => {
        expect(refAway(input.awayMs)).toBeLessThan(10_000);
        const plan = planReturn(input);
        expect(plan.jumpscare).toBeNull();
        expect(plan.qualifying).toBe(false);
        // The same input in every mode, with the same rolls and history.
        for (const mode of ['gentle', 'classic', 'nightmare'] as const) {
          const other = planReturn({ ...input, mode });
          expect(other.jumpscare, mode).toBeNull();
          expect(other.qualifying, mode).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 11: A Jumpscare needs a Qualifying_Return
  // **Validates: Requirements 5.1, 11.6**
  it('Property 11: a qualifying return plans a Jumpscare exactly when history allows and the roll is below the probability', () => {
    fc.assert(
      fc.property(qualifyingArb, (input) => {
        const mode = input.mode as ScaryMode;
        expect(refAway(input.awayMs)).toBeGreaterThanOrEqual(10_000);
        const plan = planReturn(input);
        const expected = historyAllows(mode, input.history) && refRoll(input.rolls.jump) < CHANCE[mode];
        expect(plan.qualifying).toBe(true);
        expect(plan.jumpscare !== null).toBe(expected);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 11: A Jumpscare needs a Qualifying_Return
  // **Validates: Requirements 5.1, 11.6**
  it('Property 11: the same rolls and history scare at 10000 ms and not at 9999 ms', () => {
    fc.assert(
      fc.property(qualifyingArb.filter((i) => historyAllows(i.mode as ScaryMode, i.history) && refRoll(i.rolls.jump) < CHANCE[i.mode as ScaryMode]), (input) => {
        expect(planReturn({ ...input, awayMs: 10_000 }).jumpscare).not.toBeNull();
        const below = planReturn({ ...input, awayMs: 9999 });
        expect(below.jumpscare).toBeNull();
        expect(below.qualifying).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 11: A Jumpscare needs a Qualifying_Return
  // **Validates: Requirements 5.1, 11.6**
  it('Property 11: fixed boundary examples in Classic and Nightmare', () => {
    for (const mode of ['classic', 'nightmare'] as const) {
      const base = fc.sample(plannerInputArb, 1)[0];
      const rolls = { ...base.rolls, jump: 0 };
      const input: ReturnInput = { ...base, mode, history: [], rolls, reducedMotion: false };
      for (const awayMs of [NaN, -1, 0, 1, 9999]) {
        const plan = planReturn({ ...input, awayMs });
        expect(plan.jumpscare, `${mode} ${awayMs}`).toBeNull();
        expect(plan.qualifying, `${mode} ${awayMs}`).toBe(false);
      }
      for (const awayMs of [10_000, 10_001]) {
        const plan = planReturn({ ...input, awayMs });
        expect(plan.jumpscare, `${mode} ${awayMs}`).not.toBeNull();
        expect(plan.qualifying, `${mode} ${awayMs}`).toBe(true);
      }
    }
  });

  // Coverage of the input space: the generator must reach each shape often enough.
  it('Property 11 coverage: inputs reach both sides of 10000, the would-scare case and each blocking reason', () => {
    const counts = new Map<string, number>();
    for (const input of fc.sample(caseArb, SAMPLE_SIZE)) {
      for (const tag of caseTags(input)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    for (const [tag, floor] of Object.entries(FLOORS)) {
      expect(counts.get(tag) ?? 0, tag).toBeGreaterThanOrEqual(floor);
    }
  }, TIMEOUT_MS);
});
