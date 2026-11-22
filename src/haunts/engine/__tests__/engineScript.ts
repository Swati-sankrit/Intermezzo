/**
 * Script generator and runner for Property 20 (engine.p20.prop.test.ts).
 *
 * The runner drives the REAL `createHauntEngine` with fake haunts, a fake gate, a fake clock and
 * a fake scheduler, and checks the Property 20 clauses after every step. The model below is kept
 * outside the engine: it only reads `getState()` and the fakes' recorded calls.
 *
 * `getState().running` lists haunts started and not yet stopped, so it includes retiring haunts.
 * Retiring haunts are allowed only inside a window: 800 ms after `present` or after gentle turns
 * on (for the companion), and 50 ms after a new look-away begins.
 */
import fc from 'fast-check';
import { createHauntEngine } from '../engine';
import { createSettingsStore, KEYS } from '../settings';
import type { AttentionSignalLike, EngineState } from '../types';
import { rollArb } from './arbitraries';
import { createFakeGate, createFakeHaunt, createFakeStorage, createFakeTime } from './fakes';
import type { FakeHaunt } from './fakes';

export const FADE_WINDOW_MS = 800;
export const FLUSH_WINDOW_MS = 50;
const START_TIME = 1_000_000;

// ------------------------------------------------------------------ script

export type Op =
  | { readonly k: 'present' }
  | { readonly k: 'away' }
  | { readonly k: 'advance'; readonly ms: number }
  | { readonly k: 'fire' }
  | { readonly k: 'gentle'; readonly on: boolean }
  | { readonly k: 'sound'; readonly on: boolean }
  | { readonly k: 'arm' };

export interface HauntSpec {
  /** Call number n (1-based) throws when `pattern[(n - 1) % length]` is true. */
  readonly start: readonly boolean[];
  readonly setLevel: readonly boolean[];
  readonly stop: readonly boolean[];
}

export interface Script {
  readonly haunts: readonly HauntSpec[];
  readonly rolls: readonly number[];
  readonly initial: {
    readonly signal: 'present' | 'away' | null;
    /** The signal delivered at subscribe time is stamped this many ms in the past. */
    readonly ageMs: number;
    readonly gentle: boolean;
    readonly armed: boolean;
    readonly sound: boolean;
  };
  readonly ops: readonly Op[];
  /** Index into `ops` before which `engine.stop()` is called; null means only at the end. */
  readonly stopAt: number | null;
}

const patternArb = (throwWeight: number, okWeight: number): fc.Arbitrary<boolean[]> =>
  fc.array(
    fc.oneof(
      { weight: throwWeight, arbitrary: fc.constant(true) },
      { weight: okWeight, arbitrary: fc.constant(false) },
    ),
    { minLength: 1, maxLength: 6 },
  );

const hauntSpecArb: fc.Arbitrary<HauntSpec> = fc.record({
  start: patternArb(1, 9),
  setLevel: patternArb(1, 9),
  stop: patternArb(4, 6),
});

const msArb = fc.oneof(
  fc.integer({ min: 0, max: 60 }),
  fc.integer({ min: 61, max: 900 }),
  fc.integer({ min: 901, max: 7000 }),
  fc.integer({ min: 7001, max: 15_000 }),
  fc.constantFrom(1, 49, 50, 51, 599, 600, 601, 799, 800, 801, 4999, 5000, 5001, 11_999, 12_000),
);

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<Op>({ k: 'present' }) },
  { weight: 3, arbitrary: fc.constant<Op>({ k: 'away' }) },
  { weight: 5, arbitrary: msArb.map((ms): Op => ({ k: 'advance', ms })) },
  { weight: 3, arbitrary: fc.constant<Op>({ k: 'fire' }) },
  { weight: 2, arbitrary: fc.boolean().map((on): Op => ({ k: 'gentle', on })) },
  { weight: 1, arbitrary: fc.boolean().map((on): Op => ({ k: 'sound', on })) },
  { weight: 1, arbitrary: fc.constant<Op>({ k: 'arm' }) },
);

