/**
 * Shared types for the attention module. Pure types: no DOM, clock, camera,
 * or storage access.
 */

export type AttentionValue = 'present' | 'away';

export interface AttentionSignal {
  readonly value: AttentionValue;
  /** Milliseconds. */
  readonly timestamp: number;
}

export interface PoseSample {
  /** Milliseconds, monotonic clock supplied by the adapter. */
  readonly t: number;
  readonly faceFound: boolean;
  /** Degrees. */
  readonly yaw: number;
  /** Degrees. */
  readonly pitch: number;
  /** Visible AND focused. */
  readonly tabActive: boolean;
}

/** Baseline-relative. Valid when all four are finite and both limits are > 0. */
export interface Thresholds {
  /** Degrees, median looking-at-page yaw (default 0). */
  readonly baselineYaw: number;
  /** Degrees, median looking-at-page pitch (default 0). */
  readonly baselinePitch: number;
  /** Degrees, > 0 (default 25). */
  readonly yawLimit: number;
  /** Degrees, > 0 (default 20). */
  readonly pitchLimit: number;
}

export interface DecisionConfig {
  /** Default baseline 0/0, limits 25 / 20. */
  readonly thresholds: Thresholds;
  /** Clamped to [500, 5000], default 1500. */
  readonly debounceMs: number;
  /** Clamped to (0, 1000], default 1000. */
  readonly returnMs: number;
}
