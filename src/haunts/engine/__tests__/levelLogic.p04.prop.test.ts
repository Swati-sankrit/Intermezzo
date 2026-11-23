import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluate, THRESHOLDS_MS } from '../levelLogic';
import type { AttentionSignalLike } from '../levelLogic';
import { awayHistoryArb, hauntIdsArb, rollsArb, modeArb, fullModeArb } from './arbitraries';

const NUM_RUNS = 300;

/** Offset from the trailing away start: before it, at each threshold boundary, and well past them. */
const offsetArb = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: -1000, max: 20_000 }) },
  { weight: 2, arbitrary: fc.constantFrom(-1, 0, 1, 4999, 5000, 5001, 11_999, 12_000, 12_001) },
);

const previousLeadArb = fc.oneof(
  fc.constant<string | null>(null),
  fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/),
);

const baseArb = fc.record({
  events: awayHistoryArb,
  hauntIds: hauntIdsArb,
  previousLeadId: previousLeadArb,
  rolls: rollsArb,
});

/** Start of the trailing run of `away` events. */
function trailingAwayStart(events: readonly AttentionSignalLike[]): number {
  let start = events[events.length - 1].timestamp;
  for (let i = events.length - 1; i >= 0 && events[i].value === 'away'; i--) start = events[i].timestamp;
  return start;
}

/** Input plus a `now` drawn relative to the trailing away start. */
const baseNowArb = baseArb.chain((base) =>
  offsetArb.map((offset) => ({ base, now: trailingAwayStart(base.events) + offset })),
);

/** Input plus an ordered pair t1 <= t2, both relative to the trailing away start. */
const baseTimesArb = baseArb.chain((base) =>
  fc.tuple(offsetArb, offsetArb).map(([a, b]) => {
    const start = trailingAwayStart(base.events);
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    return { base, t1: start + lo, t2: start + hi };
  }),
);

function thresholdLevel(elapsed: number): 1 | 2 | 3 {
  if (elapsed >= THRESHOLDS_MS.level3) return 3;
  if (elapsed >= THRESHOLDS_MS.level2) return 2;
  return 1;
}

describe('Level_Logic evaluate: level never falls while away, lead stays the same', () => {
  // Feature: haunt-feature, Property 4: Level never falls while away, and the lead stays the same
  // **Validates: Requirements 1.6, 3.4, 7.3, 10.11**
  it('Property 4: level at t2 is at least the level at t1, for any mode', () => {
    fc.assert(
      fc.property(baseTimesArb, modeArb, ({ base, t1, t2 }, mode) => {
        const a = evaluate({ ...base, mode, now: t1 });
        const b = evaluate({ ...base, mode, now: t2 });
        expect(b.level).toBeGreaterThanOrEqual(a.level);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 4: Level never falls while away, and the lead stays the same
  // **Validates: Requirements 1.6, 3.4, 7.3, 10.11**
  it('Property 4: leadId is the same at t1 and t2', () => {
    fc.assert(
      fc.property(baseTimesArb, modeArb, ({ base, t1, t2 }, mode) => {
        const a = evaluate({ ...base, mode, now: t1 });
        const b = evaluate({ ...base, mode, now: t2 });
        expect(b.leadId).toBe(a.leadId);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 4: Level never falls while away, and the lead stays the same
  // **Validates: Requirements 1.6, 3.4, 7.3, 10.11**
  it('Property 4: changing only the mode does not change leadId', () => {
    fc.assert(
      fc.property(baseNowArb, fullModeArb, ({ base, now }, full) => {
        const on = evaluate({ ...base, mode: 'gentle', now });
        const off = evaluate({ ...base, mode: full, now });
        expect(on.leadId).toBe(off.leadId);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 4: Level never falls while away, and the lead stays the same
  // **Validates: Requirements 1.6, 3.4, 7.3, 10.11**
  it('Property 4: with Classic or Nightmare the level equals the threshold level for the elapsed time', () => {
    fc.assert(
      fc.property(baseNowArb, fullModeArb, ({ base, now }, full) => {
        const out = evaluate({ ...base, mode: full, now });
        if (base.hauntIds.length === 0) {
          expect(out.level).toBe(0);
          return;
        }
        const elapsed = Math.max(0, now - trailingAwayStart(base.events));
        expect(out.level).toBe(thresholdLevel(elapsed));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 4: Level never falls while away, and the lead stays the same
  // **Validates: Requirements 1.6, 3.4, 7.3, 10.11**
  it('Property 4: the generators produce non-empty haunt lists and all three levels', () => {
    const levels = new Set<number>();
    let withIds = 0;
    fc.assert(
      fc.property(baseNowArb, ({ base, now }) => {
        if (base.hauntIds.length > 0) withIds++;
        levels.add(evaluate({ ...base, mode: 'classic', now }).level);
      }),
      { numRuns: NUM_RUNS },
    );
    expect(withIds).toBeGreaterThan(0);
    expect(levels.has(1)).toBe(true);
    expect(levels.has(2)).toBe(true);
    expect(levels.has(3)).toBe(true);
  });
});
