/**
 * Gate extensions for the Return_Moment (task 3.10), through the public gate API only:
 * overlays gone within 100 ms of `endReturnMoment`, the 3000 ms guard, tick reporting and
 * stopping, and the accessible label. Real gate and real adapters; only time (FakeScheduler)
 * and the AudioContext are stand-ins. Requirements 2.12, 3.2, 5.13, 9.8.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import { RETURN_MAX_MS } from '../gate/returnRules';
import { KEYS } from '../settings';
import type { ReturnPort } from '../returnTypes';
import {
  createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
  type FakeAudioContext, type FakeGainNode,
} from './fakes';

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="var(--shadow)"/></svg>';
const roots: HTMLElement[] = [];

afterEach(() => {
  for (const r of roots.splice(0)) r.remove();
});

function makeEnv() {
  const { clock, scheduler } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  document.body.append(root);
  roots.push(root);
  const unlockTarget = new EventTarget();
  const warnings: string[] = [];
  const gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlockTarget },
    hosts: { root, left, right },
    storage: createFakeStorage({ [KEYS.volumeCap]: '0.5' }),
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(false).matchMedia),
    scheduler,
    warn: (m) => void warnings.push(m),
  });
  const overlays = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('.haunt-overlay')];
  async function unlock(): Promise<FakeAudioContext> {
    unlockTarget.dispatchEvent(new Event('pointerdown'));
    for (let i = 0; i < 6; i++) await Promise.resolve();
    return factory.contexts[0];
  }
  return { gate, scheduler, clock, left, warnings, overlays, unlock };
}

function expectPort(port: ReturnPort | null): ReturnPort {
  if (port === null) throw new Error('expected a ReturnPort');
  return port;
}

describe('overlays after endReturnMoment (Requirements 3.2, 9.8)', () => {
  it.each([undefined, 0, 1, 50, 80, 100, 5000, Number.NaN])(
    'removes every overlay within 100 ms of endReturnMoment(%s) and leaves no timer',
    (fadeMs) => {
      const env = makeEnv();
      env.gate.beginReturnMoment();
      const port = expectPort(env.gate.openReturn('a'));
      for (const kind of ['ghost', 'jumpscare', 'card-hand', 'glitch'] as const) {
        const layer = port.visual.createOverlay(kind);
        layer.setMarkup(SQUARE);
        layer.setOpacity(1, 300);
      }
      expect(env.overlays()).toHaveLength(4);
      env.scheduler.advance(500);
      env.gate.endReturnMoment(fadeMs);
      env.scheduler.advance(100);
      expect(env.overlays()).toHaveLength(0);
      expect(env.scheduler.pendingCount).toBe(0);
    },
  );
});

describe('the 3000 ms guard (Requirements 3.2, 9.8)', () => {
  it('starts the fade at 2920 ms, ends the state and removes overlays and the return channel by 3000 ms', async () => {
    const env = makeEnv();
    const ctx = await env.unlock();
    env.gate.beginReturnMoment();
    const port = expectPort(env.gate.openReturn('jump', { jumpSound: true }));
    const layer = port.visual.createOverlay('jumpscare');
    layer.setMarkup(SQUARE);
    layer.setOpacity(1, 300);
    port.audio.setGain(1);
    const channel = ctx.nodesOfKind('gain')[1] as FakeGainNode;
    const connected = (): boolean => ctx.connections.some((c) => c.from === channel);

    env.scheduler.advance(RETURN_MAX_MS - 81); // 2919
    expect(env.overlays()[0].style.opacity).toBe('1');
    env.scheduler.advance(1); // 2920: guard fade starts, state still open
    expect(env.overlays()[0].style.opacity).toBe('0');
    expect(env.overlays()[0].style.transitionDuration).toBe('80ms');
    expect(env.gate.openReturn('still-open')).not.toBeNull();
    env.scheduler.advance(RETURN_MAX_MS - 1 - 2920); // 2999
    expect(env.overlays()).toHaveLength(1);
    expect(connected()).toBe(true);
    env.scheduler.advance(1); // 3000
    expect(env.clock.now()).toBe(RETURN_MAX_MS);
    expect(env.overlays()).toHaveLength(0);
    expect(connected()).toBe(false);
    expect(env.gate.openReturn('late')).toBeNull();
    expect(env.scheduler.pendingCount).toBe(0);
  });

  it('does not touch a normal port that was opened before the Return_Moment', () => {
    const env = makeEnv();
    const normal = env.gate.open('normal');
    let ticks = 0;
    normal.audio.onTick(() => void ticks++, 1000);
    env.gate.beginReturnMoment();
    env.gate.openReturn('a')?.visual.createOverlay('ghost');
    env.scheduler.advance(RETURN_MAX_MS + 1000);
    expect(env.overlays()).toHaveLength(0);
    expect(ticks).toBe(4);
  });
});

describe('onTick on a ReturnPort (Requirements 5.13, 9.8)', () => {
  it('reports a throwing callback to warn and keeps the other callbacks and its own schedule', () => {
    const env = makeEnv();
    env.gate.beginReturnMoment();
    const port = expectPort(env.gate.openReturn('a'));
    let bad = 0;
    let good = 0;
    port.audio.onTick(() => {
      bad++;
      throw new Error('return boom');
    }, 100);
    port.audio.onTick(() => void good++, 100);
    env.scheduler.advance(300);
    expect([bad, good]).toEqual([3, 3]);
    expect(env.warnings).toHaveLength(3);
    expect(env.warnings[0]).toContain('return boom');
    env.gate.endReturnMoment(0);
  });

  it('a throwing tick on a normal port does not stop a tick on a return port', () => {
    const env = makeEnv();
    env.gate.open('n').audio.onTick(() => {
      throw new Error('normal boom');
    }, 100);
    env.gate.beginReturnMoment();
    let good = 0;
    expectPort(env.gate.openReturn('a')).audio.onTick(() => void good++, 100);
    env.scheduler.advance(300);
    expect(good).toBe(3);
    expect(env.warnings).toHaveLength(3);
    env.gate.endReturnMoment(0);
  });

  it('stops ticks when the port closes itself', () => {
    const env = makeEnv();
    const normal = env.gate.open('n');
    let n = 0;
    normal.audio.onTick(() => void n++, 100);
    env.scheduler.advance(250);
    normal.close();
    env.scheduler.advance(1000);
    expect(n).toBe(2);
    env.gate.beginReturnMoment();
    const port = expectPort(env.gate.openReturn('a'));
    let r = 0;
    port.audio.onTick(() => void r++, 100);
    env.scheduler.advance(250);
    port.close();
    env.scheduler.advance(1000);
    expect(r).toBe(2);
    env.gate.endReturnMoment(0);
    expect(env.scheduler.pendingCount).toBe(0);
  });

  it('stops ticks of a ReturnPort closed by endReturnMoment, and ends the tick schedule', () => {
    const env = makeEnv();
    env.gate.beginReturnMoment();
    const port = expectPort(env.gate.openReturn('a'));
    let n = 0;
    port.audio.onTick(() => void n++, 100);
    env.scheduler.advance(350);
    expect(n).toBe(3);
    env.gate.endReturnMoment(80);
    env.scheduler.advance(100);
    const atEnd = n;
    env.scheduler.advance(2000);
    expect(n).toBe(atEnd);
    expect(env.scheduler.pendingCount).toBe(0);
  });

  it('stops ticks of a ReturnPort when the guard ends the moment', () => {
    const env = makeEnv();
    env.gate.beginReturnMoment();
    let n = 0;
    expectPort(env.gate.openReturn('a')).audio.onTick(() => void n++, 100);
    env.scheduler.advance(RETURN_MAX_MS);
    const atEnd = n;
    env.scheduler.advance(2000);
    expect(n).toBe(atEnd);
    expect(env.scheduler.pendingCount).toBe(0);
  });
});

describe('labels (Requirement 2.12)', () => {
  it('setLabel on an overlay sets role="img" and aria-label; an unlabelled overlay is aria-hidden', () => {
    const env = makeEnv();
    env.gate.beginReturnMoment();
    const port = expectPort(env.gate.openReturn('a'));
    const labelled = port.visual.createOverlay('ghost');
    port.visual.createOverlay('card-hand');
    const [first, second] = env.overlays();
    expect(first.getAttribute('aria-hidden')).toBe('true');
    expect(second.getAttribute('aria-hidden')).toBe('true');
    labelled.setLabel('A pale figure stands in the room');
    expect(first.getAttribute('role')).toBe('img');
    expect(first.getAttribute('aria-label')).toBe('A pale figure stands in the room');
    expect(first.hasAttribute('aria-hidden')).toBe(false);
    expect(second.getAttribute('aria-hidden')).toBe('true');
    expect(second.hasAttribute('role')).toBe(false);
    labelled.setLabel('');
    expect(first.getAttribute('aria-hidden')).toBe('true');
    expect(first.hasAttribute('aria-label')).toBe(false);
    env.gate.endReturnMoment(0);
  });

  it('setLabel on a side layer of a ReturnPort sets role="img" and aria-label; unlabelled layers are aria-hidden', () => {
    const env = makeEnv();
    env.gate.beginReturnMoment();
    const port = expectPort(env.gate.openReturn('a'));
    const labelled = port.visual.createLayer('left');
    port.visual.createLayer('left');
    const [one, two] = Array.from(env.left.querySelectorAll('.haunt-layer'));
    labelled.setLabel('A shadow beside the page');
    expect(one.getAttribute('role')).toBe('img');
    expect(one.getAttribute('aria-label')).toBe('A shadow beside the page');
    expect(one.hasAttribute('aria-hidden')).toBe(false);
    expect(two.getAttribute('aria-hidden')).toBe('true');
    env.gate.endReturnMoment(0);
  });

  it('a label set after the end changes nothing (the overlay is already gone)', () => {
    const env = makeEnv();
    env.gate.beginReturnMoment();
    const layer = expectPort(env.gate.openReturn('a')).visual.createOverlay('ghost');
    env.gate.endReturnMoment(0);
    layer.setLabel('Too late');
    expect(env.overlays()).toHaveLength(0);
    expect(document.querySelector('[aria-label="Too late"]')).toBeNull();
  });
});
