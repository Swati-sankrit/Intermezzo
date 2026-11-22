/**
 * Task 3.7 (subset requested by the user): `port.fadeOut`, `gate.fadeOutAll`, `port.close` and
 * `gate.dispose`. Real `createGate` with the real audio and visual adapters, driven by the
 * fakes in ./fakes.ts and jsdom host elements. Audio is unlocked through a fake `pointerdown`.
 */
import { describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { planFadeOut } from '../gate/plan';
import { createReducedMotion } from '../gate/reducedMotion';
import type { HauntAudioContext } from '../hauntAudio';
import { KEYS } from '../settings';
import type { Gate, GatePort, VisualLayer } from '../types';
import {
  FakeAudioContext, FakeAudioNode, FakeGainNode, createFakeAudioContextFactory, createFakeMatchMedia,
  createFakeStorage, createFakeTime, type FakeClock,
} from './fakes';

interface Env {
  readonly gate: Gate;
  readonly ctx: FakeAudioContext;
  readonly clock: FakeClock;
  readonly root: HTMLElement;
  readonly left: HTMLElement;
  readonly right: HTMLElement;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function makeEnv(reduced = false): Promise<Env> {
  const { clock } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const unlockTarget = new EventTarget();
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  document.body.append(root);
  const gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: unlockTarget },
    hosts: { root, left, right },
    storage: createFakeStorage({ [KEYS.volumeCap]: '1' }),
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(reduced).matchMedia),
  });
  unlockTarget.dispatchEvent(new Event('pointerdown'));
  await flush();
  const ctx = factory.contexts[0];
  if (ctx === undefined || ctx.state !== 'running') throw new Error('audio did not unlock in the test setup');
  return { gate, ctx, clock, root, left, right };
}

/** Channel gain nodes in the order the ports were opened (edges into the master gain). */
function channelNodes(ctx: FakeAudioContext): FakeGainNode[] {
  const toCompressor = ctx.connections.find((e) => e.to instanceof FakeAudioNode && e.to.kind === 'compressor');
  if (toCompressor === undefined) throw new Error('master gain not found');
  const out: FakeGainNode[] = [];
  for (const e of ctx.connections) if (e.to === toCompressor.from && e.from instanceof FakeGainNode) out.push(e.from);
  return out;
}

function ms(el: HTMLElement): number {
  return Number.parseFloat(el.style.transitionDuration);
}

/** The `div` the visual adapter made for a layer is the newest child of its region. */
function lastLayerEl(region: HTMLElement): HTMLElement {
  const el = region.lastElementChild;
  if (!(el instanceof HTMLElement)) throw new Error('no layer element');
  return el;
}

const FADE_MS: readonly number[] = [0, -20, Number.NaN, 49, 50, 300, 800, 801, 5000, Number.POSITIVE_INFINITY];
const MODES: readonly boolean[] = [false, true];

describe('port.fadeOut audio', () => {
  for (const reduced of MODES) {
    for (const requested of FADE_MS) {
      it(`gain reaches 0 within planFadeOut(${requested}) s, other port unchanged (reduced motion ${reduced})`, async () => {
        const { gate, ctx, clock } = await makeEnv(reduced);
        const a = gate.open('a');
        const b = gate.open('b');
        const [chA, chB] = channelNodes(ctx);
        a.audio.setGain(0.3);
        b.audio.setGain(0.2);
        clock.advance(2000);
        expect(chA.gain.valueAt(ctx.currentTime)).toBe(0.3);
        expect(chB.gain.valueAt(ctx.currentTime)).toBe(0.2);

        const t0 = ctx.currentTime;
        const bCallsBefore = chB.gain.calls.length;
        a.fadeOut(requested);

        const planned = planFadeOut(requested);
        expect(planned).toBeLessThanOrEqual(800);
        const end = t0 + planned / 1000;
        expect(chA.gain.valueAt(end)).toBe(0);
        expect(chA.gain.maxValueOver(end, end + 10)).toBe(0);
        // The fade is a ramp: it has not already jumped to zero at the call time.
        expect(chA.gain.valueAt(t0)).toBeGreaterThan(0);

        expect(chB.gain.calls.length).toBe(bCallsBefore);
        expect(chB.gain.maxValueOver(t0, end + 10)).toBe(0.2);
        expect(chB.gain.valueAt(end + 10)).toBe(0.2);
      });
    }
  }
});

