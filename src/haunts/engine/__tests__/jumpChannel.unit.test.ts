/**
 * Gain plan rule 5 (jump channel), run through the real `runAudioPass`, `planGains` and audio
 * adapter on the fake AudioContext. Requirements 5.10, 9.4, 9.7.
 */
import { describe, expect, it } from 'vitest';
import { createAudioAdapter, type AudioAdapter } from '../gate/audioAdapter';
import type { RampKind } from '../gate/audioTypes';
import { runAudioPass, type AudioPassInput } from '../gate/audioPass';
import { jumpHeadroom } from '../gate/returnRules';
import { FakeClock, FakeGainNode, createFakeAudioContextFactory, createFakeTime } from './fakes';

type Port = AudioPassInput['ports'][number] & { requested: number; sent: number };

interface Rig {
  readonly clock: FakeClock;
  readonly adapter: AudioAdapter;
  /** Open a port. Channel gain nodes are created at unlock, in open order, after the master node. */
  open(id: string, jumpSound: boolean): Port;
  pass(ports: Port[], opts?: { cap?: number; reduced?: boolean; soundOn?: boolean; kind?: RampKind }): void;
  /** The channel GainNode of the n-th opened port (0-based). */
  node(n: number): FakeGainNode;
  /** Sum of every channel gain at context time `t`. */
  combinedAt(count: number, t: number): number;
}

function rig(): Rig {
  const { clock } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const adapter = createAudioAdapter({ createAudioContext: factory.create, eventTarget: null });
  const ports: Port[] = [];
  const r: Rig = {
    clock,
    adapter,
    open(id, jumpSound) {
      const port: Port = { id, channel: adapter.openChannel({ jumpSound }), requested: 0, faded: false, sent: 0 };
      ports.push(port);
      return port;
    },
    pass(list, o = {}) {
      runAudioPass({
        ports: list, kind: o.kind ?? 'fade', capDropped: false, deadlineSec: null, soundOn: o.soundOn ?? true,
        audioReady: adapter.isReady(), cap: o.cap ?? 0.4, reduced: o.reduced ?? false, nowSec: adapter.now(),
      });
    },
    node: (n) => factory.contexts[0].nodesOfKind('gain')[n + 1] as FakeGainNode,
    combinedAt(count, t) {
      let sum = 0;
      for (let i = 0; i < count; i++) sum += r.node(i).gain.valueAt(t);
      return sum;
    },
  };
  return r;
}

/** Opens the given ports, then unlocks audio (unless `unlock` is false). */
async function start(kinds: boolean[], unlock = true): Promise<{ r: Rig; ports: Port[] }> {
  const r = rig();
  const ports = kinds.map((jump, i) => r.open(`p${i}`, jump));
  if (unlock) {
    r.adapter.unlock();
    await Promise.resolve();
    await Promise.resolve();
  }
  return { r, ports };
}

const EPS = 1e-9;

describe('jump channel: attack', () => {
  it('a jump rise lasts 20 ms and reaches its target', async () => {
    const { r, ports } = await start([true]);
    ports[0].requested = 0.3;
    r.pass(ports);
    const flight = ports[0].channel.inFlight();
    expect(flight?.target).toBeCloseTo(0.3, 9);
    expect((flight?.endSec ?? 0) - r.adapter.now()).toBeCloseTo(0.02, 9);
    expect(r.node(0).gain.valueAt(0.01)).toBeCloseTo(0.15, 9);
    expect(r.node(0).gain.valueAt(0.02)).toBeCloseTo(0.3, 9);
  });

  it('under reduced motion the jump rise lasts 300 ms', async () => {
    const { r, ports } = await start([true]);
    ports[0].requested = 0.3;
    r.pass(ports, { reduced: true });
    expect((ports[0].channel.inFlight()?.endSec ?? 0) - r.adapter.now()).toBeCloseTo(0.3, 9);
    expect(r.node(0).gain.valueAt(0.15)).toBeCloseTo(0.15, 9);
  });

  it('non-jump channels keep the 300 ms fade-in (1000 ms reduced)', async () => {
    const { r, ports } = await start([false]);
    ports[0].requested = 0.3;
    r.pass(ports);
    expect((ports[0].channel.inFlight()?.endSec ?? 0) - r.adapter.now()).toBeCloseTo(0.3, 9);
    const reduced = await start([false]);
    reduced.ports[0].requested = 0.3;
    reduced.r.pass(reduced.ports, { reduced: true });
    expect((reduced.ports[0].channel.inFlight()?.endSec ?? 0) - reduced.r.adapter.now()).toBeCloseTo(1, 9);
  });

  it('a non-jump channel cannot get the short attack even if a ramp asks for it', async () => {
    const { r, ports } = await start([false]);
    ports[0].channel.setGain(0.3, { kind: 'fade', reduced: false, jump: true });
    expect((ports[0].channel.inFlight()?.endSec ?? 0) - r.adapter.now()).toBeCloseTo(0.3, 9);
  });

  it('only a channel opened with jumpSound reports jumpSound', async () => {
    const { ports } = await start([true, false]);
    expect(ports.map((p) => p.channel.jumpSound)).toEqual([true, false]);
  });
});

