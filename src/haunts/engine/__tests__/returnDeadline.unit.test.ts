/**
 * Regression for Property 24 (strict reading, haunt-safety: a Return_Moment lasts at most 3 s):
 * no overlay and no return channel (jump channels included) is in the page 3000 ms after `begin`,
 * whether the guard or `endReturnMoment` ended it. Real gate, fake clock and AudioContext.
 */
import { describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import { KEYS } from '../settings';
import {
  createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
  type FakeAudioContext, type FakeGainNode,
} from './fakes';

const SQUARE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="var(--shadow)"/></svg>';

async function setup() {
  const { clock, scheduler } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  document.body.append(root);
  const unlockTarget = new EventTarget();
  const gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlockTarget },
    hosts: { root, left, right },
    storage: createFakeStorage({ [KEYS.volumeCap]: '0.5' }),
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(false).matchMedia),
    scheduler,
  });
  unlockTarget.dispatchEvent(new Event('pointerdown'));
  for (let i = 0; i < 6; i++) await Promise.resolve();
  const ctx: FakeAudioContext = factory.contexts[0];
  const channel = (): FakeGainNode => ctx.nodesOfKind('gain')[1] as FakeGainNode;
  const connected = (): boolean => ctx.connections.some((c) => c.from === channel());
  const overlays = (): number => root.querySelectorAll('.haunt-overlay').length;
  return { gate, scheduler, clock, connected, overlays };
}

describe('Return_Moment deadline', () => {
  it('leaves no overlay and no jump channel at begin + 3000 ms when nobody ends it', async () => {
    const w = await setup();
    w.gate.beginReturnMoment();
    const port = w.gate.openReturn('jump', { jumpSound: true });
    port?.visual.createOverlay('jumpscare').setMarkup(SQUARE);
    port?.audio.setGain(1);
    w.scheduler.advance(2999);
    expect(w.overlays()).toBe(1);
    expect(w.connected()).toBe(true);
    expect(w.gate.openReturn('late')).not.toBeNull();
    w.scheduler.advance(1);
    expect(w.overlays()).toBe(0);
    expect(w.connected()).toBe(false);
    expect(w.gate.openReturn('late')).toBeNull();
    expect(w.scheduler.pendingCount).toBe(0);
  });

  it('starts the guard fade early: overlays are already faded to 0 before 3000', async () => {
    const w = await setup();
    w.gate.beginReturnMoment();
    w.gate.openReturn('a')?.visual.createOverlay('ghost').setMarkup(SQUARE);
    w.scheduler.advance(2950);
    const el = document.querySelector<HTMLElement>('.haunt-overlay');
    expect(el?.style.opacity).toBe('0');
  });

  it('cuts an endReturnMoment(100) fade at 2998 ms off at 3000 ms', async () => {
    const w = await setup();
    w.gate.beginReturnMoment();
    const port = w.gate.openReturn('jump', { jumpSound: true });
    port?.visual.createOverlay('jumpscare').setMarkup(SQUARE);
    port?.audio.setGain(1);
    w.scheduler.advance(2998);
    w.gate.endReturnMoment(100);
    expect(w.gate.openReturn('x')).toBeNull();
    w.scheduler.advance(1);
    expect(w.overlays()).toBe(1);
    w.scheduler.advance(1);
    expect(w.clock.now()).toBe(3000);
    expect(w.overlays()).toBe(0);
    expect(w.connected()).toBe(false);
    w.gate.endReturnMoment(100); // twice is safe
    w.scheduler.advance(200);
    expect(w.scheduler.pendingCount).toBe(0);
  });

  it('keeps the normal fade when the end comes early', async () => {
    const w = await setup();
    w.gate.beginReturnMoment();
    w.gate.openReturn('a')?.visual.createOverlay('ghost').setMarkup(SQUARE);
    w.scheduler.advance(500);
    w.gate.endReturnMoment(100);
    w.scheduler.advance(99);
    expect(w.overlays()).toBe(1);
    w.scheduler.advance(1);
    expect(w.overlays()).toBe(0);
    expect(w.scheduler.pendingCount).toBe(0);
  });
  it('while locked: a return port still waiting at begin + 3000 ms gets no gain node and no jump channel after unlock', async () => {
    const { clock, scheduler } = createFakeTime();
    const factory = createFakeAudioContextFactory(clock);
    const root = document.createElement('div');
    const left = document.createElement('div');
    const right = document.createElement('div');
    root.append(left, right);
    document.body.append(root);
    const unlockTarget = new EventTarget();
    const gate = createGate({
      audio: { createAudioContext: factory.create, eventTarget: unlockTarget },
      hosts: { root, left, right },
      storage: createFakeStorage({ [KEYS.volumeCap]: '0.5' }),
      storageEvents: null,
      reducedMotion: createReducedMotion(createFakeMatchMedia(false).matchMedia),
      scheduler,
    });
    const normal = gate.open('normal');
    normal.audio.setGain(1);
    gate.beginReturnMoment();
    const jump = gate.openReturn('jump', { jumpSound: true });
    jump?.audio.setGain(1);
    scheduler.advance(3100);
    unlockTarget.dispatchEvent(new Event('pointerdown'));
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const ctx: FakeAudioContext = factory.contexts[0];
    const gains = ctx.nodesOfKind('gain');
    expect(gains).toHaveLength(2); // master + the normal port only
    const master = gains[0] as FakeGainNode;
    const fed = ctx.connections.filter((c) => c.to === master && c.from !== master);
    expect(fed).toHaveLength(1);
    root.remove();
  });
});