describe('port.fadeOut visual', () => {
  for (const reduced of MODES) {
    for (const requested of FADE_MS) {
      it(`single port: glow and layer go to 0 with fade <= 800 ms (requested ${requested}, reduced ${reduced})`, async () => {
        const { gate, root, left } = await makeEnv(reduced);
        const a = gate.open('a');
        a.visual.glow.setDim(0.6);
        const layer = a.visual.createLayer('left');
        layer.setOpacity(1);
        const el = lastLayerEl(left);
        expect(el.style.opacity).toBe('1');
        expect(root.style.getPropertyValue('--glow-dim')).toBe('0.6');

        a.fadeOut(requested);

        const planned = planFadeOut(requested);
        expect(root.style.getPropertyValue('--glow-dim')).toBe('0');
        expect(root.style.getPropertyValue('--glow-fade')).toBe(`${planned}ms`);
        expect(planned).toBeLessThanOrEqual(800);
        expect(el.style.opacity).toBe('0');
        expect(ms(el)).toBe(planned);
        expect(ms(el)).toBeLessThanOrEqual(800);
      });
    }
  }

  it('another port keeps its own glow dim and layer opacity', async () => {
    const { gate, root, left, right } = await makeEnv();
    const a = gate.open('a');
    const b = gate.open('b');
    a.visual.glow.setDim(0.6);
    a.visual.createLayer('left').setOpacity(1, 400);
    b.visual.glow.setDim(0.3);
    b.visual.createLayer('right').setOpacity(0.7, 500);
    const layerB = lastLayerEl(right);
    const durationB = layerB.style.transitionDuration;

    a.fadeOut(200);

    expect(lastLayerEl(left).style.opacity).toBe('0');
    expect(layerB.style.opacity).toBe('0.7');
    expect(layerB.style.transitionDuration).toBe(durationB);
    expect(root.style.getPropertyValue('--glow-dim')).toBe('0.3');
  });

  it('stops a running gutter', async () => {
    const { gate, root } = await makeEnv(false);
    const a = gate.open('a');
    a.visual.glow.setGutter(0.8, 2);
    expect(root.classList.contains('is-guttering')).toBe(true);
    a.fadeOut(300);
    expect(root.classList.contains('is-guttering')).toBe(false);
  });
});

describe('after fadeOut the port ignores requests', () => {
  async function fadedPort(reduced: boolean): Promise<{ env: Env; port: GatePort; layer: VisualLayer; el: HTMLElement }> {
    const env = await makeEnv(reduced);
    const port = env.gate.open('a');
    port.audio.setGain(0.3);
    port.visual.glow.setDim(0.6);
    port.visual.glow.setGutter(0.8, 2);
    const layer = port.visual.createLayer('left');
    layer.setOpacity(1);
    const el = lastLayerEl(env.left);
    env.clock.advance(2000);
    port.fadeOut(300);
    env.clock.advance(2000);
    return { env, port, layer, el };
  }

  for (const reduced of MODES) {
    it(`audio stays at 0 and adds no automation (reduced motion ${reduced})`, async () => {
      const { env, port } = await fadedPort(reduced);
      const [ch] = channelNodes(env.ctx);
      const callsBefore = ch.gain.calls.length;
      port.audio.setGain(0.9);
      port.audio.setGain(0.1);
      env.clock.advance(3000);
      expect(ch.gain.calls.length).toBe(callsBefore);
      expect(ch.gain.maxValueOver(env.ctx.currentTime - 1, env.ctx.currentTime + 5)).toBe(0);
    });

    it(`visual requests leave the DOM unchanged (reduced motion ${reduced})`, async () => {
      const { env, port, layer, el } = await fadedPort(reduced);
      const snap = (): string => [
        env.root.getAttribute('style'), env.root.className, env.left.innerHTML, env.right.innerHTML,
      ].join('|');
      const before = snap();
      port.visual.glow.setDim(0.9, 1000);
      port.visual.glow.setGutter(1, 3);
      layer.setOpacity(1, 1000);
      layer.setSweep(5000);
      expect(snap()).toBe(before);
      expect(el.style.opacity).toBe('0');
      expect(el.classList.contains('is-sweeping')).toBe(false);
      expect(env.root.classList.contains('is-guttering')).toBe(false);
    });
  }

  it('a layer created after the fade stays invisible', async () => {
    const { env, port } = await fadedPort(false);
    const late = port.visual.createLayer('right');
    late.setOpacity(1);
    late.setSweep(5000);
    const el = lastLayerEl(env.right);
    expect(el.style.opacity).toBe('0');
    expect(el.classList.contains('is-sweeping')).toBe(false);
  });

  it('is not released: the channel stays connected until close()', async () => {
    const { env, port } = await fadedPort(false);
    const [ch] = channelNodes(env.ctx);
    expect(env.ctx.pathsToDestination(ch).length).toBe(1);
    port.close();
    expect(env.ctx.pathsToDestination(ch).length).toBe(0);
  });
});

