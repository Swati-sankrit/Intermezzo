// Feature: ghost-dread, Property 13: Nightmare is more likely to scare than Classic
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { planReturn, type ReturnInput } from '../returnPlanner';
import { allowed, probability } from '../jumpscarePolicy';
import { plannerInputArb, refAway, referencePlan } from './plannerReference';

const NUM_RUNS = 500;
const TIMEOUT_MS = 30_000;
const SAMPLE_SIZE = 300;

/** Req 5.7 and design rule 3: chance of a Jumpscare per Qualifying_Return. */
const CLASSIC_CHANCE = 0.35;
const NIGHTMARE_CHANCE = 0.6;

const rollBetween = (lo: number, hi: number): fc.Arbitrary<number> =>
  fc.integer({ min: Math.round(lo * 1_000_000), max: Math.round(hi * 1_000_000) - 1 }).map((n) => n / 1_000_000);

/** Jump rolls: below 0.35, from 0.35 up to 0.6 (the band where only Nightmare scares), and 0.6 or more. */
const lowRollArb = rollBetween(0, CLASSIC_CHANCE);
const midRollArb = fc.oneof(
  { weight: 5, arbitrary: rollBetween(CLASSIC_CHANCE, NIGHTMARE_CHANCE) },
  { weight: 1, arbitrary: fc.constantFrom(0.35, 0.599999) },
);
const highRollArb = fc.oneof(
  { weight: 5, arbitrary: rollBetween(NIGHTMARE_CHANCE, 1) },
  { weight: 1, arbitrary: fc.constantFrom(0.6, 0.999999) },
);
const jumpRollArb = fc.oneof(
  { weight: 3, arbitrary: lowRollArb },
  { weight: 4, arbitrary: midRollArb },
  { weight: 3, arbitrary: highRollArb },
);

const qualifyingAwayArb = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(10_000, 10_001) },
  { weight: 4, arbitrary: fc.integer({ min: 10_000, max: 200_000 }) },
);
const anyAwayArb = fc.oneof(
  { weight: 8, arbitrary: qualifyingAwayArb },
  { weight: 2, arbitrary: fc.oneof(fc.constantFrom(0, 9999, NaN, -1), fc.integer({ min: 0, max: 9999 })) },
);

/** Number of Jumpscares among the last two outcomes, counted here and not by the policy module. */
const recentOf = (history: readonly boolean[]): number => history.slice(-2).filter((h) => h === true).length;

const prefixArb = fc.array(fc.boolean(), { minLength: 0, maxLength: 4 });
/** A history whose last two entries hold exactly `recent` Jumpscares, with a short or empty start before them. */
function historyWithRecent(recent: 0 | 1 | 2): fc.Arbitrary<boolean[]> {
  const tails: boolean[][] = recent === 0 ? [[false, false]] : recent === 2 ? [[true, true]] : [[true, false], [false, true]];
  return fc.tuple(prefixArb, fc.constantFrom(...tails)).map(([p, t]) => [...p, ...t]);
}
const shortHistoryArb: fc.Arbitrary<boolean[]> = fc.constantFrom<boolean[]>([], [false], [true]);
const anyHistoryArb: fc.Arbitrary<boolean[]> = fc.oneof(
  { weight: 2, arbitrary: shortHistoryArb },
  { weight: 2, arbitrary: historyWithRecent(0) },
  { weight: 3, arbitrary: historyWithRecent(1) },
  { weight: 2, arbitrary: historyWithRecent(2) },
);

/** One scenario: the same rolls, away time and history go to both modes. */
interface Scenario { readonly base: ReturnInput; readonly away: number; readonly history: boolean[]; readonly jump: number }

function scenarioArb(
  away: fc.Arbitrary<number>,
  history: fc.Arbitrary<boolean[]>,
  jump: fc.Arbitrary<number>,
): fc.Arbitrary<Scenario> {
  return fc.record({ base: plannerInputArb, away, history, jump });
}

type ScaryMode = 'classic' | 'nightmare';
function inputFor(s: Scenario, mode: ScaryMode): ReturnInput {
  return { ...s.base, mode, awayMs: s.away, history: s.history, rolls: { ...s.base.rolls, jump: s.jump } };
}
const scares = (s: Scenario, mode: ScaryMode): boolean => planReturn(inputFor(s, mode)).jumpscare !== null;
const referenceScares = (s: Scenario, mode: ScaryMode): boolean =>
  referencePlan(inputFor(s, mode) as ReturnInput & { mode: ScaryMode }).jumpscare !== null;

export const generalArb = scenarioArb(anyAwayArb, anyHistoryArb, jumpRollArb);
const midEmptyArb = scenarioArb(qualifyingAwayArb, fc.oneof(shortHistoryArb.filter((h) => recentOf(h) === 0), historyWithRecent(0)), midRollArb);
const limitOnlyArb = scenarioArb(qualifyingAwayArb, historyWithRecent(1), lowRollArb);
const bothBlockedArb = scenarioArb(qualifyingAwayArb, historyWithRecent(2), jumpRollArb);

