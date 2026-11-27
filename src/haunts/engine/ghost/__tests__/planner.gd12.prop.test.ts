// Feature: ghost-dread, Property 12: Jumpscare frequency over any three Qualifying_Returns
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { planReturn, type ReturnInput } from '../returnPlanner';
import type { HauntMode } from '../mode';
import { plannerInputArb, refAway, refRoll } from './plannerReference';

const NUM_RUNS = 500;
const TIMEOUT_MS = 30_000;
const SAMPLE_SIZE = 300;

type ScaryMode = 'classic' | 'nightmare';
/** Req 5.5 and 5.6: most Jumpscares in any three consecutive Qualifying_Returns. */
const LIMIT: Record<ScaryMode, number> = { classic: 1, nightmare: 2 };
/** Req 5.7: chance per Qualifying_Return once the limit allows one. */
const CHANCE: Record<ScaryMode, number> = { classic: 0.35, nightmare: 0.6 };

/** One return in a sequence: the full planner input, built from generated parts. */
interface Step { readonly input: ReturnInput }

const scaryModeArb = fc.constantFrom<ScaryMode>('classic', 'nightmare');

/** Away times: below 10 s (not qualifying) or 10 s and above (qualifying). */
const qualifyingAwayArb = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(10_000, 10_001) },
  { weight: 3, arbitrary: fc.integer({ min: 10_000, max: 200_000 }) },
  { weight: 1, arbitrary: fc.constantFrom(1e12, Infinity) },
);
const lowAwayArb = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(9999, 0, 1) },
  { weight: 2, arbitrary: fc.integer({ min: 0, max: 9999 }) },
  { weight: 1, arbitrary: fc.constantFrom(NaN, -1, -Infinity) },
);

/** Jump rolls: mostly below both probabilities, some between them, some high, some exactly 0. */
const jumpRollArb = fc.oneof(
  { weight: 6, arbitrary: fc.integer({ min: 0, max: 349_999 }).map((n) => n / 1_000_000) },
  { weight: 2, arbitrary: fc.constant(0) },
  { weight: 2, arbitrary: fc.integer({ min: 350_000, max: 599_999 }).map((n) => n / 1_000_000) },
  { weight: 2, arbitrary: fc.integer({ min: 600_000, max: 999_999 }).map((n) => n / 1_000_000) },
);

interface StepParts { base: ReturnInput; qualifying: boolean; jump: number }
const stepPartsArb: fc.Arbitrary<StepParts> = fc.record({
  base: plannerInputArb,
  qualifying: fc.oneof({ weight: 7, arbitrary: fc.constant(true) }, { weight: 3, arbitrary: fc.constant(false) }),
  jump: jumpRollArb,
});

function buildStep(p: StepParts, mode: HauntMode, away: number): Step {
  return { input: { ...p.base, mode, awayMs: away, rolls: { ...p.base.rolls, jump: p.jump } } };
}

/** Mixed qualifying and non-qualifying returns, one mode throughout, 1 to 40 returns. */
const steadyArb: fc.Arbitrary<Step[]> = fc
  .tuple(scaryModeArb, fc.array(fc.tuple(stepPartsArb, qualifyingAwayArb, lowAwayArb), { minLength: 1, maxLength: 40, size: 'large' }))
  .map(([mode, parts]) => parts.map(([p, q, l]) => buildStep(p, mode, p.qualifying ? q : l)));

/** Sequences where the mode changes at least once, including to and from Gentle. */
const switchingArb: fc.Arbitrary<Step[]> = fc
  .array(fc.tuple(stepPartsArb, qualifyingAwayArb, lowAwayArb, fc.constantFrom<HauntMode>('gentle', 'classic', 'classic', 'nightmare', 'nightmare')), {
    minLength: 4, maxLength: 40, size: 'large',
  })
  .map((parts) => parts.map(([p, q, l, m]) => buildStep(p, m, p.qualifying ? q : l)))
  .filter((steps) => steps.some((s, i) => i > 0 && s.input.mode !== steps[i - 1].input.mode));

/** Every return qualifies and every jump roll is 0, so the limit alone decides. */
const zeroRunArb: fc.Arbitrary<Step[]> = fc
  .tuple(scaryModeArb, fc.array(fc.tuple(stepPartsArb, qualifyingAwayArb), { minLength: 4, maxLength: 30 }))
  .map(([mode, parts]) => parts.map(([p, q]) => buildStep({ ...p, jump: 0 }, mode, q)));

