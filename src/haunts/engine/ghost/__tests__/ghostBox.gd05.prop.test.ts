import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ghostBox } from '../ghostBox';
import { classify, refStep, REF_UNITS, regionArb, stepArb } from './ghostBoxArbitraries';

const NUM_RUNS = 300;

/** Reference box: one px per unit at most, aspect ratio kept, inside the region. Null under 48 px wide. */
function referenceBox(step: number, region: { width: number; height: number }) {
  const clean = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const w = clean(region.width);
  const h = clean(region.height);
  if (w < 48) return null;
  const units = REF_UNITS[refStep(step)];
  const scale = Math.min(1, w / 100, h / units);
  return { width: 100 * scale, height: units * scale };
}

function close(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected));
}

describe('ghostBox (ghost-dread)', () => {
  // Feature: ghost-dread, Property 5: Ghost box stays inside its region
  // **Validates: Requirements 2.2**
  it('Property 5: ghostBox matches the reference, stays inside the region, keeps the aspect ratio, and is null under 48 px wide', () => {
    fc.assert(
      fc.property(stepArb, regionArb, (step, region) => {
        const box = ghostBox(step, region);
        const expected = referenceBox(step, region);
        if (expected === null) {
          expect(box).toBeNull();
          return;
        }
        expect(box).not.toBeNull();
        if (box === null) return;
        expect(close(box.width, expected.width), `width ${box.width} vs ${expected.width}`).toBe(true);
        expect(close(box.height, expected.height), `height ${box.height} vs ${expected.height}`).toBe(true);
        // No wider and no taller than the region.
        expect(box.width).toBeLessThanOrEqual(region.width);
        expect(box.height).toBeLessThanOrEqual(Number.isFinite(region.height) && region.height > 0 ? region.height : 0);
        expect(Number.isFinite(box.width) && Number.isFinite(box.height)).toBe(true);
        expect(box.width).toBeGreaterThanOrEqual(0);
        expect(box.height).toBeGreaterThanOrEqual(0);
        // Aspect ratio, within rounding (skipped for sub-normal sizes where floats lose all precision).
        const ratio = 100 / REF_UNITS[refStep(step)];
        if (box.height >= 1e-6) expect(Math.abs(box.width / box.height - ratio)).toBeLessThanOrEqual(1e-9 * ratio);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 5: Ghost box stays inside its region
  // **Validates: Requirements 2.2**
  it('Property 5: a region 48 px or wider but very short gives a small non-null box, and zero height gives 0 x 0', () => {
    fc.assert(
      fc.property(
        stepArb,
        fc.double({ min: 48, max: 5000, noNaN: true }),
        fc.double({ min: 0, max: 40, noNaN: true }),
        (step, width, height) => {
          const box = ghostBox(step, { width, height });
          expect(box).not.toBeNull();
          if (box === null) return;
          expect(box.height).toBeLessThanOrEqual(height);
          if (height === 0) expect(box).toEqual({ width: 0, height: 0 });
        },
      ),
      { numRuns: NUM_RUNS },
    );
    expect(ghostBox(4, { width: 48, height: 0 })).toEqual({ width: 0, height: 0 });
    expect(ghostBox(0, { width: 47.9999, height: 1000 })).toBeNull();
    expect(ghostBox(0, { width: NaN, height: 1000 })).toBeNull();
    expect(ghostBox(0, { width: Infinity, height: 1000 })).toBeNull();
    expect(ghostBox(0, { width: 1000, height: NaN })).toEqual({ width: 0, height: 0 });
  });

  // Feature: ghost-dread, Property 5: Ghost box stays inside its region
  // **Validates: Requirements 2.2, 2.6**
  it('Property 5: the generators reach narrow, near-48, width-limited, height-limited, capped, non-finite and every step', () => {
    const FLOORS = {
      narrow: 0.1,
      nonFinite: 0.05,
      negative: 0.03,
      nearBoundary: 0.05,
      widthLimited: 0.05,
      heightLimited: 0.05,
      capped: 0.05,
      zeroHeight: 0.01,
      shortWide: 0.02,
      stepNonInteger: 0.05,
      stepOutOfRange: 0.05,
      eachStep: 0.05,
    };
    const runs = 1000;
    const counts = {
      narrow: 0, nonFinite: 0, negative: 0, nearBoundary: 0, widthLimited: 0, heightLimited: 0,
      capped: 0, zeroHeight: 0, shortWide: 0, stepNonInteger: 0, stepOutOfRange: 0,
    };
    const steps = [0, 0, 0, 0, 0];
    fc.assert(
      fc.property(stepArb, regionArb, (step, region) => {
        const c = classify(step, region);
        for (const key of Object.keys(counts) as (keyof typeof counts)[]) if (c[key]) counts[key]++;
        steps[c.step]++;
      }),
      { numRuns: runs },
    );
    const msg = JSON.stringify({ counts, steps });
    for (const key of Object.keys(counts) as (keyof typeof counts)[]) {
      expect(counts[key] >= runs * FLOORS[key], `${key}: ${msg}`).toBe(true);
    }
    for (const n of steps) expect(n >= runs * FLOORS.eachStep, msg).toBe(true);
  });
});
