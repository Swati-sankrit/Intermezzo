// Task 6.3 (Req 2.1, 2.2, 2.13, 3.1, 3.5, 3.7, 5.1, 5.13, 9.9): the Ghost flow from look-away to
// look-back, end to end, in jsdom.
//
// Real: HauntStage, createGate (real audio and visual adapters), createHauntEngine, the haunts and
// return effects found by `loadRegistry`, the settings store, and the app's own `measureRegions`
// as the engine's `regions` getter. Fake: the signal source, the clock and scheduler, and the
// AudioContext (all from the haunt engine's fakes).
//
// Geometry. jsdom has no layout, so every box is 0 by default. `getBoundingClientRect` is stubbed
// on HTMLElement.prototype for exactly the three things the app measures or sizes:
//   - `[data-reading-column]`: a fixed 400 px box in a 1000 x 800 viewport (what `measureRegions` reads);
//   - `.haunt-stage__region`: the box HauntStage gives it with inline `left` and `width`;
//   - `.haunt-layer`: its parent region's box (the stylesheet makes a layer fill its region; jsdom
//     does not load the stylesheet).
// So the Ghost's box is derived from the regions the engine passed to `ghostFigure.start`, and is
// compared with the column box.
//
// Random draws (Return_Moment). `returnMoment.ts` draws `deps.random` (= `extraRandom`) ten times,
// in the order of ROLL_KEYS: jump, calm, calmLen, jumpLen, glitchLen, flickers, evidence,
// evidenceMsg, evidenceRun, spoiler. The roster also draws `extraRandom` once per haunt start, but
// only during a look-away. So the test feeds a queue of ten explicit values right before `present`
// and fails if it is not consumed exactly. Outside the queue every draw is 0.9, and `random`
// (the Level_Logic lead pick) is fixed, so the lead haunt never decides the outcome.
//   jump 0.1 (< 0.35 Classic chance) -> Jumpscare; calm 0.9 (>= 0.75) -> no False_Calm, so the
//   Jumpscare starts at 0; jumpLen 0.5 -> it lasts 700 + 250 = 950 ms; the moment lasts 2000 ms.
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHauntEngine } from '../../haunts/engine/engine';
import { createGate } from '../../haunts/engine/gate/gate';
import { createReducedMotion } from '../../haunts/engine/gate/reducedMotion';
import { loadRegistry } from '../../haunts/engine/registry';
import { createSettingsStore } from '../../haunts/engine/settings';
import type { Gate, HauntEngine, VisualHosts } from '../../haunts/engine';
import type { AttentionSignalLike, HauntMode } from '../../haunts/engine/types';
import {
  createFakeAudioContextFactory, createFakeMatchMedia, createFakeTime, FakeAudioNode,
  type FakeAudioContext, type FakeAudioContextFactory, type FakeScheduler,
} from '../../haunts/engine/__tests__/fakes';
import { HauntStage } from '../HauntStage';
import { measureRegions } from '../measureRegions';

