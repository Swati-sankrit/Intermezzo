/**
 * Property 16: Pose extraction round trip.
 * **Validates: Requirements 4.2, 4.12**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { poseFromMatrix16 } from '../pose';

const DEG = Math.PI / 180;
const RUNS = 500;

/** Column-major 4x4 of R = Ry(yaw)·Rx(pitch), columns scaled, plus translation. */
function buildMatrix(
  yawDeg: number,
  pitchDeg: number,
  scales: [number, number, number],
  t: [number, number, number],
): number[] {
  const cy = Math.cos(yawDeg * DEG);
  const sy = Math.sin(yawDeg * DEG);
  const cp = Math.cos(pitchDeg * DEG);
  const sp = Math.sin(pitchDeg * DEG);
  const R = [
    [cy, sy * sp, sy * cp],
    [0, cp, -sp],
    [-sy, cy * sp, cy * cp],
  ];
  const [a, b, c] = scales;
  // Column-major: each group of four is one column; translation at 12-14.
  return [
    R[0][0] * a, R[1][0] * a, R[2][0] * a, 0,
    R[0][1] * b, R[1][1] * b, R[2][1] * b, 0,
    R[0][2] * c, R[1][2] * c, R[2][2] * c, 0,
    t[0], t[1], t[2], 1,
  ];
}

const arbYaw = fc.double({ min: -89.9, max: 89.9, noNaN: true });
const arbPitch = fc.double({ min: -79.9, max: 79.9, noNaN: true });
const arbScale = fc.double({ min: 0.001, max: 1000, noNaN: true });
const arbT = fc.double({ min: -1000, max: 1000, noNaN: true });
const arbFinite = fc.double({ min: -1e3, max: 1e3, noNaN: true });
const arbBad = fc.constantFrom(NaN, Infinity, -Infinity);

describe('Property 16: pose extraction round trip', () => {
  it('recovers yaw and pitch (uniform scale and translation)', () => {
    fc.assert(
      fc.property(arbYaw, arbPitch, arbScale, arbT, arbT, arbT, (yaw, pitch, s, tx, ty, tz) => {
        const r = poseFromMatrix16(buildMatrix(yaw, pitch, [s, s, s], [tx, ty, tz]));
        expect(r.faceFound).toBe(true);
        expect(Math.abs(r.yaw - yaw)).toBeLessThan(1e-6);
        expect(Math.abs(r.pitch - pitch)).toBeLessThan(1e-6);
      }),
      { numRuns: RUNS },
    );
  });

  it('recovers yaw and pitch with independent positive column scales', () => {
    fc.assert(
      fc.property(arbYaw, arbPitch, arbScale, arbScale, arbScale, (yaw, pitch, a, b, c) => {
        const r = poseFromMatrix16(buildMatrix(yaw, pitch, [a, b, c], [0, 0, 0]));
        expect(r.faceFound).toBe(true);
        expect(Math.abs(r.yaw - yaw)).toBeLessThan(1e-6);
        expect(Math.abs(r.pitch - pitch)).toBeLessThan(1e-6);
      }),
      { numRuns: RUNS },
    );
  });

  it('returns faceFound:false for any non-finite entry', () => {
    fc.assert(
      fc.property(
        arbYaw, arbPitch, fc.integer({ min: 0, max: 15 }), arbBad,
        (yaw, pitch, idx, bad) => {
          const m = buildMatrix(yaw, pitch, [1, 1, 1], [0, 0, 0]);
          m[idx] = bad;
          expect(poseFromMatrix16(m).faceFound).toBe(false);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('reads a fixed realistic column-major matrix (yaw 30, pitch -20, translation at 12-14)', () => {
    const yaw = 30;
    const pitch = -20;
    const cy = Math.cos(yaw * DEG);
    const sy = Math.sin(yaw * DEG);
    const cp = Math.cos(pitch * DEG);
    const sp = Math.sin(pitch * DEG);
    // Columns of R = Ry(yaw)·Rx(pitch), then translation (cm-scale values).
    const m = [
      cy, 0, -sy, 0,
      sy * sp, cp, cy * sp, 0,
      sy * cp, -sp, cy * cp, 0,
      1.5, -2.25, -40, 1,
    ];
    const r = poseFromMatrix16(m);
    expect(r.faceFound).toBe(true);
    expect(r.yaw).toBeCloseTo(30, 6);
    expect(r.pitch).toBeCloseTo(-20, 6);
  });

  it('returns faceFound:false for fewer than 16 numbers', () => {
    fc.assert(
      fc.property(fc.array(arbFinite, { minLength: 0, maxLength: 15 }), (arr) => {
        expect(poseFromMatrix16(arr).faceFound).toBe(false);
      }),
      { numRuns: RUNS },
    );
  });

  it('returns faceFound:false when a rotation column has zero length', () => {
    fc.assert(
      fc.property(
        fc.array(arbFinite, { minLength: 16, maxLength: 16 }),
        fc.integer({ min: 0, max: 2 }),
        (arr, col) => {
          const m = [...arr];
          for (let row = 0; row < 3; row++) m[col * 4 + row] = 0;
          expect(poseFromMatrix16(m).faceFound).toBe(false);
        },
      ),
      { numRuns: RUNS },
    );
  });
});