export const sequenceArb: fc.Arbitrary<Step[]> = fc.oneof(
  { weight: 4, arbitrary: steadyArb },
  { weight: 3, arbitrary: switchingArb },
  { weight: 3, arbitrary: zeroRunArb },
);

interface Outcome { readonly qualifying: boolean; readonly jumped: boolean; readonly plan: ReturnType<typeof planReturn> }

/** Plan a sequence the way the controller will: record `plan.jumpscare !== null` of each qualifying return, keep the last two. */
function planSequence(steps: readonly Step[]): Outcome[] {
  let history: boolean[] = [];
  return steps.map((s) => {
    const plan = planReturn({ ...s.input, history });
    if (plan.qualifying) history = [...history, plan.jumpscare !== null].slice(-2);
    return { qualifying: plan.qualifying, jumped: plan.jumpscare !== null, plan };
  });
}

/**
 * Independent model written from the rule in the design: a Jumpscare happens when the return
 * qualifies in Classic or Nightmare, fewer than LIMIT of the last two Qualifying_Return outcomes
 * were Jumpscares, and the roll is below the chance. It keeps its own outcome list.
 */
function modelSequence(steps: readonly Step[]): { qualifying: boolean; jumped: boolean; blockedByLimit: boolean }[] {
  const past: boolean[] = [];
  return steps.map(({ input }) => {
    const mode = input.mode;
    const scary = mode === 'classic' || mode === 'nightmare';
    const qualifying = scary && refAway(input.awayMs) >= 10_000;
    if (!qualifying) return { qualifying: false, jumped: false, blockedByLimit: false };
    const m = mode as ScaryMode;
    const lastTwo = past.slice(-2).filter(Boolean).length;
    const rollOk = refRoll(input.rolls.jump) < CHANCE[m];
    const allowed = lastTwo < LIMIT[m];
    const jumped = allowed && rollOk;
    past.push(jumped);
    return { qualifying: true, jumped, blockedByLimit: !allowed && rollOk };
  });
}

/** Expected scares for an all-zero-roll run of qualifying returns, derived from the limit (0-based index i). */
function zeroRunExpected(mode: ScaryMode, length: number): boolean[] {
  // Classic, limit 1: a scare at 0 blocks 1 and 2; at 3 the last two are clear, so scare. Scares at 0, 3, 6...
  // Nightmare, limit 2: scares at 0 and 1 block 2; at 3 the last two hold one scare, so scare, and so at 4;
  // 5 sees two scares and is blocked. Scares at every index except 2, 5, 8...
  return Array.from({ length }, (_, i) => (mode === 'classic' ? i % 3 === 0 : i % 3 !== 2));
}

const isZeroRun = (steps: readonly Step[]): boolean =>
  steps.length >= 4 &&
  steps.every((s) => s.input.mode === steps[0].input.mode && s.input.rolls.jump === 0 && refAway(s.input.awayMs) >= 10_000) &&
  steps[0].input.mode !== 'gentle';

/** Labels for the coverage floors. */
export function sequenceTags(steps: readonly Step[]): readonly string[] {
  const tags: string[] = [];
  const uniq = (t: string): void => { if (!tags.includes(t)) tags.push(t); };
  const model = modelSequence(steps);
  model.forEach((m, i) => {
    const mode = steps[i].input.mode;
    if (m.blockedByLimit && mode === 'classic') uniq('bind:classic');
    if (m.blockedByLimit && mode === 'nightmare') uniq('bind:nightmare');
  });
  if (steps.length >= 12) uniq('long');
  const qIdx = model.map((m, i) => (m.qualifying ? i : -1)).filter((i) => i >= 0);
  if (qIdx.some((a, k) => k > 0 && a - qIdx[k - 1] > 1 && steps.slice(qIdx[k - 1] + 1, a).some((s) => refAway(s.input.awayMs) < 10_000))) {
    uniq('interleaved');
  }
  if (steps.some((s, i) => i > 0 && s.input.mode !== steps[i - 1].input.mode)) uniq('mode-change');
  if (isZeroRun(steps)) uniq('zero-run');
  return tags;
}

/**
 * Floors per 300 sequences: floor(mean - 4 SD) over 10 batches. Measured min / mean / SD:
 * limit binds in Classic: 136 / 148.6 / 8.59; limit binds in Nightmare: 83 / 98.2 / 7.58;
 * 12 or more returns: 79 / 87.2 / 6.03; non-qualifying returns between qualifying ones: 118 / 138.9 / 12.97;
 * a mode change: 76 / 90.5 / 8.68; all-zero roll run of 4 or more: 68 / 85.6 / 10.85.
 */
