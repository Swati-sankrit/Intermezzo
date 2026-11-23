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