const away: Op = { k: 'away' };
const present: Op = { k: 'present' };
const gentleOn: Op = { k: 'gentle', on: true };
const gentleOff: Op = { k: 'gentle', on: false };
const advance = (ms: number): Op => ({ k: 'advance', ms });

/** Short runs of ops that reach the deep states (level 3, gentle at level 3, fades) more often. */
const macroArb: fc.Arbitrary<Op[]> = fc.oneof(
  fc.integer({ min: 0, max: 900 }).map((ms) => [away, advance(12_000), gentleOn, advance(ms), present]),
  fc.integer({ min: 0, max: 900 }).map((ms) => [away, advance(12_000), gentleOn, advance(ms), gentleOff]),
  fc.integer({ min: 0, max: 700 }).map((ms) => [away, advance(12_000), present, advance(ms), away]),
  fc.integer({ min: 0, max: 700 }).map((ms) => [away, advance(5000), advance(ms), present, advance(ms), away]),
  fc.constant<Op[]>([{ k: 'arm' }, away, advance(13_000)]),
);

const chunkArb: fc.Arbitrary<Op[]> = fc.oneof(
  { weight: 7, arbitrary: opArb.map((o) => [o]) },
  { weight: 3, arbitrary: macroArb },
);

export const scriptArb: fc.Arbitrary<Script> = fc.record({
  haunts: fc
    .oneof(
      { weight: 1, arbitrary: fc.constant(0) },
      { weight: 2, arbitrary: fc.constant(1) },
      { weight: 4, arbitrary: fc.constantFrom(2, 3) },
      { weight: 1, arbitrary: fc.constant(4) },
    )
    .chain((n) => fc.array(hauntSpecArb, { minLength: n, maxLength: n })),
  rolls: fc.array(rollArb, { minLength: 2, maxLength: 8 }),
  initial: fc.record({
    signal: fc.oneof(
      { weight: 1, arbitrary: fc.constant<'present' | 'away' | null>(null) },
      { weight: 1, arbitrary: fc.constant<'present' | 'away' | null>('present') },
      { weight: 3, arbitrary: fc.constant<'present' | 'away' | null>('away') },
    ),
    ageMs: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 20_000 })),
    gentle: fc.oneof({ weight: 3, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
    armed: fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, { weight: 2, arbitrary: fc.constant(false) }),
    sound: fc.boolean(),
  }),
  ops: fc.array(chunkArb, { minLength: 3, maxLength: 20, size: 'large' }).map((chunks) => chunks.flat()),
  stopAt: fc.oneof(
    { weight: 3, arbitrary: fc.constant<number | null>(null) },
    { weight: 1, arbitrary: fc.nat(40) },
  ),
});

// ------------------------------------------------------------------ stats

/** What a script exercised. Used by the coverage test. */
export interface ScriptStats {
  level3WithCompanion: boolean;
  gentleOnAtLevel3: boolean;
  gentleOffRestoresLevel3: boolean;
  presentDuringFade: boolean;
  newAwayDuringFade: boolean;
  throwingStop: boolean;
  throwingStartOrSetLevel: boolean;
  signalWhileNotArmed: boolean;
  armedWhileAway: boolean;
  engineStopMidLookAway: boolean;
  opsAfterEngineStop: boolean;
}

// ------------------------------------------------------------------ runner

function ok(cond: boolean, msg: () => string): void {
  if (!cond) throw new Error(`Property 20 violated: ${msg()}`);
}

interface Retiree {
  readonly since: number;
  flushBy: number | null;
}

type OpKind = Op['k'] | 'init' | 'gentleOn' | 'engineStop';

const rule = (pattern: readonly boolean[]) => (n: number) => pattern[(n - 1) % pattern.length];

