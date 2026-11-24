/**
 * Return controller: plans and runs one Return_Moment through the Safety_Gate.
 * Effects are read through the `ReturnEffect` contract only, so a new effect needs no edit here.
 * Evidence and spoiler hosts are accepted but not used yet (tasks 9 and 10).
 */
import { DEFAULT_END_FADE_MS } from './gate/gateReturn';
import { RETURN_MAX_MS } from './gate/returnRules';
import { planReturn, type ReturnInput, type ReturnRolls } from './ghost/returnPlanner';
import type {
  EvidenceHost, HauntMode, ReadingContext, ReturnEffect, ReturnPlan, ReturnPort, SpoilerHost,
} from './returnTypes';
import type { EngineDeps, Gate } from './types';

export interface ReturnDeps {
  gate: Gate;
  effects: readonly ReturnEffect[];
  reading: ReadingContext;
  evidence: EvidenceHost;
  /** A `SpoilerHost` until the Spoiler controller exists (task 10.6). */
  spoiler: SpoilerHost;
  scheduler: EngineDeps['scheduler'];
  random(): number;
  warn(msg: string): void;
}

export interface ReturnController {
  /** Plans and runs one Return_Moment. Null, with no side effect, in Gentle or while one is running. */
  begin(
    args: { mode: HauntMode; awayMs: number; lookAwayCount: number; reducedMotion: boolean },
    retireAmbient: (fadeMs: number) => void,
  ): ReturnPlan | null;
  /** Ends the running Return_Moment at once (effects end, gate state ends). No-op when none runs. */
  abort(reason: 'away' | 'gentle' | 'stop'): void;
  running(): boolean;
  /** Jumpscare outcomes of earlier Qualifying_Returns, oldest first, last two only. */
  history(): readonly boolean[];
}

/** Gate end fades: `away` within 100 ms (Req 3.7); `gentle` 100 ms, within the 800 ms of Req 8.10; `stop` at once. */
export const ABORT_FADE_MS = { away: 80, gentle: 100, stop: 0 } as const;
/** The latest the controller ends a moment, so the gate's end fade finishes before its 3000 ms hard end. */
export const LATEST_END_MS = RETURN_MAX_MS - DEFAULT_END_FADE_MS;
const HISTORY_KEPT = 2;

interface Live {
  readonly effect: ReturnEffect;
  port: ReturnPort | null;
  state: 'waiting' | 'running' | 'done';
}
interface Run {
  readonly plan: ReturnPlan;
  readonly live: Live[];
  readonly timers: unknown[];
}

const ROLL_KEYS: readonly (keyof ReturnRolls)[] = [
  'jump', 'calm', 'calmLen', 'jumpLen', 'glitchLen', 'flickers', 'evidence', 'evidenceMsg', 'evidenceRun', 'spoiler',
];

function clamp(v: number, lo: number, hi: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
}

export function createReturnController(deps: ReturnDeps): ReturnController {
  let run: Run | null = null;
  let past: boolean[] = [];

  /** Runs `fn`; a throw goes to `warn`. Returns whether it completed. */
  function attempt(what: string, fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (err) {
      deps.warn(`${what} failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  function buildInput(args: { mode: HauntMode; awayMs: number; lookAwayCount: number; reducedMotion: boolean }): ReturnInput {
    const rolls = {} as Record<keyof ReturnRolls, number>;
    for (const key of ROLL_KEYS) rolls[key] = deps.random();
    let paragraph = '';
    let spoiler: ReturnInput['spoiler'] = null;
    attempt('reading context', () => {
      paragraph = deps.reading.activeParagraph() ?? '';
      spoiler = deps.reading.spoilerSource();
    });
    // The evidence pool (fixed messages and taunts) is built in task 9; until then there is none.
    return { ...args, history: past, rolls, paragraph, spoiler, messages: [] };
  }

  /** Ends one effect. A port is closed here only for an effect that ends inside the moment; at the end of the moment the gate closes every port with its fade. */
  function endEffect(live: Live, closePort: boolean): void {
    const was = live.state;
    live.state = 'done';
    if (was !== 'running') return;
    attempt(`return effect ${live.effect.id} end`, () => live.effect.end());
    const port = live.port;
    if (closePort && port !== null) attempt(`return effect ${live.effect.id} close`, () => port.close());
  }

  function startEffect(r: Run, live: Live): void {
    if (run !== r || live.state !== 'waiting') return;
    const { effect } = live;
    let port: ReturnPort | null = null;
    const opened = attempt(`return effect ${effect.id} open`, () => {
      port = deps.gate.openReturn(effect.id, { jumpSound: effect.jumpSound === true });
    });
    if (!opened || port === null) {
      live.state = 'done';
      return;
    }
    live.port = port;
    live.state = 'running';
    if (!attempt(`return effect ${effect.id} begin`, () => effect.begin(r.plan, port as ReturnPort))) endEffect(live, true);
  }

  function finish(fadeMs: number | undefined): void {
    const r = run;
    if (r === null) return;
    run = null;
    for (const t of r.timers) deps.scheduler.clearTimeout(t);
    for (const live of r.live) endEffect(live, false);
    deps.gate.endReturnMoment(fadeMs);
  }

  function schedule(r: Run, mode: HauntMode, limit: number): void {
    for (const effect of deps.effects) {
      if (effect.modes !== undefined && !effect.modes.includes(mode)) continue;
      let span: { startMs: number; endMs: number } | null = null;
      if (!attempt(`return effect ${effect.id} span`, () => void (span = effect.span(r.plan)))) continue;
      if (span === null) continue;
      const { startMs, endMs } = span as { startMs: number; endMs: number };
      const start = clamp(startMs, 0, limit);
      const end = clamp(endMs, start, limit);
      const live: Live = { effect, port: null, state: 'waiting' };
      r.live.push(live);
      if (start <= 0) startEffect(r, live);
      else r.timers.push(deps.scheduler.setTimeout(() => startEffect(r, live), start));
      if (end < limit) r.timers.push(deps.scheduler.setTimeout(() => endEffect(live, true), end));
    }
  }

  return {
    begin(args, retireAmbient) {
      if (args.mode === 'gentle' || run !== null) return null;
      const plan = planReturn(buildInput(args));
      if (plan.durationMs <= 0) return null;
      if (plan.qualifying) past = [...past, plan.jumpscare !== null].slice(-HISTORY_KEPT);
      attempt('retire ambient', () => retireAmbient(plan.ambientFadeMs));
      deps.gate.beginReturnMoment();
      const r: Run = { plan, live: [], timers: [] };
      run = r;
      const limit = Math.min(plan.durationMs, LATEST_END_MS);
      schedule(r, args.mode, limit);
      if (run === r) r.timers.push(deps.scheduler.setTimeout(() => finish(undefined), limit));
      return plan;
    },
    abort(reason) {
      finish(ABORT_FADE_MS[reason]);
    },
    running: () => run !== null,
    history: () => past,
  };
}
