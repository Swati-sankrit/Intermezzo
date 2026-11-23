/**
 * Ghost_Distance: how close the Ghost stands for a look-away, from the number of
 * earlier look-aways in the chapter. Pure: no DOM, clock, timer or random access.
 */
export const MAX_GHOST_STEP = 4;

export type GhostStep = 0 | 1 | 2 | 3 | 4;

/**
 * Integer step 0..4 for a count of earlier look-aways.
 * - `NaN`, `-0`, negatives (including -Infinity) and values below 1 give +0.
 * - Finite non-integers are floored (2.9 gives 2).
 * - +Infinity and any value of 4 or more give 4.
 * Non-decreasing in `count`. The result is never `-0`.
 */
export function ghostDistance(count: number): GhostStep {
  // Written as a negated test so NaN, -0 and everything below 1 return a literal +0.
  if (!(count >= 1)) return 0;
  if (count >= MAX_GHOST_STEP) return MAX_GHOST_STEP;
  return Math.floor(count) as GhostStep;
}
