/**
 * Property 15 over every real haunt and return effect (`loadRegistry()`; this file used `loadHaunts`, haunts
 * only, which left the return effects out). Real `createGate`, real audio and visual
 * adapters, a jsdom stage host, and the fake AudioContext from ./fakes.ts. A MutationObserver on
 * the stage root records every class and style change, so a class that appears and disappears
 * inside one step is still seen (through each record's old value).
 *
 * ghost-dread (task 6.4): haunts start with a `StartInfo`, so the Ghost layer is drawn. A scenario can begin a
 * Return_Moment through the real Return controller (ghostHarness.ts): the registry's ghostFigure and jumpscare
 * effects run on real ReturnPorts and overlays, and the clock then runs past the 3000 ms end. With reduced
 * motion on, no `is-guttering`, `is-sweeping` or `is-glitching` class is ever added (the observer sees each
 * class change), and the Ghost (layer and overlay) and the Jumpscare overlay rise over at least 1000 ms.
 * A jump channel keeps the gate's own audio rule (300 ms under reduced motion, as gd23) and is the only
 * audio ramp allowed below 1000 ms; every other rising ramp still needs 1000 ms.
 *
 * Rates are read back from the stage: `is-guttering` + `--gutter-period` and every `.is-sweeping`
 * layer + `--sweep-period`, as 1000 / period flash-equivalents per second.
 */
import { appendFileSync } from 'node:fs';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import { loadRegistry } from '../registry';
import { KEYS } from '../settings';
import type { ReturnEffect } from '../returnTypes';
import type { Gate, GatePort, Haunt, HauntLevel, StartInfo } from '../types';
import { fadeMsArb } from './arbitraries';
import { createReturnDriver, retArgsArb, startInfoArb, type RetArgs, type ReturnDriver } from './ghostHarness';
import {
  type FakeAudioContext, type FakeGainNode, createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
} from './fakes';

const NUM_RUNS = 200;
/** The label ghostFigure.ts gives the Ghost layer. */
const GHOST_LABEL = 'A ghost stands nearby';
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
const tally = {
  scenarios: 0, reducedScenarios: 0, initialOn: 0, toggled: 0, toggledOs: 0, toggledApp: 0, toggledActive: 0,
  /** Scenarios where a Return_Moment began (any mode of reduced motion). */
  returns: 0,
  /** Scenarios with each ghost-dread flag, counted once per scenario (see `GHOST_FLAGS`). */
  ghost: new Map<string, number>(),
  /** Rises checked, by what rose (one per fade-in compared with the 1000 ms floor under reduced motion). */
  riseChecks: { ghostLayer: 0, ghostOverlay: 0, jumpscareOverlay: 0 },
};
/**
 * ghostLayerReduced / ghostOverlayReduced / jumpscareOverlayReduced: a rise of that thing was seen while
 * reduced motion was on and compared with 1000 ms. returnReduced: a Return_Moment began with reduced motion
 * on. ghostOpened / jumpscareOpened: the controller gave the effect a port (any motion setting).
 * jumpscareFadeRender: the planned Jumpscare was the reduced-motion `fade` render.
 */
const GHOST_FLAGS = [
  'ghostLayerReduced', 'ghostOverlayReduced', 'jumpscareOverlayReduced', 'returnReduced', 'ghostOpened', 'jumpscareOpened',
  'jumpscareFadeRender', 'ghostLayerDrawn',
] as const;
const bump = (key: string): void => void exercised.set(key, (exercised.get(key) ?? 0) + 1);

// ------------------------------------------------------------------ scenarios

type Level = HauntLevel;
type RmMode = 'initialOs' | 'initialApp' | 'midrunOs' | 'midrunApp' | 'off';

interface Scenario {
  readonly pick: number;
  /** Run the Ghost layer (ghostFigure) instead of the haunt `pick` chooses. */
  readonly ghost: boolean;
  readonly startLevel: Level;
  readonly changes: readonly Level[];
  readonly fadeOutMs: number | undefined | null;
  readonly mode: RmMode;
  readonly toggleRoll: number;
  /** What the engine passes to the haunt's `start`. */
  readonly info: StartInfo;
  /** Clock advance after each step. The larger values let a Return_Moment run to its end. */
  readonly stepMs: number;
  /** A look-away return to begin, or null. */
  readonly ret: RetArgs | null;
  readonly retRoll: number;
}

type Step =
  | { kind: 'start'; level: Level }
  | { kind: 'setLevel'; level: Level }
  | { kind: 'fadeOut'; ms: number | undefined }
  | { kind: 'stop' }
  | { kind: 'toggle' }
  | { kind: 'ret'; args: RetArgs }
  | { kind: 'settle' };

