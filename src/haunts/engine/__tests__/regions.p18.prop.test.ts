import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeRegions } from '../regions';
import type { Rect, Regions } from '../regions';
import { viewportColumnArb } from './arbitraries';

const NUM_RUNS = 300;

interface Case {
  readonly width: number;
  readonly height: number;
  readonly column: Rect;
}

const inViewportArb: fc.Arbitrary<Case> = viewportColumnArb;

/** A column with the given finite horizontal edges and an arbitrary vertical span. */
function columnArb(left: number, right: number): fc.Arbitrary<Rect> {
  return fc
    .tuple(fc.integer({ min: -200, max: 3200 }), fc.integer({ min: -200, max: 3200 }))
    .map(([a, b]) => ({ left, right, top: Math.min(a, b), bottom: Math.max(a, b) }));
}

const viewportArb = fc.tuple(fc.integer({ min: 100, max: 4000 }), fc.integer({ min: 0, max: 3000 }));

/** Column crossing the left edge, the right edge, or both. */
const partlyOutsideArb: fc.Arbitrary<Case> = viewportArb.chain(([width, height]) =>
  fc
    .oneof(
      fc.tuple(fc.integer({ min: -500, max: -1 }), fc.integer({ min: 0, max: width })),
      fc.tuple(fc.integer({ min: 0, max: width }), fc.integer({ min: width + 1, max: width + 500 })),
      fc.tuple(fc.integer({ min: -500, max: -1 }), fc.integer({ min: width + 1, max: width + 500 })),
    )
    .chain(([left, right]) => columnArb(left, right).map((column) => ({ width, height, column }))),
);

/** Column entirely left of the viewport or entirely right of it. */
const fullyOutsideArb: fc.Arbitrary<Case> = viewportArb.chain(([width, height]) =>
  fc
    .oneof(
      fc
        .tuple(fc.integer({ min: -1500, max: -1 }), fc.integer({ min: -1500, max: -1 }))
        .map(([a, b]): [number, number] => [Math.min(a, b), Math.max(a, b)]),
      fc
        .tuple(fc.integer({ min: width + 1, max: width + 1500 }), fc.integer({ min: width + 1, max: width + 1500 }))
        .map(([a, b]): [number, number] => [Math.min(a, b), Math.max(a, b)]),
    )
    .chain(([left, right]) => columnArb(left, right).map((column) => ({ width, height, column }))),
);

const nonFiniteArb = fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY);

/** A finite viewport and a column with at least one non-finite horizontal edge. */
const nonFiniteColumnArb: fc.Arbitrary<Case> = fc
  .tuple(viewportColumnArb, nonFiniteArb, nonFiniteArb, fc.constantFrom('left', 'right', 'both'))
  .map(([vc, badA, badB, which]) => ({
    width: vc.width,
    height: vc.height,
    column: {
      ...vc.column,
      left: which === 'right' ? vc.column.left : badA,
      right: which === 'left' ? vc.column.right : badB,
    },
  }));

const negativeSizeArb = fc.double({ min: -5000, max: -1e-9, noNaN: true });

/** Viewport sizes that are NaN, infinite or negative. Roughly half are negative. */
const badSizeArb = fc.oneof(negativeSizeArb, nonFiniteArb);

/** A bad viewport width or height, or both, with an in-range column. */
const badViewportArb: fc.Arbitrary<Case> = fc
  .tuple(viewportColumnArb, badSizeArb, badSizeArb, fc.constantFrom('width', 'height', 'both'))
  .map(([vc, badW, badH, which]) => ({
    width: which === 'height' ? vc.width : badW,
    height: which === 'width' ? vc.height : badH,
    column: vc.column,
  }));

const anyCaseArb: fc.Arbitrary<Case> = fc.oneof(
  { weight: 19, arbitrary: inViewportArb },
  { weight: 19, arbitrary: partlyOutsideArb },
  { weight: 19, arbitrary: fullyOutsideArb },
  { weight: 19, arbitrary: nonFiniteColumnArb },
  { weight: 24, arbitrary: badViewportArb },
);

const effective = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Positive-area intersection: both the overlap width and the overlap height must be > 0.
 * Touching edges do not count. An empty (zero-width or zero-height) region cannot hold an
 * effect, so it does not overlap the column even when it sits inside the column's x range
 * (counterexamples: height 0 with a clamped column edge, see docs/BUILD_LOG.md).
 */
function overlaps(a: Rect, b: Rect): boolean {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0;
}

/** The column's full vertical extent, so only the horizontal edges can decide the result. */
function fullHeight(column: Rect): Rect {
  return { ...column, top: Number.NEGATIVE_INFINITY, bottom: Number.POSITIVE_INFINITY };
}

function checkRegion(r: Rect, width: number, height: number): void {
  for (const v of [r.left, r.right, r.top, r.bottom]) expect(Number.isFinite(v)).toBe(true);
  expect(r.right - r.left).toBeGreaterThanOrEqual(0);
  expect(r.bottom - r.top).toBeGreaterThanOrEqual(0);
  expect(r.left).toBeGreaterThanOrEqual(0);
  expect(r.right).toBeLessThanOrEqual(width);
  expect(r.top).toBeGreaterThanOrEqual(0);
  expect(r.bottom).toBeLessThanOrEqual(height);
}

