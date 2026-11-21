/**
 * Decision_Function: folds Pose_Samples into an AttentionSignal. Pure: no DOM,
 * clock, camera, or storage access. Eye gaze is not an input (PoseSample has
 * no such field).
 */
import {
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_RETURN_MS,
  DEFAULT_THRESHOLDS,
  clampDebounce,
  clampReturnTime,
  isBeyond,
} from './config';
import type {
  AttentionSignal,
  DecisionConfig,
  PoseSample,
  Thresholds,
} from './types';

export interface DecisionState {
  readonly signal: AttentionSignal;
  /** Latest accepted sample time. Starts at the session start (or the carried-over signal's timestamp), so earlier samples are ignored. */
  readonly lastT: number | null;
  /** `t` of the first sample of the current Away run. */
  readonly awayRunStart: number | null;
}

/** Starts at `from` when given (mode switch keeps the signal), else `present` at `startT`. */
export function initialDecisionState(
  startT: number,
  from?: AttentionSignal,
): DecisionState {
  const signal: AttentionSignal = from ?? { value: 'present', timestamp: startT };
  return {
    signal,
    // Samples earlier than the start (or the carried signal's stamp) are stale.
    lastT: from ? Math.max(startT, from.timestamp) : startT,
    awayRunStart: null,
  };
}

/** True when the sample is not Facing. Strict comparison against the limits. */
export function isAwaySample(s: PoseSample, th: Thresholds): boolean {
  if (!s.tabActive || !s.faceFound) return true;
  if (!Number.isFinite(s.yaw) || !Number.isFinite(s.pitch)) return true;
  return isBeyond(s.yaw, s.pitch, th);
}

export function stepDecision(
  state: DecisionState,
  s: PoseSample,
  cfg: DecisionConfig,
): DecisionState {
  if (!Number.isFinite(s.t)) return state;
  if (state.lastT !== null && s.t < state.lastT) return state;

  if (!isAwaySample(s, cfg.thresholds)) {
    const signal: AttentionSignal =
      state.signal.value === 'away'
        ? { value: 'present', timestamp: Math.max(s.t, state.signal.timestamp) }
        : state.signal;
    return { signal, lastT: s.t, awayRunStart: null };
  }

  const awayRunStart = state.awayRunStart ?? s.t;
  const signal: AttentionSignal =
    state.signal.value === 'present' && s.t - awayRunStart > cfg.debounceMs
      ? { value: 'away', timestamp: Math.max(s.t, state.signal.timestamp) }
      : state.signal;
  return { signal, lastT: s.t, awayRunStart };
}

function isValidThresholds(th: Thresholds | undefined): th is Thresholds {
  return (
    th !== undefined &&
    th !== null &&
    Number.isFinite(th.baselineYaw) &&
    Number.isFinite(th.baselinePitch) &&
    Number.isFinite(th.yawLimit) &&
    Number.isFinite(th.pitchLimit) &&
    th.yawLimit > 0 &&
    th.pitchLimit > 0
  );
}

function normalizeConfig(cfg: Partial<DecisionConfig>): DecisionConfig {
  return {
    thresholds: isValidThresholds(cfg.thresholds)
      ? cfg.thresholds
      : DEFAULT_THRESHOLDS,
    debounceMs: clampDebounce(cfg.debounceMs ?? DEFAULT_DEBOUNCE_MS),
    returnMs: clampReturnTime(cfg.returnMs ?? DEFAULT_RETURN_MS),
  };
}

/** Fold over a sequence. Empty sequence returns `{ present, startT }`. */
export function decide(
  samples: readonly PoseSample[],
  cfg: Partial<DecisionConfig>,
  startT = 0,
): AttentionSignal {
  const config = normalizeConfig(cfg);
  let state = initialDecisionState(startT);
  for (const s of samples) state = stepDecision(state, s, config);
  return state.signal;
}
