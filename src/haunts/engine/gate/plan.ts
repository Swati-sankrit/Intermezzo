/**
 * Safety_Gate planning. Pure functions only: no DOM, audio, clock or storage.
 * Adapters apply these plans; nothing else in the engine applies the rules.
 */

export const DEFAULT_VOLUME_CAP = 0.4;
export const MIN_FADE_IN_MS = 300;
export const MIN_FADE_IN_REDUCED_MS = 1000;
export const MAX_FADE_OUT_MS = 800;
export const MAX_FLASHES_PER_SEC = 3;

const MIN_FADE_OUT_MS = 50;
const MIN_SWEEP_PERIOD_MS = 2000;

export interface GainRequest {
  readonly key: string;
  readonly gain: number;
}
export interface RateRequest {
  readonly key: string;
  readonly rate: number;
}

const DECIMAL_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** Non-finite and negative values become 0; -0 becomes 0. */
function nonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Number in [0, 1] from storage text; otherwise 0.4. */
export function parseVolumeCap(raw: unknown): number {
  if (typeof raw !== 'string') return DEFAULT_VOLUME_CAP;
  const text = raw.trim();
  if (!DECIMAL_TEXT.test(text)) return DEFAULT_VOLUME_CAP;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 1) return DEFAULT_VOLUME_CAP;
  return n === 0 ? 0 : n;
}

/** Clamp each request to [0, cap] (non-finite becomes 0). If the sum exceeds cap, scale all by cap / sum. */
export function scaleGains(requests: readonly GainRequest[], cap: number): readonly GainRequest[] {
  const limit = Math.min(1, nonNegative(cap));
  const clamped = requests.map((r) => ({ key: r.key, gain: Math.min(nonNegative(r.gain), limit) }));
  const sum = clamped.reduce((acc, r) => acc + r.gain, 0);
  if (sum <= limit) return clamped;
  const factor = limit / sum;
  return clamped.map((r) => ({ key: r.key, gain: r.gain * factor }));
}

/** Each rate clamped to [0, 3]. Reduced motion gives 0. If the sum exceeds 3, scale all by 3 / sum. */
export function allocateFlashRates(
  requests: readonly RateRequest[],
  reduced: boolean,
): readonly RateRequest[] {
  if (reduced) return requests.map((r) => ({ key: r.key, rate: 0 }));
  const clamped = requests.map((r) => ({
    key: r.key,
    rate: Math.min(nonNegative(r.rate), MAX_FLASHES_PER_SEC),
  }));
  const sum = clamped.reduce((acc, r) => acc + r.rate, 0);
  if (sum <= MAX_FLASHES_PER_SEC) return clamped;
  const factor = MAX_FLASHES_PER_SEC / sum;
  return clamped.map((r) => ({ key: r.key, rate: r.rate * factor }));
}

/** At least 300 ms, or at least 1000 ms when reduced. Missing or invalid input gives the minimum. */
export function planFadeIn(requestedMs: number | undefined, reduced: boolean): number {
  const min = reduced ? MIN_FADE_IN_REDUCED_MS : MIN_FADE_IN_MS;
  if (requestedMs === undefined || !Number.isFinite(requestedMs)) return min;
  return Math.max(min, requestedMs);
}

/** In [50, 800], same in every mode. Missing or invalid input gives 800. */
export function planFadeOut(requestedMs: number | undefined): number {
  if (requestedMs === undefined || !Number.isFinite(requestedMs)) return MAX_FADE_OUT_MS;
  return Math.min(MAX_FADE_OUT_MS, Math.max(MIN_FADE_OUT_MS, requestedMs));
}

/** Gains actually requested of the gate: zero when sound is off or audio is locked. */
export function effectiveRequests(
  requests: readonly GainRequest[],
  soundOn: boolean,
  unlocked: boolean,
): readonly GainRequest[] {
  const audible = soundOn && unlocked;
  return requests.map((r) => ({ key: r.key, gain: audible ? nonNegative(r.gain) : 0 }));
}

/** Sweep period to flash-equivalent rate: 1000 / periodMs, with periodMs floored at 2000. */
export function sweepRate(periodMs: number): number {
  const period = Number.isFinite(periodMs) ? Math.max(MIN_SWEEP_PERIOD_MS, periodMs) : MIN_SWEEP_PERIOD_MS;
  return 1000 / period;
}
