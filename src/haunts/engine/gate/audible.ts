/**
 * Audibility notifications for `AudioOut.onAudibleChange`. Audible = sound setting on AND audio
 * unlocked AND context `running`; the gate supplies that as `isAudible` and calls `notify()` after
 * each input changes. Each subscriber hears the current value at once, then only real changes.
 */
import type { Unsubscribe } from '../types';

export interface AudibleHub {
  /** Calls `cb` now with the current value; later only when the value changes. */
  subscribe(cb: (audible: boolean) => void): Unsubscribe;
  /** Re-reads audibility and tells every subscriber whose last-seen value differs. */
  notify(): void;
  /** Drops every subscriber. */
  clear(): void;
}

interface Sub {
  readonly cb: (audible: boolean) => void;
  last: boolean;
}

export function createAudibleHub(isAudible: () => boolean, warn: (msg: string) => void): AudibleHub {
  const subs = new Set<Sub>();

  function deliver(sub: Sub, value: boolean): void {
    sub.last = value;
    try {
      sub.cb(value);
    } catch (e) {
      warn(`audible callback threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    subscribe(cb) {
      const sub: Sub = { cb, last: isAudible() };
      subs.add(sub);
      deliver(sub, sub.last);
      return () => void subs.delete(sub);
    },
    notify() {
      const now = isAudible();
      for (const sub of [...subs]) {
        if (subs.has(sub) && sub.last !== now) deliver(sub, now);
      }
    },
    clear: () => subs.clear(),
  };
}
