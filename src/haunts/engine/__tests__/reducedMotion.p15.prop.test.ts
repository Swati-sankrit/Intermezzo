/**
 * Property 15 over every real haunt (`loadHaunts()`). Real `createGate`, real audio and visual
 * adapters, a jsdom stage host, and the fake AudioContext from ./fakes.ts. A MutationObserver on
 * the stage root records every class and style change, so a class that appears and disappears
 * inside one step is still seen (through each record's old value).
 *
 * Rates are read back from the stage: `is-guttering` + `--gutter-period` and every `.is-sweeping`
 * layer + `--sweep-period`, as 1000 / period flash-equivalents per second.
 */
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import { loadHaunts } from '../registry';
import { KEYS } from '../settings';
import type { Gate, GatePort, Haunt, HauntLevel } from '../types';
import { fadeMsArb } from './arbitraries';
import {
  type FakeAudioContext, createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
} from './fakes';

const NUM_RUNS = 200;
const EPS = 1e-9;

// ------------------------------------------------------------------ tripwire

type AnimateFn = (...args: unknown[]) => unknown;
const proto = Element.prototype as unknown as { animate?: AnimateFn };
let hadAnimate = false;
let originalAnimate: AnimateFn | undefined;
let animateCalls = 0;

beforeAll(() => {
  hadAnimate = 'animate' in proto;
  originalAnimate = proto.animate;
  proto.animate = () => {
    animateCalls += 1;
    return undefined;
  };
});
afterAll(() => {
  if (hadAnimate) proto.animate = originalAnimate;
  else delete proto.animate;
});

// -------------------------------------------------------------------- tallies

const exercised = new Map<string, number>();
const tally = { scenarios: 0, reducedScenarios: 0, initialOn: 0, toggled: 0, toggledOs: 0, toggledApp: 0, toggledActive: 0 };
const bump = (key: string): void => void exercised.set(key, (exercised.get(key) ?? 0) + 1);

// ------------------------------------------------------------------ scenarios

type Level = HauntLevel;
type RmMode = 'initialOs' | 'initialApp' | 'midrunOs' | 'midrunApp' | 'off';

interface Scenario {
  readonly pick: number;
  readonly startLevel: Level;
  readonly changes: readonly Level[];
  readonly fadeOutMs: number | undefined | null;
  readonly mode: RmMode;
  readonly toggleRoll: number;
}

type Step =
  | { kind: 'start'; level: Level }
  | { kind: 'setLevel'; level: Level }
  | { kind: 'fadeOut'; ms: number | undefined }
  | { kind: 'stop' }
  | { kind: 'toggle' };

/** Uniform in [0, 1). fc.double is biased to 0 and tiny values, which put every toggle before the haunt started. */
const rollArb = fc.integer({ min: 0, max: 999_999 }).map((n) => n / 1_000_000);
const levelArb = fc.constantFrom<Level>(1, 2, 3);
const scenarioArb = (modes: readonly RmMode[]): fc.Arbitrary<Scenario> =>
  fc.record({
    pick: rollArb,
    startLevel: levelArb,
    changes: fc.array(levelArb, { maxLength: 6 }),
    fadeOutMs: fc.oneof(fc.constant(null), fadeMsArb),
    mode: fc.constantFrom(...modes),
    toggleRoll: rollArb,
  });

function buildSteps(s: Scenario): Step[] {
  const steps: Step[] = [{ kind: 'start', level: s.startLevel }, ...s.changes.map((level) => ({ kind: 'setLevel' as const, level }))];
  if (s.fadeOutMs !== null) steps.push({ kind: 'fadeOut', ms: s.fadeOutMs });
  steps.push({ kind: 'stop' });
  if (s.mode === 'midrunOs' || s.mode === 'midrunApp') {
    steps.splice(Math.floor(s.toggleRoll * (steps.length + 1)), 0, { kind: 'toggle' });
  }
  return steps;
}

// -------------------------------------------------------------------- reading

const num = (style: string, prop: string): number => {
  const m = new RegExp(`${prop}:\\s*([^;]+)`).exec(style);
  return m === null ? Number.NaN : Number.parseFloat(m[1]);
};

function flashRate(root: HTMLElement): number {
  let sum = 0;
  if (root.classList.contains('is-guttering')) sum += 1000 / Number.parseFloat(root.style.getPropertyValue('--gutter-period'));
  for (const el of root.querySelectorAll<HTMLElement>('.is-sweeping')) {
    sum += 1000 / Number.parseFloat(el.style.getPropertyValue('--sweep-period'));
  }
  return sum;
}

function motionClasses(value: string | null): boolean {
  return value !== null && /is-sweeping|is-guttering/.test(value);
}

/** Style states of one element across a step: every old value, then the current one. */
function styleStates(target: Element, recs: readonly MutationRecord[]): string[] {
  const olds = recs.filter((r) => r.type === 'attributes' && r.attributeName === 'style' && r.target === target).map((r) => r.oldValue ?? '');
  return olds.length === 0 ? [] : [...olds, target.getAttribute('style') ?? ''];
}

