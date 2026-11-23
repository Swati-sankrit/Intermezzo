import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluate } from '../levelLogic';
import type { LevelInput, LevelOutput } from '../levelLogic';
import type { HauntMode } from '../ghost/mode';
import { awayHistoryArb, eventHistoryArb, hauntIdsArb, rollsArb, modeArb, fullModeArb } from './arbitraries';

const NUM_RUNS = 300;
const COVERAGE_RUNS = 1000;

/**
 * The previous Level_Logic (input `gentle: boolean`), written out independently of
 * `evaluate` as the reference for Classic and Nightmare. It is called with gentle false.
 */
function previousEvaluate(input: Omit<LevelInput, 'mode'> & { gentle: boolean }): LevelOutput {
  const { events } = input;
  let start: number | null = null;
  for (let i = events.length - 1; i >= 0 && events[i].value === 'away'; i--) start = events[i].timestamp;
  if (start === null || input.hauntIds.length === 0) return { level: 0, leadId: null, companionId: null };

  const elapsed = Math.max(0, input.now - start);
  const level: 1 | 2 | 3 = input.gentle ? 1 : elapsed >= 12_000 ? 3 : elapsed >= 5000 ? 2 : 1;

  const ids = input.hauntIds;
  const others = ids.filter((id) => id !== input.previousLeadId);
  const leadPool = others.length === 0 || others.length === ids.length ? ids : others;
  const at = (pool: readonly string[], roll: number) => pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
  const leadId = at(leadPool, input.rolls.lead);
  let companionId: string | null = null;
  if (level === 3 && !input.gentle && ids.length >= 2) {
    companionId = at(ids.filter((id) => id !== leadId), input.rolls.companion);
  }
  return { level, leadId, companionId };
}

const idArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/);

/** Haunt lists where every size 0 to 5 is common. */
const sizedIdsArb: fc.Arbitrary<string[]> = fc
  .integer({ min: 0, max: 5 })
  .chain((n) => fc.uniqueArray(idArb, { minLength: n, maxLength: n }));

/** Milliseconds after the away start: each level range is common, and the thresholds themselves occur. */
const elapsedArb = fc.oneof(
  fc.integer({ min: -2000, max: 4999 }),
  fc.integer({ min: 5000, max: 11_999 }),
  fc.integer({ min: 12_000, max: 30_000 }),
  fc.constantFrom(0, 4999, 5000, 11_999, 12_000),
);

const awayInputArb: fc.Arbitrary<Omit<LevelInput, 'mode'>> = fc
  .record({ events: awayHistoryArb, elapsed: elapsedArb, hauntIds: sizedIdsArb, rolls: rollsArb })
  .chain((r) => {
    const start = r.events.find((_, i) => r.events.slice(i).every((e) => e.value === 'away'))!.timestamp;
    return fc
      .oneof(
        fc.constant<string | null>(null),
        fc.constant<string | null>('not-in-list'),
        r.hauntIds.length > 0 ? fc.constantFrom<string | null>(...r.hauntIds) : fc.constant<string | null>(null),
      )
      .map((previousLeadId) => ({
        events: r.events,
        now: start + r.elapsed,
        hauntIds: r.hauntIds,
        previousLeadId,
        rolls: r.rolls,
      }));
  });

const anyInputArb: fc.Arbitrary<Omit<LevelInput, 'mode'>> = fc
  .record({
    events: eventHistoryArb,
    offset: fc.integer({ min: -2000, max: 30_000 }),
    hauntIds: hauntIdsArb,
    rolls: rollsArb,
  })
  .map((r) => ({
    events: r.events,
    now: (r.events.length > 0 ? r.events[r.events.length - 1].timestamp : 0) + r.offset,
    hauntIds: r.hauntIds,
    previousLeadId: r.hauntIds[0] ?? null,
    rolls: r.rolls,
  }));

const baseArb = fc.oneof({ weight: 4, arbitrary: awayInputArb }, { weight: 1, arbitrary: anyInputArb });

describe('Level_Logic evaluate: modes', () => {
  // Feature: ghost-dread, Property 2: Level_Logic with modes
  // **Validates: Requirements 8.12**
  it('Property 2: in Gentle the level is at most 1 and there is no companion', () => {
    fc.assert(
      fc.property(baseArb, (base) => {
        const out = evaluate({ ...base, mode: 'gentle' });
        expect(out.level).toBeLessThanOrEqual(1);
        expect(out.companionId).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 2: Level_Logic with modes
  // **Validates: Requirements 8.12**
  it('Property 2: in Classic and Nightmare the output equals the previous Level_Logic with gentle false', () => {
    fc.assert(
      fc.property(baseArb, fullModeArb, (base, mode) => {
        expect(evaluate({ ...base, mode })).toEqual(previousEvaluate({ ...base, gentle: false }));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 2: Level_Logic with modes
  // **Validates: Requirements 8.12**
  it('Property 2: Classic and Nightmare give identical output', () => {
    fc.assert(
      fc.property(baseArb, (base) => {
        expect(evaluate({ ...base, mode: 'classic' })).toEqual(evaluate({ ...base, mode: 'nightmare' }));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 2: Level_Logic with modes
  // **Validates: Requirements 8.12**
  it('Property 2: the generators reach every mode, every level, companions, and a Gentle cap that bites', () => {
    const seen = { runs: 0, l0: 0, l1: 0, l2: 0, l3: 0, companion: 0, capped: 0, modes: new Set<HauntMode>() };
    fc.assert(
      fc.property(baseArb, modeArb, (base, mode) => {
        const out = evaluate({ ...base, mode });
        seen.runs++;
        seen.modes.add(mode);
        if (mode !== 'gentle') {
          if (out.level === 0) seen.l0++;
          if (out.level === 1) seen.l1++;
          if (out.level === 2) seen.l2++;
          if (out.level === 3) seen.l3++;
          if (out.companionId !== null) seen.companion++;
        } else if (evaluate({ ...base, mode: 'classic' }).level > 1) {
          seen.capped++;
          expect(out.level).toBe(1);
          expect(out.companionId).toBeNull();
        }
      }),
      { numRuns: COVERAGE_RUNS },
    );
    const msg = JSON.stringify({ ...seen, modes: [...seen.modes] });
    expect([...seen.modes].sort(), msg).toEqual(['classic', 'gentle', 'nightmare']);
    for (const key of ['l0', 'l1', 'l2', 'l3', 'companion', 'capped'] as const) {
      expect(seen[key] >= seen.runs * 0.02, `${key}: ${msg}`).toBe(true);
    }
  });
});
