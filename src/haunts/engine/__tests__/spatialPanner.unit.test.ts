/**
 * Spatial panner wrapper and the one-time listener setup (ghost-dread task 3.4; Req 1.5, 1.6, 1.15,
 * 13.6, 13.7). The real audio adapter and restricted context run against the fake AudioContext.
 */
import { describe, expect, it } from 'vitest';
import { createAudioAdapter } from '../gate/audioAdapter';
import type { HauntAudioContext } from '../hauntAudio';
import {
  FakeAudioContext, FakePannerNode, createFakeAudioContextFactory, createFakeTime,
  type FakeAudioContextOptions,
} from './fakes';

async function setup(
  options: Omit<FakeAudioContextOptions, 'clock'> = {}, ports = 1,
): Promise<{ fake: FakeAudioContext; ctxs: HauntAudioContext[] }> {
  const { clock } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock, options);
  const adapter = createAudioAdapter({ createAudioContext: factory.create, eventTarget: null });
  const ctxs: HauntAudioContext[] = [];
  const channels = Array.from({ length: ports }, () => adapter.openChannel());
  adapter.unlock();
  await Promise.resolve();
  await Promise.resolve();
  for (const c of channels) c.whenReady((ctx) => void ctxs.push(ctx));
  return { fake: factory.contexts[0], ctxs };
}

function rawPanner(fake: FakeAudioContext): FakePannerNode {
  const n = fake.nodesOfKind('panner')[0];
  if (!(n instanceof FakePannerNode)) throw new Error('no panner was created');
  return n;
}

describe('spatial panner wrapper', () => {
  it('fixes HRTF, inverse distance, reference distance 0.5 and an omnidirectional cone', async () => {
    const { fake, ctxs } = await setup();
    const w = ctxs[0].createSpatialPanner();
    expect(w).not.toBeNull();
    const n = rawPanner(fake);
    expect(n.panningModel).toBe('HRTF');
    expect(n.distanceModel).toBe('inverse');
    expect(n.refDistance).toBe(0.5);
    expect(n.rolloffFactor).toBe(1);
    expect([n.coneInnerAngle, n.coneOuterAngle, n.coneOuterGain]).toEqual([360, 0, 0]);
  });

  it('exposes only the three position params, and writes to other names never reach the real node', async () => {
    const { fake, ctxs } = await setup();
    const w = ctxs[0].createSpatialPanner();
    if (w === null) throw new Error('expected a panner');
    const n = rawPanner(fake);
    const own = Object.keys(w).sort();
    expect(own).toEqual(['connect', 'disconnect', 'isHauntSink', 'positionX', 'positionY', 'positionZ']);
    for (const bad of ['destination', 'context', 'panningModel', 'distanceModel', 'refDistance', 'node']) {
      expect(bad in w).toBe(false);
    }
    Object.assign(w, { panningModel: 'equalpower', refDistance: 100, coneOuterGain: 1 });
    expect([n.panningModel, n.refDistance, n.coneOuterGain]).toEqual(['HRTF', 0.5, 0]);
  });

  it('moves the real position params and routes only through the port input', async () => {
    const { fake, ctxs } = await setup();
    const ctx = ctxs[0];
    const w = ctx.createSpatialPanner();
    if (w === null) throw new Error('expected a panner');
    const n = rawPanner(fake);
    w.positionX.setValueAtTime(1, 0);
    w.positionX.linearRampToValueAtTime(2, 1.5);
    w.positionZ.setValueAtTime(-3, 0);
    expect(n.positionX?.calls.map((c) => [c.type, c.value, c.time])).toEqual([
      ['setValueAtTime', 1, 0], ['linearRampToValueAtTime', 2, 1.5],
    ]);
    expect(n.positionZ?.calls.map((c) => c.value)).toEqual([-3]);
    expect(() => w.connect({ isHauntSink: true } as never)).toThrow(TypeError);
    w.connect(ctx.input);
    const paths = fake.pathsToDestination(n);
    expect(paths.map((p) => p.map((x) => x.kind))).toEqual([['panner', 'gain', 'gain', 'compressor', 'destination']]);
  });

  it('uses setPosition with the stored triple when positionX is missing', async () => {
    const { fake, ctxs } = await setup({ pannerWithoutPositionParams: true });
    const w = ctxs[0].createSpatialPanner();
    if (w === null) throw new Error('expected a panner');
    const n = rawPanner(fake);
    expect(n.positionX).toBeUndefined();
    w.positionX.setValueAtTime(1, 0);
    w.positionZ.linearRampToValueAtTime(-2, 5);
    w.positionY.setValueAtTime(0.5, 0);
    w.positionX.cancelScheduledValues(0);
    expect(n.setPositionCalls).toEqual([[1, 0, 0], [1, 0, -2], [1, 0.5, -2]]);
  });

  it('returns null without throwing when createPanner throws, and other nodes still work', async () => {
    const { fake, ctxs } = await setup({ createPannerThrows: true });
    expect(ctxs[0].createSpatialPanner()).toBeNull();
    expect(fake.nodesOfKind('panner')).toEqual([]);
    expect(() => ctxs[0].createStereoPanner()).not.toThrow();
  });
});

describe('listener', () => {
  it('is set once to origin, facing -Z, +Y up, through the AudioParams when they exist', async () => {
    const { fake } = await setup({}, 2);
    const l = fake.listener;
    const values = [l.positionX, l.positionY, l.positionZ, l.forwardX, l.forwardY, l.forwardZ, l.upX, l.upY, l.upZ]
      .map((p) => p?.calls.map((c) => [c.type, c.value]));
    expect(values).toEqual([
      [['setValueAtTime', 0]], [['setValueAtTime', 0]], [['setValueAtTime', 0]],
      [['setValueAtTime', 0]], [['setValueAtTime', 0]], [['setValueAtTime', -1]],
      [['setValueAtTime', 0]], [['setValueAtTime', 1]], [['setValueAtTime', 0]],
    ]);
    expect(l.setPositionCalls).toEqual([]);
    expect(l.setOrientationCalls).toEqual([]);
  });

  it('uses setPosition and setOrientation, once, when the listener has no AudioParams', async () => {
    const { fake } = await setup({ listenerWithoutParams: true }, 2);
    expect(fake.listener.positionX).toBeUndefined();
    expect(fake.listener.setPositionCalls).toEqual([[0, 0, 0]]);
    expect(fake.listener.setOrientationCalls).toEqual([[0, 0, -1, 0, 1, 0]]);
  });
});