/** Uniform in [0, 1). fc.double is biased to 0 and tiny values, which put every toggle before the haunt started. */
const rollArb = fc.integer({ min: 0, max: 999_999 }).map((n) => n / 1_000_000);
const levelArb = fc.constantFrom<Level>(1, 2, 3);
const scenarioArb = (modes: readonly RmMode[]): fc.Arbitrary<Scenario> =>
  fc.record({
    pick: rollArb,
    // 1 in 8 scenarios run the Ghost layer on purpose: picked uniformly it rose under reduced motion in only
    // 3.5% of scenarios (14 of 400 on average). Every haunt still gets at least 7/8 of the uniform share.
    ghost: fc.oneof({ weight: 7, arbitrary: fc.constant(false) }, { weight: 1, arbitrary: fc.constant(true) }),
    startLevel: levelArb,
    changes: fc.array(levelArb, { maxLength: 6 }),
    fadeOutMs: fc.oneof(fc.constant(null), fadeMsArb),
    mode: fc.constantFrom(...modes),
    toggleRoll: rollArb,
    info: startInfoArb,
    stepMs: fc.constantFrom(100, 100, 100, 700, 1500),
    ret: fc.oneof({ weight: 1, arbitrary: fc.constant(null) }, { weight: 2, arbitrary: retArgsArb }),
    retRoll: rollArb,
  });