/** Rises need a fade-in of at least 1000 ms and falls a fade-out of at most 800 ms. */
function checkFades(states: readonly string[], levelProp: string, durProp: string, what: string): void {
  for (let i = 0; i + 1 < states.length; i++) {
    const before = num(states[i], levelProp);
    const after = num(states[i + 1], levelProp);
    const a = Number.isNaN(before) ? 0 : before;
    const b = Number.isNaN(after) ? 0 : after;
    const dur = num(states[i + 1], durProp);
    if (b > a + 1e-12) expect(dur, `${what} fade-in (${a} to ${b})`).toBeGreaterThanOrEqual(1000);
    else if (b < a - 1e-12) expect(dur, `${what} fade-out (${a} to ${b})`).toBeLessThanOrEqual(800);
  }
}

function checkAudioRamps(ctx: FakeAudioContext, from: number): void {
  for (let i = from; i < ctx.automation.length; i++) {
    const c = ctx.automation[i];
    if (c.type !== 'linearRampToValueAtTime' || c.value === undefined) continue;
    const prior = ctx.automation.slice(0, i).filter((x) => x.param === c.param && x.value !== undefined).pop();
    const previous = prior?.value ?? c.param.defaultValue;
    if (c.value > previous + 1e-12) expect(c.effectiveTime - c.atContextTime, `${c.param.label} rise`).toBeGreaterThanOrEqual(1 - EPS);
  }
}

// ---------------------------------------------------------------------- harness

interface Env {
  readonly gate: Gate;
  readonly ctx: FakeAudioContext;
  readonly root: HTMLElement;
  readonly observer: MutationObserver;
  readonly clock: { advance(ms: number): void };
  setOs(on: boolean): void;
  close(): void;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function makeEnv(osReduced: boolean): Promise<Env> {
  const { clock, scheduler } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const unlockTarget = new EventTarget();
  const mm = createFakeMatchMedia(osReduced);
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  document.body.append(root);
  const gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlockTarget },
    hosts: { root, left, right },
    storage: createFakeStorage({ [KEYS.volumeCap]: '1' }),
    storageEvents: null,
    reducedMotion: createReducedMotion(mm.matchMedia),
    scheduler,
  });
  unlockTarget.dispatchEvent(new Event('pointerdown'));
  await flush();
  const ctx = factory.contexts[0];
  if (ctx === undefined || ctx.state !== 'running') throw new Error('audio did not unlock in the test setup');
  const observer = new MutationObserver(() => undefined);
  observer.observe(root, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'], childList: true, subtree: true });
  return {
    gate, ctx, root, observer, clock, setOs: (on) => mm.setMatches(on),
    close() {
      observer.disconnect();
      gate.dispose();
      root.remove();
    },
  };
}

interface Run {
  readonly env: Env;
  readonly haunt: Haunt;
  port: GatePort | null;
  active: boolean;
  reduced: boolean;
}

function perform(run: Run, step: Step, mode: RmMode): void {
  const { haunt, env } = run;
  switch (step.kind) {
    case 'start':
      run.port = env.gate.open(haunt.id);
      haunt.start(step.level, run.port.audio, run.port.visual);
      run.active = true;
      bump(`${haunt.id}:${step.level}`);
      break;
    case 'setLevel':
      haunt.setLevel(step.level);
      bump(`${haunt.id}:${step.level}`);
      break;
    case 'fadeOut':
      run.port?.fadeOut(step.ms as number);
      break;
    case 'stop':
      haunt.stop();
      run.port?.close();
      run.active = false;
      break;
    case 'toggle':
      tally.toggled++;
      if (run.active) tally.toggledActive++;
      if (mode === 'midrunOs') {
        tally.toggledOs++;
        env.setOs(true);
      } else {
        tally.toggledApp++;
        env.gate.setReducedMotion(true);
      }
      run.reduced = true;
      break;
  }
}

