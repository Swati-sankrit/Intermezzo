/**
 * Property 14 over every real haunt (`loadHaunts()`): the real gate and real audio adapter, against the
 * fake AudioContext from ./fakes.ts, with the real haunts calling the real ports.
 *
 * Scenarios use each haunt alone and every ordered pair of distinct haunts (lead, companion), so a haunt
 * added later is covered automatically. Any interleaving of: setGain, setLevel, cap changes (storage write
 * plus `refreshVolumeCap`, or a `storage` event), sound toggles, unlock, context state changes, fadeOut,
 * fadeOutAll, port close, restart, and reduced-motion changes, with time advancing in between.
 *
 * What is measured: the COMBINED gain reaching the destination is the sum over channels of
 * (channel gain x master gain), computed from the fake graph BEFORE the compressor. The compressor is
 * a safety net for filter peaks, not the guarantee, so it is deliberately left out of the number.
 *
 * Why the forward schedule: the adapter cancels and re-anchors a ramp each time it changes, which
 * rewrites the fake timeline from "now" on. So after every action, and again after time advances, every
 * breakpoint and ramp end from "now" on (plus midpoints, and both sides of every cap-window edge) is
 * sampled. The realised trajectory is always a prefix of such a forward schedule.
 *
 * Cap in force and tolerance. design.md gives no tolerance for the cap ramp, only "applied within 100 ms"
 * (Req 6.13). The test therefore requires, at every sampled instant t:
 *   combined(t) <= max(cap in force at any moment of the 50 ms before t) + 1e-9
 * i.e. after a cap DROP the combined gain may stay between old and new cap for at most 50 ms (the
 * adapter's cap ramp), and must be <= the new cap after that. It also requires combined(T + 100 ms) <= the
 * allowed cap at that time (Req 6.13; see the comment at the check), and that the sum of the target values of all channel gains is <=
 * the cap in force (within 1e-9), which is the literal wording of Property 14.
 *
 * ghost-dread additions (task 6.4). The registry now gives haunts AND return effects (`loadRegistry`; this file
 * used `loadHaunts`, haunts only). The haunts include the layers (footsteps, breathing, knock, ghostFigure),
 * which start with a `StartInfo` as the engine gives them. A Return_Moment is begun through the real Return
 * controller (ghostHarness.ts), so the registry's return effects (ghostFigure, jumpscare) run on real
 * ReturnPorts, the jumpscare on a jump channel. The rise rule for a jump channel is the one of gd23: 20 ms
 * (300 ms under reduced motion); every other channel keeps 300 ms (1000 ms). Nothing else is relaxed.
 *
 * What this adds beyond gd23 (gateCap.gd23): gd23 drives the gate with synthetic ports and a scripted jump
 * request. This file runs the REAL haunt files: their own gain requests, pulse buffers, spatial panner chains
 * and `onTick` position ramps, together with the lead and the companion (the "ensemble" property below), and
 * the REAL jumpscare and ghostFigure effects planned by the real planner, with any cap change, sound toggle,
 * lock and fade around them. A real file asking for more than the gate allows, or a gain change that bypasses
 * the cap, shows up here and cannot in gd23.
 */
import { appendFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { parseVolumeCap } from '../gate/plan';
import { createReducedMotion } from '../gate/reducedMotion';
import { loadRegistry } from '../registry';
import { KEYS } from '../settings';
import type { ReturnEffect } from '../returnTypes';
import type { AudioOut, Gate, GatePort, Haunt, HauntLevel, StartInfo } from '../types';
import { fadeMsArb } from './arbitraries';
import { createReturnDriver, retArgsArb, startInfoArb, type RetArgs, type ReturnDriver } from './ghostHarness';
import {
  FakeAudioContext, type FakeAudioNode, type FakeAudioState, type FakeGainNode,
  createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
} from './fakes';

/**
 * 700, was 300. The registry now gives 6 haunts, so 36 combos. At 300 runs each combo was drawn about 8 times
 * and the check "every combo at least once" (floor 1) failed in 2 of 20 measured batches (a single combo drawn
 * 0 times). At 700 the mean per combo is about 19 (binomial SD 4.4), about 4 SD above the floor. No floor changed.
 */
const NUM_RUNS = 700;
const ENSEMBLE_RUNS = 300;
/**
 * Explicit timeout for the two property tests (same reason as gd23): the default 5000 ms is too close to
 * their times once the whole suite runs in parallel. Measured alone: see the report of task 6.4.
 */
const SLOW_TEST_MS = 20_000;
const EPS = 1e-9;
/** Tolerance window after a cap drop: the adapter's 50 ms cap ramp. design.md states none. */
const CAP_WINDOW_S = 0.05;
/** Req 6.13: a new cap is applied within 100 ms. */
const CAP_APPLY_S = 0.1;
const AUDIBLE = 1e-4;

// ------------------------------------------------------------------ cap history

interface CapHistory {
  base: number;
  /** In ctx-time order. */
  changes: { t: number; cap: number }[];
}

/** Cap in force at ctx time t (last change at or before t). */
function capAt(h: CapHistory, t: number): number {
  let cap = h.base;
  for (const c of h.changes) if (c.t <= t) cap = c.cap;
  return cap;
}

/** Largest cap in force at any moment of the 50 ms up to t. */
function allowedAt(h: CapHistory, t: number): number {
  const lo = t - CAP_WINDOW_S;
  let max = capAt(h, lo);
  for (const c of h.changes) if (c.t > lo && c.t <= t) max = Math.max(max, c.cap);
  return max;
}

// ------------------------------------------------------------------ graph reading

function masterOf(ctx: FakeAudioContext): FakeAudioNode | null {
  const edge = ctx.connections.find((e) => e.from.kind === 'gain' && 'kind' in e.to && e.to.kind === 'compressor');
  return edge === undefined ? null : edge.from;
}

/** Channel gain nodes: every gain node except the master. */
function channelsOf(ctx: FakeAudioContext): FakeGainNode[] {
  const master = masterOf(ctx);
  return ctx.nodesOfKind('gain').filter((n) => n !== master) as FakeGainNode[];
}

function combinedAt(ctx: FakeAudioContext, channels: readonly FakeAudioNode[], t: number): number {
  let sum = 0;
  for (const n of channels) sum += ctx.effectiveGainAt(n, t);
  return sum;
}

function sampleTimes(ctx: FakeAudioContext, channels: readonly FakeAudioNode[], h: CapHistory, now: number): number[] {
  const set = new Set<number>([now]);
  for (const n of channels) for (const t of ctx.gainBreakpoints(n)) if (t >= now) set.add(t);
  for (const c of h.changes) for (const t of [c.t, c.t + CAP_WINDOW_S, c.t + CAP_APPLY_S]) if (t >= now) set.add(t);
  const sorted = [...set].sort((a, b) => a - b);
  const out = new Set<number>(sorted);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] - 1e-7 >= now) out.add(sorted[i] - 1e-7);
    if (i > 0) out.add((sorted[i] + sorted[i - 1]) / 2);
  }
  return [...out].sort((a, b) => a - b);
}

