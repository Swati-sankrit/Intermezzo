/**
 * Fallback decision function: folds tab-visibility/focus and idle samples into
 * an AttentionSignal when the camera is not used. Pure: no DOM, clock, camera,
 * or storage access.
 */
import {
  DEFAULT_DEBOUNCE_MS,
  MIN_IDLE_LIMIT_MS,
  clampDebounce,
  clampIdleLimit,
} from './config';
import type { AttentionSignal } from './types';

export interface FallbackSample {
  /** Milliseconds, monotonic clock supplied by the caller. */
  readonly t: number;
  /** Visible AND focused. */
  readonly tabActive: boolean;
  /** Time of the last keyboard, pointer, touch, or scroll input. */
  readonly lastInputT: number;
}

export interface FallbackConfig {
  readonly debounceMs: number;
  readonly idleLimitMs: number;
}

export interface FallbackState {
  readonly signal: AttentionSignal;
  /** Latest accepted sample time; samples with earlier `t` are ignored. */
  readonly lastT: number | null;
  /** `t` of the first sample of the current hidden/unfocused run. */
  readonly inactiveRunStart: number | null;
}

/** Starts at `from` when given (mode switch keeps the signal), else `present` at `startT`. */
export function initialFallbackState(
  startT: number,
  from?: AttentionSignal,
): FallbackState {
  const signal: AttentionSignal = from ?? { value: 'present', timestamp: startT };
  return {
    signal,
    lastT: from ? Math.max(startT, from.timestamp) : startT,
    inactiveRunStart: null,
  };
}

/**
 * Idle by strict comparison. A non-finite `lastInputT` (NaN, +/-Infinity)
 * carries no usable input time, so it is never idle: the idle rule only fires
 * on a real number, and an unknown input time never causes a haunt.
 */
function isIdle(s: FallbackSample, idleLimitMs: number): boolean {
  return Number.isFinite(s.lastInputT) && s.t - s.lastInputT > idleLimitMs;
}

/**
 * While `present`: becomes `away` when the hidden run lasts longer than
 * `debounceMs` or the sample is idle (strict). While `away`: becomes `present`
 * only at the first accepted sample with `tabActive` and not idle.
 */
export function stepFallback(
  state: FallbackState,
  s: FallbackSample,
  cfg: FallbackConfig,
): FallbackState {
  if (!Number.isFinite(s.t)) return state;
  if (state.lastT !== null && s.t < state.lastT) return state;

  const inactiveRunStart = s.tabActive ? null : (state.inactiveRunStart ?? s.t);
  const awayByTab =
    inactiveRunStart !== null && s.t - inactiveRunStart > cfg.debounceMs;
  const idle = isIdle(s, cfg.idleLimitMs);

  let signal = state.signal;
  if (signal.value === 'present') {
    if (awayByTab || idle) {
      signal = { value: 'away', timestamp: Math.max(s.t, signal.timestamp) };
    }
  } else if (s.tabActive && !idle) {
    // Req 6.4: once away, only an active tab with recent input returns to
    // present. A hidden sample never does, even inside the debounce time.
    signal = { value: 'present', timestamp: Math.max(s.t, signal.timestamp) };
  }
  return { signal, lastT: s.t, inactiveRunStart };
}

function normalizeConfig(cfg: Partial<FallbackConfig>): FallbackConfig {
  return {
    debounceMs: clampDebounce(cfg.debounceMs ?? DEFAULT_DEBOUNCE_MS),
    idleLimitMs: clampIdleLimit(
      cfg.idleLimitMs ?? MIN_IDLE_LIMIT_MS,
      MIN_IDLE_LIMIT_MS,
    ),
  };
}

/** Fold over a sequence. Empty sequence returns `{ present, startT }`. */
export function decideFallback(
  samples: readonly FallbackSample[],
  cfg: Partial<FallbackConfig>,
  startT = 0,
): AttentionSignal {
  const config = normalizeConfig(cfg);
  let state = initialFallbackState(startT);
  for (const s of samples) state = stepFallback(state, s, config);
  return state.signal;
}
