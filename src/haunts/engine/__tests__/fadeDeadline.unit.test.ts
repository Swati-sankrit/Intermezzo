/**
 * Regression for the Property 23 counterexample (seed -1775563803): a later planning pass re-issued a
 * channel that was still falling and gave it a fresh 800 ms, so the fall ended after its original
 * deadline. Real gate and audio adapter against the fake AudioContext.
 */
import { describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import { KEYS } from '../settings';
import type { Gate } from '../types';
import {
  FakeAudioNode, FakeGainNode, createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
} from './fakes';

async function setup(cap: string) {
  const { clock, scheduler } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const unlockTarget = new EventTarget();
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  document.body.append(root);
  const gate: Gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlockTarget },
    hosts: { root, left, right },
    storage: createFakeStorage({ [KEYS.volumeCap]: cap }),
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(false).matchMedia),
    scheduler,
  });
  unlockTarget.dispatchEvent(new Event('pointerdown'));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const ctx = factory.contexts[0];
  if (ctx === undefined || ctx.state !== 'running') throw new Error('audio did not unlock in the test setup');
  const toCompressor = ctx.connections.find((e) => e.to instanceof FakeAudioNode && e.to.kind === 'compressor');
  if (toCompressor === undefined) throw new Error('master gain not found');
  const channels = (): FakeGainNode[] =>
    ctx.connections.filter((e) => e.to === toCompressor.from && e.from instanceof FakeGainNode).map((e) => e.from as FakeGainNode);
  return { gate, ctx, clock, root, channels };
}

describe('a faded port keeps its original fall deadline', () => {
  it('a later pass (reduced motion on, 300 ms in) does not push the end past fade start + 800 ms', async () => {
    const { gate, ctx, clock, root, channels } = await setup('0.02');
    const port = gate.open('a');
    const [ch] = channels();
    port.audio.setGain(1);
    clock.advance(1000);
    expect(ch.gain.valueAt(ctx.currentTime)).toBeCloseTo(0.02, 10);
    const t0 = ctx.currentTime;
    port.fadeOut(800);
    clock.advance(300);
    gate.setReducedMotion(true); // a fresh planning pass while the channel is still falling
    const deadline = t0 + 0.8;
    expect(ch.gain.valueAt(t0 + 0.3)).toBeGreaterThan(0);
    expect(ch.gain.valueAt(deadline)).toBe(0);
    expect(ch.gain.maxValueOver(deadline, deadline + 10)).toBe(0);
    root.remove();
  });

  it('a second fade-out after 500 ms with a longer length does not extend the deadline', async () => {
    const { gate, ctx, clock, root, channels } = await setup('0.02');
    const port = gate.open('a');
    const [ch] = channels();
    port.audio.setGain(1);
    clock.advance(1000);
    const t0 = ctx.currentTime;
    port.fadeOut(800);
    clock.advance(500);
    port.fadeOut(800);
    const deadline = t0 + 0.8;
    expect(ch.gain.valueAt(deadline)).toBe(0);
    expect(ch.gain.maxValueOver(deadline, deadline + 10)).toBe(0);
    root.remove();
  });

  it('a pass after the deadline has passed sets the channel to 0 at once and never raises it', async () => {
    const { gate, ctx, clock, root, channels } = await setup('0.02');
    const port = gate.open('a');
    const [ch] = channels();
    port.audio.setGain(1);
    clock.advance(1000);
    port.fadeOut(800);
    clock.advance(1000);
    gate.setReducedMotion(true);
    expect(ch.gain.valueAt(ctx.currentTime)).toBe(0);
    expect(ch.gain.maxValueOver(ctx.currentTime, ctx.currentTime + 10)).toBe(0);
    root.remove();
  });
});