/** First sampled instant where the combined gain is above the allowed cap, or null. Also returns the peak. */
function firstViolation(
  ctx: FakeAudioContext, channels: readonly FakeAudioNode[], times: readonly number[], allowed: (t: number) => number,
): { message: string | null; peak: number } {
  let peak = 0;
  let message: string | null = null;
  for (const t of times) {
    const g = combinedAt(ctx, channels, t);
    peak = Math.max(peak, g);
    const a = allowed(t);
    if (message === null && g > a + EPS) message = `combined gain ${g} at ctx time ${t}s is above the cap allowed there (${a})`;
  }
  return { message, peak };
}

// ------------------------------------------------------------------ scenarios

type Level = HauntLevel;

type Action =
  | { k: 'setGain'; who: number; v: number }
  | { k: 'setLevel'; who: number; level: Level }
  | { k: 'capRefresh'; text: string | null }
  | { k: 'capEvent'; text: string | null; key: 'cap' | 'null' }
  | { k: 'capWrite'; text: string | null }
  | { k: 'capEventOther'; text: string | null }
  | { k: 'sound'; on: boolean }
  | { k: 'unlock'; via: 'pointerdown' | 'keydown' | 'api' }
  | { k: 'ctxState'; state: Exclude<FakeAudioState, 'closed'> }
  | { k: 'fadeOut'; who: number; ms: number | undefined }
  | { k: 'fadeOutAll'; ms: number | undefined }
  | { k: 'close'; who: number }
  | { k: 'restart'; who: number; level: Level }
  | { k: 'reducedOs'; on: boolean }
  | { k: 'reducedApp'; on: boolean }
  | { k: 'ret'; args: RetArgs }
  | { k: 'retAbort'; reason: 'away' | 'stop' };

interface Step { readonly a: Action; readonly dt: number }

interface Scenario {
  readonly combo: number;
  readonly levels: readonly [Level, Level];
  readonly capText: string | null;
  readonly soundOn: boolean;
  readonly osReduced: boolean;
  readonly unlockAtStart: boolean;
  /** What the engine passes to every haunt's `start`. */
  readonly info: StartInfo;
  readonly steps: readonly Step[];
}

