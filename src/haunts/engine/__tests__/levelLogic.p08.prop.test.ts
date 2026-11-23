import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluate, nextChangeDelay } from '../levelLogic';
import type { LevelInput } from '../levelLogic';
import { awayHistoryArb, eventHistoryArb, rollsArb, weightedModeArb } from './arbitraries';

const NUM_RUNS = 300;
/** Runs for the coverage test only: the 25% to 40% band is about 5 SD wide on each side at this count. */
const COVERAGE_RUNS = 1000;

/** Gentle mode on 32.5% of the time: the centre of the 25% to 40% coverage band. */
const modeInputArb = weightedModeArb(13, 27);

const idArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/);

/** Haunt lists where every size 0 to 5 is common. */
const sizedIdsArb: fc.Arbitrary<string[]> = fc
  .integer({ min: 0, max: 5 })
  .chain((n) => fc.uniqueArray(idArb, { minLength: n, maxLength: n }));

/** Milliseconds after the away start; levels 1, 2 and 3 are each about a third. */
const elapsedArb = fc.oneof(
  fc.integer({ min: 0, max: 4999 }),
  fc.integer({ min: 5000, max: 11_999 }),
  fc.integer({ min: 12_000, max: 30_000 }),
  fc.constantFrom(0, 1, 4998, 4999, 5000, 5001, 11_998, 11_999, 12_000, 12_001),
);

/** Input whose last events are `away`, with `now` drawn relative to the trailing away start. */
const awayInputArb: fc.Arbitrary<LevelInput> = fc
  .record({
    events: awayHistoryArb,
    elapsed: elapsedArb,
    mode: modeInputArb,
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
          mode: r.mode,
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
    mode: modeInputArb,
    hauntIds: sizedIdsArb,
    rolls: rollsArb,
  })
  .map((r) => ({
    events: r.events,
    now: (r.events.length > 0 ? r.events[r.events.length - 1].timestamp : 0) + r.offset,
    mode: r.mode,
    hauntIds: r.hauntIds,
    previousLeadId: r.hauntIds[0] ?? null,
    rolls: r.rolls,
  }));

const inputArb = fc.oneof(
  { weight: 4, arbitrary: awayInputArb },
  { weight: 1, arbitrary: anyInputArb },
);

describe('Level_Logic nextChangeDelay: lands on the next level change', () => {
  // Feature: haunt-feature, Property 8: nextChangeDelay lands on the next level change
  // **Validates: Requirements 1.2, 1.3, 11.5**
  it('Property 8: a returned delay raises the level exactly at now + d, not one ms earlier', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const d = nextChangeDelay(input);
        if (d === null) return;
        const at = (now: number) => evaluate({ ...input, now }).level;
        const here = at(input.now);
        expect(Number.isInteger(d) && d >= 1).toBe(true);
        expect(at(input.now + d)).toBeGreaterThan(here);
        expect(at(input.now + d - 1)).toBe(here);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 8: nextChangeDelay lands on the next level change
  // **Validates: Requirements 1.2, 1.3, 11.5**
  it('Property 8: the delay is null exactly when level is 0 or 3, gentle is on, or there are no haunts', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const level = evaluate(input).level;
        const expectNull =
          level === 0 || level === 3 || input.mode === 'gentle' || input.hauntIds.length === 0;
        expect(nextChangeDelay(input) === null).toBe(expectNull);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 8: nextChangeDelay lands on the next level change
  // **Validates: Requirements 1.2, 1.3, 11.5**
  it('Property 8: the generated inputs reach every level, both gentle settings and both delay outcomes', () => {
    const seen = { runs: 0, l0: 0, l1: 0, l2: 0, l3: 0, gentle: 0, delayNull: 0, delayNumber: 0 };
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = evaluate(input);
        seen.runs++;
        if (out.level === 0) seen.l0++;
        if (out.level === 1) seen.l1++;
        if (out.level === 2) seen.l2++;
        if (out.level === 3) seen.l3++;
        if (input.mode === 'gentle') seen.gentle++;
        if (nextChangeDelay(input) === null) seen.delayNull++;
        else seen.delayNumber++;
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
    expect(seen.gentle <= seen.runs * 0.4, `gentle at most 40%: ${msg}`).toBe(true);
    expect(atLeast(seen.delayNumber, 0.2), `non-null delay: ${msg}`).toBe(true);
    expect(atLeast(seen.delayNull, 0.2), `null delay: ${msg}`).toBe(true);
  });
});
