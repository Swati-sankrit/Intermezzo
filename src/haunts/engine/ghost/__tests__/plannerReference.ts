/**
 * Independent reference model and input generator for the Return_Planner properties (ghost-dread).
 * The model is written from design rules 4 to 6 and does not import `planParts.ts`.
 */
import fc from 'fast-check';
import type { ReturnInput, ReturnRolls } from '../returnPlanner';
import type { ReturnPlan } from '../../returnTypes';
import { modeArb } from '../../__tests__/arbitraries';
import { historyArb, messagePoolArb, paragraphArb, spoilerSourceArb, unitFractionArb, edgeFractionArb } from './arbitraries';

/** What the design says a plan is, for a Classic or Nightmare input, built from the input alone. */
export type ReferencePlan = Pick<
  ReturnPlan,
  'durationMs' | 'qualifying' | 'ambientFadeMs' | 'falseCalmMs' | 'jumpscare' | 'fade' | 'glitch' | 'evidence' | 'spoiler'
>;

const LIMIT = { classic: 1, nightmare: 2 } as const;
const CHANCE = { classic: 0.35, nightmare: 0.6 } as const;

/** Rolls live in [0, 1): NaN and negatives become 0; 1 or more becomes the largest double below 1. */
export const refRoll = (x: number): number => (x > 0 ? Math.min(x, 1 - Number.EPSILON / 2) : 0);
/** Away time: NaN and negatives become 0. */
export const refAway = (x: number): number => (x > 0 ? x : 0);

export function referencePlan(input: ReturnInput & { mode: 'classic' | 'nightmare' }): ReferencePlan {
  const { mode, rolls, reducedMotion: reduced } = input;
  const qualifying = refAway(input.awayMs) >= 10_000;
  const recent = input.history.slice(-2).filter((h) => h === true).length;
  const jumps = qualifying && recent < LIMIT[mode] && refRoll(rolls.jump) < CHANCE[mode];

  let falseCalmMs: number | null = null;
  let jumpscare: ReturnPlan['jumpscare'] = null;
  if (jumps) {
    if (refRoll(rolls.calm) < 0.75) falseCalmMs = 300 + Math.round(refRoll(rolls.calmLen) * 500);
    const length = reduced
      ? 1000 + Math.round(refRoll(rolls.jumpLen) * 400)
      : 700 + Math.round(refRoll(rolls.jumpLen) * 500);
    jumpscare = { startMs: falseCalmMs ?? 0, durationMs: length, render: reduced ? 'fade' : 'full' };
  }
  const jumpEnd = jumpscare === null ? 0 : jumpscare.startMs + jumpscare.durationMs;
  const fade = reduced ? { startMs: jumpEnd, durationMs: 600 } : null;
  const lastEnd = fade === null ? jumpEnd : fade.startMs + fade.durationMs;
  return {
    durationMs: Math.min(3000, Math.max(2000, lastEnd + 300)),
    qualifying,
    ambientFadeMs: jumpscare === null ? 600 : 300,
    falseCalmMs,
    jumpscare,
    fade,
    glitch: null,
    evidence: null,
    spoiler: null,
  };
}

/** Values the planner must tolerate in a numeric input. */
const DIRTY_NUMBERS = [NaN, -1, -0.5, -1e9, 1, 1.5, 1e9, Infinity, -Infinity] as const;

const dirtyNumberArb = fc.constantFrom<number>(...DIRTY_NUMBERS);
/** A roll that is clean most of the time and sometimes outside [0, 1) or NaN. */
const rollArb = (clean: fc.Arbitrary<number>): fc.Arbitrary<number> =>
  fc.oneof({ weight: 8, arbitrary: clean }, { weight: 1, arbitrary: dirtyNumberArb });

