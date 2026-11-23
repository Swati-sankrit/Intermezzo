/**
 * Independent reference model for the look-away counter (Property 4), written from the design
 * statement and not from `startLookAway`. It keeps the list of chapter keys of earlier look-aways
 * and counts the trailing run that matches the chapter of the look-away now starting.
 */
import type { ChapterScript } from './scriptArbitraries';

export interface RefLookAway {
  /** Chapter the reader is in when this look-away starts. */
  readonly chapterKey: string;
  /** Earlier look-aways in this chapter, not capped. */
  readonly earlier: number;
  /** Expected step: earlier, capped at 4. */
  readonly step: number;
  /** True when an earlier look-away exists and it was in a different chapter. */
  readonly afterChange: boolean;
  /** True when afterChange and this key was already used by a look-away before the previous one. */
  readonly returnToPrevious: boolean;
}

/** The chapter key at each look-away start of a script, in order. */
export function lookAwayKeys(script: ChapterScript): string[] {
  const keys: string[] = [];
  let current = script.firstChapterKey;
  for (const op of script.ops) {
    if (op.k === 'chapter') current = op.chapterKey;
    else keys.push(current);
  }
  return keys;
}

export function referenceTrace(keys: readonly string[]): RefLookAway[] {
  return keys.map((chapterKey, i) => {
    let earlier = 0;
    for (let j = i - 1; j >= 0 && keys[j] === chapterKey; j--) earlier++;
    const afterChange = i > 0 && keys[i - 1] !== chapterKey;
    const returnToPrevious = afterChange && keys.slice(0, i - 1).includes(chapterKey);
    return { chapterKey, earlier, step: Math.min(earlier, 4), afterChange, returnToPrevious };
  });
}