const levelArb = fc.constantFrom<Level>(1, 2, 3);
const whoArb = fc.integer({ min: 0, max: 1 });
/** Mostly caps near or below what haunts ask for (0.04 to 0.18), so the cap binds; some high, some invalid. */
const capTextArb: fc.Arbitrary<string | null> = fc.oneof(
  { weight: 5, arbitrary: fc.integer({ min: 0, max: 20 }).map((n) => String(n / 100)) },
  { weight: 3, arbitrary: fc.integer({ min: 21, max: 100 }).map((n) => String(n / 100)) },
  { weight: 1, arbitrary: fc.constantFrom('0', '1') },
  { weight: 1, arbitrary: fc.constantFrom('loud', '', '7', '-1', null) },
);
const setGainValueArb = fc.oneof(
  { weight: 5, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
  { weight: 1, arbitrary: fc.constantFrom(0, 1, 2, Number.NaN, Number.POSITIVE_INFINITY, -1) },
);
// 0, 10, 30 and 49 ms put two actions inside one 50 ms cap window; 2000 and 3200 let a Return_Moment run to its end.
const dtArb = fc.constantFrom(0, 0, 0, 10, 10, 30, 49, 51, 80, 99, 101, 150, 299, 301, 500, 1000, 1500, 2000, 3200);

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ k: fc.constant('setLevel' as const), who: whoArb, level: levelArb }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('setGain' as const), who: whoArb, v: setGainValueArb }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('capRefresh' as const), text: capTextArb }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('capEvent' as const), text: capTextArb, key: fc.constantFrom<'cap' | 'null'>('cap', 'null') }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('capWrite' as const), text: capTextArb }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('capEventOther' as const), text: capTextArb }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('sound' as const), on: fc.boolean() }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('unlock' as const), via: fc.constantFrom<'pointerdown' | 'keydown' | 'api'>('pointerdown', 'keydown', 'api') }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('ctxState' as const), state: fc.constantFrom<'running' | 'suspended' | 'interrupted'>('running', 'suspended', 'interrupted') }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('fadeOut' as const), who: whoArb, ms: fadeMsArb }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('fadeOutAll' as const), ms: fadeMsArb }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('close' as const), who: whoArb }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('restart' as const), who: whoArb, level: levelArb }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('reducedOs' as const), on: fc.boolean() }) },
  { weight: 1, arbitrary: fc.record({ k: fc.constant('reducedApp' as const), on: fc.boolean() }) },
  { weight: 3, arbitrary: fc.record({ k: fc.constant('ret' as const), args: retArgsArb }) },
  { weight: 2, arbitrary: fc.record({ k: fc.constant('retAbort' as const), reason: fc.constantFrom<'away' | 'stop'>('away', 'stop') }) },
);

/** Integers from `from` up to but not including `to`. */
function indexRange(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

/**
 * Which combo a scenario runs. Combos are [singles..., ordered pairs...], so there are about sqrt(comboCount)
 * singles. fc.integer is biased toward its lower bound, which favoured the singles; constantFrom is uniform.
 * Pairs are drawn 85% of the time so the pair share has a wide margin over its floor (0.75 expected) and
 * every combo still shows up.
 */
function comboPickArb(comboCount: number): fc.Arbitrary<number> {
  return fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom(...indexRange(0, Math.round(Math.sqrt(comboCount)))) },
    { weight: 17, arbitrary: fc.constantFrom(...indexRange(Math.round(Math.sqrt(comboCount)), comboCount)) },
  );
}

