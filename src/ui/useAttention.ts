/**
 * React binding for the attention module. One controller per page (module
 * singleton), started after the reading view's first paint and stopped when
 * the view unmounts. The module's status store only replaces its snapshot
 * object when a field changes, so it is safe for useSyncExternalStore as is.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { createAttention } from '../attention';
import type { Attention, AttentionControls, AttentionSignal, AttentionStatus } from '../attention';

export type AttentionApi = Attention & AttentionControls;

let instance: AttentionApi | null = null;

function getAttention(): AttentionApi {
  return (instance ??= createAttention());
}

/** Test seam: use a controller built with fake ports. Stops the previous one. */
export function setAttentionForTests(next: AttentionApi): void {
  instance?.stop();
  instance = next;
}

/** Test seam: stop and forget the current controller. */
export function resetAttention(): void {
  instance?.stop();
  instance = null;
}

/** Runs `cb` after the next paint; returns a cancel function. */
function afterPaint(cb: () => void): () => void {
  if (typeof requestAnimationFrame !== 'function') {
    const id = setTimeout(cb, 0);
    return () => clearTimeout(id);
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const frameId = requestAnimationFrame(() => {
    timeoutId = setTimeout(cb, 0);
  });
  return () => {
    cancelAnimationFrame(frameId);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  };
}

const subscribeStatus = (cb: () => void): (() => void) =>
  getAttention().subscribeStatus(() => cb());
const getStatus = (): AttentionStatus => getAttention().getStatus();

/** Commands exposed to the UI. Calibration and debounce are not wired yet. */
export interface AttentionCommands {
  chooseCamera(on: boolean): void;
  setCameraOn(on: boolean): Promise<void>;
  setIdleLimit(ms: number): void;
  /** For the temporary label and the future haunt engine. */
  subscribeSignal(cb: (s: AttentionSignal) => void): () => void;
}

const commands: AttentionCommands = {
  chooseCamera: (on) => getAttention().chooseCamera(on),
  setCameraOn: (on) => getAttention().setCameraOn(on),
  setIdleLimit: (ms) => getAttention().setIdleLimit(ms),
  subscribeSignal: (cb) => getAttention().subscribe(cb),
};

/** Use once, in the reading view. Starts after first paint; stops on unmount. */
export function useAttention(): { status: AttentionStatus } & AttentionCommands {
  useEffect(() => {
    const attention = getAttention();
    const cancel = afterPaint(() => attention.start());
    return () => {
      cancel();
      attention.stop();
    };
  }, []);

  const status = useSyncExternalStore(subscribeStatus, getStatus, getStatus);
  return { status, ...commands };
}
