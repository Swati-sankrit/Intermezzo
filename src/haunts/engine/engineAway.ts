/**
 * Look-away counting for the engine: the chapter key, the per-chapter counter and the Ghost_Distance
 * of the current look-away. No DOM, audio, camera or `src/attention/` access.
 */
import { INITIAL_AWAY_COUNTER, onChapterChange, startLookAway } from './awayCounter';
import type { GhostStep } from './ghost/ghostDistance';
import type { ReadingContext } from './returnTypes';
import type { Unsubscribe } from './types';
export interface AwayTracker {
  /** Reads the chapter key; a different key resets the count (Req 2.4). */
  syncChapter(): void;
  /** Follows chapter changes through `subscribeChapter` when the context has it. */
  watchChapter(): void;
  /** A look-away begins: counts it and fixes its Ghost_Distance. */
  startAway(): void;
  ghostStep(): GhostStep;
  /** Earlier look-aways in this chapter, before the current one. */
  earlierCount(): number;
  reset(): void;
}
export function createAwayTracker(reading: ReadingContext, warn: (msg: string) => void): AwayTracker {
  let counter = INITIAL_AWAY_COUNTER;
  let step: GhostStep = 0;
  let unsub: Unsubscribe | null = null;
  function chapterKey(): string {
    try {
      return reading.chapterKey();
    } catch (error) {
      warn(`chapterKey failed: ${error instanceof Error ? error.message : String(error)}`);
      return counter.chapterKey ?? '';
    }
  }
  const syncChapter = (): void => {
    counter = onChapterChange(counter, chapterKey());
  };
  return {
    syncChapter,
    watchChapter() {
      syncChapter();
      unsub?.();
      unsub = reading.subscribeChapter?.(syncChapter) ?? null;
    },
    startAway() {
      const result = startLookAway(counter, chapterKey());
      counter = result.next;
      step = result.step;
    },
    ghostStep: () => step,
    earlierCount: () => Math.max(0, counter.count - 1),
    reset() {
      unsub?.();
      unsub = null;
      counter = INITIAL_AWAY_COUNTER;
      step = 0;
    },
  };
}
