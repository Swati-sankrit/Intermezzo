import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { azimuthToPosition, breathingSpec, footstepSpec } from '../spatial';
import type { HauntLevel } from '../../types';
import { azimuthArb, distanceArb, levelArb, rollArb, sideArb } from './spatialPulseArbitraries';

const NUM_RUNS = 300;
/** Design table (design.md, spatial sound): level -> distance in metres and turn rate in degrees per second. */
const TABLE: Readonly<Record<number, { d: number; deg: number }>> = {
  1: { d: 6, deg: 20 },
  2: { d: 4, deg: 45 },
  3: { d: 2.5, deg: 80 },
};
const asLevel = (n: number): HauntLevel => n as HauntLevel;
const isNegZero = (v: number): boolean => Object.is(v, -0);
/** Independent reference for the level a footstep call settles on: round and clamp into 1..3, NaN gives 1. */
const refLevel = (n: number): number => (Number.isNaN(n) ? 1 : Math.min(3, Math.max(1, Math.round(n))));

describe('footstepSpec, breathingSpec, azimuthToPosition (ghost-dread)', () => {
  // Feature: ghost-dread, Property 6: Footstep and breathing specs
  // **Validates: Requirements 1.1, 1.2**
  it('Property 6: footstep distance and turn rate match the design table for levels 1 to 3', () => {
    for (const level of [1, 2, 3]) {
      const s = footstepSpec(asLevel(level));
      expect(s.distanceM).toBe(TABLE[level].d);
      expect(s.degPerSec).toBe(TABLE[level].deg);
      expect(s.stepsPerSec).toBeGreaterThan(0);
      expect(s.gain).toBeGreaterThan(0);
      expect(s.gain).toBeLessThanOrEqual(1);
    }
  });

  // Feature: ghost-dread, Property 6: Footstep and breathing specs
  // **Validates: Requirements 1.1**
  it('Property 6: for levels l < m, distance at m is at most at l and turn rate at m is strictly greater', () => {
    fc.assert(
      fc.property(fc.constantFrom(1, 2, 3), fc.constantFrom(1, 2, 3), (l, m) => {
        fc.pre(l < m);
        const a = footstepSpec(asLevel(l));
        const b = footstepSpec(asLevel(m));
        expect(b.distanceM).toBeLessThanOrEqual(a.distanceM);
        expect(b.degPerSec).toBeGreaterThan(a.degPerSec);
        expect(b.distanceM).toBeGreaterThanOrEqual(1.5); // design: footsteps stay 1.5 m or more away
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 6: Footstep and breathing specs
  // **Validates: Requirements 1.1**
  it('Property 6: any level (fractional, out of range, NaN) gives a table row, and a higher level never moves closer-to-slower', () => {
    fc.assert(
      fc.property(levelArb, levelArb, (a, b) => {
        const sa = footstepSpec(asLevel(a));
        const sb = footstepSpec(asLevel(b));
        expect(sa.distanceM).toBe(TABLE[refLevel(a)].d);
        expect(sa.degPerSec).toBe(TABLE[refLevel(a)].deg);
        expect(Number.isFinite(sa.stepsPerSec) && Number.isFinite(sa.gain)).toBe(true);
        if (!Number.isNaN(a) && !Number.isNaN(b) && a <= b) {
          expect(sb.distanceM).toBeLessThanOrEqual(sa.distanceM);
          expect(sb.degPerSec).toBeGreaterThanOrEqual(sa.degPerSec);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 6: Footstep and breathing specs
  // **Validates: Requirements 1.2**
  it('Property 6: breathing azimuth is 60 to 120 degrees on the chosen side, distance 0.5 to 1.0 m, deterministic', () => {
    fc.assert(
      fc.property(sideArb, rollArb, (side, roll) => {
        const s = breathingSpec(side, roll);
        const again = breathingSpec(side, roll);
        expect(again).toEqual(s);
        expect(Number.isNaN(s.azimuthDeg) || Number.isNaN(s.distanceM)).toBe(false);
        const magnitude = Math.abs(s.azimuthDeg);
        expect(magnitude).toBeGreaterThanOrEqual(60);
        expect(magnitude).toBeLessThanOrEqual(120);
        expect(Math.sign(s.azimuthDeg)).toBe(side === 'left' ? -1 : 1);
        expect(s.distanceM).toBeGreaterThanOrEqual(0.5);
        expect(s.distanceM).toBeLessThanOrEqual(1.0);
        expect(isNegZero(s.azimuthDeg) || isNegZero(s.distanceM)).toBe(false);
        // Placed with the geometry helper, the source is within 1 m and on the chosen side (+X is right).
        const p = azimuthToPosition(s.azimuthDeg, s.distanceM);
        expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(1.0 + 1e-12);
        expect(side === 'left' ? p.x < 0 : p.x > 0).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 6: Footstep and breathing specs
  // **Validates: Requirements 1.2**
  it('Property 6: the same side with different rolls can give different breathing positions', () => {
    const seen = new Set<string>();
    for (const roll of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999]) seen.add(JSON.stringify(breathingSpec('left', roll)));
    expect(seen.size).toBeGreaterThan(1);
  });

  // Feature: ghost-dread, Property 6: Footstep and breathing specs
  // **Validates: Requirements 1.1, 1.2**
  it('Property 6: azimuthToPosition keeps the distance, sets y to 0 and never gives NaN or -0', () => {
    fc.assert(
      fc.property(azimuthArb, distanceArb, (az, d) => {
        const p = azimuthToPosition(az, d);
        for (const v of [p.x, p.y, p.z]) {
          expect(Number.isNaN(v)).toBe(false);
          expect(isNegZero(v)).toBe(false);
        }
        expect(p.y).toBe(0);
        if (Number.isFinite(d) && d >= 0) {
          expect(Math.hypot(p.x, p.z)).toBeCloseTo(d, 9);
          expect(Math.abs(Math.hypot(p.x, p.z) - d)).toBeLessThanOrEqual(1e-12 * Math.max(1, d));
        } else if (Number.isFinite(d)) {
          // Negative distance has no meaning; the documented result is the listener's position.
          expect(p).toEqual({ x: 0, y: 0, z: 0 });
        } else {
          expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: ghost-dread, Property 6: Footstep and breathing specs
  // **Validates: Requirements 1.1, 1.2**
  it('Property 6: azimuth 0 is straight ahead (-Z) and 90 is to the right (+X)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1000, noNaN: true }), (d) => {
        const ahead = azimuthToPosition(0, d);
        expect(ahead.x).toBe(0);
        expect(ahead.z).toBe(d === 0 ? 0 : -d);
        const right = azimuthToPosition(90, d);
        expect(Math.abs(right.x - d)).toBeLessThanOrEqual(1e-12 * Math.max(1, d));
        expect(Math.abs(right.z)).toBeLessThanOrEqual(1e-12 * Math.max(1, d));
        const left = azimuthToPosition(-90, d);
        expect(left.x).toBeLessThanOrEqual(0);
        const behind = azimuthToPosition(180, d);
        expect(behind.z).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Coverage of the generated shapes. Floors sit below the per-batch minimum measured over 10 batches of 1000 samples in task 2.6.
  it('Property 6: generators cover every level, side, roll extreme and non-finite input', () => {
    const sample = <T>(arb: fc.Arbitrary<T>): T[] => fc.sample(arb, 1000);
    const levels = sample(levelArb).map((l) => refLevel(l));
    const rolls = sample(rollArb);
    const sides = sample(sideArb);
    const azs = sample(azimuthArb);
    const ds = sample(distanceArb);
    const share = (xs: readonly unknown[], f: (x: never) => boolean): number => xs.filter((x) => f(x as never)).length / xs.length;
    for (const level of [1, 2, 3]) expect(levels.filter((l) => l === level).length / 1000).toBeGreaterThanOrEqual(0.1);
    expect(share(sides, (s: string) => s === 'left')).toBeGreaterThanOrEqual(0.35);
    expect(share(sides, (s: string) => s === 'right')).toBeGreaterThanOrEqual(0.35);
    expect(share(rolls, (r: number) => r >= 0 && r < 0.05)).toBeGreaterThanOrEqual(0.08);
    expect(share(rolls, (r: number) => r >= 0.95 && r <= 1)).toBeGreaterThanOrEqual(0.08);
    expect(share(rolls, (r: number) => !Number.isFinite(r))).toBeGreaterThanOrEqual(0.05);
    expect(share(azs, (a: number) => !Number.isFinite(a))).toBeGreaterThanOrEqual(0.05);
    expect(share(ds, (d: number) => !Number.isFinite(d))).toBeGreaterThanOrEqual(0.05);
    expect(share(ds, (d: number) => Number.isFinite(d) && d < 0)).toBeGreaterThanOrEqual(0.05);
    expect(share(ds, (d: number) => Number.isFinite(d) && d >= 0)).toBeGreaterThanOrEqual(0.4);
  });
});
