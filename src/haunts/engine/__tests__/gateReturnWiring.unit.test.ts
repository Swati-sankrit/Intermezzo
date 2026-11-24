/**
 * Wiring of the Return_Moment on the real gate and real adapters (task 3.7). Only time
 * (FakeScheduler) and the AudioContext are stand-ins. Requirements 3.2, 3.4, 5.11, 5.13, 9.7, 9.8.
 */
import { describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import { RETURN_MAX_MS } from '../gate/returnRules';
import { KEYS } from '../settings';
import type { Gate } from '../types';
import {
  createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
  type FakeAudioContext, type FakeGainNode, type FakeScheduler,
} from './fakes';

interface Env {
  readonly gate: Gate;
  readonly scheduler: FakeScheduler;
  readonly root: HTMLElement;
  readonly contexts: readonly FakeAudioContext[];
  readonly warnings: string[];
  unlock(): Promise<void>;
}

function makeEnv(opts: { reduced?: boolean } = {}): Env {
  const { clock, scheduler } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  document.body.append(root);
  const unlockTarget = new EventTarget();
  const warnings: string[] = [];
  const gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlockTarget },
    hosts: { root, left, right },
    storage: createFakeStorage({ [KEYS.volumeCap]: '0.5' }),
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(opts.reduced === true).matchMedia),
    scheduler,
    warn: (m) => void warnings.push(m),
  });
  return {
    gate, scheduler, root, contexts: factory.contexts, warnings,
    async unlock() {
      unlockTarget.dispatchEvent(new Event('pointerdown'));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
  };
}

const overlays = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.haunt-overlay')];
const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="var(--shadow)"/></svg>';

describe('Return_Moment state', () => {
  it('openReturn is null outside a Return_Moment and non-null inside it', () => {
    const { gate, scheduler } = makeEnv();
    expect(gate.openReturn('ghostFigure')).toBeNull();
    gate.beginReturnMoment();
    const port = gate.openReturn('ghostFigure');
    expect(port).not.toBeNull();
    gate.endReturnMoment();
    expect(gate.openReturn('ghostFigure')).toBeNull();
    scheduler.advance(200);
    expect(scheduler.pendingCount).toBe(0);
  });

  it('the 3000 ms guard ends the state when nobody calls endReturnMoment', () => {
    const { gate, scheduler, root } = makeEnv();
    gate.beginReturnMoment();
    gate.openReturn('ghostFigure')?.visual.createOverlay('ghost').setMarkup(SQUARE);
    scheduler.advance(RETURN_MAX_MS - 1);
    expect(gate.openReturn('x')).not.toBeNull();
    scheduler.advance(1);
    expect(gate.openReturn('x')).toBeNull();
    scheduler.advance(100);
    expect(overlays(root)).toHaveLength(0);
  });

});

describe('endReturnMoment', () => {
  it('is idempotent and leaves no timer behind', () => {
    const { gate, scheduler, root } = makeEnv();
    gate.beginReturnMoment();
    gate.openReturn('a')?.visual.createOverlay('jumpscare').setMarkup(SQUARE);
    gate.endReturnMoment(80);
    gate.endReturnMoment(80);
    gate.endReturnMoment();
    scheduler.advance(100);
    expect(overlays(root)).toHaveLength(0);
    gate.endReturnMoment();
    expect(scheduler.pendingCount).toBe(0);
    // A new Return_Moment works after a double end.
    gate.beginReturnMoment();
    expect(gate.openReturn('b')).not.toBeNull();
    gate.endReturnMoment(0);
  });

  it('removes overlays of every kind within 100 ms and fades them first', () => {
    const { gate, scheduler, root } = makeEnv();
    gate.beginReturnMoment();
    const port = gate.openReturn('a');
    if (port === null) throw new Error('expected a ReturnPort');
    for (const kind of ['ghost', 'jumpscare', 'card-hand'] as const) {
      const layer = port.visual.createOverlay(kind);
      layer.setMarkup(SQUARE);
      layer.setOpacity(1, 300);
    }
    const found = overlays(root);
    expect(found.map((o) => o.getAttribute('data-overlay-kind'))).toEqual(['ghost', 'jumpscare', 'card-hand']);
    expect(found.every((o) => o.querySelector('rect') !== null && o.style.opacity === '1')).toBe(true);
    gate.endReturnMoment(80);
    expect(found.every((o) => o.style.opacity === '0')).toBe(true);
    scheduler.advance(79);
    expect(overlays(root)).toHaveLength(3);
    scheduler.advance(1);
    expect(overlays(root)).toHaveLength(0);
  });

  it('caps the fade at 100 ms', () => {
    const { gate, scheduler, root } = makeEnv();
    gate.beginReturnMoment();
    gate.openReturn('a')?.visual.createOverlay('ghost');
    gate.endReturnMoment(5000);
    scheduler.advance(100);
    expect(overlays(root)).toHaveLength(0);
  });

  it('ignores overlay requests after the end', () => {
    const { gate, root } = makeEnv();
    gate.beginReturnMoment();
    const port = gate.openReturn('a');
    gate.endReturnMoment(0);
    port?.visual.createOverlay('ghost').setMarkup(SQUARE);
    expect(overlays(root)).toHaveLength(0);
  });
});