/** Labels for the coverage floors. */
export function scenarioTags(s: Scenario): readonly string[] {
  const tags: string[] = [];
  if (refAway(s.away) < 10_000) return ['not-qualifying'];
  const recent = recentOf(s.history);
  if (s.jump >= CLASSIC_CHANCE && s.jump < NIGHTMARE_CHANCE) {
    tags.push('roll:mid');
    if (recent === 0) tags.push('mid-only-nightmare');
  }
  if (s.jump < CLASSIC_CHANCE) tags.push('roll:low');
  if (s.jump >= NIGHTMARE_CHANCE) tags.push('roll:high');
  if (recent === 1) tags.push('history:blocks-classic-only');
  if (recent === 2) tags.push('history:blocks-both');
  return tags;
}

/**
 * Floors per 300 scenarios: floor(mean - 4 SD) over 10 batches. Measured min / mean / SD:
 * roll from 0.35 up to 0.6: 86 / 97.4 / 7.03; that roll with no recent Jumpscare (only Nightmare scares): 31 / 37.0 / 5.10;
 * roll below 0.35: 68 / 73.9 / 5.92; roll 0.6 or more: 64 / 69.0 / 4.90;
 * history blocking Classic only: 82 / 97.9 / 8.89; history blocking both: 45 / 53.3 / 8.35.
 */
export const FLOORS: Record<string, number> = {
  'roll:mid': 69,
  'mid-only-nightmare': 16,
  'roll:low': 50,
  'roll:high': 49,
  'history:blocks-classic-only': 62,
  'history:blocks-both': 19,
};

describe('planReturn Nightmare against Classic (ghost-dread)', () => {
  // Feature: ghost-dread, Property 13: Nightmare is more likely to scare than Classic
  // **Validates: Requirements 5.7**
  it('Property 13: for the same rolls and history, a Classic Jumpscare always means a Nightmare Jumpscare, and both match the reference', () => {
    fc.assert(
      fc.property(generalArb, (s) => {
        const classic = scares(s, 'classic');
        const nightmare = scares(s, 'nightmare');
        if (classic) expect(nightmare, 'Classic scared but Nightmare did not').toBe(true);
        expect(classic).toBe(referenceScares(s, 'classic'));
        expect(nightmare).toBe(referenceScares(s, 'nightmare'));
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 13: Nightmare is more likely to scare than Classic
  // **Validates: Requirements 5.7**
  it('Property 13: with no recent Jumpscare and a roll from 0.35 up to 0.6, only Nightmare plans a Jumpscare', () => {
    fc.assert(
      fc.property(midEmptyArb, (s) => {
        expect(scares(s, 'nightmare')).toBe(true);
        expect(scares(s, 'classic')).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 13: Nightmare is more likely to scare than Classic
  // **Validates: Requirements 5.7**
  it('Property 13: with one recent Jumpscare and a roll below 0.35, only Nightmare plans a Jumpscare', () => {
    fc.assert(
      fc.property(limitOnlyArb, (s) => {
        expect(scares(s, 'nightmare')).toBe(true);
        expect(scares(s, 'classic')).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 13: Nightmare is more likely to scare than Classic
  // **Validates: Requirements 5.7**
  it('Property 13: with two recent Jumpscares neither mode plans one, and with a roll of 0.6 or more neither does', () => {
    fc.assert(
      fc.property(bothBlockedArb, (s) => {
        expect(scares(s, 'classic')).toBe(false);
        expect(scares(s, 'nightmare')).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
    fc.assert(
      fc.property(scenarioArb(qualifyingAwayArb, anyHistoryArb, highRollArb), (s) => {
        expect(scares(s, 'classic')).toBe(false);
        expect(scares(s, 'nightmare')).toBe(false);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 13: Nightmare is more likely to scare than Classic
  // **Validates: Requirements 5.7**
  it('Property 13: Nightmare has the higher chance and the higher limit', () => {
    expect(probability('classic')).toBe(CLASSIC_CHANCE);
    expect(probability('nightmare')).toBe(NIGHTMARE_CHANCE);
    expect(probability('nightmare')).toBeGreaterThan(probability('classic'));
    // The limit is the number of recent Jumpscares at which `allowed` turns false.
    const limitOf = (mode: ScaryMode): number => [[], [true], [true, true]].findIndex((h) => !allowed(mode, h));
    expect(limitOf('classic')).toBe(1);
    expect(limitOf('nightmare')).toBe(2);
    expect(limitOf('nightmare')).toBeGreaterThan(limitOf('classic'));
    // Every history of up to four outcomes: Classic allowed implies Nightmare allowed.
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 0, maxLength: 4 }), (h) => {
        if (allowed('classic', h)) expect(allowed('nightmare', h)).toBe(true);
        expect(allowed('classic', h)).toBe(recentOf(h) < 1);
        expect(allowed('nightmare', h)).toBe(recentOf(h) < 2);
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Coverage of the input space: the generators must reach each shape often enough.
  it('Property 13 coverage: scenarios reach mid, low and high rolls and histories that block Classic only or both', () => {
    const counts = new Map<string, number>();
    for (const s of fc.sample(generalArb, SAMPLE_SIZE)) {
      for (const tag of scenarioTags(s)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    for (const [tag, floor] of Object.entries(FLOORS)) {
      expect(counts.get(tag) ?? 0, tag).toBeGreaterThanOrEqual(floor);
    }
  }, TIMEOUT_MS);
});
