/**
 * Script generators for the look-away counter (Properties 3 and 4) and chapter changes.
 * The design gives no exact script type, so these are local shapes.
 */
import fc from 'fast-check';

/** One step of a look-away script: a look-away starts in the given chapter. */
export interface LookAwayStep {
  readonly chapterKey: string;
}

/** A sequence of look-away starts, each tagged with the chapter the reader is in. */
export type LookAwayScript = readonly LookAwayStep[];

/** A step of a chapter script: a look-away starts, or the reader moves to another chapter. */
export type ChapterOp =
  | { readonly k: 'lookAway' }
  | { readonly k: 'chapter'; readonly chapterKey: string };

export interface ChapterScript {
  readonly firstChapterKey: string;
  readonly ops: readonly ChapterOp[];
}

/** A small key pool, so the same key repeats and a chapter change may return to an earlier key. */
export const chapterKeyArb: fc.Arbitrary<string> = fc.constantFrom('c1', 'c2', 'c3', 'c4', 'ch-5', '');

export const lookAwayScriptArb: fc.Arbitrary<LookAwayScript> = fc.array(
  chapterKeyArb.map((chapterKey) => ({ chapterKey })),
  { minLength: 0, maxLength: 30 },
);

/** Look-aways mixed with chapter changes. Long runs of look-aways in one chapter occur. */
export const chapterScriptArb: fc.Arbitrary<ChapterScript> = fc.record({
  firstChapterKey: chapterKeyArb,
  ops: fc.array(
    fc.oneof(
      { weight: 5, arbitrary: fc.constant<ChapterOp>({ k: 'lookAway' }) },
      { weight: 1, arbitrary: chapterKeyArb.map((chapterKey): ChapterOp => ({ k: 'chapter', chapterKey })) },
    ),
    { minLength: 0, maxLength: 40 },
  ),
});
