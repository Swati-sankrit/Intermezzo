/**
 * Defaults, threshold comparison, and clamping helpers. Pure: no DOM, clock,
 * camera, or storage access.
 */
import type { Thresholds } from './types';

export const DEFAULT_THRESHOLDS: Thresholds = Object.freeze({
  baselineYaw: 0,
  baselinePitch: 0,
  yawLimit: 25,
  pitchLimit: 20,
});

export const DEFAULT_DEBOUNCE_MS = 1500;
export const MIN_DEBOUNCE_MS = 500;
export const MAX_DEBOUNCE_MS = 5000;
export const DEFAULT_RETURN_MS = 1000;
export const MAX_RETURN_MS = 1000;
export const MIN_IDLE_LIMIT_MS = 60_000;

/**
 * True when the pose is strictly beyond the limit on either axis, measured
 * from the Baseline, on either side. A difference exactly equal to a limit
 * is not beyond.
 */
export function isBeyond(yaw: number, pitch: number, th: Thresholds): boolean {
  return (
    Math.abs(yaw - th.baselineYaw) > th.yawLimit ||
    Math.abs(pitch - th.baselinePitch) > th.pitchLimit
  );
}

/** Clamp to [500, 5000]. Non-finite input (NaN, Infinity) gives the default. */
export function clampDebounce(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_DEBOUNCE_MS;
  return Math.min(MAX_DEBOUNCE_MS, Math.max(MIN_DEBOUNCE_MS, ms));
}

/** Clamp to at most 1000. Non-finite input gives the default (1000). */
export function clampReturnTime(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_RETURN_MS;
  return Math.min(MAX_RETURN_MS, ms);
}

/** Non-finite input keeps `previous`. Otherwise `max(ms, 60 000)`. */
export function clampIdleLimit(ms: number, previous: number): number {
  if (!Number.isFinite(ms)) return previous;
  return Math.max(ms, MIN_IDLE_LIMIT_MS);
}
