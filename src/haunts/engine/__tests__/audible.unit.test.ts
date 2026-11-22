/**
 * `AudioOut.onAudibleChange` on the real gate and real audio adapter, driven by the fake
 * AudioContext. Audible = sound setting on AND unlocked AND context `running`.
 */
import { describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import { KEYS } from '../settings';
import type { Gate, GatePort } from '../types';
import {
  createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
  type FakeAudioContext, type FakeAudioContextFactory,
} from './fakes';

interface Env {
  readonly gate: Gate;
  readonly factory: FakeAudioContextFactory;
  readonly unlock: EventTarget;
}

function makeEnv(): Env {
  const { clock } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const unlock = new EventTarget();
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  const gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlock },
    hosts: { root, left, right },
    storage: createFakeStorage({ [KEYS.volumeCap]: '1' }),
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(false).matchMedia),
  });
  return { gate, factory, unlock };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function unlockAudio(env: Env): Promise<FakeAudioContext> {
  env.unlock.dispatchEvent(new Event('pointerdown'));
  await flush();
  const ctx = env.factory.contexts[0];
  if (ctx === undefined || ctx.state !== 'running') throw new Error('audio did not unlock in the test setup');
  return ctx;
}

function watch(port: GatePort): { calls: boolean[]; off: () => void } {
  const calls: boolean[] = [];
  const off = port.audio.onAudibleChange((a) => void calls.push(a));
  return { calls, off };
}

describe('AudioOut.onAudibleChange (real gate)', () => {
  it('calls back at once with false before unlock, then true after unlock and running', async () => {
    const env = makeEnv();
    const w = watch(env.gate.open('a'));
    expect(w.calls).toEqual([false]);
    await unlockAudio(env);
    expect(w.calls).toEqual([false, true]);
  });

  it('calls back at once with true when already audible', async () => {
    const env = makeEnv();
    await unlockAudio(env);
    expect(watch(env.gate.open('a')).calls).toEqual([true]);
  });

  it('follows the sound setting in both directions', async () => {
    const env = makeEnv();
    const w = watch(env.gate.open('a'));
    await unlockAudio(env);
    env.gate.setSoundEnabled(false);
    expect(w.calls).toEqual([false, true, false]);
    env.gate.setSoundEnabled(true);
    expect(w.calls).toEqual([false, true, false, true]);
  });

  it('stays false while sound is off even after unlock, and turns true when sound comes on', async () => {
    const env = makeEnv();
    env.gate.setSoundEnabled(false);
    const w = watch(env.gate.open('a'));
    await unlockAudio(env);
    expect(w.calls).toEqual([false]);
    env.gate.setSoundEnabled(true);
    expect(w.calls).toEqual([false, true]);
  });

  it('follows the context state: false on suspended and interrupted, true again on running', async () => {
    const env = makeEnv();
    const ctx = await unlockAudio(env);
    const w = watch(env.gate.open('a'));
    ctx.setState('suspended');
    ctx.setState('running');
    ctx.setState('interrupted');
    ctx.setState('running');
    expect(w.calls).toEqual([true, false, true, false, true]);
  });

  it('makes no duplicate calls for an unchanged state', async () => {
    const env = makeEnv();
    const ctx = await unlockAudio(env);
    const w = watch(env.gate.open('a'));
    env.gate.setSoundEnabled(true);
    env.gate.unlockAudio();
    await flush();
    ctx.setState('suspended');
    ctx.setState('interrupted'); // still not audible
    env.gate.setSoundEnabled(false); // still not audible
    expect(w.calls).toEqual([true, false]);
  });

  it('stops calling after unsubscribe', async () => {
    const env = makeEnv();
    const w = watch(env.gate.open('a'));
    w.off();
    await unlockAudio(env);
    env.gate.setSoundEnabled(false);
    expect(w.calls).toEqual([false]);
  });

  it('stops calling after the port is closed, but keeps calling after fadeOut', async () => {
    const env = makeEnv();
    const port = env.gate.open('a');
    const w = watch(port);
    await unlockAudio(env);
    port.fadeOut(300);
    env.gate.setSoundEnabled(false);
    expect(w.calls).toEqual([false, true, false]);
    port.close();
    env.gate.setSoundEnabled(true);
    expect(w.calls).toEqual([false, true, false]);
    expect(watch(port).calls).toEqual([]); // a closed port accepts no new subscribers
  });

  it('stops calling after gate.dispose()', async () => {
    const env = makeEnv();
    const ctx = await unlockAudio(env);
    const w = watch(env.gate.open('a'));
    env.gate.dispose();
    env.gate.setSoundEnabled(false);
    ctx.setState('suspended');
    ctx.setState('running');
    expect(w.calls).toEqual([true]);
  });

  it('notifies each of two ports, and closing one leaves the other', async () => {
    const env = makeEnv();
    const p1 = env.gate.open('a');
    const p2 = env.gate.open('b');
    const w1 = watch(p1);
    const w2 = watch(p2);
    await unlockAudio(env);
    expect(w1.calls).toEqual([false, true]);
    expect(w2.calls).toEqual([false, true]);
    p1.close();
    env.gate.setSoundEnabled(false);
    expect(w1.calls).toEqual([false, true]);
    expect(w2.calls).toEqual([false, true, false]);
  });
});