/** Runs one script against the real engine and throws on the first violated clause. */
export function runScript(script: Script): ScriptStats {
  const { clock, scheduler } = createFakeTime(START_TIME);
  const init = script.initial;
  const store = createSettingsStore(
    createFakeStorage({
      [KEYS.sound]: String(init.sound),
      [KEYS.gentle]: String(init.gentle),
      [KEYS.noticeSeen]: String(init.armed),
    }),
  );
  let settingsSubs = 0;
  const settings = {
    get: store.get,
    set: store.set,
    subscribe(cb: () => void) {
      settingsSubs++;
      const off = store.subscribe(cb);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        settingsSubs--;
        off();
      };
    },
  };
  const listeners = new Set<(s: AttentionSignalLike) => void>();
  const emit = (value: 'present' | 'away') => {
    for (const cb of [...listeners]) cb({ value, timestamp: clock.now() });
  };

  const haunts: FakeHaunt[] = script.haunts.map((spec, i) =>
    createFakeHaunt(`h${i}`, { start: rule(spec.start), setLevel: rule(spec.setLevel), stop: rule(spec.stop) }),
  );
  const hauntById = new Map(haunts.map((h) => [h.id, h] as const));
  const gate = createFakeGate();
  let draws = 0;
  const engine = createHauntEngine({
    subscribeSignal(cb) {
      listeners.add(cb);
      if (init.signal !== null) cb({ value: init.signal, timestamp: clock.now() - init.ageMs });
      return () => {
        listeners.delete(cb);
      };
    },
    haunts,
    gate,
    settings,
    clock,
    scheduler,
    random: () => script.rolls[draws++ % script.rolls.length],
    warn: () => {},
  });

  const stats: ScriptStats = {
    level3WithCompanion: false,
    gentleOnAtLevel3: false,
    gentleOffRestoresLevel3: false,
    presentDuringFade: false,
    newAwayDuringFade: false,
    throwingStop: false,
    throwingStartOrSetLevel: false,
    signalWhileNotArmed: false,
    armedWhileAway: false,
    engineStopMidLookAway: false,
    opsAfterEngineStop: false,
  };

  // Model, kept outside the engine.
  let signal: 'present' | 'away' | null = null;
  let presentAt = clock.now();
  let armed = init.armed;
  let gentle = init.gentle;
  let leadOfLookAway: string | null = null;
  let companionOfLookAway: string | null = null;
  let stopped = false;
  let startCountsAtStop: number[] = [];
  let portsAtStop = 0;
  const retiring = new Map<string, Retiree>();
  const keyOf = (id: string) => `${id}#${hauntById.get(id)!.startCount}`;

  function checkStopped(): void {
    const st = engine.getState();
    ok(st.level === 0 && st.leadId === null && st.companionId === null, () => 'state not calm after engine.stop()');
    ok(st.running.length === 0, () => `running after engine.stop(): ${st.running.join(',')}`);
    ok(haunts.every((h) => h.openCount === 0), () => 'a haunt is still started after engine.stop()');
    ok(gate.openPorts().length === 0, () => 'a port is still open after engine.stop()');
    ok(scheduler.pendingCount === 0, () => `${scheduler.pendingCount} timer(s) pending after engine.stop()`);
    ok(listeners.size === 0, () => 'signal subscription still present after engine.stop()');
    ok(settingsSubs === 0, () => 'settings subscription still present after engine.stop()');
    ok(
      haunts.every((h, i) => h.startCount === startCountsAtStop[i]) && gate.ports.length === portsAtStop,
      () => 'a haunt was started after engine.stop()',
    );
  }

  function check(op: OpKind, before: EngineState, valueChanged: boolean): void {
    if (stopped) {
      checkStopped();
      return;
    }
    const st = engine.getState();
    const now = clock.now();
    const at = `after ${op} at t=${now - START_TIME}`;

    // The running set is exactly what the haunts report as started and not stopped.
    for (const h of haunts) {
      ok(h.openCount === 0 || h.openCount === 1, () => `${at}: ${h.id} started ${h.openCount} times without a stop`);
      const openPorts = gate.openPorts().filter((p) => p.hauntId === h.id).length;
      ok(openPorts === h.openCount, () => `${at}: ${h.id} has ${openPorts} open ports and ${h.openCount} starts open`);
    }
    const open = haunts.filter((h) => h.openCount > 0).map((h) => h.id).sort();
    ok(JSON.stringify([...st.running].sort()) === JSON.stringify(open), () => `${at}: running ${st.running} vs ${open}`);

    ok(Number.isInteger(st.level) && st.level >= 0 && st.level <= 3, () => `${at}: level ${st.level} outside [0, 3]`);
    ok(st.level > 0 || (st.leadId === null && st.companionId === null), () => `${at}: level 0 with a lead or companion`);
    if (!armed) {
      ok(st.level === 0 && st.running.length === 0, () => `${at}: not armed but level ${st.level}, running ${st.running}`);
    }
    if (gentle) {
      ok(st.level <= 1 && st.companionId === null, () => `${at}: gentle on but level ${st.level}, companion ${st.companionId}`);
    }
    if (signal === 'present') {
      ok(st.level <= before.level, () => `${at}: level rose from ${before.level} to ${st.level} while present`);
      if (now - presentAt >= FADE_WINDOW_MS) {
        ok(st.running.length === 0, () => `${at}: running ${st.running} ${now - presentAt} ms after present`);
      }
    }

    // Lead and companion belong to the current look-away and do not change within it.
    if (st.leadId !== null) {
      ok(signal === 'away' && hauntById.has(st.leadId), () => `${at}: lead ${st.leadId} outside a look-away`);
      if (leadOfLookAway === null) leadOfLookAway = st.leadId;
      ok(leadOfLookAway === st.leadId, () => `${at}: lead changed from ${leadOfLookAway} to ${st.leadId} within a look-away`);
    }
    if (st.companionId !== null) {
      ok(st.companionId !== st.leadId && hauntById.has(st.companionId), () => `${at}: bad companion ${st.companionId}`);
      if (companionOfLookAway === null) companionOfLookAway = st.companionId;
      ok(companionOfLookAway === st.companionId, () => `${at}: companion changed within a look-away`);
    }

    // Retiring haunts (running, but neither lead nor companion) only inside their window.
    const wanted = new Set([st.leadId, st.companionId]);
    const live = new Set<string>();
    for (const id of st.running) {
      const key = keyOf(id);
      live.add(key);
      let r = retiring.get(key);
      if (!r && !wanted.has(id)) {
        const explained = (op === 'present' && valueChanged) || (op === 'gentleOn' && id === before.companionId);
        ok(explained, () => `${at}: ${id} is running but is neither lead nor companion, and nothing retired it`);
        r = { since: now, flushBy: null };
        retiring.set(key, r);
      }
      if (r) {
        ok(now <= r.since + FADE_WINDOW_MS, () => `${at}: ${id} still running ${now - r.since} ms after it began to retire`);
        ok(r.flushBy === null || now <= r.flushBy, () => `${at}: ${id} still running ${now - r.flushBy!} ms past the new look-away flush`);
      }
    }
    for (const key of [...retiring.keys()]) if (!live.has(key)) retiring.delete(key);

    if (st.level === 3 && st.companionId !== null) stats.level3WithCompanion = true;
  }

  function step(op: OpKind, act: () => void): void {
    const before = engine.getState();
    const hadRetiring = retiring.size > 0;
    const prevSignal = signal;
    act();
    const valueChanged = signal !== prevSignal;
    if (valueChanged && signal === 'present' && hadRetiring) stats.presentDuringFade = true;
    if (valueChanged && signal === 'away' && hadRetiring) stats.newAwayDuringFade = true;
    check(op, before, valueChanged);
  }

  /** Model update for a delivered signal, then delivery. */
  function deliver(value: 'present' | 'away'): void {
    if (!stopped && signal !== value) {
      signal = value;
      if (!armed) stats.signalWhileNotArmed = true;
      if (value === 'present') presentAt = clock.now();
      else {
        leadOfLookAway = null;
        companionOfLookAway = null;
        // A new look-away ends every fade within the flush window.
        for (const r of retiring.values()) r.flushBy = clock.now() + FLUSH_WINDOW_MS;
      }
    }
    emit(value);
  }

  function stopEngine(): void {
    if (!stopped && signal === 'away' && armed && engine.getState().running.length > 0) {
      stats.engineStopMidLookAway = true;
    }
    step('engineStop', () => {
      engine.stop();
      if (!stopped) {
        stopped = true;
        startCountsAtStop = haunts.map((h) => h.startCount);
        portsAtStop = gate.ports.length;
      }
    });
  }

  // Start: the signal delivered at subscribe time is the first event.
  if (init.signal !== null) {
    signal = init.signal;
    if (!armed) stats.signalWhileNotArmed = true;
    if (signal === 'present') presentAt = clock.now();
  }
  const zero: EngineState = { level: 0, leadId: null, companionId: null, running: [] };
  engine.start();
  check('init', zero, init.signal !== null);
  ok(listeners.size === 1 && settingsSubs === 1, () => 'engine did not subscribe once to the signal and to the settings');

  script.ops.forEach((op, i) => {
    if (script.stopAt !== null && i === script.stopAt % (script.ops.length + 1)) stopEngine();
    if (stopped) stats.opsAfterEngineStop = true;
    const before = engine.getState();
    switch (op.k) {
      case 'present':
      case 'away':
        step(op.k, () => deliver(op.k as 'present' | 'away'));
        break;
      case 'advance':
        step('advance', () => scheduler.advance(op.ms));
        break;
      case 'fire':
        step('fire', () => void scheduler.fireNext());
        break;
      case 'sound':
        step('sound', () => store.set({ sound: op.on }));
        break;
      case 'arm':
        step('arm', () => {
          if (!armed && signal === 'away' && haunts.length > 0 && !stopped) stats.armedWhileAway = true;
          if (!stopped) armed = true;
          store.set({ noticeSeen: true });
        });
        break;
      case 'gentle': {
        const wasGentle = gentle;
        const kind: OpKind = op.on && !wasGentle ? 'gentleOn' : 'gentle';
        step(kind, () => {
          if (!stopped && op.on && before.level === 3 && before.companionId !== null) stats.gentleOnAtLevel3 = true;
          if (!stopped) gentle = op.on;
          store.set({ gentle: op.on });
        });
        if (!stopped && wasGentle && !op.on && engine.getState().level === 3) stats.gentleOffRestoresLevel3 = true;
        break;
      }
    }
  });

  // Let a final fade finish, then stop (a no-op if the script already stopped it).
  if (!stopped && signal === 'present') step('advance', () => scheduler.advance(FADE_WINDOW_MS));
  if (!stopped) stopEngine();

  for (const [i, h] of haunts.entries()) {
    let isOpen = false;
    for (const c of h.calls) {
      if (c.type === 'start') {
        ok(!isOpen, () => `${h.id} started twice without a stop`);
        isOpen = true;
      } else {
        ok(isOpen, () => `${h.id} got ${c.type} while not started`);
        if (c.type === 'stop') isOpen = false;
      }
    }
    ok(!isOpen && h.startCount === h.stopCount, () => `${h.id}: ${h.startCount} starts, ${h.stopCount} stops`);
    ok(gate.ports.filter((p) => p.hauntId === h.id).length === h.startCount, () => `${h.id}: ports and starts differ`);
    const spec = script.haunts[i];
    for (let n = 1; n <= h.stopCount; n++) if (rule(spec.stop)(n)) stats.throwingStop = true;
    for (let n = 1; n <= h.startCount; n++) if (rule(spec.start)(n)) stats.throwingStartOrSetLevel = true;
    const levelCalls = h.calls.filter((c) => c.type === 'setLevel').length;
    for (let n = 1; n <= levelCalls; n++) if (rule(spec.setLevel)(n)) stats.throwingStartOrSetLevel = true;
  }
  ok(gate.ports.every((p) => p.closed), () => 'a port was never closed');
  return stats;
}
