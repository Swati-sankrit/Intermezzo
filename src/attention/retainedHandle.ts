/**
 * Holds the camera handle whose stop() threw, so the camera session is not
 * forgotten while a track may still be live. The indicator (cameraOn) follows
 * `has()`. Handle.stop() is safe to repeat: it skips tracks already stopped
 * (see cameraAdapter.ts).
 */
import type { CameraHandle } from './types';

export interface RetainedHandle {
  has(): boolean;
  /** Stops `handle`; keeps it for a later retry if stop() throws. Returns true when stopped. */
  stop(handle: CameraHandle): boolean;
  /** Retries the kept handle. True when none is kept or the retry stopped every track. */
  retry(): boolean;
}

export function createRetainedHandle(): RetainedHandle {
  let held: CameraHandle | null = null;
  const stop = (handle: CameraHandle): boolean => {
    try {
      handle.stop();
      if (held === handle) held = null;
      return true;
    } catch {
      held = handle;
      return false;
    }
  };
  return {
    has: () => held !== null,
    stop,
    retry: () => (held === null ? true : stop(held)),
  };
}