function scenarioArb(comboPick: fc.Arbitrary<number>): fc.Arbitrary<Scenario> {
  return fc.record({
    combo: comboPick,
    levels: fc.tuple(levelArb, levelArb),
    capText: capTextArb,
    soundOn: fc.oneof({ weight: 9, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
    osReduced: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
    unlockAtStart: fc.oneof({ weight: 9, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
    info: startInfoArb,
    steps: fc.array(fc.record({ a: actionArb, dt: dtArb }), { minLength: 8, maxLength: 16 }),
  });
}

/** Each haunt alone, then every ordered pair of distinct haunts. */
function combosOf(haunts: readonly Haunt[]): Haunt[][] {
  const out: Haunt[][] = haunts.map((h) => [h]);
  for (const a of haunts) for (const b of haunts) if (a !== b) out.push([a, b]);
  return out;
}

const isLayer = (h: Haunt): boolean => h.role === 'layer';

/**
 * The engine's full crew: a lead and a companion (both orders), with every non-empty subset of the layers
 * running alongside them.
 */
function ensemblesOf(haunts: readonly Haunt[]): Haunt[][] {
  const leads = haunts.filter((h) => !isLayer(h));
  const layers = haunts.filter(isLayer);
  const out: Haunt[][] = [];
  for (let mask = 1; mask < 2 ** layers.length; mask++) {
    const subset = layers.filter((_, i) => (mask >> i) & 1);
    for (const lead of leads) for (const companion of leads) if (lead !== companion) out.push([lead, companion, ...subset]);
  }
  return out;
}

// ------------------------------------------------------------------ tallies

interface Tally {
  scenarios: number; pairs: number; played: number; built: number; capDropPlaying: number; soundTogglePlaying: number;
  reduced: number; interrupted: number; capDropWhileFalling: number; risesChecked: number; windowChecks: number;
  whispersPlayed: number; whispersScenarios: number; twoDrops: number; soundOffAfterDrop: number; fadePlaying: number;
  planInFlight: number; jumpRisesChecked: number;
  /** Scenarios with each ghost-dread flag (see `GHOST_FLAGS` and the `built:<layer>` flags), each counted once per scenario. */
  ghost: Map<string, number>;
}
const newTally = (): Tally => ({
  scenarios: 0, pairs: 0, played: 0, built: 0, capDropPlaying: 0, soundTogglePlaying: 0, reduced: 0, interrupted: 0,
  capDropWhileFalling: 0, risesChecked: 0, windowChecks: 0, whispersPlayed: 0, whispersScenarios: 0,
  twoDrops: 0, soundOffAfterDrop: 0, fadePlaying: 0, planInFlight: 0, jumpRisesChecked: 0, ghost: new Map(),
});
/** Base property: single haunts and ordered pairs. Ensemble property: lead, companion and layers. */
const tally = newTally();
const ensembleTally = newTally();
const comboCounts = new Map<number, number>();
const bump = (m: Map<number, number>, k: number): void => void m.set(k, (m.get(k) ?? 0) + 1);
/**
 * Ghost-dread flags, one per thing the task asks to see run. `built:<layer id>` is added for every layer:
 * the layer's own `whenReady` callback ran, so it built its sources. Return flags are about the controller
 * opening a port for the effect, so a Return_Moment really ran it.
 */
const GHOST_FLAGS = [
  'ghostDrawn', 'ghostReturnRan', 'jumpReturnRan', 'jumpPlaying', 'jumpReducedRan', 'returnAborted',
] as const;
/** Only the ensemble property can have a lead, a companion and a layer at once. */
const ENSEMBLE_FLAGS = ['layersWithLeadAndCompanion'] as const;

// ------------------------------------------------------------------ harness

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

function storageEventTarget(): {
  target: { addEventListener(t: 'storage', l: (e: { key: string | null }) => void): void; removeEventListener(t: 'storage', l: (e: { key: string | null }) => void): void };
  emit(key: string | null): void;
} {
  const listeners = new Set<(e: { key: string | null }) => void>();
  return {
    target: {
      addEventListener: (_t, l) => void listeners.add(l),
      removeEventListener: (_t, l) => void listeners.delete(l),
    },
    emit: (key) => void [...listeners].forEach((l) => l({ key })),
  };
}

interface Slot { haunt: Haunt; port: GatePort | null; active: boolean; built: boolean }

/** The port's audio with a read-only note of when the haunt's own `whenReady` callback runs. */
function watched(slot: Slot, audio: AudioOut): AudioOut {
  return { ...audio, whenReady: (cb) => audio.whenReady((ctx) => { slot.built = true; cb(ctx); }) };
}

async function runScenario(
  combos: readonly Haunt[][], effects: readonly ReturnEffect[], s: Scenario, tl: Tally, countCombo: boolean,
): Promise<void> {
  const combo = combos[s.combo];
  const { clock, scheduler } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const unlockTarget = new EventTarget();
  const mm = createFakeMatchMedia(s.osReduced);
  const storage = createFakeStorage(s.capText === null ? {} : { [KEYS.volumeCap]: s.capText });
  const events = storageEventTarget();
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  document.body.append(root);
  const warnings: string[] = [];
  const gate: Gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlockTarget },
    hosts: { root, left, right },
    storage,
    storageEvents: events.target,
    reducedMotion: createReducedMotion(mm.matchMedia),
    scheduler,
    warn: (m) => void warnings.push(m),
  });
  const slots: Slot[] = combo.map((haunt) => ({ haunt, port: null, active: false, built: false }));
  const seen = new Set<string>();
  /** Gain nodes of jump channels the controller opened (found at the moment of the open). */
  const jumpNodes: FakeGainNode[] = [];
  const driver: ReturnDriver = createReturnDriver({
    gate, effects, scheduler, warn: (m) => void warnings.push(m),
    around(effectId, jumpSound, doOpen) {
      const ctx = ctxOf();
      const before = ctx === undefined ? -1 : ctx.nodesOfKind('gain').length;
      const port = doOpen();
      if (port === null) return null;
      seen.add(`opened:${effectId}`);
      if (jumpSound) {
        const gains = ctx === undefined ? [] : ctx.nodesOfKind('gain');
        if (ctx === undefined || gains.length !== before + 1) throw new Error('could not find the gain node of the jump channel');
        jumpNodes.push(gains[gains.length - 1] as FakeGainNode);
        if (osReduced || appReduced) seen.add('jumpReducedRan');
      }
      return port;
    },
  });

  let appReduced = false;
  let osReduced = s.osReduced;
  let capModel = parseVolumeCap(storage.getItem(KEYS.volumeCap));
  const hist: CapHistory = { base: capModel, changes: [] };
  let mark = 0;
  let peak = 0;
  let sawReduced = osReduced;
  const flags = {
    capDropPlaying: false, soundTogglePlaying: false, interrupted: false, capDropFalling: false,
    twoDrops: false, soundOffAfterDrop: false, fadePlaying: false, planInFlight: false,
  };
  let lastDropT = Number.NEGATIVE_INFINITY;
  const ctxOf = (): FakeAudioContext | undefined => factory.contexts[0];

  const nowCombined = (): number => {
    const ctx = ctxOf();
    return ctx === undefined ? 0 : channelsOf(ctx).reduce((a, n) => a + (n as FakeGainNode).gain.valueAt(ctx.currentTime) * 1, 0);
  };
  /** True while some channel has a ramp still moving (its last target differs from its value now). */
  const moving = (): boolean => {
    const ctx = ctxOf();
    if (ctx === undefined) return false;
    return channelsOf(ctx).some((n) => {
      const calls = n.gain.calls.filter((c) => c.value !== undefined);
      const target = calls.length === 0 ? 0 : (calls[calls.length - 1].value as number);
      return Math.abs(target - n.gain.valueAt(ctx.currentTime)) > 1e-9;
    });
  };
  /** True while some channel is on its way down (its ramp target is below its value now). */
  const falling = (): boolean => {
    const ctx = ctxOf();
    if (ctx === undefined) return false;
    return channelsOf(ctx).some((n) => {
      const calls = n.gain.calls.filter((c) => c.value !== undefined);
      const target = calls.length === 0 ? 0 : (calls[calls.length - 1].value as number);
      return target < n.gain.valueAt(ctx.currentTime) - 1e-9;
    });
  };

  /** Applies what a cap read at this moment means in the model. */
  const capRead = (): void => {
    const next = parseVolumeCap(storage.getItem(KEYS.volumeCap));
    if (next === capModel) return;
    const ctx = ctxOf();
    if (next < capModel) {
      if (nowCombined() > AUDIBLE) flags.capDropPlaying = true;
      if (falling()) flags.capDropFalling = true;
      if (ctx !== undefined) {
        if (ctx.currentTime - lastDropT <= CAP_WINDOW_S) flags.twoDrops = true;
        lastDropT = ctx.currentTime;
      }
    }
    capModel = next;
    if (ctx === undefined) {
      hist.base = next;
      hist.changes.length = 0;
    } else hist.changes.push({ t: ctx.currentTime, cap: next });
  };
  const writeCap = (text: string | null): void => (text === null ? storage.removeItem(KEYS.volumeCap) : storage.setItem(KEYS.volumeCap, text));

  const verify = (): void => {
    const ctx = ctxOf();
    if (ctx === undefined) return;
    const channels = channelsOf(ctx);
    const now = ctx.currentTime;

    // Clause: the sum of the target values of all channel gains never exceeds the cap in force.
    let targets = 0;
    for (const n of channels) {
      if (ctx.pathsToDestination(n).length === 0) continue; // closed channel: disconnected from the master
      const calls = n.gain.calls.filter((c) => c.value !== undefined);
      targets += calls.length === 0 ? 0 : (calls[calls.length - 1].value as number);
    }
    expect(targets, `sum of channel gain targets vs cap ${capModel}`).toBeLessThanOrEqual(capModel + EPS);

    // Clause: combined gain at every instant of the forward schedule stays under the cap in force (50 ms tolerance after a drop).
    const times = sampleTimes(ctx, channels, hist, now);
    const { message, peak: p } = firstViolation(ctx, channels, times, (t) => allowedAt(hist, t));
    peak = Math.max(peak, p);
    expect(message, `forward schedule at ctx time ${now}s, cap ${capModel}`).toBeNull();

    // Clause (Req 6.13): 100 ms after any cap change the new cap is applied. Compared with allowedAt, not
    // capAt: a second cap change inside the 50 ms before the check instant (for example a drop at
    // change + 90 ms) legitimately keeps the earlier cap in the tolerance window at change + 100 ms.
    // When no other change is that close, allowedAt equals the cap in force and this is the plain 6.13 check.
    for (const c of hist.changes) {
      const t = c.t + CAP_APPLY_S;
      if (t < now) continue;
      tl.windowChecks++;
      expect(combinedAt(ctx, channels, t), `combined gain 100 ms after the cap change at ${c.t}s`).toBeLessThanOrEqual(allowedAt(hist, t) + EPS);
    }

    // Clause: every rising ramp lasts at least 300 ms (1000 ms under reduced motion). A jump channel (found when
    // the controller opened it) may rise in 20 ms (300 ms under reduced motion), as in gd23. Nothing else is relaxed.
    const reduced = osReduced || appReduced;
    const jumpParams = new Set<unknown>(jumpNodes.map((n) => n.gain));
    for (let i = mark; i < ctx.automation.length; i++) {
      const c = ctx.automation[i];
      if (c.type !== 'linearRampToValueAtTime' || !c.param.label.startsWith('gain#')) continue;
      const calls = c.param.calls;
      const prev = calls[calls.indexOf(c) - 1];
      expect(prev?.type, `${c.param.label}: a ramp is anchored by setValueAtTime`).toBe('setValueAtTime');
      if ((c.value as number) > (prev.value as number) + 1e-12) {
        const jump = jumpParams.has(c.param);
        const min = jump ? (reduced ? 0.3 : 0.02) : reduced ? 1 : 0.3;
        if (jump) tl.jumpRisesChecked++;
        else tl.risesChecked++;
        expect(c.effectiveTime - c.atContextTime, `${c.param.label} rise ${prev.value} to ${c.value} (jump channel: ${jump})`).toBeGreaterThanOrEqual(min - EPS);
      }
    }
    mark = ctx.automation.length;

    // Flags only (no assertion): a jump channel made sound, a Ghost layer is drawn in a side region.
    if (jumpNodes.some((n) => times.some((x) => ctx.effectiveGainAt(n, x) > AUDIBLE))) seen.add('jumpPlaying');
    // The Ghost layer carries this label (ghostFigure.ts), so this is the Ghost and not a lead's layer.
    const ghostLabel = '[aria-label="A ghost stands nearby"]';
    if (left.querySelector(ghostLabel) !== null || right.querySelector(ghostLabel) !== null) seen.add('ghostDrawn');
  };

  const perform = async (a: Action): Promise<void> => {
    const slot = (who: number): Slot => slots[who % slots.length];
    if (moving()) flags.planInFlight = true;
    if ((a.k === 'fadeOut' || a.k === 'fadeOutAll') && nowCombined() > AUDIBLE) flags.fadePlaying = true;
    const nowT = ctxOf()?.currentTime;
    if (a.k === 'sound' && !a.on && nowT !== undefined && nowT - lastDropT <= CAP_WINDOW_S) flags.soundOffAfterDrop = true;
    switch (a.k) {
      case 'setGain': {
        const sl = slot(a.who);
        if (sl.active) sl.port?.audio.setGain(a.v);
        break;
      }
      case 'setLevel': {
        const sl = slot(a.who);
        if (sl.active) sl.haunt.setLevel(a.level);
        break;
      }
      case 'capRefresh':
        writeCap(a.text);
        gate.refreshVolumeCap();
        capRead();
        break;
      case 'capEvent':
        writeCap(a.text);
        events.emit(a.key === 'null' ? null : KEYS.volumeCap);
        capRead();
        break;
      case 'capWrite':
        writeCap(a.text); // no refresh and no event: the cap in force does not change
        break;
      case 'capEventOther':
        writeCap(a.text);
        events.emit('some_other_key'); // not the cap key: ignored
        break;
      case 'sound':
        if (nowCombined() > AUDIBLE) flags.soundTogglePlaying = true;
        gate.setSoundEnabled(a.on);
        break;
      case 'unlock':
        if (a.via === 'api') gate.unlockAudio();
        else unlockTarget.dispatchEvent(new Event(a.via));
        await flush();
        break;
      case 'ctxState': {
        const ctx = ctxOf();
        if (ctx === undefined) break;
        if (a.state === 'interrupted' && ctx.state === 'running') flags.interrupted = true;
        ctx.setState(a.state);
        await flush();
        break;
      }
      case 'fadeOut': {
        const sl = slot(a.who);
        if (sl.active) sl.port?.fadeOut(a.ms as number);
        break;
      }
      case 'fadeOutAll':
        gate.fadeOutAll(a.ms as number);
        break;
      case 'close': {
        const sl = slot(a.who);
        if (sl.active) {
          sl.haunt.stop();
          sl.port?.close();
          sl.active = false;
        }
        break;
      }
      case 'restart': {
        const sl = slot(a.who);
        if (!sl.active) {
          sl.port = gate.open(sl.haunt.id);
          sl.haunt.start(a.level, watched(sl, sl.port.audio), sl.port.visual, s.info);
          sl.active = true;
        }
        break;
      }
      case 'reducedOs':
        osReduced = a.on;
        mm.setMatches(a.on);
        break;
      case 'reducedApp':
        appReduced = a.on;
        gate.setReducedMotion(a.on);
        break;
      case 'ret':
        // The Return_Moment needs the audio graph to exist, so the jump channel's gain node can be found
        // when it opens. Before the first unlock the action does nothing (gd23 covers that order).
        if (ctxOf() === undefined) break;
        driver.begin(a.args, osReduced || appReduced, (ms) => {
          for (const sl of slots) if (sl.active) sl.port?.fadeOut(ms);
        });
        break;
      case 'retAbort':
        if (driver.running()) seen.add('returnAborted');
        driver.abort(a.reason);
        break;
    }
    if (osReduced || appReduced) sawReduced = true;
  };

  try {
    if (!s.soundOn) gate.setSoundEnabled(false);
    if (s.unlockAtStart) {
      unlockTarget.dispatchEvent(new Event('pointerdown'));
      await flush();
    }
    combo.forEach((haunt, i) => {
      const port = gate.open(haunt.id);
      haunt.start(s.levels[i], watched(slots[i], port.audio), port.visual, s.info);
      slots[i].port = port;
      slots[i].active = true;
    });
    await flush();
    verify();
    for (const step of s.steps) {
      await perform(step.a);
      verify();
      // scheduler.advance moves the clock AND fires due timers: ticks, fade cleanups, the Return controller.
      scheduler.advance(step.dt);
      await flush();
      verify();
    }
    expect(warnings, 'warnings from the gate, the controller or an effect').toEqual([]);
  } finally {
    driver.abort('stop');
    for (const sl of slots) {
      if (sl.active) {
        sl.haunt.stop();
        sl.port?.close();
        sl.active = false;
      }
    }
    const ctx = ctxOf();
    const built = ctx !== undefined && ctx.nodesOfKind('bufferSource').length > 0;
    tl.scenarios++;
    if (countCombo) bump(comboCounts, s.combo);
    if (combo.length === 2) tl.pairs++;
    if (peak > AUDIBLE) tl.played++;
    if (built) tl.built++;
    if (combo.some((h) => h.id === 'whispers')) {
      tl.whispersScenarios++;
      if (peak > AUDIBLE && built) tl.whispersPlayed++;
    }
    if (flags.capDropPlaying) tl.capDropPlaying++;
    if (flags.soundTogglePlaying) tl.soundTogglePlaying++;
    if (sawReduced) tl.reduced++;
    if (flags.interrupted) tl.interrupted++;
    if (flags.capDropFalling) tl.capDropWhileFalling++;
    for (const k of ['twoDrops', 'soundOffAfterDrop', 'fadePlaying', 'planInFlight'] as const) if (flags[k]) tl[k]++;
    // ghost-dread flags
    for (const sl of slots) if (sl.haunt.role === 'layer' && sl.built) seen.add(`built:${sl.haunt.id}`);
    if (seen.has('opened:ghostFigure')) seen.add('ghostReturnRan');
    if (seen.has('opened:jumpscare')) seen.add('jumpReturnRan');
    if (combo.length >= 3 && slots.some((sl) => sl.haunt.role === 'layer' && sl.built)) seen.add('layersWithLeadAndCompanion');
    for (const f of seen) if (!f.startsWith('opened:')) tl.ghost.set(f, (tl.ghost.get(f) ?? 0) + 1);
    gate.dispose();
    root.remove();
  }
}

// ------------------------------------------------------------------ tests

describe('Property 14: real adapter and real haunts stay under the cap', () => {
  const { haunts, effects } = loadRegistry();
  const combos = combosOf(haunts);
  const ensembles = ensemblesOf(haunts);
  const layers = haunts.filter(isLayer);

  it('covers each haunt alone and every ordered pair of distinct haunts', () => {
    expect(haunts.length).toBeGreaterThanOrEqual(2);
    expect(haunts.map((h) => h.id)).toEqual(expect.arrayContaining(['candle', 'whispers']));
    expect(combos.length).toBe(haunts.length + haunts.length * (haunts.length - 1));
  });

  it('the registry has the ghost-dread layers and return effects, so the suites below run them', () => {
    expect(layers.map((h) => h.id).sort()).toEqual(['breathing', 'footsteps', 'ghostFigure', 'knock']);
    expect(effects.map((e) => e.id).sort()).toEqual(['ghostFigure', 'jumpscare']);
    expect(effects.find((e) => e.id === 'jumpscare')?.jumpSound).toBe(true);
    // Every ensemble has a lead, a companion and at least one layer; all 15 layer subsets in both lead orders.
    expect(ensembles.length).toBe(2 * (2 ** layers.length - 1));
    for (const e of ensembles) {
      expect(e.slice(0, 2).every((h) => !isLayer(h))).toBe(true);
      expect(e.slice(2).length).toBeGreaterThanOrEqual(1);
    }
  });

  describe('control: the check detects a gain above the cap', () => {
    it('flags a ramp to 0.9 under a 0.4 cap and accepts a ramp to 0.4', () => {
      const { clock } = createFakeTime();
      const ctx = new FakeAudioContext({ clock });
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, 0);
      g.gain.linearRampToValueAtTime(0.9, 0.5);
      g.connect(ctx.destination);
      const times = [0, 0.25, 0.5];
      const bad = firstViolation(ctx, [g], times, () => 0.4);
      expect(bad.message).toMatch(/above the cap/);
      expect(bad.peak).toBeCloseTo(0.9, 9);
      const h = ctx.createGain();
      h.gain.setValueAtTime(0, 0);
      h.gain.linearRampToValueAtTime(0.4, 0.5);
      h.connect(ctx.destination);
      g.disconnect();
      expect(firstViolation(ctx, [h], times, () => 0.4).message).toBeNull();
    });
  });

  // Feature: haunt-feature, Property 14: Real adapter and real haunts stay under the cap
  // **Validates: Requirements 4.3, 6.2, 6.3, 6.4, 6.13, 14.5**
  it('combined gain stays under the cap in force at every instant, rises last >= 300 ms (>= 1000 ms reduced), a new cap lands within 100 ms', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb(comboPickArb(combos.length)), (s) => runScenario(combos, effects, s, tally, true)),
      { numRuns: NUM_RUNS },
    );
  }, SLOW_TEST_MS);

  // Feature: ghost-dread, Property 23 (p14 extension): the cap holds with layers alongside the lead and companion
  // **Validates: Requirements 1.7, 9.4**
  it('ensemble: lead, companion and layers together, with Return_Moments, keep the combined gain under the cap', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb(fc.constantFrom(...indexRange(0, ensembles.length))), (s) => runScenario(ensembles, effects, s, ensembleTally, false)),
      { numRuns: ENSEMBLE_RUNS },
    );
  }, SLOW_TEST_MS);

  // Runs last in this file: the tallies come from the property run above.
  it('coverage: pairs, sound produced, cap drops while playing, sound toggles, reduced motion, interruptions, with margin', () => {
    const floor = (n: number, p: number): number => Math.max(1, Math.floor(n * p - 4 * Math.sqrt(n * p * (1 - p))));
    const n = tally.scenarios;
    expect(n).toBe(NUM_RUNS);
    // P14_TALLY=<path>: append the tallies of this run to that file (vitest hides console output here).
    if (process.env.P14_TALLY) {
      const dump = (t: Tally, extra: object): string => JSON.stringify({ ...t, ghost: Object.fromEntries(t.ghost), ...extra });
      appendFileSync(process.env.P14_TALLY, `${dump(tally, { combos: [...comboCounts] })}\n${dump(ensembleTally, {})}\n`);
    }
    const pPairs = (haunts.length * (haunts.length - 1)) / combos.length;
    expect(tally.pairs, 'pairs').toBeGreaterThanOrEqual(floor(n, pPairs));
    for (let i = 0; i < combos.length; i++) expect(comboCounts.get(i) ?? 0, `combo ${combos[i].map((h) => h.id).join('+')}`).toBeGreaterThanOrEqual(floor(n, 1 / combos.length));
    expect(tally.played, 'scenarios with sound at the destination').toBeGreaterThanOrEqual(floor(n, COVER.played));
    expect(tally.whispersPlayed, 'whispers built a source and produced gain').toBeGreaterThanOrEqual(floor(tally.whispersScenarios, COVER.whispersPlayed));
    expect(tally.capDropPlaying, 'cap drops while playing').toBeGreaterThanOrEqual(floor(n, COVER.capDropPlaying));
    expect(tally.soundTogglePlaying, 'sound toggles while playing').toBeGreaterThanOrEqual(floor(n, COVER.soundTogglePlaying));
    expect(tally.reduced, 'reduced motion').toBeGreaterThanOrEqual(floor(n, COVER.reduced));
    expect(tally.interrupted, 'context interruptions').toBeGreaterThanOrEqual(floor(n, COVER.interrupted));
    expect(tally.capDropWhileFalling, 'cap drops while a channel is falling').toBeGreaterThanOrEqual(floor(n, COVER.capDropWhileFalling));
    expect(tally.twoDrops, 'two cap drops within 50 ms').toBeGreaterThanOrEqual(floor(n, COVER.twoDrops));
    expect(tally.soundOffAfterDrop, 'sound off right after a cap drop').toBeGreaterThanOrEqual(floor(n, COVER.soundOffAfterDrop));
    expect(tally.fadePlaying, 'fadeOut or fadeOutAll while playing').toBeGreaterThanOrEqual(floor(n, COVER.fadePlaying));
    expect(tally.planInFlight, 'plans while a ramp is in flight').toBeGreaterThanOrEqual(floor(n, COVER.planInFlight));
    // Measured 418.9 rising ramps per run (SD 23.7) over 40 runs: the floor of n = 300 is 5 SD below.
    expect(tally.risesChecked, 'rising ramps checked').toBeGreaterThanOrEqual(n);
  });

  // Runs last: the tallies of the ghost-dread flags, in the base property and in the ensemble property.
  it('coverage: each layer started, each return effect run, the jump channel heard, with margin', () => {
    const floor = (n: number, p: number): number => Math.max(1, Math.floor(n * p - 4 * Math.sqrt(n * p * (1 - p))));
    expect(ensembleTally.scenarios).toBe(ENSEMBLE_RUNS);
    for (const [name, tl, share] of [['base', tally, GHOST_BASE], ['ensemble', ensembleTally, GHOST_ENSEMBLE]] as const) {
      const n = tl.scenarios;
      // ghostFigure makes no sound, so it never calls `whenReady`: its flag is `ghostDrawn` (below).
      for (const h of layers.filter((x) => x.id !== 'ghostFigure')) {
        expect(tl.ghost.get(`built:${h.id}`) ?? 0, `${name}: layer ${h.id} built its sources`).toBeGreaterThanOrEqual(floor(n, share[`built:${h.id}`] ?? share.built));
      }
      const flagsHere: readonly string[] = name === 'base' ? GHOST_FLAGS : [...GHOST_FLAGS, ...ENSEMBLE_FLAGS];
      for (const f of flagsHere) expect(tl.ghost.get(f) ?? 0, `${name}: ${f}`).toBeGreaterThanOrEqual(floor(n, share[f]));
      expect(tl.jumpRisesChecked, `${name}: rising ramps of jump channels checked`).toBeGreaterThanOrEqual(1);
    }
  });
});

