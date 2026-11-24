/**
 * Building blocks of `planReturn`. Pure: no DOM, audio, timer, clock or random access.
 * Every function returns new values and never changes its inputs.
 */

import type { GhostStep, ReturnPlan } from '../returnTypes';

/** Longest Return_Moment (Req 3.2, 11.4). */
export const MAX_RETURN_MS = 3000;
/** Shortest Return_Moment in Classic and Nightmare (design rule 6). */
export const MIN_RETURN_MS = 2000;
/** Quiet time kept after the last planned part (design rule 6). */
export const TAIL_MS = 300;
/** Away time at which a return qualifies (Req 5.1, 11.6). */
export const QUALIFYING_AWAY_MS = 10_000;
/** A False_Calm is planned when its roll is below this (design rule 4). */
export const FALSE_CALM_CHANCE = 0.75;
/** Ambient fade lengths (Req 3.3, at most 800 ms). */
export const AMBIENT_FADE_JUMP_MS = 300;
export const AMBIENT_FADE_PLAIN_MS = 600;
/** Reduced-motion replacement for the Glitch (design rule 5; at least 500 ms). */
export const REDUCED_FADE_MS = 600;

/** Largest double below 1, the top of the roll range [0, 1). */
const BELOW_ONE = 1 - 2 ** -53;

/** The plan for Gentle mode: no Return_Moment, every optional part null (Req 11.5). */
export const EMPTY_PLAN: ReturnPlan = Object.freeze({
  durationMs: 0,
  qualifying: false,
  // Gentle keeps the engine's own 600 ms fade (Req 3.9).
  ambientFadeMs: AMBIENT_FADE_PLAIN_MS,
  ghostStep: 0 as GhostStep,
  ghostLingerMs: 0,
  falseCalmMs: null,
  jumpscare: null,
  glitch: null,
  fade: null,
  evidence: null,
  spoiler: null,
});

/** A roll in [0, 1). NaN, non-numbers and negatives give 0; 1 or more gives the largest value below 1. */
export function clampRoll(value: unknown): number {
  if (typeof value !== 'number' || !(value > 0)) return 0;
  return value >= 1 ? BELOW_ONE : value;
}

/** Milliseconds away: NaN, non-numbers and negatives give 0. Infinity is kept. */
export function sanitiseAway(value: unknown): number {
  return typeof value === 'number' && value > 0 ? value : 0;
}

export interface JumpscarePart {
  readonly falseCalmMs: number | null;
  readonly jumpscare: NonNullable<ReturnPlan['jumpscare']>;
}

/**
 * False_Calm and Jumpscare timing from already-clamped rolls (design rule 4).
 * False_Calm: 300 + round(calmLen * 500) when calm < 0.75. The Jumpscare starts at
 * `falseCalmMs ?? 0`, lasts 700 + round(jumpLen * 500), or 1000 + round(jumpLen * 400)
 * as a fade under reduced motion.
 */
export function planJumpscare(
  calm: number,
  calmLen: number,
  jumpLen: number,
  reducedMotion: boolean,
): JumpscarePart {
  const falseCalmMs = calm < FALSE_CALM_CHANCE ? 300 + Math.round(calmLen * 500) : null;
  const durationMs = reducedMotion ? 1000 + Math.round(jumpLen * 400) : 700 + Math.round(jumpLen * 500);
  return {
    falseCalmMs,
    jumpscare: { startMs: falseCalmMs ?? 0, durationMs, render: reducedMotion ? 'fade' : 'full' },
  };
}

/** End time of a Jumpscare (`startMs + durationMs`). The Glitch added later starts here. */
export function jumpscareEndMs(jumpscare: { readonly startMs: number; readonly durationMs: number } | null): number {
  return jumpscare === null ? 0 : jumpscare.startMs + jumpscare.durationMs;
}

/** `min(3000, max(2000, end + 300))`, where `end` is the latest end of every planned part (design rule 6). */
export function returnDuration(endMs: number): number {
  return Math.min(MAX_RETURN_MS, Math.max(MIN_RETURN_MS, endMs + TAIL_MS));
}
