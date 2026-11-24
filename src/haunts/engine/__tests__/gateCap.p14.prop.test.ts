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
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { parseVolumeCap } from '../gate/plan';
import { createReducedMotion } from '../gate/reducedMotion';
import { loadHaunts } from '../registry';
import { KEYS } from '../settings';
import type { Gate, GatePort, Haunt, HauntLevel } from '../types';
import { fadeMsArb } from './arbitraries';
import {
  FakeAudioContext, type FakeAudioNode, type FakeAudioState, type FakeGainNode,
  createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
} from './fakes';

const NUM_RUNS = 300;
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
  | { k: 'reducedApp'; on: boolean };

interface Step { readonly a: Action; readonly dt: number }

interface Scenario {
  readonly combo: number;
  readonly levels: readonly [Level, Level];
  readonly capText: string | null;
  readonly soundOn: boolean;
  readonly osReduced: boolean;
  readonly unlockAtStart: boolean;
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
const dtArb = fc.constantFrom(0, 0, 10, 30, 49, 51, 80, 99, 101, 150, 299, 301, 500, 1000, 1500);

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
);

/** Integers from `from` up to but not including `to`. */
function indexRange(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

function scenarioArb(comboCount: number): fc.Arbitrary<Scenario> {
  return fc.record({
    // Combos are [singles..., ordered pairs...], so there are sqrt(comboCount) singles. fc.integer is biased
    // toward its lower bound, which favoured the singles; constantFrom is uniform. Pairs are drawn 85% of the
    // time so the pair share has a wide margin over its floor (0.75 expected) and every combo still shows up.
    combo: fc.oneof(
      { weight: 3, arbitrary: fc.constantFrom(...indexRange(0, Math.round(Math.sqrt(comboCount)))) },
      { weight: 17, arbitrary: fc.constantFrom(...indexRange(Math.round(Math.sqrt(comboCount)), comboCount)) },
    ),
    levels: fc.tuple(levelArb, levelArb),
    capText: capTextArb,
    soundOn: fc.oneof({ weight: 9, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
    osReduced: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
    unlockAtStart: fc.oneof({ weight: 9, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
    steps: fc.array(fc.record({ a: actionArb, dt: dtArb }), { minLength: 8, maxLength: 16 }),
  });
}

/** Each haunt alone, then every ordered pair of distinct haunts. */
function combosOf(haunts: readonly Haunt[]): Haunt[][] {
  const out: Haunt[][] = haunts.map((h) => [h]);
  for (const a of haunts) for (const b of haunts) if (a !== b) out.push([a, b]);
  return out;
}

// ------------------------------------------------------------------ tallies

const tally = {
  scenarios: 0, pairs: 0, played: 0, built: 0, capDropPlaying: 0, soundTogglePlaying: 0, reduced: 0, interrupted: 0,
  capDropWhileFalling: 0, risesChecked: 0, windowChecks: 0, whispersPlayed: 0, whispersScenarios: 0,
  twoDrops: 0, soundOffAfterDrop: 0, fadePlaying: 0, planInFlight: 0,
};
const comboCounts = new Map<number, number>();
const bump = (m: Map<number, number>, k: number): void => void m.set(k, (m.get(k) ?? 0) + 1);

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

interface Slot { haunt: Haunt; port: GatePort | null; active: boolean }

async function runScenario(combos: readonly Haunt[][], s: Scenario): Promise<void> {
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
  const gate: Gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlockTarget },
    hosts: { root, left, right },
    storage,
    storageEvents: events.target,
    reducedMotion: createReducedMotion(mm.matchMedia),
    scheduler,
  });
  const slots: Slot[] = combo.map((haunt) => ({ haunt, port: null, active: false }));

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
      tally.windowChecks++;
      expect(combinedAt(ctx, channels, t), `combined gain 100 ms after the cap change at ${c.t}s`).toBeLessThanOrEqual(allowedAt(hist, t) + EPS);
    }

    // Clause: every rising ramp lasts at least 300 ms (1000 ms under reduced motion).
    const reduced = osReduced || appReduced;
    for (let i = mark; i < ctx.automation.length; i++) {
      const c = ctx.automation[i];
      if (c.type !== 'linearRampToValueAtTime' || !c.param.label.startsWith('gain#')) continue;
      const calls = c.param.calls;
      const prev = calls[calls.indexOf(c) - 1];
      expect(prev?.type, `${c.param.label}: a ramp is anchored by setValueAtTime`).toBe('setValueAtTime');
      if ((c.value as number) > (prev.value as number) + 1e-12) {
        tally.risesChecked++;
        expect(c.effectiveTime - c.atContextTime, `${c.param.label} rise ${prev.value} to ${c.value}`).toBeGreaterThanOrEqual((reduced ? 1 : 0.3) - EPS);
      }
    }
    mark = ctx.automation.length;
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
          sl.haunt.start(a.level, sl.port.audio, sl.port.visual);
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
      haunt.start(s.levels[i], port.audio, port.visual);
      slots[i].port = port;
      slots[i].active = true;
    });
    await flush();
    verify();
    for (const step of s.steps) {
      await perform(step.a);
      verify();
      clock.advance(step.dt);
      await flush();
      verify();
    }
  } finally {
    for (const sl of slots) {
      if (sl.active) {
        sl.haunt.stop();
        sl.port?.close();
        sl.active = false;
      }
    }
    const ctx = ctxOf();
    const built = ctx !== undefined && ctx.nodesOfKind('bufferSource').length > 0;
    tally.scenarios++;
    bump(comboCounts, s.combo);
    if (combo.length === 2) tally.pairs++;
    if (peak > AUDIBLE) tally.played++;
    if (built) tally.built++;
    if (combo.some((h) => h.id === 'whispers')) {
      tally.whispersScenarios++;
      if (peak > AUDIBLE && built) tally.whispersPlayed++;
    }
    if (flags.capDropPlaying) tally.capDropPlaying++;
    if (flags.soundTogglePlaying) tally.soundTogglePlaying++;
    if (sawReduced) tally.reduced++;
    if (flags.interrupted) tally.interrupted++;
    if (flags.capDropFalling) tally.capDropWhileFalling++;
    for (const k of ['twoDrops', 'soundOffAfterDrop', 'fadePlaying', 'planInFlight'] as const) if (flags[k]) tally[k]++;
    gate.dispose();
    root.remove();
  }
}

