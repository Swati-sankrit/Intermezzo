/**
 * Haunt engine: turns attention signals into running haunts through Level_Logic.
 * It only sees `present` / `away` events and the injected ports. No camera,
 * detector, video or `src/attention/` import.
 */
import { createAwayTracker } from './engineAway';
import { allowedIn, layersToRun, selectByMode } from './engineSelect';
import { createRoster, FADE_MS } from './engineRoster';
import { resolveWiring } from './engineWiring';
import { DEFAULT_MODE } from './ghost/mode';
import type { HauntMode } from './ghost/mode';
import { evaluate, nextChangeDelay } from './levelLogic';
import type { LevelInput, LevelOutput } from './levelLogic';
import { createReturnController } from './returnMoment';
import type { AttentionSignalLike, EngineDeps, EngineState, HauntEngine, HauntLevel, Unsubscribe } from './types';

const CALM: LevelOutput = { level: 0, leadId: null, companionId: null };

/** Fade for haunts a mode change no longer allows. Within the 800 ms of Req 8.10. */
const MODE_FADE_MS = 800;

export function createHauntEngine(deps: EngineDeps): HauntEngine {
  const wiring = resolveWiring(deps);
  const roster = createRoster(deps, wiring.extraRandom);
  const returns = createReturnController({
    gate: deps.gate,
    effects: wiring.effects,
    reading: wiring.reading,
    evidence: wiring.evidence,
    spoiler: wiring.spoiler,
    scheduler: deps.scheduler,
    random: wiring.extraRandom,
    warn: deps.warn,
  });
  const hauntById = new Map(deps.haunts.map((h) => [h.id, h] as const).reverse());
  /** One haunt per id, first one wins, in delivery order. */
  const uniqueHaunts = deps.haunts.filter((h, i) => deps.haunts.findIndex((o) => o.id === h.id) === i);
  let selection = selectByMode(uniqueHaunts, DEFAULT_MODE);
  let hauntIds = selection.leads.map((h) => h.id);
  const away = createAwayTracker(wiring.reading, deps.warn);
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

  function reconcile(next: LevelOutput, fadeMs: number): void {
    if (next.level === 0 || next.leadId === null) {
      roster.retireAll(fadeMs);
      return;
    }
    const level = next.level as HauntLevel;
    const layerIds = layersToRun(selection.layers, next.level, mode);
    const wanted = [next.leadId, next.companionId, ...layerIds].filter((id): id is string => id !== null);
    for (const id of roster.activeIds()) if (!wanted.includes(id)) roster.retireOne(id);
    for (const id of wanted) {
      if (roster.isActive(id)) {
        roster.setLevel(id, level);
        continue;
      }
      const haunt = hauntById.get(id);
      if (!haunt || roster.hasFailed(id)) continue;
      // A layer plays once per look-away (Req 1.3): never restart one that already ran.
      if (layerIds.includes(id) && roster.wasStarted(id)) continue;
      // Haunts keep module-level state: a retiring instance must be gone before a new start.
      roster.flushRetiring(id);
      roster.start(haunt, level, { mode, ghostStep: away.ghostStep(), regions: wiring.regions() });
    }
  }
  function recompute(fadeMs: number = FADE_MS): void {
    if (!started) return;
    clearChangeTimer();
    const input: LevelInput = { events: armed ? events : [], now: deps.clock.now(), mode, hauntIds, previousLeadId, rolls };
    output = armed ? evaluate(input) : CALM;
    if (output.leadId !== null) lastLeadId = output.leadId;
    reconcile(output, fadeMs);
    const delay = armed ? nextChangeDelay(input) : null;
    if (delay !== null) {
      hasChangeTimer = true;
      changeTimer = deps.scheduler.setTimeout(() => {
        hasChangeTimer = false;
        recompute();
      }, Math.max(0, delay));
    }
  }
  function setMode(next: HauntMode): void {
    mode = next;
    selection = selectByMode(uniqueHaunts, mode);
    hauntIds = selection.leads.map((h) => h.id);
  }
  /** The Return_Moment for a `present` that ends a look-away. True when one started. */
  function beginReturn(awayStart: number, now: number): boolean {
    const args = {
      mode,
      awayMs: Math.max(0, now - awayStart),
      lookAwayCount: away.earlierCount(),
      reducedMotion: wiring.reducedMotion(),
    };
    const plan = returns.begin(args, (ms) => recompute(ms));
    return plan !== null && output.level === 0;
  }
  function onSignal(signal: AttentionSignalLike): void {
    if (!started || signal.value === lastValue) return;
    const wasAway = lastValue === 'away';
    lastValue = signal.value;
    if (signal.value === 'present') {
      const awayStart = events.find((e) => e.value === 'away')?.timestamp ?? null;
      events = [signal];
      if (armed && wasAway && awayStart !== null && beginReturn(awayStart, signal.timestamp)) return;
    } else {
      returns.abort('away');
      events = [...events, signal];
      previousLeadId = lastLeadId;
      rolls = { lead: deps.random(), companion: deps.random() };
      roster.clearFailed();
      away.startAway();
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
    if (next.mode !== wasMode) setMode(next.mode);
    if (armed && !wasArmed && lastValue === 'away') {
      // Escalation starts at level 1 from now, not from the remembered away time.
      events = [{ value: 'away', timestamp: deps.clock.now() }];
    }
    if (mode === 'gentle' && wasMode !== 'gentle') returns.abort('gentle');
    if (armed !== wasArmed || mode !== wasMode) recompute();
    if (mode !== wasMode) roster.retireWhere((h) => !allowedIn(h, mode), MODE_FADE_MS);
  }
  return {
    start() {
      if (started) return;
      started = true;
      const initial = deps.settings.get();
      armed = initial.noticeSeen;
      setMode(initial.mode);
      away.watchChapter();
      unsubSettings = deps.settings.subscribe(onSettings);
      // The signal delivered at subscribe time is the first event (Req 11.4).
      unsubSignal = deps.subscribeSignal(onSignal);
    },
    stop() {
      if (!started) return;
      started = false;
      returns.abort('stop');
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
      away.reset();
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
