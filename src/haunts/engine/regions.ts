/**
 * Stage regions: the viewport areas left and right of the Reading_Column,
 * where haunt visuals may be drawn. Pure: no DOM access.
 */

export interface Rect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface Regions {
  readonly left: Rect;
  readonly right: Rect;
}

/** Non-finite or negative sizes become 0. */
function size(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Clamp into [0, max]. */
function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

/**
 * Pure. Left region: x from 0 to column.left. Right region: x from
 * column.right to viewportWidth. Both span y from 0 to viewportHeight.
 * Widths never below 0, and both regions stay inside the viewport.
 *
 * Unsafe inputs: a non-finite or negative viewport size counts as 0. A
 * non-finite column edge gives an empty region on that side (zero width at
 * the viewport edge), so an effect never lands on the column. Finite edges
 * outside the viewport are clamped to it.
 */
export function computeRegions(viewportWidth: number, viewportHeight: number, column: Rect): Regions {
  const width = size(viewportWidth);
  const height = size(viewportHeight);
  const leftEdge = Number.isFinite(column.left) ? clamp(column.left, width) : 0;
  const rightEdge = Number.isFinite(column.right) ? clamp(column.right, width) : width;
  return {
    left: { left: 0, right: leftEdge, top: 0, bottom: height },
    right: { left: rightEdge, right: width, top: 0, bottom: height },
  };
}
