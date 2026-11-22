/** Dependencies of `createGate`. Everything outside the pure plan is injected so tests can fake it. */
import type { AudioAdapterDeps } from './audioTypes';
import type { ReducedMotionAdapter } from './reducedMotion';
import type { VisualHosts } from './visualTypes';

/** The slice of `window` used to hear Volume_Cap changes made in another tab. */
export interface StorageEventTarget {
  addEventListener(type: 'storage', listener: (event: { key: string | null }) => void): void;
  removeEventListener(type: 'storage', listener: (event: { key: string | null }) => void): void;
}

export interface GateDeps {
  /** Audio context factory and the Audio_Unlock event target. */
  readonly audio: AudioAdapterDeps;
  /** Stage host elements for the visual adapter. */
  readonly hosts: VisualHosts;
  /** Read only. `null` when storage is unavailable; the default cap then applies. */
  readonly storage: Pick<Storage, 'getItem'> | null;
  /** `null` when there is no window. */
  readonly storageEvents: StorageEventTarget | null;
  /** `prefers-reduced-motion` source. */
  readonly reducedMotion: ReducedMotionAdapter;
  readonly warn?: (msg: string) => void;
}
