/**
 * Head pose from a 4x4 facial transformation matrix. Pure: no DOM, clock,
 * camera, or storage access.
 */
import type { PoseReading } from './types';

const NOT_FOUND: PoseReading = { faceFound: false, yaw: 0, pitch: 0 };
const RAD_TO_DEG = 180 / Math.PI;

/**
 * LAYOUT (confirmed by the manual Chrome spike, task 2.3): MediaPipe's
 * `Matrix.data` is COLUMN-MAJOR, so translation sits at indices 12-14 and
 * element (row, col) is at index `col * 4 + row`.
 * Spike signs with this layout: yaw left +25.9 / right -46.9;
 * pitch down +16.6 / up -38.9 (left = positive yaw, down = positive pitch).
 */
function at(m: ArrayLike<number>, row: number, col: number): number {
  return m[col * 4 + row];
}

/** Rotation column `col` (upper-left 3x3), scaled to unit length, or null. */
function unitColumn(m: ArrayLike<number>, col: number): [number, number, number] | null {
  const x = at(m, 0, col);
  const y = at(m, 1, col);
  const z = at(m, 2, col);
  const len = Math.hypot(x, y, z);
  if (!Number.isFinite(len) || len === 0) return null;
  return [x / len, y / len, z / len];
}

/**
 * Returns yaw and pitch in degrees from a column-major 4x4 matrix.
 * Fewer than 16 numbers, a non-finite entry, or a zero-length rotation
 * column gives `faceFound: false` with yaw and pitch 0.
 */
export function poseFromMatrix16(m: ArrayLike<number>): PoseReading {
  if (!m || m.length < 16) return NOT_FOUND;
  for (let i = 0; i < 16; i++) {
    if (typeof m[i] !== 'number' || !Number.isFinite(m[i])) return NOT_FOUND;
  }

  const c0 = unitColumn(m, 0);
  const c1 = unitColumn(m, 1);
  const c2 = unitColumn(m, 2);
  if (!c0 || !c1 || !c2) return NOT_FOUND;

  // R[row][col] with normalized columns; only column 2 feeds the angles.
  const r02 = c2[0];
  const r12 = c2[1];
  const r22 = c2[2];

  const clamped = Math.max(-1, Math.min(1, -r12));
  const pitch = Math.asin(clamped) * RAD_TO_DEG;
  const yaw = Math.atan2(r02, r22) * RAD_TO_DEG;

  if (!Number.isFinite(pitch) || !Number.isFinite(yaw)) return NOT_FOUND;
  return { faceFound: true, yaw, pitch };
}
