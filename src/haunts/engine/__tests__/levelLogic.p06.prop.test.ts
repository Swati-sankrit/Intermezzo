import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { evaluate } from '../levelLogic';
import type { LevelInput, LevelOutput } from '../levelLogic';
import { awayHistoryArb, eventHistoryArb, rollsArb, weightedModeArb } from './arbitraries';

const NUM_RUNS = 300;

/** Gentle mode on 42% of the time: about 4 SD above the 30% gentle floor, few enough to keep level 3 with companions common. */
const modeInputArb = weightedModeArb(21, 29);

const idArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,7}$/);

/** Haunt lists: size 0 is 8%, size 1 is 28%, sizes 2 to 5 share the other 64% (a plain uniqueArray favours small sizes). */
const sizedIdsArb: fc.Arbitrary<string[]> = fc
  .oneof(
    { weight: 8, arbitrary: fc.constant(0) },
    { weight: 28, arbitrary: fc.constant(1) },
    { weight: 64, arbitrary: fc.integer({ min: 2, max: 5 }) },
  )
  .chain((n) => fc.uniqueArray(idArb, { minLength: n, maxLength: n }));

/** Milliseconds after the away start; level 1 is 5%, level 2 is 41%, level 3 is 54%. */
const elapsedArb = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 0, max: 4999 }) },
  { weight: 41, arbitrary: fc.integer({ min: 5000, max: 11_999 }) },
  { weight: 54, arbitrary: fc.integer({ min: 12_000, max: 30_000 }) },
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
  { weight: 9, arbitrary: awayInputArb },
  { weight: 1, arbitrary: anyInputArb },
);

function checkCompanion(input: LevelInput, out: LevelOutput): void {
  if (out.companionId !== null) {
    expect(out.level).toBe(3);
    expect(input.hauntIds.length).toBeGreaterThanOrEqual(2);
    expect(out.leadId).not.toBeNull();
    expect(out.companionId).not.toBe(out.leadId);
    expect(input.hauntIds).toContain(out.companionId);
    expect(input.hauntIds).toContain(out.leadId);
  }
  if (out.level < 3) expect(out.companionId).toBeNull();
}

describe('Level_Logic evaluate: companion rules', () => {
  // Feature: haunt-feature, Property 6: Companion rules
  // **Validates: Requirements 3.5, 3.6, 10.9**
  it('Property 6: a companion implies level 3, two or more haunts, a different id, both ids in the list', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        checkCompanion(input, evaluate(input));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 6: Companion rules
  // **Validates: Requirements 3.5, 3.6, 10.9**
  it('Property 6: below level 3 there is never a companion', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = evaluate(input);
        if (out.level < 3) expect(out.companionId).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 6: Companion rules
  // **Validates: Requirements 3.5, 3.6, 10.9**
  it('Property 6: at level 3 with two or more haunts there is a companion, with one haunt there is none', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = evaluate(input);
        if (out.level !== 3) return;
        if (input.hauntIds.length >= 2) expect(out.companionId).not.toBeNull();
        else expect(out.companionId).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 6: Companion rules
  // **Validates: Requirements 3.5, 3.6, 10.9**
  it('Property 6: gentle mode never has a companion', () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = evaluate({ ...input, mode: 'gentle' });
        expect(out.companionId).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 6: Companion rules
  // **Validates: Requirements 3.5, 3.6, 10.9**
  it('Property 6: the generated inputs reach every region the property is about', () => {
    const seen = { runs: 0, l3Two: 0, l3One: 0, l2: 0, l1: 0, gentle: 0, l0: 0, companion: 0 };
    fc.assert(
      fc.property(inputArb, (input) => {
        const out = evaluate(input);
        seen.runs++;
        if (out.level === 3 && input.hauntIds.length >= 2) seen.l3Two++;
        if (out.level === 3 && input.hauntIds.length === 1) seen.l3One++;
        if (out.level === 2) seen.l2++;
        if (out.level === 1) seen.l1++;
        if (out.level === 0) seen.l0++;
        if (input.mode === 'gentle') seen.gentle++;
        if (out.companionId !== null) seen.companion++;
      }),
      { numRuns: NUM_RUNS },
    );
    const atLeast = (n: number, pct: number) => n >= seen.runs * pct;
    const msg = JSON.stringify(seen);
    expect(atLeast(seen.l3Two, 0.1), `level 3, two or more haunts: ${msg}`).toBe(true);
    expect(atLeast(seen.l3One, 0.02), `level 3, one haunt: ${msg}`).toBe(true);
    expect(atLeast(seen.l2, 0.1), `level 2: ${msg}`).toBe(true);
    expect(atLeast(seen.l1, 0.1), `level 1: ${msg}`).toBe(true);
    expect(atLeast(seen.l0, 0.05), `level 0: ${msg}`).toBe(true);
    expect(atLeast(seen.gentle, 0.3), `gentle: ${msg}`).toBe(true);
    expect(atLeast(seen.companion, 0.1), `companion present: ${msg}`).toBe(true);
  });
});