const VIEWPORT = { width: 1000, height: 800 };
const COLUMN = { left: 300, right: 700, top: 100, bottom: 700 };
const GHOST_LABEL = 'A ghost stands nearby';
const RETURN_ROLLS = [0.1, 0.9, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

interface Box { left: number; right: number; top: number; bottom: number }
const toRect = (b: Box): DOMRect =>
  ({ ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON: () => b }) as DOMRect;

let restoreGeometry: () => void = () => undefined;

function installGeometry(): void {
  const proto = HTMLElement.prototype;
  const original = proto.getBoundingClientRect;
  const sizes = { w: Object.getOwnPropertyDescriptor(window, 'innerWidth'), h: Object.getOwnPropertyDescriptor(window, 'innerHeight') };
  Object.defineProperty(window, 'innerWidth', { value: VIEWPORT.width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: VIEWPORT.height, configurable: true, writable: true });
  proto.getBoundingClientRect = function box(this: HTMLElement): DOMRect {
    return toRect(boxOf(this));
  };
  restoreGeometry = () => {
    proto.getBoundingClientRect = original;
    if (sizes.w) Object.defineProperty(window, 'innerWidth', sizes.w);
    if (sizes.h) Object.defineProperty(window, 'innerHeight', sizes.h);
  };
}

function boxOf(el: HTMLElement): Box {
  if (el.hasAttribute('data-reading-column')) return COLUMN;
  if (el.classList.contains('haunt-stage__region')) {
    const left = parseFloat(el.style.left) || 0;
    const width = parseFloat(el.style.width) || 0;
    return { left, right: left + width, top: 0, bottom: VIEWPORT.height };
  }
  if (el.classList.contains('haunt-layer') && el.parentElement) return boxOf(el.parentElement);
  return { left: 0, right: 0, top: 0, bottom: 0 };
}

const STYLE_PROPS = ['color', 'opacity', 'visibility', 'display', 'filter', 'background-color', 'text-shadow', 'mix-blend-mode', 'transform'];

/** Text, markup and the styles that decide whether the text is readable, for the column and its ancestors. */
function readability(column: HTMLElement) {
  const chain: unknown[] = [];
  for (let el: HTMLElement | null = column; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    chain.push({
      tag: el.tagName, className: el.className, style: el.getAttribute('style'),
      computed: STYLE_PROPS.map((p) => cs.getPropertyValue(p)),
    });
  }
  return { text: column.textContent, html: column.innerHTML, chain };
}

interface World {
  engine: HauntEngine;
  gate: Gate;
  scheduler: FakeScheduler;
  audio: FakeAudioContextFactory;
  column: HTMLElement;
  hosts: VisualHosts;
  warnings: string[];
  rolls: { queue: number[] };
  setSignal(value: 'present' | 'away'): void;
  advance(ms: number): void;
  ctx(): FakeAudioContext;
}

let world: World | null = null;
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

async function setup(mode: HauntMode): Promise<World> {
  localStorage.clear();
  installGeometry();
  const column = document.createElement('div');
  column.setAttribute('data-reading-column', '');
  column.style.color = 'rgb(232, 220, 196)';
  column.style.opacity = '1';
  column.innerHTML = '<p>The candle gutters. A page turns by itself.</p><p>Nobody is reading it.</p>';
  document.body.append(column);

  let hosts: VisualHosts | null = null;
  render(<HauntStage hostsRef={(h) => { if (h !== null) hosts = h; }} />);
  if (hosts === null) throw new Error('HauntStage did not expose its hosts');

  const { clock, scheduler } = createFakeTime(1_000_000);
  const audio = createFakeAudioContextFactory(clock);
  const unlockTarget = new EventTarget();
  const gate = createGate({
    audio: { createAudioContext: audio.create, eventTarget: unlockTarget },
    hosts,
    storage: null,
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(false).matchMedia),
    scheduler,
  });
  gate.setSoundEnabled(true);
  const settings = createSettingsStore(null);
  settings.set({ mode, noticeSeen: true });

  let listener: ((s: AttentionSignalLike) => void) | null = null;
  const warnings: string[] = [];
  const rolls = { queue: [] as number[] };
  const { haunts, effects } = loadRegistry((m) => warnings.push(m));
  const engine = createHauntEngine({
    subscribeSignal(cb) {
      listener = cb;
      cb({ value: 'present', timestamp: clock.now() });
      return () => void (listener = null);
    },
    haunts,
    effects,
    gate,
    settings,
    clock,
    scheduler,
    random: () => 0.5,
    extraRandom: () => {
      const next = rolls.queue.shift();
      return next ?? 0.9;
    },
    reducedMotion: () => false,
    regions: measureRegions,
    warn: (m) => warnings.push(m),
  });
  engine.start();
  unlockTarget.dispatchEvent(new Event('pointerdown'));
  await flush();
  const w: World = {
    engine, gate, scheduler, audio, column, hosts, warnings, rolls,
    setSignal: (value) => listener?.({ value, timestamp: clock.now() }),
    advance: (ms) => scheduler.advance(ms),
    ctx: () => audio.contexts[0],
  };
  world = w;
  return w;
}