/** Low jump rolls are common so that Classic and Nightmare both often plan a Jumpscare. */
const jumpRollArb = rollArb(
  fc.oneof(
    { weight: 5, arbitrary: fc.integer({ min: 0, max: 299_999 }).map((n) => n / 1_000_000) },
    { weight: 3, arbitrary: edgeFractionArb },
  ),
);
const calmRollArb = rollArb(
  fc.oneof(
    { weight: 2, arbitrary: unitFractionArb },
    { weight: 1, arbitrary: fc.constantFrom(0, 0.749999, 0.75, 0.999999) },
  ),
);
const lengthRollArb = rollArb(
  fc.oneof({ weight: 3, arbitrary: unitFractionArb }, { weight: 1, arbitrary: fc.constantFrom(0, 0.999999) }),
);

export const plannerRollsArb: fc.Arbitrary<ReturnRolls> = fc.record({
  jump: jumpRollArb,
  calm: calmRollArb,
  calmLen: lengthRollArb,
  jumpLen: lengthRollArb,
  glitchLen: rollArb(unitFractionArb),
  flickers: rollArb(unitFractionArb),
  evidence: rollArb(edgeFractionArb),
  evidenceMsg: rollArb(unitFractionArb),
  evidenceRun: rollArb(unitFractionArb),
  spoiler: rollArb(unitFractionArb),
});

/** Away times: the 10 s boundary, ordinary values, large values, and values that need sanitising. */
export const plannerAwayArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 14, arbitrary: fc.constantFrom(9999, 10_000, 10_001) },
  { weight: 1, arbitrary: fc.constantFrom(0, 20_000, 60_000) },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 30_000 }) },
  { weight: 2, arbitrary: fc.integer({ min: 10_000, max: 120_000 }) },
  { weight: 1, arbitrary: fc.constantFrom(1e12, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, Infinity) },
  { weight: 1, arbitrary: fc.constantFrom(NaN, -1, -10_000, -1e9, -Infinity) },
);

/** Earlier outcomes: empty, all false, or anything, so the history limit lets a Jumpscare through often. */
const plannerHistoryArb: fc.Arbitrary<boolean[]> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<boolean[]>([]) },
  { weight: 3, arbitrary: fc.array(fc.constant(false), { minLength: 2, maxLength: 4 }) },
  { weight: 2, arbitrary: historyArb },
);

const lookAwayArb = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 0, max: 10 }) },
  { weight: 1, arbitrary: fc.constantFrom(1.5, 3.9, 1e9, Infinity, NaN, -1, -Infinity) },
);

export const plannerInputArb: fc.Arbitrary<ReturnInput> = fc.record({
  mode: modeArb,
  awayMs: plannerAwayArb,
  history: plannerHistoryArb,
  rolls: plannerRollsArb,
  reducedMotion: fc.boolean(),
  paragraph: paragraphArb,
  lookAwayCount: lookAwayArb,
  spoiler: fc.oneof({ weight: 1, arbitrary: fc.constant(null) }, { weight: 3, arbitrary: spoilerSourceArb }),
  messages: messagePoolArb,
});

const isClean = (x: number): boolean => x >= 0 && x < 1;

/** Labels for the coverage floors. */
export function classify(input: ReturnInput, plan: ReturnPlan): readonly string[] {
  const tags: string[] = [`mode:${input.mode}`, input.reducedMotion ? 'reduced:on' : 'reduced:off'];
  tags.push(plan.qualifying ? 'qualifying' : 'not-qualifying');
  if ([9999, 10_000, 10_001].includes(input.awayMs)) tags.push(`away:${input.awayMs}`);
  if (plan.jumpscare !== null) {
    tags.push(`jump:${input.mode}`);
    tags.push(plan.falseCalmMs === null ? 'falsecalm:absent' : 'falsecalm:present');
    if (input.reducedMotion) tags.push('jump:reduced');
  }
  if (input.history.length === 0) tags.push('history:empty');
  if (input.history.length >= 2) tags.push('history:full');
  const away = input.awayMs;
  const dirty =
    !(Number.isFinite(away) && away >= 0) || !Object.values(input.rolls).every(isClean);
  if (dirty) tags.push('dirty');
  return tags;
}
