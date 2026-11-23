/**
 * Gate-owned ticks for `AudioOut.onTick`. Haunt files cannot start timers, so the gate runs
 * them on its injected scheduler (a self-rescheduling `setTimeout`) and cancels them all when
 * the port closes or fades out. One `PortTicks` per port; it never exposes the scheduler.
 */
import type { Unsubscribe } from '../types';

/** Shortest allowed tick period. Lower requests are raised to this value. */
export const MIN_TICK_PERIOD_MS = 100;

export interface TickScheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface PortTicks {
  /** Same contract as `AudioOut.onTick`. After `cancelAll` it returns a no-op cancel. */
  onTick(cb: () => void, periodMs: number): Unsubscribe;
  /** Cancels every running tick and refuses new ones. Safe to call twice. */
  cancelAll(): void;
}

export function clampTickPeriod(periodMs: number): number {
  return Number.isFinite(periodMs) ? Math.max(MIN_TICK_PERIOD_MS, periodMs) : MIN_TICK_PERIOD_MS;
}

export function createPortTicks(scheduler: TickScheduler | undefined, warn: (msg: string) => void): PortTicks {
  const cancels = new Set<() => void>();
  let closed = false;

  return {
    onTick(cb, periodMs) {
      if (closed || scheduler === undefined) return () => {};
      const period = clampTickPeriod(periodMs);
      let cancelled = false;
      let timer: unknown = null;
      let hasTimer = false;

      const cancel = (): void => {
        if (cancelled) return;
        cancelled = true;
        if (hasTimer) scheduler.clearTimeout(timer);
        hasTimer = false;
        timer = null;
        cancels.delete(cancel);
      };

      const arm = (): void => {
        hasTimer = true;
        timer = scheduler.setTimeout(run, period);
      };

      function run(): void {
        hasTimer = false;
        timer = null;
        if (cancelled) return;
        try {
          cb();
        } catch (e) {
          warn(`audio tick callback threw: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (!cancelled) arm(); // the callback may have cancelled itself
      }

      cancels.add(cancel);
      arm();
      return cancel;
    },
    cancelAll() {
      closed = true;
      for (const cancel of [...cancels]) cancel();
    },
  };
}