// ------------------------------------------------------------------ tests

describe('Property 14: real adapter and real haunts stay under the cap', () => {
  const haunts = loadHaunts();
  const combos = combosOf(haunts);

  it('covers each haunt alone and every ordered pair of distinct haunts', () => {
    expect(haunts.length).toBeGreaterThanOrEqual(2);
    expect(haunts.map((h) => h.id)).toEqual(expect.arrayContaining(['candle', 'whispers']));
    expect(combos.length).toBe(haunts.length + haunts.length * (haunts.length - 1));
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
    await fc.assert(fc.asyncProperty(scenarioArb(combos.length), (s) => runScenario(combos, s)), { numRuns: NUM_RUNS });
  });

  // Runs last in this file: the tallies come from the property run above.
  it('coverage: pairs, sound produced, cap drops while playing, sound toggles, reduced motion, interruptions, with margin', () => {
    const floor = (n: number, p: number): number => Math.max(1, Math.floor(n * p - 4 * Math.sqrt(n * p * (1 - p))));
    const n = tally.scenarios;
    expect(n).toBe(NUM_RUNS);
    if (process.env.P14_TALLY) console.info('P14 tally', JSON.stringify({ ...tally, combos: [...comboCounts] }));
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
});

/**
 * Expected shares of scenarios, from tallies measured over 40 runs of 300 scenarios (see docs/BUILD_LOG.md).
 * `floor` puts each check 4 binomial SD below the share. Shares near 0.03 give a floor of 1: at least once.
 */
const COVER = {
  played: 0.51, whispersPlayed: 0.7, capDropPlaying: 0.18, soundTogglePlaying: 0.19, reduced: 0.46, interrupted: 0.15,
  capDropWhileFalling: 0.11, twoDrops: 0.035, soundOffAfterDrop: 0.03, fadePlaying: 0.15, planInFlight: 0.5,
};
