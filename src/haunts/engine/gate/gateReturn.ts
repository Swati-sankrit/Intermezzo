/**
 * Return_Moment state of the Safety_Gate. `openReturn` hands out a ReturnPort only between
 * `begin` and `end`. A 3000 ms guard on the injected scheduler ends the state if the controller
 * never does. The scheduler is a required dependency of the gate, so the guard always exists.
 * `end` fades every ReturnPort (audio and overlays) and closes it within `fadeMs` (at most 100 ms).
 * Nothing outlives 3000 ms from `begin`: the guard starts the end fade early (3000 minus the
 * default fade, state still open), and a hard deadline at 3000 closes every port and overlay at
 * once, which also cuts short any `end` fade that would have run past it. The scheduler has no
 * clock, so a fade is cut at the deadline instead of being shortened up front.
 * A ReturnPort is a normal gate port plus overlays; only a port opened here can be a jump channel.
 */
import type { ReturnPort } from '../returnTypes';
import type { GatePort } from '../types';
import { RETURN_MAX_MS } from './returnRules';
import { createReturnVisual, type ReturnVisual } from './returnVisual';
import type { TickScheduler } from './tickHost';

export const DEFAULT_END_FADE_MS = 80;
export const MAX_END_FADE_MS = 100;

export interface ReturnHostDeps {
  /** The gate's own port opener; `jumpSound` opens a jump channel. */
  openPort(id: string, jumpSound: boolean): GatePort;
  readonly scheduler: TickScheduler;
  readonly root: HTMLElement;
  reduced(): boolean;
  warn(msg: string): void;
}

export interface ReturnHost {
  begin(): void;
  end(fadeMs?: number): void;
  open(effectId: string, opts?: { jumpSound?: boolean }): ReturnPort | null;
  dispose(): void;
}

interface Entry {
  readonly port: GatePort;
  readonly rv: ReturnVisual;
  closed: boolean;
}

/** Missing or invalid gives 80; otherwise in [0, 100]. */
export function planEndFade(fadeMs: number | undefined): number {
  if (fadeMs === undefined || !Number.isFinite(fadeMs)) return DEFAULT_END_FADE_MS;
  return Math.min(MAX_END_FADE_MS, Math.max(0, fadeMs));
}

export function createReturnHost(deps: ReturnHostDeps): ReturnHost {
  const { scheduler } = deps;
  const entries = new Set<Entry>();
  let active = false;
  let disposed = false;
  let guard: { id: unknown } | null = null;
  let pending: { id: unknown } | null = null;
  let deadline: { id: unknown } | null = null;
  let guardFading = false;

  function clear(t: { id: unknown } | null): null {
    if (t !== null) scheduler.clearTimeout(t.id);
    return null;
  }

  function closeEntry(e: Entry): void {
    if (e.closed) return;
    e.closed = true;
    e.rv.removeAll();
    e.port.close();
    entries.delete(e);
  }

  function finalize(): void {
    pending = clear(pending);
    deadline = clear(deadline);
    guardFading = false;
    for (const e of [...entries]) closeEntry(e);
  }

  function end(fadeMs?: number): void {
    if (!active) return;
    active = false;
    guard = clear(guard);
    const ms = planEndFade(fadeMs);
    guardFading = false;
    if (entries.size === 0) {
      deadline = clear(deadline);
      return;
    }
    if (ms <= 0) {
      finalize();
      return;
    }
    for (const e of entries) fadeEntry(e, ms);
    pending = { id: scheduler.setTimeout(finalize, ms) };
  }

  function fadeEntry(e: Entry, ms: number): void {
    e.port.fadeOut(ms);
    e.rv.fadeAndRemove(ms);
  }

  /** The guard's early fade: the state is still open until 3000, so overlays may still be made. */
  function guardFade(e: Entry): void {
    e.port.fadeOut(DEFAULT_END_FADE_MS);
    e.rv.fadeOut(DEFAULT_END_FADE_MS);
  }

  return {
    begin() {
      if (disposed || active) return;
      finalize(); // ports left over from an earlier end are closed now
      active = true;
      guard = {
        id: scheduler.setTimeout(() => {
          guard = null;
          guardFading = true;
          for (const e of entries) guardFade(e);
        }, Math.max(0, RETURN_MAX_MS - DEFAULT_END_FADE_MS)),
      };
      deadline = {
        id: scheduler.setTimeout(() => {
          deadline = null;
          active = false;
          guard = clear(guard);
          finalize();
        }, RETURN_MAX_MS),
      };
    },
    end,
    open(effectId, opts) {
      if (!active || disposed) return null;
      const port = deps.openPort(`return:${effectId}`, opts?.jumpSound === true);
      const rv = createReturnVisual(port.visual, deps);
      const entry: Entry = { port, rv, closed: false };
      entries.add(entry);
      if (guardFading) guardFade(entry);
      return { audio: port.audio, visual: rv.visual, close: () => closeEntry(entry) };
    },
    dispose() {
      disposed = true;
      active = false;
      guard = clear(guard);
      finalize();
    },
  };
}
