/**
 * Look-away counter per chapter. Pure: no DOM, clock, timer or random access.
 */
import { ghostDistance, type GhostStep } from './ghost/ghostDistance';

export interface AwayCounter {
  readonly chapterKey: string | null;
  readonly count: number;
}

export const INITIAL_AWAY_COUNTER: AwayCounter = { chapterKey: null, count: 0 };

/**
 * A chapter change. When `chapterKey` differs from the stored key, returns a new counter with
 * count 0 and the new key. When it is the same, returns `c` itself.
 *
 * The engine (task 5.8) must call this whenever `reading.chapterKey()` changes, not only when a
 * look-away starts. Otherwise leaving chapter A, reading chapter B and returning to A with no
 * look-away in between would keep the old count (Req 2.4: any chapter change resets).
 */
export function onChapterChange(c: AwayCounter, chapterKey: string): AwayCounter {
  return c.chapterKey === chapterKey ? c : { chapterKey, count: 0 };
}

/**
 * Starting a look-away. A new `chapterKey` resets the count first. `step` is the
 * Ghost_Distance for the number of earlier look-aways in this chapter (before
 * this one). `next` is a new counter that includes this look-away. The input is
 * not changed.
 */
export function startLookAway(
  c: AwayCounter,
  chapterKey: string,
): { step: GhostStep; next: AwayCounter } {
  const earlier = c.chapterKey === chapterKey ? c.count : 0;
  return {
    step: ghostDistance(earlier),
    next: { chapterKey, count: earlier + 1 },
  };
}
