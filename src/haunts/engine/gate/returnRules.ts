/**
 * Return-moment rules for the Safety_Gate. Pure functions only: no DOM, audio, clock or storage.
 * Adapters and the gain plan apply these numbers; nothing else decides them.
 * Every function returns a finite number that is never negative and never -0.
 */
export const RETURN_MAX_MS = 3000;
export const JUMP_ATTACK_MIN_MS = 20;
/** Reduced motion: no startle, a normal fade-in. */
export const JUMP_ATTACK_REDUCED_MS = 300;

export type FadeKind = 'ghost' | 'jumpscare' | 'glitch' | 'card' | 'evidence';

/** Shortest overlay fade under reduced motion, per kind (haunt-safety: slow fades, no sudden change). */
const REDUCED_FADE_MIN_MS: Readonly<Record<FadeKind, number>> = {
  ghost: 1000,
  jumpscare: 1000,
  glitch: 500,
  card: 300,
  evidence: 500,
};

/** Non-finite and negative values become 0; -0 becomes 0. */
function nonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Attack of a jump channel: at least 20 ms, at least 300 ms under reduced motion. Missing or invalid input gives the minimum. */
export function planJumpAttack(requestedMs: number | undefined, reduced: boolean): number {
  const min = reduced ? JUMP_ATTACK_REDUCED_MS : JUMP_ATTACK_MIN_MS;
  if (requestedMs === undefined || !Number.isFinite(requestedMs)) return min;
  return Math.max(min, requestedMs);
}

/** Largest gain the jump channel may target: cap (at most 1) minus the other channels' current gains, never below 0. */
export function jumpHeadroom(cap: number, othersCurrent: readonly number[]): number {
  const limit = Math.min(1, nonNegative(cap));
  const others = othersCurrent.reduce((sum, g) => sum + nonNegative(g), 0);
  return nonNegative(limit - others);
}

/**
 * Fade length the gate applies. Missing or invalid input counts as 0, negative counts as 0.
 * Under reduced motion the result is at least the per-kind floor; otherwise it is the request.
 */
export function planOverlayFade(kind: FadeKind, requestedMs: number | undefined, reduced: boolean): number {
  const requested = requestedMs === undefined ? 0 : nonNegative(requestedMs);
  return reduced ? Math.max(REDUCED_FADE_MIN_MS[kind], requested) : requested;
}
