/**
 * Independent reference models for the look-away counter (Property 4), written from the design
 * statement and not from `startLookAway`.
 * - `referenceTrace(keys)` takes only the chapter keys at look-away starts. It keeps the list of
 *   keys and counts the trailing run that matches the chapter of the look-away now starting.
 * - `referenceScriptTrace(script)` sees every chapter change. Any change of key resets the count,
 *   including a return to an earlier chapter with no look-away in between.
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

export interface RefScriptLookAway {
  readonly chapterKey: string;
  /** Look-aways since the last change of key (not capped). */
  readonly earlier: number;
  readonly step: number;
  /** A change of key happened since the previous look-away (or since the start, for the first). */
  readonly changedSince: boolean;
  /** changedSince, and this key equals the key of the previous look-away: a round trip with no look-away between. */
  readonly roundTrip: boolean;
}

/** Reference over a whole script. Every op that changes the current key resets the count. */
export function referenceScriptTrace(script: ChapterScript): RefScriptLookAway[] {
  const out: RefScriptLookAway[] = [];
  let current = script.firstChapterKey;
  let since = 0;
  let changed = false;
  for (const op of script.ops) {
    if (op.k === 'chapter') {
      if (op.chapterKey !== current) {
        current = op.chapterKey;
        since = 0;
        changed = true;
      }
    } else {
      const prev = out[out.length - 1];
      out.push({
        chapterKey: current,
        earlier: since,
        step: Math.min(since, 4),
        changedSince: changed,
        roundTrip: changed && prev !== undefined && prev.chapterKey === current,
      });
      since++;
      changed = false;
    }
  }
  return out;
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
