/**
 * Internal state helpers for the attention controller: the status store (what
 * the UI sees) and the pure sample builder. No DOM, clock, or storage access.
 * The status never carries pose values, landmarks, or frames.
 */
import { DEFAULT_DEBOUNCE_MS, MIN_IDLE_LIMIT_MS } from './config';
import type { DecisionState } from './decision';
import type { FallbackConfig, FallbackSample, FallbackState } from './fallback';
import type { AttentionStatus, PageEvents, Unsubscribe } from './types';

export const TICK_MS = 250;

export function initialStatus(): AttentionStatus {
  return {
    mode: 'fallback',
    paused: false,
    cameraOn: false,
    cameraAvailable: true,
    faceFound: false,
    choice: 'unanswered',
    needsCalibrationOffer: false,
    calibration: null,
    notice: null,
    cameraOffError: null,
  };
}

/** Mutable bookkeeping owned by the controller. */
export interface ControllerCore {
  running: boolean;
  paused: boolean;
  idleLimitMs: number;
  /** Input before this time does not count toward idleness (set on resume and start). */
  idleOrigin: number;
  /** Reset together with `fallback` on resume; used by the camera path in 3.8. */
  decision: DecisionState | null;
  fallback: FallbackState | null;
  timerId: number | null;
  unsubPage: Unsubscribe | null;
}

export function initialCore(): ControllerCore {
  return {
    running: false,
    paused: false,
    idleLimitMs: MIN_IDLE_LIMIT_MS,
    idleOrigin: 0,
    decision: null,
    fallback: null,
    timerId: null,
    unsubPage: null,
  };
}

export function fallbackConfig(core: ControllerCore): FallbackConfig {
  return { debounceMs: DEFAULT_DEBOUNCE_MS, idleLimitMs: core.idleLimitMs };
}

/** Builds one fallback sample. Input older than the idle origin is ignored. */
export function buildFallbackSample(
  t: number,
  page: PageEvents,
  idleOrigin: number,
): FallbackSample {
  const input = page.lastInputT();
  const lastInputT = Number.isFinite(input) ? Math.max(input, idleOrigin) : idleOrigin;
  return { t, tabActive: page.tabActive(), lastInputT };
}

export interface StatusStore {
  get(): AttentionStatus;
  set(patch: Partial<AttentionStatus>): void;
  subscribe(cb: (s: AttentionStatus) => void): Unsubscribe;
  clearSubscribers(): void;
}

export function createStatusStore(): StatusStore {
  let status = initialStatus();
  const subs = new Set<(s: AttentionStatus) => void>();
  return {
    get: () => status,
    set(patch) {
      const next = { ...status, ...patch };
      const changed = (Object.keys(patch) as (keyof AttentionStatus)[]).some(
        (k) => next[k] !== status[k],
      );
      if (!changed) return;
      status = next;
      for (const cb of Array.from(subs)) {
        try {
          cb(status);
        } catch {
          // A failing subscriber must not affect the others.
        }
      }
    },
    subscribe(cb) {
      subs.add(cb);
      try {
        cb(status);
      } catch {
        // See above.
      }
      return () => {
        subs.delete(cb);
      };
    },
    clearSubscribers: () => subs.clear(),
  };
}
