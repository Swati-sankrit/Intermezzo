/**
 * The box a Ghost takes inside a side region, and the step height table. Pure: no DOM, clock,
 * timer or random access. The picture itself is a bundled Ghost_Image (see `imageFit.ts`).
 */
import { ghostDistance } from './ghostDistance';

/** Width of the reference box in units; every step is this wide. */
export const GHOST_WIDTH_UNITS = 100;
/** Height units per step: the Ghost grows taller as it comes closer. */
export const GHOST_HEIGHT_UNITS: readonly number[] = [120, 150, 185, 225, 270];
/** A region narrower than this (px) gets no Ghost; the sound carries the haunt. */
export const MIN_GHOST_BOX_WIDTH = 48;
/** Largest rendering: one unit per pixel. */
const MAX_PX_PER_UNIT = 1;

/** Non-finite or negative sizes count as 0. */
function size(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Pure. The Ghost's rendered size inside a side region: aspect ratio kept, never wider or taller
 * than the region, and never larger than one px per unit. `null` when the region is
 * under 48 px wide. Unsafe region sizes (NaN, negative, infinite) count as 0, so they give `null`.
 */
export function ghostBox(step: number, region: { width: number; height: number }): { width: number; height: number } | null {
  const width = size(region.width);
  const height = size(region.height);
  if (width < MIN_GHOST_BOX_WIDTH) return null;
  const units = GHOST_HEIGHT_UNITS[ghostDistance(step)];
  const scale = Math.min(MAX_PX_PER_UNIT, width / GHOST_WIDTH_UNITS, height / units);
  // min() guards against a rounding step that would leave the box a hair over the region.
  return { width: Math.min(width, GHOST_WIDTH_UNITS * scale), height: Math.min(height, units * scale) };
}