describe('overlay rules', () => {
  it('raises the fade-in to the reduced-motion floor and writes no colour', () => {
    const { gate, root } = makeEnv({ reduced: true });
    gate.beginReturnMoment();
    const layer = gate.openReturn('a')?.visual.createOverlay('jumpscare');
    layer?.setMarkup(SQUARE);
    layer?.setOpacity(1, 50);
    const el = overlays(root)[0];
    expect(el.style.transitionDuration).toBe('1000ms');
    expect(el.style.color).toBe('');
    expect(el.style.backgroundColor).toBe('');
  });

  it('is hidden from assistive technology unless labelled', () => {
    const { gate, root } = makeEnv();
    gate.beginReturnMoment();
    const layer = gate.openReturn('a')?.visual.createOverlay('ghost');
    const el = overlays(root)[0];
    expect(el.getAttribute('aria-hidden')).toBe('true');
    layer?.setLabel('A pale figure');
    expect(el.getAttribute('aria-label')).toBe('A pale figure');
    expect(el.hasAttribute('aria-hidden')).toBe(false);
  });
});

describe('jump channel in a ReturnPort', () => {
  const channelNode = (ctx: FakeAudioContext): FakeGainNode => ctx.nodesOfKind('gain')[1] as FakeGainNode;

  it('rises in 20 ms under the cap and is disconnected within 100 ms of the end', async () => {
    const env = makeEnv();
    await env.unlock();
    env.gate.beginReturnMoment();
    const port = env.gate.openReturn('jumpscare', { jumpSound: true });
    if (port === null) throw new Error('expected a ReturnPort');
    port.audio.setGain(1);
    const ctx = env.contexts[0];
    const node = channelNode(ctx);
    env.scheduler.advance(20);
    expect(node.gain.valueAt(ctx.currentTime)).toBeGreaterThan(0.45);
    expect(node.gain.valueAt(ctx.currentTime)).toBeLessThanOrEqual(0.5 + 1e-9);
    env.gate.endReturnMoment(80);
    env.scheduler.advance(80);
    expect(ctx.connections.some((c) => c.from === node)).toBe(false);
    expect(node.gain.valueAt(ctx.currentTime)).toBeCloseTo(0, 9);
  });

  it('a port opened while sound is locked plays nothing', async () => {
    const env = makeEnv();
    env.gate.beginReturnMoment();
    const port = env.gate.openReturn('jumpscare', { jumpSound: true });
    expect(port).not.toBeNull();
    port?.audio.setGain(1);
    env.scheduler.advance(100);
    expect(env.contexts).toHaveLength(0);
    env.gate.endReturnMoment(0);
  });

  it('a port opened while sound is off stays silent', async () => {
    const env = makeEnv();
    await env.unlock();
    env.gate.setSoundEnabled(false);
    env.gate.beginReturnMoment();
    const port = env.gate.openReturn('jumpscare', { jumpSound: true });
    port?.audio.setGain(1);
    env.scheduler.advance(200);
    const ctx = env.contexts[0];
    expect(channelNode(ctx).gain.valueAt(ctx.currentTime)).toBe(0);
    env.gate.endReturnMoment(0);
  });

  it('dispose while a Return_Moment runs removes overlays and cancels timers', () => {
    const { gate, scheduler, root } = makeEnv();
    gate.beginReturnMoment();
    gate.openReturn('a')?.visual.createOverlay('ghost');
    gate.dispose();
    expect(overlays(root)).toHaveLength(0);
    expect(scheduler.pendingCount).toBe(0);
    expect(gate.openReturn('a')).toBeNull();
  });
});