describe('jump channel: headroom and cap', () => {
  it('targets at most the headroom left by other channels and keeps the combined gain at or below the cap', async () => {
    const { r, ports } = await start([false, true]);
    ports[0].requested = 0.3;
    r.pass(ports);
    r.clock.advance(1000); // ambient settled at 0.3
    expect(ports[0].channel.currentGain()).toBeCloseTo(0.3, 9);
    ports[1].requested = 0.4;
    r.pass(ports);
    const headroom = jumpHeadroom(0.4, [ports[0].channel.currentGain()]);
    expect(headroom).toBeCloseTo(0.1, 9);
    expect(ports[1].channel.inFlight()?.target).toBeLessThanOrEqual(headroom + EPS);
    expect(ports[1].channel.inFlight()?.target).toBeGreaterThan(0);
    const t0 = r.adapter.now();
    let worst = 0;
    for (let ms = 0; ms <= 1500; ms += 5) worst = Math.max(worst, r.combinedAt(2, t0 + ms / 1000));
    expect(worst).toBeLessThanOrEqual(0.4 + EPS);
  });

  it('plays nothing when the other channels already use the whole cap', async () => {
    const { r, ports } = await start([false, false, true]);
    ports[0].requested = 0.2;
    ports[1].requested = 0.2;
    r.pass(ports);
    r.clock.advance(1000);
    ports[2].requested = 0.4;
    r.pass(ports);
    const t0 = r.adapter.now();
    expect(r.node(2).gain.maxValueOver(t0, t0 + 2)).toBe(0);
    expect(ports[2].channel.inFlight()).toBeNull();
  });

  it('with no other sound, the jump may use the whole cap', async () => {
    const { r, ports } = await start([true]);
    ports[0].requested = 1;
    r.pass(ports, { cap: 0.4 });
    expect(ports[0].channel.inFlight()?.target).toBeCloseTo(0.4, 9);
    expect(r.node(0).gain.maxValueOver(0, 2)).toBeLessThanOrEqual(0.4 + EPS);
  });
});

describe('jump channel: other rises are held', () => {
  it('a new ambient rise requested together with the jump waits until the jump rise ends', async () => {
    const { r, ports } = await start([true, false]);
    ports[0].requested = 0.1;
    ports[1].requested = 0.1;
    r.pass(ports);
    const t0 = r.adapter.now();
    expect(r.node(1).gain.maxValueOver(t0, t0 + 1)).toBe(0);
    expect(ports[1].sent).toBe(0);
    r.clock.advance(20); // jump rise over
    r.pass(ports);
    expect(ports[0].channel.currentGain()).toBeCloseTo(0.1, 9);
    expect(ports[1].channel.inFlight()?.target).toBeCloseTo(0.1, 9);
    expect((ports[1].channel.inFlight()?.endSec ?? 0) - r.adapter.now()).toBeCloseTo(0.3, 9);
  });

  it('an ambient rise already running stops where it is when a jump rise starts', async () => {
    const { r, ports } = await start([false, true]);
    ports[0].requested = 0.2;
    r.pass(ports);
    r.clock.advance(100);
    const held = ports[0].channel.currentGain();
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThan(0.2);
    ports[1].requested = 0.1;
    r.pass(ports);
    const t0 = r.adapter.now();
    for (const ms of [0, 20, 100, 300, 1000]) expect(r.node(0).gain.valueAt(t0 + ms / 1000)).toBeCloseTo(held, 9);
    expect(r.node(1).gain.valueAt(t0 + 0.02)).toBeGreaterThan(0);
  });

  it('only one jump channel rises in a pass', async () => {
    const { r, ports } = await start([true, true]);
    ports[0].requested = 0.1;
    ports[1].requested = 0.1;
    r.pass(ports);
    const t0 = r.adapter.now();
    expect(ports[0].channel.inFlight()?.target).toBeCloseTo(0.1, 9);
    expect(r.node(1).gain.maxValueOver(t0, t0 + 1)).toBe(0);
    r.clock.advance(20);
    r.pass(ports);
    expect(ports[1].channel.inFlight()?.target).toBeGreaterThan(0);
    const t1 = r.adapter.now();
    let worst = 0;
    for (let ms = 0; ms <= 1000; ms += 5) worst = Math.max(worst, r.combinedAt(2, t1 + ms / 1000));
    expect(worst).toBeLessThanOrEqual(0.4 + EPS);
  });
});

describe('jump channel: no sound without sound', () => {
  it('plays nothing while audio is locked', async () => {
    const { r, ports } = await start([true], false);
    ports[0].requested = 0.3;
    r.pass(ports);
    expect(r.adapter.isReady()).toBe(false);
    expect(ports[0].channel.currentGain()).toBe(0);
    expect(ports[0].channel.inFlight()).toBeNull();
    expect(r.adapter.now()).toBe(0);
  });

  it('plays nothing when sound is off, even after audio unlocks', async () => {
    const { r, ports } = await start([true]);
    ports[0].requested = 0.3;
    r.pass(ports, { soundOn: false });
    r.clock.advance(500);
    r.pass(ports, { soundOn: false });
    expect(r.adapter.isReady()).toBe(true);
    expect(ports[0].channel.inFlight()).toBeNull();
    expect(r.node(0).gain.maxValueOver(0, 2)).toBe(0);
  });

  it('a request made while locked is not played as a startle after unlock with sound off', async () => {
    const { r, ports } = await start([true], false);
    ports[0].requested = 0.3;
    r.pass(ports, { soundOn: false });
    r.adapter.unlock();
    await Promise.resolve();
    await Promise.resolve();
    r.pass(ports, { soundOn: false });
    expect(r.node(0).gain.maxValueOver(0, 2)).toBe(0);
  });
});