afterEach(() => {
  world?.engine.stop();
  world?.gate.dispose();
  world?.column.remove();
  world = null;
  cleanup();
  restoreGeometry();
  restoreGeometry = () => undefined;
  localStorage.clear();
});

const ghostLayers = (): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>(`.haunt-layer[aria-label="${GHOST_LABEL}"]`)];
const overlays = (kind?: string): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>(kind ? `.haunt-overlay[data-overlay-kind="${kind}"]` : '.haunt-overlay')];
const ghostElements = (): Element[] => [...document.querySelectorAll('[aria-label]')].filter((e) => /ghost/i.test(e.getAttribute('aria-label') ?? ''));
/** Gain nodes created after `since` that are connected to something (an open channel). */
function liveGainsSince(ctx: FakeAudioContext, since: number): FakeAudioNode[] {
  return ctx.createdNodes.slice(since).filter((n) => n.kind === 'gain' && ctx.connections.some((e) => e.from === n));
}
function liveSourcesSince(ctx: FakeAudioContext, since: number): FakeAudioNode[] {
  return ctx.createdNodes.slice(since).filter((n) => n.kind === 'bufferSource' && ctx.pathsToDestination(n).length > 0);
}

interface JumpChannel { source: FakeAudioNode; gain: FakeAudioNode }
/**
 * The jump channel opened since `since`: the only buffer source playing (the Jumpscare's), and the
 * channel gain node it feeds. The Ghost's return effect opens its own silent channel, so gain nodes
 * are not counted; the jump channel is found through the sound that plays on it.
 */
function jumpChannel(ctx: FakeAudioContext, since: number): JumpChannel {
  const sources = liveSourcesSince(ctx, since);
  expect(sources).toHaveLength(1);
  const path = ctx.pathsToDestination(sources[0])[0];
  expect(path[1].kind).toBe('gain');
  expect(ctx.connections.some((e) => e.from === path[1])).toBe(true);
  return { source: sources[0], gain: path[1] };
}
function expectChannelGone(ctx: FakeAudioContext, jump: JumpChannel): void {
  expect(ctx.pathsToDestination(jump.source)).toEqual([]);
  expect(ctx.connections.some((e) => e.from === jump.gain)).toBe(false);
}

