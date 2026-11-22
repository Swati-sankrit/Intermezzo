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

/**
 * Internal to the attention module (not exported from index.ts). One head
 * pose reading from the detector. Angles are degrees; both are 0 when
 * `faceFound` is false.
 */
export interface PoseReading {
  readonly faceFound: boolean;
  /** Degrees. */
  readonly yaw: number;
  /** Degrees. */
  readonly pitch: number;
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
  /** Greater than 0 and at most 1000; at or below 0 or non-finite gives 1000. */
  readonly returnMs: number;
}
