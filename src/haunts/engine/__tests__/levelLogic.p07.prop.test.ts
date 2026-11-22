import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluate } from '../levelLogic';
import type { LevelInput } from '../levelLogic';
import { awayHistoryArb, eventHistoryArb, rollsArb } from './arbitraries';

const NUM_RUNS = 300;
/** The coverage check has a floor and a ceiling for gentle mode, so it gets more cases (same approach as p08). */
const COVERAGE_RUNS = 1000;

/** Gentle mode on about 35% of the time, the centre of the 25% to 45% coverage band. */
const gentleArb = fc.oneof(
  { weight: 13, arbitrary: fc.constant(false) },
  { weight: 7, arbitrary: fc.constant(true) },
);

const idArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/);

/** Haunt lists where every size 0 to 5 is common. */
const sizedIdsArb: fc.Arbitrary<string[]> = fc
  .integer({ min: 0, max: 5 })
  .chain((n) => fc.uniqueArray(idArb, { minLength: n, maxLength: n }));

/** Milliseconds after the away start; level 2 is weighted up because gentle mode and empty haunt lists remove cases from it. */
const elapsedArb = fc.oneof(
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 4999 }) },
  { weight: 4, arbitrary: fc.integer({ min: 5000, max: 11_999 }) },
  { weight: 3, arbitrary: fc.integer({ min: 12_000, max: 30_000 }) },
);

/** Input whose last events are `away`, with `now` drawn relative to the trailing away start. */
const awayInputArb: fc.Arbitrary<LevelInput> = fc
  .record({
    events: awayHistoryArb,
    elapsed: elapsedArb,
    gentle: gentleArb,
    hauntIds: sizedIdsArb,
    rolls: rollsArb,
  })
  .chain((r) => {
    const start = r.events.find((_, i) => r.events.slice(i).every((e) => e.value === 'away'))!.timestamp;
    return fc
      .oneof(
        fc.constant<string | null>(null),
        fc.constant<string | null>('not-in-list'),
        r.hauntIds.length > 0 ? fc.constantFrom<string | null>(...r.hauntIds) : fc.constant<string | null>(null),
      )
      .map(
        (previousLeadId): LevelInput => ({
          events: r.events,
          now: start + r.elapsed,
          gentle: r.gentle,
          hauntIds: r.hauntIds,
          previousLeadId,
          rolls: r.rolls,
        }),
      );
  });

/** Any history (may end in `present` or be empty), `now` near the last event. */
const anyInputArb: fc.Arbitrary<LevelInput> = fc
  .record({
    events: eventHistoryArb,
    offset: fc.integer({ min: -2000, max: 30_000 }),
    gentle: gentleArb,
    hauntIds: sizedIdsArb,
    rolls: rollsArb,
  })
  .map((r) => ({
    events: r.events,
    now: (r.events.length > 0 ? r.events[r.events.length - 1].timestamp : 0) + r.offset,
    gentle: r.gentle,
    hauntIds: r.hauntIds,
    previousLeadId: r.hauntIds[0] ?? null,
    rolls: r.rolls,
  }));

const inputArb = fc.oneof(
  { weight: 4, arbitrary: awayInputArb },
  { weight: 1, arbitrary: anyInputArb },
);

/** Freezes an object graph. Writing to a frozen object throws in strict mode (ES modules). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

describe('Level_Logic evaluate: determinism and no input mutation', () => {
  // Feature: haunt-feature, Property 7: Level_Logic is deterministic and does not mutate its input
  // **Validates: Requirements 10.1, 10.2**
  it('Property 7: two calls on structurally equal copies return equal outputs', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const a = evaluate(structuredClone(input));
        const b = evaluate(structuredClone(input));
        expect(b).toEqual(a);
        // Same object again, after the first call.
        expect(evaluate(input)).toEqual(a);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 7: Level_Logic is deterministic and does not mutate its input
  // **Validates: Requirements 10.1, 10.2**
  it('Property 7: the input is unchanged after the call', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const before = structuredClone(input);
        evaluate(input);
        expect(input).toEqual(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 7: Level_Logic is deterministic and does not mutate its input
  // **Validates: Requirements 10.1, 10.2**
  it('Property 7: a deeply frozen input is accepted and gives the same output', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const expected = evaluate(structuredClone(input));
        const frozen = deepFreeze(structuredClone(input));
        expect(evaluate(frozen)).toEqual(expected);
        expect(frozen).toEqual(input);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 7: Level_Logic is deterministic and does not mutate its input
  // **Validates: Requirements 10.1, 10.2**
  it('Property 7: the generated inputs reach every level and both gentle settings', () => {
    const seen = { runs: 0, l0: 0, l1: 0, l2: 0, l3: 0, gentle: 0, companion: 0 };
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = evaluate(input);
        seen.runs++;
        if (out.level === 0) seen.l0++;
        if (out.level === 1) seen.l1++;
        if (out.level === 2) seen.l2++;
        if (out.level === 3) seen.l3++;
        if (input.gentle) seen.gentle++;
        if (out.companionId !== null) seen.companion++;
      }),
      { numRuns: COVERAGE_RUNS },
    );
    const atLeast = (n: number, pct: number) => n >= seen.runs * pct;
    const msg = JSON.stringify(seen);
    expect(atLeast(seen.l0, 0.05), `level 0: ${msg}`).toBe(true);
    expect(atLeast(seen.l1, 0.1), `level 1: ${msg}`).toBe(true);
    expect(atLeast(seen.l2, 0.1), `level 2: ${msg}`).toBe(true);
    expect(atLeast(seen.l3, 0.1), `level 3: ${msg}`).toBe(true);
    expect(atLeast(seen.gentle, 0.25), `gentle at least 25%: ${msg}`).toBe(true);
    expect(seen.gentle <= seen.runs * 0.45, `gentle at most 45%: ${msg}`).toBe(true);
    expect(atLeast(seen.companion, 0.05), `companion present: ${msg}`).toBe(true);
  });
});
