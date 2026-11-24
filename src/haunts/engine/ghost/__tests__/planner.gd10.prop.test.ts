// Feature: ghost-dread, Property 10: Reduced motion plans have no Glitch and no close-up
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { planReturn, type ReturnInput, type ReturnRolls } from '../returnPlanner';
import type { ReturnPlan } from '../../returnTypes';
import { plannerInputArb } from './plannerReference';

const NUM_RUNS = 300;
const TIMEOUT_MS = 20_000;
const SAMPLE_SIZE = 300;
/** The design's floor for the reduced-motion fade (Req 3.10, 5.12, 9.10). */
const DESIGN_FADE_FLOOR_MS = 500;
/** The fade length chosen in task 4.2 (design rule 5: 600 ms). */
const CHOSEN_FADE_MS = 600;

/**
 * Floors per 300 inputs: floor(mean - 4 SD) over 10 batches, measured after shaping the generator
 * (see `Shape` in `reducedInputArb`). Measured min / mean / SD over 10 batches:
 * mode:classic 141 / 151.3 / 8.21; mode:nightmare 135 / 148.7 / 8.21; Jumpscare 209 / 218.4 / 7.04;
 * False_Calm 160 / 164.2 / 3.61; longest Jumpscare with the fade ending at 2700 or later 53 / 57.9 / 4.56.
 */
export const FLOORS: Record<string, number> = {
  'mode:classic': 118,
  'mode:nightmare': 115,
  'jump:reduced': 190,
  'falsecalm:reduced': 149,
  'jump:long-fade-late': 39,
};

type Shape = 'as-is' | 'scare' | 'longest';
type Rolls = ReturnRolls;

const ALMOST_ONE = 0.999999;

/**
 * Any Classic or Nightmare input with reduced motion on. Besides the shared generator, two shapes
 * force a Jumpscare with a False_Calm (history empty, away at least 10 s, jump roll 0, calm roll below
 * 0.75): `scare`, and `longest`, which
 * also takes a False_Calm of about 800 ms and the longest Jumpscare, so the fade ends near 3000 ms.
 */
export const reducedInputArb: fc.Arbitrary<ReturnInput> = fc
  .tuple(
    plannerInputArb,
    fc.constantFrom<'classic' | 'nightmare'>('classic', 'nightmare'),
    fc.constantFrom<Shape>('as-is', 'scare', 'longest', 'longest'),
    fc.integer({ min: 10_000, max: 60_000 }),
    fc.double({ min: 0, max: 0.74, noNaN: true }),
    fc.double({ min: 0.97, max: ALMOST_ONE, noNaN: true }),
  )
  .map(([base, mode, shape, away, calm, high]): ReturnInput => {
    if (shape === 'as-is') return { ...base, mode, reducedMotion: true };
    const rolls: Rolls = { ...base.rolls, jump: 0, calm };
    if (shape === 'longest') Object.assign(rolls, { calmLen: high, jumpLen: high });
    return { ...base, mode, reducedMotion: true, awayMs: away, history: [], rolls };
  });

/** Labels for the coverage floors. */
export function reducedTags(input: ReturnInput): readonly string[] {
  const plan = planReturn(input);
  const tags: string[] = [`mode:${input.mode}`];
  if (plan.jumpscare !== null) {
    tags.push('jump:reduced');
    if (plan.falseCalmMs !== null) tags.push('falsecalm:reduced');
    const fadeEnd = plan.fade === null ? 0 : plan.fade.startMs + plan.fade.durationMs;
    if (plan.jumpscare.durationMs >= 1390 && fadeEnd >= 2700) tags.push('jump:long-fade-late');
  }
  return tags;
}

const end = (span: { startMs: number; durationMs: number }): number => span.startMs + span.durationMs;

