import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluate } from '../levelLogic';
import type { LevelInput } from '../levelLogic';
import { awayHistoryArb, hauntIdsArb, rollsArb, fullModeArb } from './arbitraries';

const NUM_RUNS = 300;

/** Elapsed time since the away start: negative, near each threshold, and far past them. */
const offsetArb = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: -20_000, max: 30_000 }) },
  { weight: 2, arbitrary: fc.constantFrom(-1, 0, 1, 4999, 5000, 5001, 11_999, 12_000, 12_001) },
);

const nonEmptyIdsArb = hauntIdsArb.filter((ids) => ids.length > 0);

/** Start of the trailing run of `away` events, found without using the code under test. */
function trailingAwayStart(events: LevelInput['events']): number {
  const lastPresent = events.map((e) => e.value).lastIndexOf('present');
  return events[lastPresent + 1].timestamp;
}

const inputArb = fc
  .tuple(awayHistoryArb, offsetArb, nonEmptyIdsArb, rollsArb, fullModeArb)
  .chain(([events, offset, hauntIds, rolls, mode]) =>
    fc
      .oneof(
        fc.constant<string | null>(null),
        fc.constantFrom(...hauntIds),
        fc.constant<string | null>('not-in-list'),
      )
      .map((previousLeadId) => ({
        input: {
          events,
          now: trailingAwayStart(events) + offset,
          mode,
          hauntIds,
          previousLeadId,
          rolls,
        } satisfies LevelInput,
        elapsed: offset,
      })),
  );

function expectedLevel(elapsed: number): 1 | 2 | 3 {
  if (elapsed >= 12_000) return 3;
  if (elapsed >= 5000) return 2;
  return 1;
}

describe('Level_Logic evaluate: escalation thresholds', () => {
  // Feature: haunt-feature, Property 2: Escalation follows the thresholds
  // **Validates: Requirements 1.1, 1.2, 1.3, 2.5**
  it('Property 2: level is 1 below 5000 ms, 2 from 5000 ms, 3 from 12000 ms after the away start', () => {
    fc.assert(
      fc.property(inputArb, ({ input, elapsed }) => {
        expect(evaluate(input).level).toBe(expectedLevel(elapsed));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 2: Escalation follows the thresholds
  // **Validates: Requirements 1.1, 1.2, 1.3, 2.5**
  it('Property 2: a negative elapsed time gives level 1', () => {
    fc.assert(
      fc.property(
        inputArb.filter(({ elapsed }) => elapsed < 0),
        ({ input }) => {
          expect(evaluate(input).level).toBe(1);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 2: Escalation follows the thresholds
  // **Validates: Requirements 1.1, 1.2, 1.3, 2.5**
  it('Property 2: the generator reaches every level, including negative elapsed time', () => {
    const seen = new Set<number>();
    let negative = 0;
    fc.assert(
      fc.property(inputArb, ({ input, elapsed }) => {
        seen.add(evaluate(input).level);
        if (elapsed < 0) negative++;
      }),
      { numRuns: NUM_RUNS },
    );
    expect([...seen].sort()).toEqual([1, 2, 3]);
    expect(negative).toBeGreaterThan(0);
  });
});
