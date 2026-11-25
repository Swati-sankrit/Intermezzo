/** Debounced writer for the Data_Model. No DOM, no React. Never throws. */
import type { DataModel } from './model';
import type { DataStore, FailureKind } from './localStore';

export interface ModelSaver {
  /** Save after `delayMs`. A sooner pending deadline is kept; a later one never postpones it. */
  schedule(delayMs: number): void;
  /** Write now if a save is pending. */
  flush(): Promise<void>;
  /** Stop all writes (newer schema version, or teardown). */
  stop(): void;
}

/** Longest wait for an ordinary model write (Requirement 18.1: within 1000 ms). */
export const MODEL_SAVE_DELAY_MS = 400;
/** Wait for a position save (Requirement 5.1: within 500 ms of a chunk opening). */
export const POSITION_SAVE_DELAY_MS = 100;

export function createModelSaver(
  store: DataStore,
  getModel: () => DataModel,
  onResult: (failure: FailureKind | null) => void,
): ModelSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let due = Infinity;
  let stopped = false;

  const write = async (): Promise<void> => {
    timer = null;
    due = Infinity;
    if (stopped) return;
    try {
      const result = await store.save(getModel());
      onResult(result.ok ? null : result.kind);
    } catch {
      onResult('unavailable');
    }
  };

  return {
    schedule(delayMs) {
      if (stopped) return;
      const at = Date.now() + delayMs;
      if (timer !== null && at >= due) return;
      if (timer !== null) clearTimeout(timer);
      due = at;
      timer = setTimeout(() => void write(), delayMs);
    },
    async flush() {
      if (timer === null) return;
      clearTimeout(timer);
      await write();
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