describe('Ghost flow, Classic', () => {
  beforeEach(() => localStorage.clear());

  it('away: the Ghost layer sits in a side region, outside the column box (Req 2.1, 2.2)', async () => {
    const w = await setup('classic');
    w.setSignal('away');
    w.advance(100);

    const layers = ghostLayers();
    expect(layers).toHaveLength(1);
    const layer = layers[0];
    const host = layer.parentElement;
    expect(host === w.hosts.left || host === w.hosts.right).toBe(true);

    const box = layer.getBoundingClientRect();
    const col = w.column.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(0); // the stub resolved a real region, so the check is not vacuous
    expect(col.left).toBe(COLUMN.left);
    expect(box.right <= col.left || box.left >= col.right).toBe(true);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(VIEWPORT.width);
    // No overlay (the only element that may cover the text) exists during the look-away.
    expect(overlays()).toHaveLength(0);
    expect(w.warnings).toEqual([]);
  });

  it('present after 12 s: Jumpscare overlay, then nothing left at 3000 ms and the text unchanged (Req 3.1, 3.5, 5.1, 5.13, 9.9, 2.13)', async () => {
    const w = await setup('classic');
    const before = readability(w.column);
    expect(before.text).toContain('The candle gutters');

    w.setSignal('away');
    w.advance(12_000);
    expect(w.engine.getState().level).toBe(3);
    expect(ghostLayers()).toHaveLength(1);
    expect(overlays()).toHaveLength(0);
    const ctx = w.ctx();
    expect(ctx.state).toBe('running');
    const nodesBefore = ctx.createdNodes.length;

    w.rolls.queue = [...RETURN_ROLLS];
    w.setSignal('present');
    expect(w.rolls.queue).toEqual([]); // all ten draws were made, in the order set above

    // The Return_Moment has started: Jumpscare and Ghost overlays, and a live jump channel.
    expect(overlays('jumpscare')).toHaveLength(1);
    expect(overlays('ghost')).toHaveLength(1);
    expect(overlays('jumpscare')[0].parentElement).toBe(w.hosts.root);
    expect(w.column.contains(overlays('jumpscare')[0])).toBe(false);
    const jump = jumpChannel(ctx, nodesBefore);

    // After the Jumpscare (950 ms) only the Ghost lingers.
    w.advance(1000);
    expect(overlays('jumpscare')).toHaveLength(0);
    expect(overlays('ghost')).toHaveLength(1);

    // At 3000 ms nothing of the Return_Moment remains.
    w.advance(2000);
    expect(overlays()).toHaveLength(0);
    expect(ghostElements()).toHaveLength(0);
    expect(document.querySelectorAll('.haunt-layer')).toHaveLength(0);
    expectChannelGone(ctx, jump);
    expect(liveGainsSince(ctx, nodesBefore)).toHaveLength(0);
    expect(readability(w.column)).toEqual(before);
    expect(w.warnings).toEqual([]);
  });

  it('a new away during the Return_Moment ends it at once: overlays gone within 100 ms (Req 3.7)', async () => {
    const w = await setup('classic');
    w.setSignal('away');
    w.advance(12_000);
    const ctx = w.ctx();
    const nodesBefore = ctx.createdNodes.length;
    w.rolls.queue = [...RETURN_ROLLS];
    w.setSignal('present');
    w.advance(100); // still inside the Jumpscare (950 ms)
    expect(overlays('jumpscare')).toHaveLength(1);
    expect(overlays('ghost')).toHaveLength(1);
    const jump = jumpChannel(ctx, nodesBefore);

    w.setSignal('away');
    w.advance(100);
    expect(overlays()).toHaveLength(0);
    expectChannelGone(ctx, jump);
    // The scheduler has nothing of the old moment left to fire: later time adds no overlay.
    w.advance(3000);
    expect(overlays()).toHaveLength(0);
    expect(w.warnings).toEqual([]);
  });
});

describe('Ghost flow, Gentle', () => {
  it('shows no Ghost and no Return_Moment (Req 2.1, 3.1)', async () => {
    const w = await setup('gentle');
    const before = readability(w.column);
    w.setSignal('away');
    w.advance(12_000);
    expect(w.engine.getState().level).toBe(1); // haunted, so the checks below are not vacuous
    expect(ghostElements()).toHaveLength(0);
    expect(overlays()).toHaveLength(0);

    const nodesBefore = w.ctx().createdNodes.length;
    w.rolls.queue = [...RETURN_ROLLS];
    w.setSignal('present');
    for (let ms = 0; ms <= 3500; ms += 100) {
      expect(overlays(), `overlay at +${ms} ms`).toHaveLength(0);
      expect(ghostElements(), `ghost at +${ms} ms`).toHaveLength(0);
      w.advance(100);
    }
    expect(w.rolls.queue).toEqual(RETURN_ROLLS); // no Return_Moment was planned, so no roll was drawn
    expect(liveSourcesSince(w.ctx(), nodesBefore)).toHaveLength(0);
    expect(w.engine.getState().level).toBe(0);
    expect(readability(w.column)).toEqual(before);
    expect(w.warnings).toEqual([]);
  });
});
