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

/** Cause of an on-screen notice. One notice per kind per Session. */
export type NoticeKind = 'denied' | 'camera-lost' | 'detector-failed' | 'cameraOffFailed';

export interface Notice {
  readonly kind: NoticeKind;
  readonly text: string;
}

export interface DecisionConfig {
  /** Default baseline 0/0, limits 25 / 20. */
  readonly thresholds: Thresholds;
  /** Clamped to [500, 5000], default 1500. */
  readonly debounceMs: number;
  /** Greater than 0 and at most 1000; at or below 0 or non-finite gives 1000. */
  readonly returnMs: number;
}

// ---------------------------------------------------------------------------
// Status and ports. Internal to the attention module (not exported from
// index.ts, except the status types the UI needs). No type here carries pose
// values, landmarks, or frames beyond PoseReading, which stays internal.
// ---------------------------------------------------------------------------

export type AttentionMode = 'camera' | 'fallback';

export interface CalibrationProgress {
  readonly phase:
    | 'idle'
    | 'look-at-page'
    | 'look-away'
    | 'done'
    | 'failed-no-face'
    | 'failed-too-close';
  readonly secondsLeft: number;
  readonly message: string;
}

export interface AttentionStatus {
  readonly mode: AttentionMode;
  readonly paused: boolean;
  /** True only while tracks are live. */
  readonly cameraOn: boolean;
  /** False after denial. */
  readonly cameraAvailable: boolean;
  /** Latest detection found a face; false when the camera is off. Boolean only. */
  readonly faceFound: boolean;
  readonly choice: 'unanswered' | 'camera' | 'no-camera';
  readonly needsCalibrationOffer: boolean;
  readonly calibration: CalibrationProgress | null;
  readonly notice: Notice | null;
  /** Set when a camera track could not be stopped (Req 2.7). */
  readonly cameraOffError: string | null;
}

/** Callback that removes a subscription. */
export type Unsubscribe = () => void;

/** `denied` for NotAllowedError and SecurityError; everything else is `unavailable`. */
export type CameraErrorKind = 'denied' | 'unavailable';

export interface CameraHandle {
  /** Stops every track. Stops all of them even if one throws, then rethrows the first error. */
  stop(): void;
  /** Registers a callback fired once when any track ends on its own. */
  onEnded(cb: () => void): void;
  readonly video: HTMLVideoElement;
}

/** `open()` rejects with a `CameraError` (defined in cameraAdapter.ts) carrying a `kind`. */
export interface CameraAdapter {
  open(): Promise<CameraHandle>;
}

export interface Detector {
  detect(video: HTMLVideoElement, t: number): PoseReading;
  close(): void;
}

export interface PageEvents {
  /** Visible AND focused. */
  tabActive(): boolean;
  /** Milliseconds, from the same clock as `now`. */
  lastInputT(): number;
  /** Calls `cb` with the new value whenever `tabActive()` changes. */
  onChange(cb: (tabActive: boolean) => void): Unsubscribe;
  /** Removes every listener. Idempotent. */
  dispose(): void;
}

/**
 * Persistence port, implemented by storage.ts (task 5.1 and 9.4). Loads return
 * null for missing or invalid values and never throw. Saves return false when
 * the write fails.
 */
export interface AttentionStore {
  loadChoice(): 'camera' | 'no-camera' | null;
  saveChoice(choice: 'camera' | 'no-camera'): boolean;
  loadThresholds(): Thresholds | null;
  saveThresholds(thresholds: Thresholds): boolean;
  /** Milliseconds, already clamped to [500, 5000]. */
  loadDebounce(): number | null;
  saveDebounce(ms: number): boolean;
}

/** Frame scheduling for the detection loop. */
export interface FrameScheduler {
  /**
   * Calls `cb` once at the next frame. Uses `requestVideoFrameCallback` on
   * `video` when available, otherwise `requestAnimationFrame`. Returns a
   * handle for `cancel`.
   */
  request(cb: (nowMs: number) => void, video?: HTMLVideoElement): number;
  cancel(handle: number): void;
}

/** Document visibility, separate from focus. */
export interface VisibilityPort {
  visible(): boolean;
  onChange(cb: (visible: boolean) => void): Unsubscribe;
}

export interface AttentionPorts {
  frames: FrameScheduler;
  visibility: VisibilityPort;
  /** Monotonic ms (performance.timeOrigin + performance.now()). */
  now(): number;
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
  camera: CameraAdapter;
  detector: { create(): Promise<Detector> };
  page: PageEvents;
  store: AttentionStore;
}
