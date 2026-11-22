/**
 * Restricted audio context (decision 2): a haunt-like caller holding only the context from
 * `whenReady` cannot reach `destination`. Uses the real audio adapter on the fake AudioContext.
 */
import { describe, expect, it } from 'vitest';
import { createAudioAdapter } from '../gate/audioAdapter';
import type { HauntAudioContext } from '../hauntAudio';
import { createNoiseBuffer } from '../noise';
import {
  FakeAudioContext, FakeAudioNode, FakeAudioParam, createFakeAudioContextFactory, createFakeTime,
} from './fakes';

const FORBIDDEN = [
  'destination', 'context', 'audioWorklet', 'createGain', 'createMediaStreamDestination',
  'createMediaElementSource', 'createDynamicsCompressor', 'createMediaStreamSource', 'ctx',
];

async function setup(ports = 1): Promise<{ fake: FakeAudioContext; ctxs: HauntAudioContext[] }> {
  const { clock } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const adapter = createAudioAdapter({ createAudioContext: factory.create, eventTarget: null });
  const ctxs: HauntAudioContext[] = [];
  const channels = Array.from({ length: ports }, () => adapter.openChannel());
  adapter.unlock();
  await Promise.resolve();
  await Promise.resolve();
  for (const c of channels) c.whenReady((ctx) => void ctxs.push(ctx));
  return { fake: factory.contexts[0], ctxs };
}

/** Own and inherited property names, every value reachable through properties, forbidden names. */
function inspect(root: object): { names: string[]; leaks: string[] } {
  const seen = new Set<object>();
  const names: string[] = [];
  const leaks: string[] = [];
  const visit = (obj: object, path: string): void => {
    if (seen.has(obj)) return;
    seen.add(obj);
    for (let o: object | null = obj; o !== null && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      for (const key of Reflect.ownKeys(o)) {
        if (typeof key === 'symbol') continue;
        names.push(key);
        const value: unknown = Reflect.get(obj, key);
        if (value instanceof FakeAudioNode || value instanceof FakeAudioContext || value instanceof FakeAudioParam) {
          leaks.push(`${path}.${key}`);
        } else if (typeof value === 'object' && value !== null) visit(value, `${path}.${key}`);
      }
    }
  };
  visit(root, 'ctx');
  return { names, leaks };
}

describe('restricted audio context', () => {
  it('exposes no destination, raw context or graph-routing factories, on the context or any wrapper', async () => {
    const { ctxs } = await setup();
    const ctx = ctxs[0];
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const panner = ctx.createStereoPanner();
    for (const root of [ctx, source, filter, panner, ctx.input]) {
      const { names, leaks } = inspect(root);
      expect(leaks).toEqual([]);
      for (const bad of FORBIDDEN) {
        expect(bad in root).toBe(false);
        expect(names).not.toContain(bad);
      }
    }
    expect('connect' in ctx.input).toBe(false);
  });

  it('throws when connecting to anything but a wrapper of the same port or the port input', async () => {
    const { fake, ctxs } = await setup(2);
    const [a, b] = ctxs;
    const source = a.createBufferSource();
    const raw = fake.nodesOfKind('bufferSource')[0];
    const targets: unknown[] = [
      fake.destination, raw, fake.createGain(), { isHauntSink: true }, null, undefined, 5,
      b.createBiquadFilter(), b.input,
    ];
    for (const t of targets) expect(() => source.connect(t as never)).toThrow(TypeError);
    expect(fake.connections.filter((e) => e.from === raw)).toEqual([]);
    expect(() => source.connect(a.createBiquadFilter())).not.toThrow();
    expect(() => source.connect(a.input)).not.toThrow();
  });

  it('routes source -> filter -> panner -> input only through channel gain, master gain and compressor', async () => {
    const { fake, ctxs } = await setup();
    const ctx = ctxs[0];
    const source = ctx.createBufferSource();
    source.buffer = createNoiseBuffer(ctx, 0.1);
    expect(source.buffer.length).toBe(Math.round(0.1 * ctx.sampleRate));
    source.connect(ctx.createBiquadFilter()).connect(ctx.createStereoPanner()).connect(ctx.input);
    const raw = fake.nodesOfKind('bufferSource')[0];
    const paths = fake.pathsToDestination(raw);
    expect(paths).toHaveLength(1);
    expect(paths[0].map((n) => n.kind)).toEqual(
      ['bufferSource', 'biquad', 'stereoPanner', 'gain', 'gain', 'compressor', 'destination'],
    );
    const intoDestination = fake.connections.filter((e) => e.to === fake.destination);
    expect(intoDestination.map((e) => e.from.kind)).toEqual(['compressor']);
    expect(fake.effectiveGainAt(raw, fake.currentTime)).toBe(0); // channel gain starts silent
  });
});