describe('gate.fadeOutAll', () => {
  for (const reduced of MODES) {
    for (const requested of [0, 300, 800, 5000, Number.NaN]) {
      it(`fades every port within the returned time (requested ${requested}, reduced ${reduced})`, async () => {
        const { gate, ctx, clock, root, left, right } = await makeEnv(reduced);
        const ports = [gate.open('a'), gate.open('b'), gate.open('c')];
        const channels = channelNodes(ctx);
        ports[0].audio.setGain(0.3);
        ports[1].audio.setGain(0.2);
        ports[0].visual.glow.setDim(0.5);
        ports[0].visual.createLayer('left').setOpacity(1);
        ports[1].visual.createLayer('right').setOpacity(0.7);
        clock.advance(2000);

        const t0 = ctx.currentTime;
        const returned = gate.fadeOutAll(requested);

        expect(returned).toBe(planFadeOut(requested));
        expect(returned).toBeLessThanOrEqual(800);
        const end = t0 + returned / 1000;
        for (const ch of channels) {
          expect(ch.gain.valueAt(end)).toBe(0);
          expect(ch.gain.maxValueOver(end, end + 10)).toBe(0);
        }
        expect(root.style.getPropertyValue('--glow-dim')).toBe('0');
        for (const el of [lastLayerEl(left), lastLayerEl(right)]) {
          expect(el.style.opacity).toBe('0');
          expect(ms(el)).toBe(returned);
        }

        // Every port now ignores requests.
        const callCounts = channels.map((c) => c.gain.calls.length);
        const snap = (): string => [root.getAttribute('style'), root.className, left.innerHTML, right.innerHTML].join('|');
        const domBefore = snap();
        for (const p of ports) {
          p.audio.setGain(0.9);
          p.visual.glow.setDim(0.9);
          p.visual.glow.setGutter(1, 3);
        }
        expect(snap()).toBe(domBefore);
        ports[0].visual.createLayer('left').setOpacity(1);
        expect(lastLayerEl(left).style.opacity).toBe('0');
        clock.advance(3000);
        expect(channels.map((c) => c.gain.calls.length)).toEqual(callCounts);
        for (const ch of channels) expect(ch.gain.maxValueOver(end, ctx.currentTime + 5)).toBe(0);
        for (const ch of channels) expect(ctx.pathsToDestination(ch).length).toBe(1);
      });
    }
  }
});

describe('port.close and gate.dispose', () => {
  it('disconnects the channel and haunt nodes, removes layers, and is safe twice', async () => {
    const { gate, ctx, left, right } = await makeEnv();
    const a = gate.open('a');
    const b = gate.open('b');
    const [chA, chB] = channelNodes(ctx);
    a.audio.setGain(0.3);
    b.audio.setGain(0.2);

    const received: HauntAudioContext[] = [];
    a.audio.whenReady((c) => void received.push(c));
    const hctx = received[0];
    if (hctx === undefined) throw new Error('whenReady did not fire on an unlocked gate');
    const src = hctx.createBufferSource();
    const filter = hctx.createBiquadFilter();
    const panner = hctx.createStereoPanner();
    src.connect(filter).connect(panner).connect(hctx.input);
    const haunt = [ctx.nodesOfKind('bufferSource')[0], ctx.nodesOfKind('biquad')[0], ctx.nodesOfKind('stereoPanner')[0]];
    for (const n of haunt) expect(ctx.pathsToDestination(n).length).toBe(1);

    a.visual.createLayer('left');
    a.visual.createLayer('right');
    b.visual.createLayer('left');
    expect(left.children.length).toBe(2);
    expect(right.children.length).toBe(1);

    a.close();

    expect(ctx.pathsToDestination(chA).length).toBe(0);
    expect(ctx.connections.some((e) => e.from === chA)).toBe(false);
    for (const n of haunt) expect(ctx.pathsToDestination(n).length).toBe(0);
    expect(left.children.length).toBe(1);
    expect(right.children.length).toBe(0);
    // The other port is untouched.
    expect(ctx.pathsToDestination(chB).length).toBe(1);

    expect(() => a.close()).not.toThrow();
    expect(() => a.close()).not.toThrow();
    expect(ctx.log.filter((e) => e.op === 'disconnect' && e.from === chA).length).toBe(1);
    expect(ctx.pathsToDestination(chA).length).toBe(0);
  });

  it('closing a faded port is also safe and disconnects it', async () => {
    const { gate, ctx } = await makeEnv();
    const a = gate.open('a');
    const [ch] = channelNodes(ctx);
    a.fadeOut(200);
    expect(() => a.close()).not.toThrow();
    expect(() => a.close()).not.toThrow();
    expect(ctx.pathsToDestination(ch).length).toBe(0);
  });

  it('dispose closes every port', async () => {
    const { gate, ctx, root, left, right } = await makeEnv();
    const ports = [gate.open('a'), gate.open('b'), gate.open('c')];
    const channels = channelNodes(ctx);
    ports.forEach((p, i) => {
      p.audio.setGain(0.1 * (i + 1));
      p.visual.createLayer(i % 2 === 0 ? 'left' : 'right');
    });
    for (const ch of channels) expect(ctx.pathsToDestination(ch).length).toBe(1);

    gate.dispose();

    for (const ch of channels) {
      expect(ctx.pathsToDestination(ch).length).toBe(0);
      expect(ctx.connections.some((e) => e.from === ch)).toBe(false);
    }
    expect(left.children.length).toBe(0);
    expect(right.children.length).toBe(0);
    expect(root.style.getPropertyValue('--glow-dim')).toBe('');
    expect(() => gate.dispose()).not.toThrow();
    for (const p of ports) expect(() => p.close()).not.toThrow();
  });
});
