import fc from 'fast-check';

export interface Region {
  width: number;
  height: number;
}

/** Independent copy of the step rule: NaN and below 1 give 0, 4 and above give 4, else the whole part. */
export function refStep(step: number): number {
  if (!(step >= 1)) return 0;
  if (step >= 4) return 4;
  return Math.trunc(step);
}

/** Independent copy of the drawing heights per step, in viewBox units (width is always 100). */
export const REF_UNITS = [120, 150, 185, 225, 270];

const sizeArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: 47 }) },
  { weight: 3, arbitrary: fc.constantFrom(47, 47.9999, 48, 48.0001, 49, 0, -0, 100, 270) },
  { weight: 4, arbitrary: fc.integer({ min: 48, max: 600 }) },
  { weight: 3, arbitrary: fc.double({ min: 0, max: 800, noNaN: true }) },
  { weight: 2, arbitrary: fc.integer({ min: 601, max: 100000 }) },
  { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity) },
  { weight: 1, arbitrary: fc.double({ min: -1000, max: -Number.MIN_VALUE, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(Number.MAX_VALUE, -Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER) },
);

/** Regions 48 to 99 px wide and tall enough that the width is the limit. */
const widthLimitedArb: fc.Arbitrary<Region> = fc.record({
  width: fc.double({ min: 48, max: 99.9, noNaN: true }),
  height: fc.double({ min: 280, max: 3000, noNaN: true }),
});

export const regionArb: fc.Arbitrary<Region> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ width: sizeArb, height: sizeArb }) },
  { weight: 1, arbitrary: widthLimitedArb },
);

/** Steps: whole 0..4, fractions, below 0, above 4, NaN and infinities. */
export const stepArb: fc.Arbitrary<number> = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 0, max: 4 }) },
  { weight: 2, arbitrary: fc.double({ min: 0, max: 4, noNaN: true }) },
  { weight: 1, arbitrary: fc.integer({ min: -10, max: 12 }) },
  { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity, -Infinity, -0, 0.999, 3.999, 4.5, Number.MAX_VALUE) },
  { weight: 1, arbitrary: fc.double() },
);

export interface RegionShape {
  narrow: boolean; // width (as the code sees it) under 48
  nonFinite: boolean;
  negative: boolean;
  nearBoundary: boolean; // width within [47, 49]
  widthLimited: boolean;
  heightLimited: boolean;
  capped: boolean; // one px per unit is the limit
  zeroHeight: boolean;
  shortWide: boolean; // width >= 48 but box under 48 wide
  step: number; // sanitised step
  stepNonInteger: boolean;
  stepOutOfRange: boolean;
}

/** Classify a generated (step, region) pair by an independent reading of the inputs. */
export function classify(step: number, region: Region): RegionShape {
  const clean = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const w = clean(region.width);
  const h = clean(region.height);
  const s = refStep(step);
  const units = REF_UNITS[s];
  const narrow = w < 48;
  const limits = [1, w / 100, h / units];
  const scale = Math.min(...limits);
  return {
    narrow,
    nonFinite: !Number.isFinite(region.width) || !Number.isFinite(region.height),
    negative: region.width < 0 || region.height < 0,
    nearBoundary: region.width >= 47 && region.width <= 49,
    widthLimited: !narrow && scale === w / 100 && w / 100 < 1 && w / 100 <= h / units,
    heightLimited: !narrow && scale === h / units && h / units < 1 && h / units < w / 100,
    capped: !narrow && scale === 1,
    zeroHeight: !narrow && h === 0,
    shortWide: !narrow && 100 * scale < 48,
    step: s,
    stepNonInteger: Number.isFinite(step) && !Number.isInteger(step),
    stepOutOfRange: !(step >= 0 && step <= 4),
  };
}
