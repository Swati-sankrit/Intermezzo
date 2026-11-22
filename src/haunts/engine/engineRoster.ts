/**
 * Roster of haunts the engine has started: active ones (wanted by Level_Logic)
 * and retiring ones (fading out, stopped when the fade ends).
 * Every call into a haunt or a port is wrapped, so one failure never stops the engine.
 * No DOM, audio, camera or `src/attention/` access.
 */
import type { EngineDeps, GatePort, Haunt, HauntLevel } from './types';

export const FADE_MS = 600;
export const FLUSH_MS = 50;
const MAX_FADE_MS = 800;

interface Entry {
  readonly haunt: Haunt;
  readonly port: GatePort;
  level: HauntLevel;
  timer: unknown;
  /** Clock time at which the retire timer fires. */
  due: number;
}

export interface Roster {
  activeIds(): string[];
  /** Active and retiring: started and not yet stopped. */
  runningIds(): string[];
  isActive(id: string): boolean;
  levelOf(id: string): HauntLevel | null;
  /** Ids whose start or setLevel failed during the current look-away. */
  hasFailed(id: string): boolean;
  clearFailed(): void;
  start(haunt: Haunt, level: HauntLevel): void;
  setLevel(id: string, level: HauntLevel): void;
  /** Level 0: fade every open port with `gate.fadeOutAll`, then stop and close. */
  retireAll(): void;
  /** Fade only this haunt's port, then stop and close it. */
  retireOne(id: string): void;
  /** Stop and close a retiring instance of `id` now, before it is started again. */
  flushRetiring(id: string): void;
  /** A new look-away began: end every retiring fade within FLUSH_MS. */
  shortenRetiring(): void;
  /** Stop and close everything at once. */
  closeAll(): void;
}

export function createRoster(deps: EngineDeps): Roster {
  const active = new Map<string, Entry>();
  const retiring = new Set<Entry>();
  const failed = new Set<string>();

  function attempt(what: string, id: string, fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      deps.warn(`haunt "${id}": ${what} failed: ${detail}`);
      return false;
    }
  }

  function stopAndClose(entry: Entry): void {
    const id = entry.haunt.id;
    attempt('stop', id, () => entry.haunt.stop());
    attempt('close', id, () => entry.port.close());
  }

  function finish(entry: Entry): void {
    if (!retiring.delete(entry)) return;
    deps.scheduler.clearTimeout(entry.timer);
    stopAndClose(entry);
  }

  function schedule(entry: Entry, ms: number): void {
    const wait = Number.isFinite(ms) ? Math.min(MAX_FADE_MS, Math.max(0, ms)) : MAX_FADE_MS;
    entry.due = deps.clock.now() + wait;
    entry.timer = deps.scheduler.setTimeout(() => finish(entry), wait);
  }

  function fail(entry: Entry): void {
    active.delete(entry.haunt.id);
    failed.add(entry.haunt.id);
    stopAndClose(entry);
  }

  function moveToRetiring(entry: Entry, ms: number): void {
    active.delete(entry.haunt.id);
    retiring.add(entry);
    schedule(entry, ms);
  }

  return {
    activeIds: () => [...active.keys()],
    runningIds: () => [...active.keys(), ...[...retiring].map((e) => e.haunt.id)],
    isActive: (id) => active.has(id),
    levelOf: (id) => active.get(id)?.level ?? null,
    hasFailed: (id) => failed.has(id),
    clearFailed: () => failed.clear(),

    start(haunt, level) {
      let port: GatePort | null = null;
      if (!attempt('open', haunt.id, () => { port = deps.gate.open(haunt.id); }) || port === null) {
        failed.add(haunt.id);
        return;
      }
      const opened: GatePort = port;
      const entry: Entry = { haunt, port: opened, level, timer: null, due: 0 };
      active.set(haunt.id, entry);
      if (!attempt('start', haunt.id, () => haunt.start(level, opened.audio, opened.visual))) fail(entry);
    },

    setLevel(id, level) {
      const entry = active.get(id);
      if (!entry || entry.level === level) return;
      entry.level = level;
      if (!attempt('setLevel', id, () => entry.haunt.setLevel(level))) fail(entry);
    },

    retireAll() {
      if (active.size === 0) return;
      let ms = FADE_MS;
      try {
        ms = deps.gate.fadeOutAll(FADE_MS);
      } catch (error) {
        deps.warn(`fadeOutAll failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      for (const entry of [...active.values()]) moveToRetiring(entry, ms);
    },

    retireOne(id) {
      const entry = active.get(id);
      if (!entry) return;
      attempt('fadeOut', id, () => entry.port.fadeOut(FADE_MS));
      moveToRetiring(entry, FADE_MS);
    },

    flushRetiring(id) {
      for (const entry of [...retiring]) if (entry.haunt.id === id) finish(entry);
    },

    shortenRetiring() {
      const now = deps.clock.now();
      for (const entry of retiring) {
        if (entry.due - now <= FLUSH_MS) continue;
        attempt('fadeOut', entry.haunt.id, () => entry.port.fadeOut(FLUSH_MS));
        deps.scheduler.clearTimeout(entry.timer);
        schedule(entry, FLUSH_MS);
      }
    },

    closeAll() {
      for (const entry of [...retiring]) finish(entry);
      for (const entry of [...active.values()]) {
        active.delete(entry.haunt.id);
        stopAndClose(entry);
      }
      failed.clear();
    },
  };
}
