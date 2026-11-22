/**
 * matchMedia adapter for `prefers-reduced-motion: reduce`.
 * Unavailable matchMedia is treated as "reduced motion off" (design: failure table).
 * Uses addEventListener('change'), never the deprecated addListener.
 */

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** The slice of MediaQueryList this adapter uses. */
export interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void;
}

export type MatchMediaFn = (query: string) => MediaQueryListLike;

export interface ReducedMotionAdapter {
  get(): boolean;
  /** Calls `cb` with the new value when the preference changes. Returns an unsubscribe function. */
  subscribe(cb: (reduced: boolean) => void): () => void;
}

function defaultMatchMedia(): MatchMediaFn | null {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia.bind(window) as MatchMediaFn;
  }
  return null;
}

/**
 * @param matchMedia Injectable for tests. `undefined` uses `window.matchMedia` when present;
 *                   `null` means "unavailable".
 */
export function createReducedMotion(matchMedia?: MatchMediaFn | null): ReducedMotionAdapter {
  const fn = matchMedia === undefined ? defaultMatchMedia() : matchMedia;
  if (fn === null) {
    return { get: () => false, subscribe: () => () => {} };
  }
  const mql = fn(REDUCED_MOTION_QUERY);
  return {
    get: () => mql.matches,
    subscribe(cb) {
      const listener = (event: { matches: boolean }): void => cb(event.matches);
      mql.addEventListener('change', listener);
      return () => mql.removeEventListener('change', listener);
    },
  };
}
