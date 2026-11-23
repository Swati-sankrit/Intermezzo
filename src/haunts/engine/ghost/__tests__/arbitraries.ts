/**
 * Generators for the ghost-dread property tests.
 *
 * `ReturnRolls` and `ReturnInput` belong to `ghost/returnPlanner.ts` (task 4.2), which does not
 * exist yet. They are declared here as local copies of the design shapes. When the planner exists,
 * replace these two interfaces with a type import from `../returnPlanner`.
 */
import fc from 'fast-check';
import type { HauntMode } from '../mode';
import { modeArb } from '../../__tests__/arbitraries';
import { messagePoolArb, paragraphArb, spoilerSourceArb } from './textArbitraries';

export * from './textArbitraries';
export * from './scriptArbitraries';

/** Local copy of the design's `ReturnRolls`. Each field is in [0, 1). */
export interface ReturnRolls {
  jump: number; calm: number; calmLen: number; jumpLen: number;
  glitchLen: number; flickers: number;
  evidence: number; evidenceMsg: number; evidenceRun: number; spoiler: number;
}

/** Local copy of the design's `ReturnInput`. */
export interface ReturnInput {
  readonly mode: HauntMode;
  readonly awayMs: number;
  readonly history: readonly boolean[];
  readonly rolls: ReturnRolls;
  readonly reducedMotion: boolean;
  readonly paragraph: string;
  readonly lookAwayCount: number;
  readonly spoiler: { finalChapterSentences: readonly string[]; otherChapterSentences: readonly string[] } | null;
  readonly messages: readonly string[];
}

/** A unit fraction in [0, 1): n / 1_000_000 for n in 0..999_999. */
export const unitFractionArb: fc.Arbitrary<number> = fc
  .integer({ min: 0, max: 999_999 })
  .map((n) => n / 1_000_000);

/** Fractions near the edges of [0, 1) as well as the middle. */
export const edgeFractionArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 4, arbitrary: unitFractionArb },
  { weight: 1, arbitrary: fc.constantFrom(0, 0.349999, 0.35, 0.599999, 0.6, 0.749999, 0.75, 0.999999) },
);

export const returnRollsArb: fc.Arbitrary<ReturnRolls> = fc.record({
  jump: edgeFractionArb,
  calm: edgeFractionArb,
  calmLen: unitFractionArb,
  jumpLen: unitFractionArb,
  glitchLen: unitFractionArb,
  flickers: unitFractionArb,
  evidence: edgeFractionArb,
  evidenceMsg: unitFractionArb,
  evidenceRun: unitFractionArb,
  spoiler: unitFractionArb,
});

/** Boundary values around the 10 s and 20 s thresholds and the 60 s legibility ceiling. */
export const BOUNDARY_AWAY_MS: readonly number[] = [0, 9999, 10_000, 20_000, 20_001, 59_999, 60_000];

/** awayMs: the boundary values, an ordinary range, and very large values. */
export const awayMsArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...BOUNDARY_AWAY_MS) },
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 120_000 }) },
  { weight: 1, arbitrary: fc.constantFrom(1e9, 1e12, Number.MAX_SAFE_INTEGER) },
);

/** Earlier jumpscare outcomes, oldest first. */
export const historyArb: fc.Arbitrary<boolean[]> = fc.array(fc.boolean(), { minLength: 0, maxLength: 6 });

/** A `ReturnInput` for one fixed mode. */
export function returnInputArb(mode: HauntMode): fc.Arbitrary<ReturnInput> {
  return fc.record({
    mode: fc.constant(mode),
    awayMs: awayMsArb,
    history: historyArb,
    rolls: returnRollsArb,
    reducedMotion: fc.boolean(),
    paragraph: paragraphArb,
    lookAwayCount: fc.integer({ min: 0, max: 10 }),
    spoiler: fc.oneof({ weight: 1, arbitrary: fc.constant(null) }, { weight: 3, arbitrary: spoilerSourceArb }),
    messages: messagePoolArb,
  });
}

export const gentleInputArb = returnInputArb('gentle');
export const classicInputArb = returnInputArb('classic');
export const nightmareInputArb = returnInputArb('nightmare');

/** A `ReturnInput` in any mode, chosen evenly. */
export const returnInputAnyModeArb: fc.Arbitrary<ReturnInput> = modeArb.chain(returnInputArb);