export const FLOORS: Record<string, number> = {
  'bind:classic': 114,
  'bind:nightmare': 67,
  long: 63,
  interleaved: 87,
  'mode-change': 55,
  'zero-run': 42,
};

describe('planReturn Jumpscare frequency (ghost-dread)', () => {
  // Feature: ghost-dread, Property 12: Jumpscare frequency over any three Qualifying_Returns
  // **Validates: Requirements 5.4, 5.5, 5.6, 11.7, 11.8, 11.9**
  it('Property 12: each outcome matches the model, and any three consecutive Qualifying_Returns stay within the limit', () => {
    fc.assert(
      fc.property(sequenceArb, (steps) => {
        const out = planSequence(steps);
        const model = modelSequence(steps);
        const q: { mode: HauntMode; jumped: boolean }[] = [];
        out.forEach((o, i) => {
          expect(o.qualifying, `qualifying at ${i}`).toBe(model[i].qualifying);
          expect(o.jumped, `jumped at ${i}`).toBe(model[i].jumped);
          // Req 11.9: at most one Jumpscare per plan (a single value), False_Calm none or 300 to 800 ms.
          const fc0 = o.plan.falseCalmMs;
          if (!o.jumped) expect(fc0).toBeNull();
          else if (fc0 !== null) {
            expect(fc0).toBeGreaterThanOrEqual(300);
            expect(fc0).toBeLessThanOrEqual(800);
          }
          if (steps[i].input.mode === 'gentle') expect(o.jumped, `gentle at ${i}`).toBe(false);
          if (o.qualifying) q.push({ mode: steps[i].input.mode, jumped: o.jumped });
        });
        for (let i = 0; i < q.length; i += 1) {
          const m = q[i].mode as ScaryMode;
          const prior = q.slice(Math.max(0, i - 2), i).filter((x) => x.jumped).length;
          // A scare in mode M needs fewer than LIMIT[M] scares among the previous two, so the window ending here holds at most LIMIT[M].
          if (q[i].jumped) expect(prior + 1, `window ending at q${i}`).toBeLessThanOrEqual(LIMIT[m]);
          // Windows of three in one mode hold at most that mode's limit (Req 5.5, 5.6).
          if (i >= 2 && q[i - 2].mode === m && q[i - 1].mode === m) {
            const count = [q[i - 2], q[i - 1], q[i]].filter((x) => x.jumped).length;
            expect(count, `window q${i - 2}..q${i} in ${m}`).toBeLessThanOrEqual(LIMIT[m]);
          }
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 12: Jumpscare frequency over any three Qualifying_Returns
  // **Validates: Requirements 5.4, 5.5, 5.6, 11.7, 11.8, 11.9**
  it('Property 12: with every roll 0 the limit alone decides: Classic scares at returns 1, 4, 7 and Nightmare at all but every third', () => {
    fc.assert(
      fc.property(zeroRunArb, (steps) => {
        const mode = steps[0].input.mode as ScaryMode;
        const got = planSequence(steps).map((o) => o.jumped);
        expect(got).toEqual(zeroRunExpected(mode, steps.length));
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Feature: ghost-dread, Property 12: Jumpscare frequency over any three Qualifying_Returns
  // **Validates: Requirements 5.4, 5.5, 5.6, 11.7, 11.8, 11.9**
  it('Property 12: Gentle returns plan no Jumpscare and are not recorded, whatever the rolls', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(stepPartsArb, qualifyingAwayArb), { minLength: 1, maxLength: 20 }), (parts) => {
        const steps = parts.map(([p, q]) => buildStep({ ...p, jump: 0 }, 'gentle', q));
        for (const o of planSequence(steps)) {
          expect(o.jumped).toBe(false);
          expect(o.qualifying).toBe(false);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, TIMEOUT_MS);

  // Coverage of the input space: the generator must reach each shape often enough.
  it('Property 12 coverage: sequences bind the limit in both modes, run long, interleave, switch mode and run all-zero rolls', () => {
    const counts = new Map<string, number>();
    for (const steps of fc.sample(sequenceArb, SAMPLE_SIZE)) {
      for (const tag of sequenceTags(steps)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    for (const [tag, floor] of Object.entries(FLOORS)) {
      expect(counts.get(tag) ?? 0, tag).toBeGreaterThanOrEqual(floor);
    }
  }, TIMEOUT_MS);
});