function checkReduced(input: ReturnInput, plan: ReturnPlan): void {
  expect(plan.glitch).toBeNull();
  expect(plan.fade).not.toBeNull();
  const fade = plan.fade as NonNullable<ReturnPlan['fade']>;
  expect(fade.durationMs).toBeGreaterThanOrEqual(DESIGN_FADE_FLOOR_MS);
  expect(fade.durationMs).toBe(CHOSEN_FADE_MS);
  const j = plan.jumpscare;
  if (j !== null) {
    expect(j.render).toBe('fade');
    expect(j.durationMs).toBeGreaterThanOrEqual(1000);
    expect(j.durationMs).toBeLessThanOrEqual(1400);
    expect(fade.startMs).toBe(end(j));
  } else {
    expect(fade.startMs).toBe(0);
  }
  expect(fade.startMs).toBeGreaterThanOrEqual(0);
  expect(end(fade)).toBeLessThanOrEqual(plan.durationMs);
  expect(end(fade)).toBeLessThanOrEqual(3000);
  expect(input.reducedMotion).toBe(true);
}

describe('planReturn with reduced motion (ghost-dread)', () => {
  // Feature: ghost-dread, Property 10: Reduced motion plans have no Glitch and no close-up
  // **Validates: Requirements 3.10, 5.12, 11.16**
  it('Property 10: reduced motion gives no Glitch, a fade, and any Jumpscare is a 1000 to 1400 ms fade', () => {
    fc.assert(
      fc.property(reducedInputArb, (input) => {
        checkReduced(input, planReturn(input));
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 10: Reduced motion plans have no Glitch and no close-up
  // **Validates: Requirements 3.10, 5.12, 11.16**
  it('Property 10: with reduced motion off, no Jumpscare is a fade and there is no fade', () => {
    fc.assert(
      fc.property(reducedInputArb, (input) => {
        const plan = planReturn({ ...input, reducedMotion: false });
        expect(plan.fade).toBeNull();
        if (plan.jumpscare !== null) expect(plan.jumpscare.render).toBe('full');
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 10: Reduced motion plans have no Glitch and no close-up
  // **Validates: Requirements 3.10, 5.12, 11.16**
  it('Property 10: turning reduced motion on keeps qualifying, ghostStep, the Jumpscare decision and falseCalmMs', () => {
    fc.assert(
      fc.property(reducedInputArb, (input) => {
        const on = planReturn(input);
        const off = planReturn({ ...input, reducedMotion: false });
        expect(on.qualifying).toBe(off.qualifying);
        expect(on.ghostStep).toBe(off.ghostStep);
        expect(on.falseCalmMs).toBe(off.falseCalmMs);
        expect(on.jumpscare === null).toBe(off.jumpscare === null);
        if (on.jumpscare !== null && off.jumpscare !== null) {
          expect(on.jumpscare.startMs).toBe(off.jumpscare.startMs);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 10: Reduced motion plans have no Glitch and no close-up
  // **Validates: Requirements 3.10, 5.12, 11.16**
  it('Property 10: the longest case (800 ms False_Calm, 1400 ms fade Jumpscare) keeps the fade inside 3000 ms', () => {
    const rolls: ReturnRolls = {
      jump: 0, calm: 0, calmLen: 1, jumpLen: 1, glitchLen: 1, flickers: 1,
      evidence: 0, evidenceMsg: 0, evidenceRun: 0, spoiler: 0,
    };
    for (const mode of ['classic', 'nightmare'] as const) {
      const plan = planReturn({
        mode, awayMs: 60_000, history: [], rolls, reducedMotion: true,
        paragraph: 'A quiet paragraph.', lookAwayCount: 0, spoiler: null, messages: [],
      });
      expect(plan.falseCalmMs).toBe(800);
      expect(plan.jumpscare).toEqual({ startMs: 800, durationMs: 1400, render: 'fade' });
      expect(plan.fade).toEqual({ startMs: 2200, durationMs: 600 });
      expect(plan.durationMs).toBe(3000);
      expect(plan.glitch).toBeNull();
    }
  });

  // Coverage of the input space: the generator must reach each shape often enough.
  it('Property 10 coverage: reduced inputs reach both modes, Jumpscares, False_Calm and the longest fade', () => {
    const counts = new Map<string, number>();
    for (const input of fc.sample(reducedInputArb, SAMPLE_SIZE)) {
      for (const tag of reducedTags(input)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    for (const [tag, floor] of Object.entries(FLOORS)) {
      expect(counts.get(tag) ?? 0, tag).toBeGreaterThanOrEqual(floor);
    }
  }, TIMEOUT_MS);
});