/**
 * Expected shares of scenarios, from tallies measured over 40 runs of 300 scenarios (see docs/BUILD_LOG.md).
 * `floor` puts each check 4 binomial SD below the share. Shares near 0.03 give a floor of 1: at least once.
 */
const COVER = {
  played: 0.51, whispersPlayed: 0.7, capDropPlaying: 0.18, soundTogglePlaying: 0.19, reduced: 0.46, interrupted: 0.15,
  capDropWhileFalling: 0.11, twoDrops: 0.035, soundOffAfterDrop: 0.03, fadePlaying: 0.15, planInFlight: 0.5,
};

/**
 * Expected shares of scenarios for the ghost-dread flags, from tallies measured over 10 batches of the base
 * (700) and ensemble (300) properties. `floor` puts each check 4 binomial SD below the share. `built` is the
 * share for every sound layer (footsteps, breathing, knock); ghostFigure makes no sound and is `ghostDrawn`.
 * The knock's `minLevel` 3 is an engine rule; this harness starts every layer at the scenario's level.
 */
type ShareMap = Record<string, number>;
const GHOST_BASE: ShareMap = {
  built: 0.25, ghostDrawn: 0.24, ghostReturnRan: 0.6, jumpReturnRan: 0.38, jumpPlaying: 0.12, jumpReducedRan: 0.14, returnAborted: 0.06,
};
const GHOST_ENSEMBLE: ShareMap = {
  built: 0.44, ghostDrawn: 0.4, ghostReturnRan: 0.58, jumpReturnRan: 0.4, jumpPlaying: 0.12, jumpReducedRan: 0.14, returnAborted: 0.06,
  layersWithLeadAndCompanion: 0.8,
};
