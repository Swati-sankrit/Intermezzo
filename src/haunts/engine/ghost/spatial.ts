/**
 * Spatial sound specs for the Ghost layers. Pure: no DOM, clock, timer, random or
 * audio access. Listener at the origin facing -Z, +X to the right.
 */
import type { HauntLevel } from '../types';

export interface FootstepSpec {
  readonly distanceM: number;
  readonly degPerSec: number;
  readonly stepsPerSec: number;
  /** Requested layer gain in (0, 1]. The Safety_Gate scales it under the Volume_Cap. */
  readonly gain: number;
}

export interface BreathingSpec {
  readonly azimuthDeg: number;
  readonly distanceM: number;
}

const FOOTSTEPS: Readonly<Record<HauntLevel, FootstepSpec>> = {
  1: { distanceM: 6, degPerSec: 20, stepsPerSec: 1.4, gain: 0.35 },
  2: { distanceM: 4, degPerSec: 45, stepsPerSec: 1.7, gain: 0.55 },
  3: { distanceM: 2.5, degPerSec: 80, stepsPerSec: 2.0, gain: 0.75 },
};

/**
 * Footstep movement for a Haunt_Level. Distance never rises with level and the turn
 * rate strictly rises. A level that is not 1, 2 or 3 is rounded and clamped into
 * 1..3 (+Infinity gives level 3, -Infinity gives level 1); NaN gives level 1.
 */
export function footstepSpec(level: HauntLevel): FootstepSpec {
  const n = Number(level);
  const safe = Number.isNaN(n) ? 1 : Math.min(3, Math.max(1, Math.round(n)));
  return FOOTSTEPS[safe as HauntLevel];
}

/** Breathing azimuth magnitude range in degrees, and distance range in metres. */
const MIN_AZ = 60;
const AZ_SPAN = 60;
const MIN_DIST = 0.5;
const DIST_SPAN = 0.5;

/** Fractional part, always in [0, 1). */
function fract(v: number): number {
  const f = v - Math.floor(v);
  return f >= 0 && f < 1 ? f : 0;
}

/**
 * Fixed breathing position beside the reader. `roll` is the start draw in [0, 1);
 * values outside that range are clamped, NaN is treated as 0.5.
 * |azimuth| is in [60, 120], negative for 'left' and positive for 'right'
 * (any side other than 'left' counts as right). Distance is in [0.5, 1.0].
 * Same input gives the same output.
 */
export function breathingSpec(side: 'left' | 'right', roll: number): BreathingSpec {
  const r = Number.isFinite(roll) ? Math.min(1, Math.max(0, roll)) : 0.5;
  // Keeps the magnitude below 120 even when roll is exactly 1.
  const u = r >= 1 ? 1 : r;
  const magnitude = MIN_AZ + AZ_SPAN * u;
  // A second value derived from the same roll, so distance and angle vary together
  // without a second random draw.
  const distanceM = MIN_DIST + DIST_SPAN * fract(u * 7.31 + 0.17);
  const azimuthDeg = side === 'left' ? -magnitude : magnitude;
  return { azimuthDeg, distanceM };
}

const DEFAULT_DISTANCE_M = 1;

/**
 * Point at `distanceM` from the origin, `azimuthDeg` degrees clockwise from straight
 * ahead (-Z). Azimuth 90 is +X (right), -90 is -X, 180 is +Z (behind).
 * Non-finite azimuth gives 0; non-finite distance gives 1 m; negative distance gives 0.
 * The result never contains -0 or NaN.
 */
export function azimuthToPosition(
  azimuthDeg: number,
  distanceM: number,
): { x: number; y: 0; z: number } {
  const az = Number.isFinite(azimuthDeg) ? azimuthDeg : 0;
  const d = Number.isFinite(distanceM) ? Math.max(0, distanceM) : DEFAULT_DISTANCE_M;
  // Reduce first so a huge finite azimuth cannot overflow when multiplied by PI.
  const rad = ((az % 360) * Math.PI) / 180;
  // Adding +0 turns -0 into +0.
  return { x: d * Math.sin(rad) + 0, y: 0, z: -d * Math.cos(rad) + 0 };
}
