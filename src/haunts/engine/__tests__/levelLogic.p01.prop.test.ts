import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluate } from '../levelLogic';
import type { LevelInput } from '../levelLogic';
import type { HauntMode } from '../ghost/mode';
import { eventHistoryArb, awayHistoryArb, hauntIdsArb, rollsArb, modeArb } from './arbitraries';

const NUM_RUNS = 300;

/** Time may be before, among, or long after the events. */
const nowArb = fc.integer({ min: -1000, max: 1_100_000 + 200_000 });

/** Previous lead: none, a listed id, or an id that is not in the list. */
function inputArb(history: fc.Arbitrary<LevelInput['events']>, mode: fc.Arbitrary<HauntMode>) {
  return fc
    .tuple(history, nowArb, mode, hauntIdsArb, rollsArb)
    .chain(([events, now, m, hauntIds, rolls]) =>
      fc
        .oneof(
          fc.constant<string | null>(null),
          hauntIds.length > 0 ? fc.constantFrom(...hauntIds) : fc.constant<string | null>(null),
          fc.constant<string | null>('not-in-list'),
        )
        .map((previousLeadId): LevelInput => ({ events, now, mode: m, hauntIds, previousLeadId, rolls })),
    );
}

const anyInputArb = inputArb(fc.oneof(eventHistoryArb, awayHistoryArb), modeArb);
/** Offset from the trailing away start: before it, among the levels, at each boundary. */
const offsetArb = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: -1000, max: 20_000 }) },
  { weight: 2, arbitrary: fc.constantFrom(0, 4999, 5000, 11_999, 12_000) },
);

/** Away history with `now` drawn relative to the trailing away start, so levels 1 to 3 all occur. */
const relativeInputArb: fc.Arbitrary<LevelInput> = fc
  .tuple(awayHistoryArb, offsetArb, modeArb, hauntIdsArb, rollsArb)
  .map(([events, offset, mode, hauntIds, rolls]) => {
    let start = events[events.length - 1].timestamp;
    for (let i = events.length - 1; i >= 0 && events[i].value === 'away'; i--) start = events[i].timestamp;
    return { events, now: start + offset, mode, hauntIds, previousLeadId: null, rolls };
  });
const coverageInputArb = fc.oneof(anyInputArb, relativeInputArb);
const gentleInputArb = inputArb(fc.oneof(eventHistoryArb, awayHistoryArb), fc.constant<HauntMode>('gentle'));

describe('Level_Logic evaluate', () => {
  // Feature: haunt-feature, Property 1: Level is bounded and gentle mode caps it
  // **Validates: Requirements 1.4, 7.1, 7.4, 10.4, 10.5**
  it('Property 1: level is an integer from 0 to 3 for any input', () => {
    fc.assert(
      fc.property(anyInputArb, (input) => {
        const out = evaluate(input);
        expect([0, 1, 2, 3]).toContain(out.level);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 1: Level is bounded and gentle mode caps it
  // **Validates: Requirements 1.4, 7.1, 7.4, 10.4, 10.5**
  it('Property 1: with gentle on, level is at most 1 and there is no companion', () => {
    fc.assert(
      fc.property(gentleInputArb, (input) => {
        const out = evaluate(input);
        expect(out.level).toBeLessThanOrEqual(1);
        expect(out.level).toBeGreaterThanOrEqual(0);
        expect(out.companionId).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 1: Level is bounded and gentle mode caps it
  // **Validates: Requirements 1.4, 7.1, 7.4, 10.4, 10.5**
  it('Property 1: the generators reach levels 0 to 3 and gentle caps a level that would be higher', () => {
    const seen = new Set<number>();
    let capped = 0;
    fc.assert(
      fc.property(coverageInputArb, (input) => {
        const out = evaluate(input);
        seen.add(out.level);
        if (input.mode === 'gentle' && evaluate({ ...input, mode: 'classic' }).level > 1) {
          capped++;
          expect(out.level).toBe(1);
          expect(out.companionId).toBeNull();
        }
      }),
      { numRuns: 1000 },
    );
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    expect(capped).toBeGreaterThan(0);
  });
});
