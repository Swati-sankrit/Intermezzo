/** Pure flicker for the Flame_Glow: resampled at most `maxHz` times a second, eased between samples. */
export interface Flicker {
  /** Brightness factor in [LOW, 1] at `nowMs`. */
  at(nowMs: number): number;
}

export const FLICKER_LOW = 0.6;

const ease = (t: number): number => t * t * (3 - 2 * t);

export function createFlicker(maxHz: number, random: () => number = Math.random): Flicker {
  const interval = 1000 / Math.max(0.1, Math.min(maxHz, 2.5));
  const sample = (): number => FLICKER_LOW + (1 - FLICKER_LOW) * Math.min(1, Math.max(0, random()));
  let from = 1;
  let to = sample();
  let start: number | null = null;
  return {
    at(nowMs) {
      if (start === null) start = nowMs;
      while (nowMs - start >= interval) {
        start += interval;
        from = to;
        to = sample();
      }
      return from + (to - from) * ease((nowMs - start) / interval);
    },
  };
}