async function runScenario(haunts: readonly Haunt[], s: Scenario): Promise<void> {
  const haunt = haunts[Math.min(haunts.length - 1, Math.floor(s.pick * haunts.length))];
  const env = await makeEnv(s.mode === 'initialOs');
  const calls0 = animateCalls;
  try {
    if (s.mode === 'initialApp') env.gate.setReducedMotion(true);
    const run: Run = { env, haunt, port: null, active: false, reduced: s.mode === 'initialOs' || s.mode === 'initialApp' };
    tally.scenarios++;
    if (s.mode !== 'off') tally.reducedScenarios++;
    if (run.reduced) tally.initialOn++;
    env.observer.takeRecords();
    for (const step of buildSteps(s)) {
      const before = run.reduced;
      const mark = env.ctx.automation.length;
      perform(run, step, s.mode);
      env.clock.advance(100);
      const recs = env.observer.takeRecords();
      if (run.reduced) {
        expect(env.root.classList.contains('is-guttering'), 'is-guttering on root').toBe(false);
        expect(env.root.querySelectorAll('.is-sweeping').length, 'is-sweeping layers').toBe(0);
        expect(flashRate(env.root), 'flash-equivalent rate').toBe(0);
      } else {
        expect(flashRate(env.root), 'flash-equivalent rate with reduced motion off').toBeLessThanOrEqual(3 + EPS);
      }
      if (before && run.reduced) {
        for (const r of recs) {
          if (r.type === 'attributes' && r.attributeName === 'class') expect(motionClasses(r.oldValue), 'recorded class').toBe(false);
          if (r.type === 'attributes' && r.attributeName === 'style') expect(r.oldValue ?? '', 'recorded style').not.toMatch(/--gutter-period|--sweep-period/);
          for (const n of r.addedNodes) if (n instanceof Element) expect(motionClasses(n.getAttribute('class'))).toBe(false);
        }
        checkFades(styleStates(env.root, recs), '--glow-dim', '--glow-fade', 'glow');
        const layers = new Set(recs.filter((r) => r.target !== env.root && r.target instanceof Element).map((r) => r.target as Element));
        for (const el of layers) checkFades(styleStates(el, recs), 'opacity', 'transition-duration', 'layer');
        checkAudioRamps(env.ctx, mark);
      }
    }
    expect(animateCalls - calls0, 'Web Animations API calls').toBe(0);
  } finally {
    env.close();
  }
}

// ------------------------------------------------------------------- tests

describe('Property 15: reduced motion over every real haunt', () => {
  const haunts = loadHaunts();

  it('discovers at least one haunt, including the candle, with unique ids', () => {
    expect(haunts.length).toBeGreaterThanOrEqual(1);
    expect(haunts.map((h) => h.id)).toContain('candle');
    expect(new Set(haunts.map((h) => h.id)).size).toBe(haunts.length);
  });

  // Feature: haunt-feature, Property 15: Reduced motion emits no flashing from any haunt
  // **Validates: Requirements 6.8, 6.10, 13.5, 15.6, 15.4**
  it('reduced motion on (from the start or mid-run): no motion classes, rate 0, fade-in >= 1000 ms, fade-out <= 800 ms, no Web Animations', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb(['initialOs', 'initialApp', 'midrunOs', 'midrunApp']), (s) => runScenario(haunts, s)),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 15: Reduced motion emits no flashing from any haunt
  // **Validates: Requirements 6.8, 6.10, 13.5, 15.6, 15.4**
  it('reduced motion off: the combined flash-equivalent rate is at most 3', async () => {
    await fc.assert(fc.asyncProperty(scenarioArb(['off']), (s) => runScenario(haunts, s)), { numRuns: NUM_RUNS });
  });

  describe('control: the observation detects motion', () => {
    for (const level of [2, 3] as const) {
      for (const via of ['start', 'setLevel'] as const) {
        it(`reduced motion off, candle at level ${level} via ${via}: is-guttering appears, recorded, rate in (0, 3]`, async () => {
          const candle = haunts.find((h) => h.id === 'candle');
          if (candle === undefined) throw new Error('candle haunt not discovered');
          const env = await makeEnv(false);
          try {
            env.observer.takeRecords();
            const port = env.gate.open('candle');
            candle.start(via === 'start' ? level : 1, port.audio, port.visual);
            if (via === 'setLevel') candle.setLevel(level);
            const recs = env.observer.takeRecords();
            expect(env.root.classList.contains('is-guttering')).toBe(true);
            expect(recs.some((r) => r.type === 'attributes' && r.attributeName === 'class' && r.target === env.root)).toBe(true);
            expect(flashRate(env.root)).toBeGreaterThan(0);
            expect(flashRate(env.root)).toBeLessThanOrEqual(3 + EPS);
            candle.stop();
            port.close();
            expect(env.root.classList.contains('is-guttering')).toBe(false);
          } finally {
            env.close();
          }
        });
      }
    }
  });

  // Runs last in this file: the tallies come from the property runs above.
  it('coverage: every haunt at every level 1-3, and reduced motion toggled mid-run, with margin', () => {
    const floor = (n: number, p: number): number => Math.max(1, Math.floor(n * p - 4 * Math.sqrt(n * p * (1 - p))));
    expect(tally.scenarios).toBe(2 * NUM_RUNS);
    const p = 1 / (3 * haunts.length);
    for (const h of haunts) {
      for (const level of [1, 2, 3]) {
        const count = exercised.get(`${h.id}:${level}`) ?? 0;
        expect(count, `${h.id} at level ${level}`).toBeGreaterThanOrEqual(floor(tally.scenarios, p));
      }
    }
    const a = tally.reducedScenarios;
    expect(tally.initialOn).toBeGreaterThanOrEqual(floor(a, 1 / 2));
    expect(tally.toggledOs).toBeGreaterThanOrEqual(floor(a, 1 / 4));
    expect(tally.toggledApp).toBeGreaterThanOrEqual(floor(a, 1 / 4));
    expect(tally.toggledActive).toBeGreaterThanOrEqual(floor(a, 1 / 6));
  });
});
