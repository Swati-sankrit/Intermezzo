/**
 * The adapter's own record of one gain ramp. Pure: no audio access.
 *
 * Reading `param.value` in the middle of a ramp is not confirmed by the docs
 * (task 3.1 findings), so the in-flight value is computed from this record.
 * Times are seconds on the AudioContext clock.
 */

export interface GainSchedule {
  readonly startValue: number;
  readonly startTime: number;
  readonly target: number;
  readonly endTime: number;
}

/** A channel starts silent and settled. */
export const SILENT: GainSchedule = { startValue: 0, startTime: 0, target: 0, endTime: 0 };

/** Value of the scheduled ramp at context time `t` (linear, clamped to the ramp). */
export function valueAt(s: GainSchedule, t: number): number {
  if (!(t < s.endTime)) return s.target;
  if (!(t > s.startTime)) return s.startValue;
  const fraction = (t - s.startTime) / (s.endTime - s.startTime);
  return s.startValue + (s.target - s.startValue) * fraction;
}

/** Non-finite becomes 0; the result is in [0, 1]. */
export function clampGain(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** The record after a new ramp from the in-flight value at `now` to `target` over `durationSec`. */
export function nextSchedule(prev: GainSchedule, now: number, target: number, durationSec: number): GainSchedule {
  return { startValue: valueAt(prev, now), startTime: now, target, endTime: now + durationSec };
}
