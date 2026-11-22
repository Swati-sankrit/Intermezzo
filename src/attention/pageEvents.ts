/**
 * Page-event adapter for Fallback_Mode. Reports whether the tab is active
 * (visible AND focused) and the time of the last user input.
 *
 * Input listeners record only a timestamp. No event object, key, coordinate,
 * or target is kept.
 */
import type { PageEvents } from './types';

export interface PageEventsOptions {
  /** Clock in milliseconds. Defaults to `performance.timeOrigin + performance.now()`. */
  readonly now?: () => number;
}

const INPUT_EVENTS_ON_WINDOW = [
  'keydown',
  'pointerdown',
  'pointermove',
  'touchstart',
  'wheel',
  'scroll',
] as const;

const PASSIVE: AddEventListenerOptions = { passive: true, capture: true };

const defaultNow = (): number => performance.timeOrigin + performance.now();

const readTabActive = (): boolean =>
  document.visibilityState === 'visible' && document.hasFocus();

export function createPageEvents(options: PageEventsOptions = {}): PageEvents {
  const now = options.now ?? defaultNow;
  let lastInput = now();
  let active = readTabActive();
  let disposed = false;
  const listeners = new Set<(tabActive: boolean) => void>();

  const recordInput = (): void => {
    lastInput = now();
  };

  const refresh = (): void => {
    const next = readTabActive();
    if (next === active) return;
    active = next;
    for (const cb of Array.from(listeners)) {
      // A throwing subscriber must not stop the others.
      try {
        cb(next);
      } catch {
        // Ignored on purpose: subscribers are isolated from each other.
      }
    }
  };

  for (const type of INPUT_EVENTS_ON_WINDOW) {
    window.addEventListener(type, recordInput, PASSIVE);
  }
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('blur', refresh);

  return {
    tabActive: () => readTabActive(),
    lastInputT: () => lastInput,
    onChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const type of INPUT_EVENTS_ON_WINDOW) {
        window.removeEventListener(type, recordInput, PASSIVE);
      }
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('blur', refresh);
      listeners.clear();
    },
  };
}
