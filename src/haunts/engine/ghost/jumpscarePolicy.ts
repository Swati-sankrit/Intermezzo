/**
 * Jumpscare frequency policy. Pure: no DOM, audio, timer, clock or random access.
 *
 * `history` holds the jumpscare outcome of each earlier Qualifying_Return,
 * oldest first. Only the last two entries matter: the new outcome joins them,
 * so every window of three consecutive Qualifying_Returns stays at or below
 * the limit (Req 5.5, 5.6).
 */

import type { HauntMode } from './mode';

/** Entries of the history that count towards the limit. */
const WINDOW = 2;

/** Most jumpscares allowed among the last two outcomes, plus the new one. */
const LIMITS: Readonly<Record<HauntMode, number>> = {
  gentle: 0,
  classic: 1,
  nightmare: 2,
};

/** Chance of a jumpscare per Qualifying_Return, once the limit allows one (Req 5.7). */
const PROBABILITIES: Readonly<Record<HauntMode, number>> = {
  gentle: 0,
  classic: 0.35,
  nightmare: 0.6,
};

function limitFor(mode: HauntMode): number {
  // An unknown mode at runtime gets no jumpscares.
  return Object.prototype.hasOwnProperty.call(LIMITS, mode) ? LIMITS[mode] : 0;
}

/**
 * Jumpscares among the last two history entries. A history that is not an
 * array counts as empty. Only the value `true` counts as a jumpscare; any
 * other entry is read as "no jumpscare". The input is never changed.
 */
function recentJumpscares(history: unknown): number {
  if (!Array.isArray(history)) return 0;
  let count = 0;
  for (let i = Math.max(0, history.length - WINDOW); i < history.length; i += 1) {
    if (history[i] === true) count += 1;
  }
  return count;
}

/**
 * True when another jumpscare may be planned: the jumpscares among the last
 * two outcomes number fewer than the limit (1 in Classic, 2 in Nightmare).
 * Gentle never allows one.
 */
export function allowed(mode: HauntMode, history: readonly boolean[]): boolean {
  const limit = limitFor(mode);
  return limit > 0 && recentJumpscares(history) < limit;
}

/** Chance of a jumpscare: 0.35 in Classic, 0.6 in Nightmare, 0 in Gentle. */
export function probability(mode: HauntMode): number {
  return Object.prototype.hasOwnProperty.call(PROBABILITIES, mode) ? PROBABILITIES[mode] : 0;
}
