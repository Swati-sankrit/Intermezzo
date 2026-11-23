/**
 * Haunt engine: turns attention signals into running haunts through Level_Logic.
 * It only sees `present` / `away` events and the injected ports. No camera,
 * detector, video or `src/attention/` import.
 */
import { createRoster } from './engineRoster';
import { DEFAULT_MODE } from './ghost/mode';
import type { HauntMode } from './ghost/mode';
import { evaluate, nextChangeDelay } from './levelLogic';
import type { LevelInput, LevelOutput } from './levelLogic';
import type { AttentionSignalLike, EngineDeps, EngineState, HauntEngine, HauntLevel, Unsubscribe } from './types';

const CALM: LevelOutput = { level: 0, leadId: null, companionId: null };

export function createHauntEngine(deps: EngineDeps): HauntEngine {
  const roster = createRoster(deps);
  const hauntById = new Map(deps.haunts.map((h) => [h.id, h] as const).reverse());
  const hauntIds = [...new Set(deps.haunts.map((h) => h.id))];

  let started = false;
  let unsubSignal: Unsubscribe | null = null;
  let unsubSettings: Unsubscribe | null = null;
  let changeTimer: unknown = null;
  let hasChangeTimer = false;

  let armed = false;
  let mode: HauntMode = DEFAULT_MODE;
  /** Events since the last `present`, in delivery order. */
  let events: AttentionSignalLike[] = [];
  let lastValue: AttentionSignalLike['value'] | null = null;
  let rolls = { lead: 0, companion: 0 };
  let previousLeadId: string | null = null;
  let lastLeadId: string | null = null;
  let output: LevelOutput = CALM;

  function clearChangeTimer(): void {
    if (hasChangeTimer) deps.scheduler.clearTimeout(changeTimer);
    hasChangeTimer = false;
    changeTimer = null;
  }

  function reconcile(next: LevelOutput): void {
    if (next.level === 0 || next.leadId === null) {
      roster.retireAll();
      return;
    }
    const level = next.level as HauntLevel;
    const wanted = [next.leadId, next.companionId].filter((id): id is string => id !== null);
    for (const id of roster.activeIds()) if (!wanted.includes(id)) roster.retireOne(id);
    for (const id of wanted) {
      if (roster.isActive(id)) {
        roster.setLevel(id, level);
        continue;
      }
      const haunt = hauntById.get(id);
      if (!haunt || roster.hasFailed(id)) continue;
      // Haunts keep module-level state: a retiring instance must be gone before a new start.
      roster.flushRetiring(id);
      roster.start(haunt, level);
    }
  }

  function recompute(): void {
    if (!started) return;
    clearChangeTimer();
    const input: LevelInput = { events: armed ? events : [], now: deps.clock.now(), mode, hauntIds, previousLeadId, rolls };
    output = armed ? evaluate(input) : CALM;
    if (output.leadId !== null) lastLeadId = output.leadId;
    reconcile(output);
    const delay = armed ? nextChangeDelay(input) : null;
    if (delay !== null) {
      hasChangeTimer = true;
      changeTimer = deps.scheduler.setTimeout(() => {
        hasChangeTimer = false;
        recompute();
      }, Math.max(0, delay));
    }
  }

  function onSignal(signal: AttentionSignalLike): void {
    if (!started || signal.value === lastValue) return;
    lastValue = signal.value;
    if (signal.value === 'present') {
      events = [signal];
    } else {
      events = [...events, signal];
      previousLeadId = lastLeadId;
      rolls = { lead: deps.random(), companion: deps.random() };
      roster.clearFailed();
      if (armed) roster.shortenRetiring();
    }
    if (armed) recompute();
  }

  function onSettings(): void {
    if (!started) return;
    const next = deps.settings.get();
    const wasArmed = armed;
    const wasMode = mode;
    armed = next.noticeSeen;
    mode = next.mode;
    if (armed && !wasArmed && lastValue === 'away') {
      // Escalation starts at level 1 from now, not from the remembered away time.
      events = [{ value: 'away', timestamp: deps.clock.now() }];
    }
    if (armed !== wasArmed || mode !== wasMode) recompute();
  }

  return {
    start() {
      if (started) return;
      started = true;
      const initial = deps.settings.get();
      armed = initial.noticeSeen;
      mode = initial.mode;
      unsubSettings = deps.settings.subscribe(onSettings);
      // The signal delivered at subscribe time is the first event (Req 11.4).
      unsubSignal = deps.subscribeSignal(onSignal);
    },

    stop() {
      if (!started) return;
      started = false;
      clearChangeTimer();
      unsubSignal?.();
      unsubSettings?.();
      unsubSignal = null;
      unsubSettings = null;
      roster.closeAll();
      events = [];
      lastValue = null;
      previousLeadId = null;
      lastLeadId = null;
      output = CALM;
    },

    getState(): EngineState {
      return {
        level: output.level,
        leadId: output.leadId,
        companionId: output.companionId,
        running: roster.runningIds(),
      };
    },
  };
}
