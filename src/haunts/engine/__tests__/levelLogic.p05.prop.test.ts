import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluate } from '../levelLogic';
import type { LevelOutput } from '../levelLogic';
import type { HauntMode } from '../ghost/mode';
import { awayHistoryArb, rollArb, weightedModeArb } from './arbitraries';

const NUM_RUNS = 300;

const idArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/);

/**
 * Haunt lists shaped so every size 0 to 5 is common (a plain uniqueArray favours small sizes).
 * Sizes 0 and 1 are each about 19%, sizes 2 to 5 together about 62%, so every share sits well above its floor.
 */
const sizeArb = fc.oneof(
  { weight: 38, arbitrary: fc.constant(0) },
  { weight: 38, arbitrary: fc.constant(1) },
  { weight: 124, arbitrary: fc.integer({ min: 2, max: 5 }) },
);
const sizedIdsArb: fc.Arbitrary<string[]> = sizeArb
  .chain((n) => fc.uniqueArray(idArb, { minLength: n, maxLength: n }));

/** Rolls with the extreme values 0 and just below 1 appearing often. */
const edgeRollArb = fc.oneof(
  { weight: 3, arbitrary: rollArb },
  { weight: 1, arbitrary: fc.constantFrom(0, 1 - Number.EPSILON / 2) },
);
const rollsArb = fc.record({ lead: edgeRollArb, companion: edgeRollArb });

/** Milliseconds after the away start: level 1, 2 and 3 ranges are each about a third. */
const elapsedArb = fc.oneof(
  fc.integer({ min: 0, max: 4999 }),
  fc.integer({ min: 5000, max: 11_999 }),
  fc.integer({ min: 12_000, max: 30_000 }),
);

const lookAwayArb = fc.record({
  events: awayHistoryArb,
  elapsed: elapsedArb,
  mode: weightedModeArb(1, 3),
  rolls: rollsArb,
});

/** One to six consecutive look-aways; two or more is the common case (about 90%). */
const lookAwaysArb = fc.oneof(
  { weight: 1, arbitrary: fc.array(lookAwayArb, { minLength: 1, maxLength: 1 }) },
  { weight: 9, arbitrary: fc.array(lookAwayArb, { minLength: 2, maxLength: 6 }) },
);

const scenarioArb = fc
  .tuple(sizedIdsArb, lookAwaysArb)
  .chain(([hauntIds, lookAways]) =>
    fc
      .oneof(
        fc.constant<string | null>(null),
        fc.constant<string | null>('not-in-list'),
        hauntIds.length > 0 ? fc.constantFrom<string | null>(...hauntIds) : fc.constant<string | null>(null),
      )
      .map((firstPrevious) => ({ hauntIds, lookAways, firstPrevious })),
  );

type Scenario = {
  hauntIds: string[];
  lookAways: Array<{
    events: Array<{ value: 'present' | 'away'; timestamp: number }>;
    elapsed: number;
    mode: HauntMode;
    rolls: { lead: number; companion: number };
  }>;
  firstPrevious: string | null;
};

interface Step {
  readonly previousLeadId: string | null;
  readonly out: LevelOutput;
}

/** Folds the real `evaluate` over the look-aways, feeding each lead in as the next previousLeadId. */
function run(s: Scenario): Step[] {
  const steps: Step[] = [];
  let previousLeadId = s.firstPrevious;
  for (const la of s.lookAways) {
    const start = la.events.find((_, i) => la.events.slice(i).every((e) => e.value === 'away'))!.timestamp;
    const out = evaluate({
      events: la.events,
      now: start + la.elapsed,
      mode: la.mode,
      hauntIds: s.hauntIds,
      previousLeadId,
      rolls: la.rolls,
    });
    steps.push({ previousLeadId, out });
    previousLeadId = out.leadId;
  }
  return steps;
}

describe('Level_Logic evaluate: consecutive look-aways use different leads', () => {
  // Feature: haunt-feature, Property 5: Consecutive look-aways use different leads
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.7, 10.8, 10.10**
  it('Property 5: with two or more haunts, no lead equals the previous lead, and every lead is in the list', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const steps = run(s);
        if (s.hauntIds.length < 2) return;
        steps.forEach(({ previousLeadId, out }) => {
          expect(out.leadId).not.toBeNull();
          expect(s.hauntIds).toContain(out.leadId);
          if (previousLeadId !== null) expect(out.leadId).not.toBe(previousLeadId);
        });
        for (let i = 1; i < steps.length; i++) {
          expect(steps[i].out.leadId).not.toBe(steps[i - 1].out.leadId);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 5: Consecutive look-aways use different leads
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.7, 10.8, 10.10**
  it('Property 5: with exactly one haunt, every lead is that haunt and the companion is null at any level', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const steps = run(s);
        if (s.hauntIds.length !== 1) return;
        for (const { out } of steps) {
          expect(out.leadId).toBe(s.hauntIds[0]);
          expect(out.companionId).toBeNull();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 5: Consecutive look-aways use different leads
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.7, 10.8, 10.10**
  it('Property 5: with no haunts, the level is 0 and there is no lead or companion', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const steps = run(s);
        if (s.hauntIds.length !== 0) return;
        for (const { out } of steps) {
          expect(out).toEqual({ level: 0, leadId: null, companionId: null });
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 5: Consecutive look-aways use different leads
  // **Validates: Requirements 3.1, 3.2, 3.3, 3.7, 10.8, 10.10**
  it('Property 5: the generated inputs reach every region the property is about', () => {
    const seen = {
      runs: 0,
      twoOrMore: 0,
      one: 0,
      zero: 0,
      consecutive: 0,
      previousInList: 0,
      level3Companion: 0,
      level2: 0,
    };
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const steps = run(s);
        seen.runs++;
        if (s.hauntIds.length >= 2) seen.twoOrMore++;
        if (s.hauntIds.length === 1) seen.one++;
        if (s.hauntIds.length === 0) seen.zero++;
        if (s.hauntIds.length >= 2 && steps.length >= 2) seen.consecutive++;
        if (s.firstPrevious !== null && s.hauntIds.includes(s.firstPrevious)) seen.previousInList++;
        if (steps.some((x) => x.out.companionId !== null)) seen.level3Companion++;
        if (steps.some((x) => x.out.level === 2)) seen.level2++;
      }),
      { numRuns: NUM_RUNS },
    );
    const atLeast = (n: number, pct: number) => n >= seen.runs * pct;
    expect(atLeast(seen.twoOrMore, 0.5), `two or more haunts: ${seen.twoOrMore}/${seen.runs}`).toBe(true);
    expect(atLeast(seen.one, 0.1), `one haunt: ${seen.one}/${seen.runs}`).toBe(true);
    expect(atLeast(seen.zero, 0.1), `zero haunts: ${seen.zero}/${seen.runs}`).toBe(true);
    expect(atLeast(seen.consecutive, 0.4), `consecutive look-aways: ${seen.consecutive}/${seen.runs}`).toBe(true);
    expect(atLeast(seen.previousInList, 0.1), `previous lead in list: ${seen.previousInList}/${seen.runs}`).toBe(true);
    expect(atLeast(seen.level3Companion, 0.2), `level 3 companion: ${seen.level3Companion}/${seen.runs}`).toBe(true);
    expect(atLeast(seen.level2, 0.2), `level 2: ${seen.level2}/${seen.runs}`).toBe(true);
  });
});