function buildSteps(s: Scenario): Step[] {
  const steps: Step[] = [{ kind: 'start', level: s.startLevel }, ...s.changes.map((level) => ({ kind: 'setLevel' as const, level }))];
  if (s.fadeOutMs !== null) steps.push({ kind: 'fadeOut', ms: s.fadeOutMs });
  steps.push({ kind: 'stop' });
  if (s.mode === 'midrunOs' || s.mode === 'midrunApp') {
    steps.splice(Math.floor(s.toggleRoll * (steps.length + 1)), 0, { kind: 'toggle' });
  }
  if (s.ret !== null) {
    // After the start step, and no later than the stop step; then the clock runs past the 3000 ms end.
    steps.splice(1 + Math.floor(s.retRoll * (steps.length - 1)), 0, { kind: 'ret', args: s.ret });
    steps.push({ kind: 'settle' });
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
  return value !== null && /is-sweeping|is-guttering|is-glitching/.test(value);
}

/** Style states of one element across a step: every old value, then the current one. */
function styleStates(target: Element, recs: readonly MutationRecord[]): string[] {
  const olds = recs.filter((r) => r.type === 'attributes' && r.attributeName === 'style' && r.target === target).map((r) => r.oldValue ?? '');
  return olds.length === 0 ? [] : [...olds, target.getAttribute('style') ?? ''];
}

/** Rises need a fade-in of at least 1000 ms and falls a fade-out of at most 800 ms. Returns how many rises it compared. */
function checkFades(states: readonly string[], levelProp: string, durProp: string, what: string): number {
  let rises = 0;
  for (let i = 0; i + 1 < states.length; i++) {
    const before = num(states[i], levelProp);
    const after = num(states[i + 1], levelProp);
    const a = Number.isNaN(before) ? 0 : before;
    const b = Number.isNaN(after) ? 0 : after;
    const dur = num(states[i + 1], durProp);
    if (b > a + 1e-12) {
      rises++;
      expect(dur, `${what} fade-in (${a} to ${b})`).toBeGreaterThanOrEqual(1000);
    } else if (b < a - 1e-12) expect(dur, `${what} fade-out (${a} to ${b})`).toBeLessThanOrEqual(800);
  }
  return rises;
}

/** What a rising element is: the Ghost layer, or an overlay of a kind. Null for anything else. */
function riseKind(el: Element): 'ghostLayer' | 'ghostOverlay' | 'jumpscareOverlay' | null {
  const kind = el.getAttribute('data-overlay-kind');
  if (kind === 'ghost') return 'ghostOverlay';
  if (kind === 'jumpscare') return 'jumpscareOverlay';
  return kind === null && el.getAttribute('aria-label') === GHOST_LABEL ? 'ghostLayer' : null;
}

/** Every rising ramp needs 1000 ms. The only exception is a jump channel's gain: 300 ms, the gate's own rule (gd23). */
function checkAudioRamps(ctx: FakeAudioContext, from: number, jumpParams: ReadonlySet<unknown>): void {
  for (let i = from; i < ctx.automation.length; i++) {
    const c = ctx.automation[i];
    if (c.type !== 'linearRampToValueAtTime' || c.value === undefined) continue;
    const prior = ctx.automation.slice(0, i).filter((x) => x.param === c.param && x.value !== undefined).pop();
    const previous = prior?.value ?? c.param.defaultValue;
    if (c.value > previous + 1e-12) {
      const min = jumpParams.has(c.param) ? 0.3 : 1;
      expect(c.effectiveTime - c.atContextTime, `${c.param.label} rise`).toBeGreaterThanOrEqual(min - EPS);
    }
  }
}

// ---------------------------------------------------------------------- harness

interface Env {
  readonly gate: Gate;
  readonly ctx: FakeAudioContext;
  readonly root: HTMLElement;
  readonly observer: MutationObserver;
  readonly clock: { advance(ms: number): void };
  readonly scheduler: { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void; advance(ms: number): void };
  readonly warnings: string[];
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
  const warnings: string[] = [];
  const gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlockTarget },
    hosts: { root, left, right },
    storage: createFakeStorage({ [KEYS.volumeCap]: '1' }),
    storageEvents: null,
    reducedMotion: createReducedMotion(mm.matchMedia),
    scheduler,
    warn: (m) => void warnings.push(m),
  });
  unlockTarget.dispatchEvent(new Event('pointerdown'));
  await flush();
  const ctx = factory.contexts[0];
  if (ctx === undefined || ctx.state !== 'running') throw new Error('audio did not unlock in the test setup');
  const observer = new MutationObserver(() => undefined);
  observer.observe(root, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'], childList: true, subtree: true });
  return {
    gate, ctx, root, observer, clock, scheduler, warnings, setOs: (on) => mm.setMatches(on),
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
  readonly info: StartInfo;
  readonly driver: ReturnDriver;
  /** Ghost-dread flags of this scenario (see GHOST_FLAGS). */
  readonly seen: Set<string>;
}

function perform(run: Run, step: Step, mode: RmMode): void {
  const { haunt, env } = run;
  switch (step.kind) {
    case 'start':
      run.port = env.gate.open(haunt.id);
      haunt.start(step.level, run.port.audio, run.port.visual, run.info);
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
    case 'ret': {
      const plan = run.driver.begin(step.args, run.reduced, (ms) => run.port?.fadeOut(ms));
      if (plan !== null && run.reduced) run.seen.add('returnReduced');
      if (plan?.jumpscare?.render === 'fade') run.seen.add('jumpscareFadeRender');
      break;
    }
    case 'settle':
      break; // only the clock moves (see runScenario)
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

async function runScenario(haunts: readonly Haunt[], effects: readonly ReturnEffect[], s: Scenario): Promise<void> {
  const ghostLayer = haunts.find((h) => h.id === 'ghostFigure');
  const haunt = s.ghost && ghostLayer !== undefined ? ghostLayer : haunts[Math.min(haunts.length - 1, Math.floor(s.pick * haunts.length))];
  const env = await makeEnv(s.mode === 'initialOs');
  const calls0 = animateCalls;
  const seen = new Set<string>();
  /** Gain params of the jump channels the controller opened (found at the moment of the open). */
  const jumpParams = new Set<unknown>();
  const driver = createReturnDriver({
    gate: env.gate, effects, scheduler: env.scheduler, warn: (m) => void env.warnings.push(m),
    around(effectId, jumpSound, doOpen) {
      const before = env.ctx.nodesOfKind('gain').length;
      const port = doOpen();
      if (port === null) return null;
      seen.add(effectId === 'ghostFigure' ? 'ghostOpened' : `${effectId}Opened`);
      if (jumpSound) {
        const gains = env.ctx.nodesOfKind('gain');
        if (gains.length !== before + 1) throw new Error('could not find the gain node of the jump channel');
        jumpParams.add((gains[gains.length - 1] as FakeGainNode).gain);
      }
      return port;
    },
  });
  try {
    if (s.mode === 'initialApp') env.gate.setReducedMotion(true);
    const run: Run = {
      env, haunt, port: null, active: false, reduced: s.mode === 'initialOs' || s.mode === 'initialApp', info: s.info, driver, seen,
    };
    tally.scenarios++;
    if (s.mode !== 'off') tally.reducedScenarios++;
    if (run.reduced) tally.initialOn++;
    env.observer.takeRecords();
    for (const step of buildSteps(s)) {
      const before = run.reduced;
      const mark = env.ctx.automation.length;
      perform(run, step, s.mode);
      // scheduler.advance moves the clock AND fires due timers: ticks, fade cleanups, the Return controller.
      env.scheduler.advance(step.kind === 'settle' ? 3500 : s.stepMs);
      const recs = env.observer.takeRecords();
      if (env.root.querySelector(`[aria-label="${GHOST_LABEL}"]:not(.haunt-overlay)`) !== null) seen.add('ghostLayerDrawn');
      if (run.reduced) {
        expect(env.root.classList.contains('is-guttering'), 'is-guttering on root').toBe(false);
        expect(env.root.querySelectorAll('.is-sweeping').length, 'is-sweeping layers').toBe(0);
        expect(flashRate(env.root), 'flash-equivalent rate').toBe(0);
        expect(env.root.classList.contains('is-glitching'), 'is-glitching on root').toBe(false);
        expect(env.root.querySelectorAll('.is-glitching').length, 'is-glitching elements').toBe(0);
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
        for (const el of layers) {
          const rises = checkFades(styleStates(el, recs), 'opacity', 'transition-duration', 'layer');
          const kind = riseKind(el);
          if (kind !== null && rises > 0) {
            tally.riseChecks[kind] += rises;
            seen.add(`${kind}Reduced`);
          }
        }
        checkAudioRamps(env.ctx, mark, jumpParams);
      }
    }
    expect(animateCalls - calls0, 'Web Animations API calls').toBe(0);
    if (s.ret !== null) expect(env.root.querySelectorAll('.haunt-overlay').length, 'overlays left after the Return_Moment ended').toBe(0);
    expect(env.warnings, 'warnings from the gate, the controller or an effect').toEqual([]);
  } finally {
    driver.abort('stop');
    if (s.ret !== null) tally.returns++;
    for (const f of seen) tally.ghost.set(f, (tally.ghost.get(f) ?? 0) + 1);
    env.close();
  }
}

// ------------------------------------------------------------------- tests

describe('Property 15: reduced motion over every real haunt', () => {
  const { haunts, effects } = loadRegistry();

  it('discovers at least one haunt, including the candle, with unique ids', () => {
    expect(haunts.length).toBeGreaterThanOrEqual(1);
    expect(haunts.map((h) => h.id)).toContain('candle');
    expect(new Set(haunts.map((h) => h.id)).size).toBe(haunts.length);
  });

  it('discovers the ghost-dread layers and the two return effects, with the Jumpscare as a jump channel', () => {
    expect(haunts.map((h) => h.id)).toEqual(expect.arrayContaining(['footsteps', 'breathing', 'knock', 'ghostFigure']));
    expect(effects.map((e) => e.id).sort()).toEqual(['ghostFigure', 'jumpscare']);
    expect(effects.find((e) => e.id === 'jumpscare')?.jumpSound).toBe(true);
  });

  // Feature: haunt-feature, Property 15: Reduced motion emits no flashing from any haunt
  // **Validates: Requirements 6.8, 6.10, 13.5, 15.6, 15.4**
  it('reduced motion on (from the start or mid-run): no motion classes, rate 0, fade-in >= 1000 ms, fade-out <= 800 ms, no Web Animations', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb(['initialOs', 'initialApp', 'midrunOs', 'midrunApp']), (s) => runScenario(haunts, effects, s)),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 15: Reduced motion emits no flashing from any haunt
  // **Validates: Requirements 6.8, 6.10, 13.5, 15.6, 15.4**
  it('reduced motion off: the combined flash-equivalent rate is at most 3', async () => {
    await fc.assert(fc.asyncProperty(scenarioArb(['off']), (s) => runScenario(haunts, effects, s)), { numRuns: NUM_RUNS });
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
    // P15_TALLY=<path>: append the tallies of this run to that file (vitest hides console output here).
    if (process.env.P15_TALLY) {
      appendFileSync(process.env.P15_TALLY, `${JSON.stringify({ ...tally, ghost: Object.fromEntries(tally.ghost), exercised: Object.fromEntries(exercised) })}\n`);
    }
    // Each haunt is picked uniformly in 7 of 8 scenarios (see `ghost` in scenarioArb), so this is still a floor.
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

  // Runs last: the ghost-dread flags, from the property runs above. Shares are of all scenarios (n).
  it('coverage: the Ghost layer and overlay and the Jumpscare were seen rising under reduced motion, with margin', () => {
    const floor = (n: number, p: number): number => Math.max(1, Math.floor(n * p - 4 * Math.sqrt(n * p * (1 - p))));
    const n = tally.scenarios;
    for (const f of GHOST_FLAGS) expect(tally.ghost.get(f) ?? 0, f).toBeGreaterThanOrEqual(floor(n, GHOST_SHARE[f]));
    expect(tally.riseChecks.ghostLayer, 'Ghost layer rises compared with 1000 ms').toBeGreaterThanOrEqual(1);
    expect(tally.riseChecks.ghostOverlay, 'Ghost overlay rises compared with 1000 ms').toBeGreaterThanOrEqual(1);
    expect(tally.riseChecks.jumpscareOverlay, 'Jumpscare overlay rises compared with 1000 ms').toBeGreaterThanOrEqual(1);
  });
});

/** Expected share of all scenarios with each ghost-dread flag, from the measurement in the report of task 6.4. */
const GHOST_SHARE: Record<(typeof GHOST_FLAGS)[number], number> = {
  ghostLayerReduced: 0.03, ghostOverlayReduced: 0.22, jumpscareOverlayReduced: 0.16, returnReduced: 0.22, ghostOpened: 0.6,
  jumpscareOpened: 0.4, jumpscareFadeRender: 0.14, ghostLayerDrawn: 0.09,
};
