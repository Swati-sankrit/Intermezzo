import { useCallback, useEffect, useRef } from 'react';

/**
 * Holds ONE open request made before the library is ready. A later request replaces it.
 * When `ready` becomes true the held request runs once (with the latest `run`) and is cleared.
 */
export function useHeldOpen<R>(ready: boolean, run: (request: R) => void): (request: R) => void {
  const held = useRef<{ request: R } | null>(null);
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    if (!ready || !held.current) return;
    const { request } = held.current;
    held.current = null;
    runRef.current(request);
  }, [ready]);

  return useCallback(
    (request: R) => {
      if (ready) runRef.current(request);
      else held.current = { request };
    },
    [ready],
  );
}
