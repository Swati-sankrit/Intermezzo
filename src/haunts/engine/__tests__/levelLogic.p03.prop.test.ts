import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluate } from '../levelLogic';
import type { AttentionSignalLike, LevelInput } from '../levelLogic';
import { eventHistoryArb, hauntIdsArb, presentHistoryArb, rollsArb, modeArb } from './arbitraries';

const NUM_RUNS = 300;

/** Last event is `present`, or the history is empty. */
const calmHistoryArb: fc.Arbitrary<AttentionSignalLike[]> = fc.oneof(
  { weight: 4, arbitrary: presentHistoryArb },
  { weight: 1, arbitrary: fc.constant<AttentionSignalLike[]>([]) },
);

/** Any `now`: before, near and far after the events. */
const nowArb = fc.integer({ min: -1_000_000, max: 2_000_000 });

const otherInputArb = fc.record({
  now: nowArb,
  mode: modeArb,
  hauntIds: hauntIdsArb,
  previousLeadId: fc.oneof(fc.constant<string | null>(null), fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/)),
  rolls: rollsArb,
});

/** Extra `present` events after the history, timestamps never going backwards. */
function extendWithPresent(
  events: readonly AttentionSignalLike[],
  gaps: readonly number[],
): AttentionSignalLike[] {
  let t = events.length > 0 ? events[events.length - 1].timestamp : 0;
  const extra = gaps.map((gap) => {
    t += gap;
    return { value: 'present' as const, timestamp: t };
  });
  return [...events, ...extra];
}

const gapsArb = fc.array(fc.integer({ min: 0, max: 20_000 }), { minLength: 1, maxLength: 5 });

describe('Level_Logic evaluate: present means level 0', () => {
  // Feature: haunt-feature, Property 3: Present means level 0
  // **Validates: Requirements 1.5, 2.1, 10.6, 10.7**
  it('Property 3: a history ending in present, or empty, gives level 0 with no lead and no companion', () => {
    fc.assert(
      fc.property(calmHistoryArb, otherInputArb, (events, other) => {
        const out = evaluate({ events, ...other } satisfies LevelInput);
        expect(out).toEqual({ level: 0, leadId: null, companionId: null });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 3: Present means level 0
  // **Validates: Requirements 1.5, 2.1, 10.6, 10.7**
  it('Property 3: extending a calm history with further present events never raises the level', () => {
    fc.assert(
      fc.property(calmHistoryArb, gapsArb, otherInputArb, (events, gaps, other) => {
        const before = evaluate({ events, ...other });
        const after = evaluate({ events: extendWithPresent(events, gaps), ...other });
        expect(after.level).toBeLessThanOrEqual(before.level);
        expect(after).toEqual({ level: 0, leadId: null, companionId: null });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 3: Present means level 0
  // **Validates: Requirements 1.5, 2.1, 10.6, 10.7**
  it('Property 3: a present event after any history (including away) drops the output to level 0 and never raises it', () => {
    fc.assert(
      fc.property(eventHistoryArb, gapsArb, otherInputArb, (events, gaps, other) => {
        const before = evaluate({ events, ...other });
        const after = evaluate({ events: extendWithPresent(events, gaps), ...other });
        expect(after.level).toBeLessThanOrEqual(before.level);
        expect(after).toEqual({ level: 0, leadId: null, companionId: null });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 3: Present means level 0
  // **Validates: Requirements 1.5, 2.1, 10.6, 10.7**
  it('Property 3: the generators cover empty histories, away-then-present histories and non-empty haunt lists', () => {
    let empty = 0;
    let awayBeforePresent = 0;
    let withIds = 0;
    fc.assert(
      fc.property(calmHistoryArb, otherInputArb, (events, other) => {
        if (events.length === 0) empty++;
        if (events.some((e) => e.value === 'away')) awayBeforePresent++;
        if (other.hauntIds.length > 0) withIds++;
      }),
      { numRuns: NUM_RUNS },
    );
    expect(empty).toBeGreaterThan(0);
    expect(awayBeforePresent).toBeGreaterThan(0);
    expect(withIds).toBeGreaterThan(0);
  });
});