function checkSafe(c: Case, out: Regions): void {
  const width = effective(c.width);
  const height = effective(c.height);
  checkRegion(out.left, width, height);
  checkRegion(out.right, width, height);
  const { left, right } = c.column;
  if (Number.isFinite(left) && Number.isFinite(right) && left <= right) {
    const interior = fullHeight(c.column);
    expect(overlaps(out.left, interior)).toBe(false);
    expect(overlaps(out.right, interior)).toBe(false);
  }
}

type Kind = 'inViewport' | 'partly' | 'fullyOutside' | 'nonFiniteColumn' | 'negativeViewport' | 'nonFiniteViewport';

function classify(c: Case): Kind {
  if (!Number.isFinite(c.width) || !Number.isFinite(c.height)) return 'nonFiniteViewport';
  if (c.width < 0 || c.height < 0) return 'negativeViewport';
  if (!Number.isFinite(c.column.left) || !Number.isFinite(c.column.right)) return 'nonFiniteColumn';
  if (c.column.right < 0 || c.column.left > c.width) return 'fullyOutside';
  if (c.column.left < 0 || c.column.right > c.width) return 'partly';
  return 'inViewport';
}

describe('Stage regions: effects stay outside the Reading_Column', () => {
  // Feature: haunt-feature, Property 18: Effects stay outside the Reading_Column
  // **Validates: Requirements 6.11, 12.2, 15.2**
  it('Property 18: for a column inside the viewport the regions match the design formula exactly', () => {
    fc.assert(
      fc.property(inViewportArb, (c) => {
        const out = computeRegions(c.width, c.height, c.column);
        expect(out).toEqual({
          left: { left: 0, right: c.column.left, top: 0, bottom: c.height },
          right: { left: c.column.right, right: c.width, top: 0, bottom: c.height },
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 18: Effects stay outside the Reading_Column
  // **Validates: Requirements 6.11, 12.2, 15.2**
  it('Property 18: for a column inside the viewport the regions have width >= 0, lie inside it and never overlap the column interior', () => {
    fc.assert(
      fc.property(inViewportArb, (c) => {
        checkSafe(c, computeRegions(c.width, c.height, c.column));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 18: Effects stay outside the Reading_Column
  // **Validates: Requirements 6.11, 12.2, 15.2**
  it('Property 18: a column partly or fully outside the viewport still gives safe regions', () => {
    fc.assert(
      fc.property(fc.oneof(partlyOutsideArb, fullyOutsideArb), (c) => {
        checkSafe(c, computeRegions(c.width, c.height, c.column));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 18: Effects stay outside the Reading_Column
  // **Validates: Requirements 6.11, 12.2, 15.2**
  it('Property 18: a non-finite column edge gives an empty region on that side and safe regions overall', () => {
    fc.assert(
      fc.property(nonFiniteColumnArb, (c) => {
        const out = computeRegions(c.width, c.height, c.column);
        checkSafe(c, out);
        if (!Number.isFinite(c.column.left)) expect(out.left.right - out.left.left).toBe(0);
        if (!Number.isFinite(c.column.right)) expect(out.right.right - out.right.left).toBe(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 18: Effects stay outside the Reading_Column
  // **Validates: Requirements 6.11, 12.2, 15.2**
  it('Property 18: a non-finite or negative viewport size counts as 0 and gives safe regions', () => {
    fc.assert(
      fc.property(badViewportArb, (c) => {
        const out = computeRegions(c.width, c.height, c.column);
        checkSafe(c, out);
        if (effective(c.width) === 0) {
          expect(out.left.right - out.left.left).toBe(0);
          expect(out.right.right - out.right.left).toBe(0);
        }
        if (effective(c.height) === 0) {
          expect(out.left.bottom - out.left.top).toBe(0);
          expect(out.right.bottom - out.right.top).toBe(0);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 18: Effects stay outside the Reading_Column
  // **Validates: Requirements 6.11, 12.2, 15.2**
  it('Property 18: across every kind of input the regions are safe', () => {
    fc.assert(
      fc.property(anyCaseArb, (c) => {
        checkSafe(c, computeRegions(c.width, c.height, c.column));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 18: Effects stay outside the Reading_Column
  // **Validates: Requirements 6.11, 12.2, 15.2**
  it('Property 18: the generated inputs reach every kind of input the property is about', () => {
    const seen: Record<Kind, number> = {
      inViewport: 0,
      partly: 0,
      fullyOutside: 0,
      nonFiniteColumn: 0,
      negativeViewport: 0,
      nonFiniteViewport: 0,
    };
    let runs = 0;
    fc.assert(
      fc.property(anyCaseArb, (c) => {
        runs++;
        seen[classify(c)]++;
      }),
      { numRuns: NUM_RUNS },
    );
    const msg = JSON.stringify({ runs, ...seen });
    const atLeast = (n: number, pct: number) => n >= runs * pct;
    expect(atLeast(seen.inViewport, 0.05), `column inside viewport: ${msg}`).toBe(true);
    expect(atLeast(seen.partly, 0.05), `column partly outside: ${msg}`).toBe(true);
    expect(atLeast(seen.fullyOutside, 0.05), `column fully outside: ${msg}`).toBe(true);
    expect(atLeast(seen.nonFiniteColumn, 0.05), `non-finite column edge: ${msg}`).toBe(true);
    expect(atLeast(seen.negativeViewport, 0.03), `negative viewport: ${msg}`).toBe(true);
    expect(atLeast(seen.nonFiniteViewport, 0.03), `non-finite viewport: ${msg}`).toBe(true);
  });
});
