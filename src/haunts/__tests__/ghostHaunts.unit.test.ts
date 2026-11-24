/**
 * Unit tests for the Ghost audio layers (footsteps, breathing, knock) and the contract of all five
 * new haunt files. Real gate, real audio and visual adapters, real restricted context, on the fake
 * AudioContext and scheduler. The haunts are never mocked. Ghost figure and jumpscare behaviour is in
 * ghostHaunts.visual.unit.test.ts.
 * Requirements: 1.3, 1.5, 1.6, 1.11, 1.13, 1.15 (and 2.10, 2.11, 5.13, 5.14 in the visual file).
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as breathing from '../breathing';
import * as footsteps from '../footsteps';
import * as ghostFigure from '../ghostFigure';
import * as jumpscare from '../jumpscare';
import * as knock from '../knock';
import { footstepSpec } from '../engine/ghost/spatial';
import { loadRegistry } from '../engine/registry';
import type { Haunt, ReturnEffect } from '../engine/types';
import {
  FakeAudioNode, FakeBufferSourceNode, FakePannerNode, FakeStereoPannerNode, type AutomationCall, type FakeAudioParam,
} from '../engine/__tests__/fakes';
import { World, startInfo, type LayerRun, type WorldOptions } from './ghostWorld';

// Compile-time contract: these assignments fail `tsc -b` if a file stops matching its type.
const layerModules: readonly Haunt[] = [footsteps, breathing, knock, ghostFigure];
const effectModules: readonly ReturnEffect[] = [ghostFigure, jumpscare];

let world: World | null = null;
function make(o: WorldOptions = {}): World {
  world = new World(o);
  return world;
}
afterEach(() => {
  world?.dispose();
  world = null;
});

function param(p: FakeAudioParam | undefined): FakeAudioParam {
  if (p === undefined) throw new Error('panner has no position params');
  return p;
}
function chainEndsAtInput(w: World, run: LayerRun): void {
  const src = run.sources()[0];
  expect(w.ctx.pathsToDestination(src)).toHaveLength(1);
  expect(w.ctx.pathsToDestination(src)[0]).toContain(w.channelGain(0));
}
function expectAllDisconnected(w: World, nodes: FakeAudioNode[]): void {
  expect(w.connectedAmong(nodes)).toEqual([]);
  for (const n of nodes) {
    expect(w.ctx.log.some((e) => e.op === 'disconnect' && e.from === n && e.to === 'all')).toBe(true);
  }
}

describe('contract of the five haunt files', () => {
  it('registers through loadRegistry with the right role, modes and level', () => {
    const warnings: string[] = [];
    const { haunts, effects } = loadRegistry((m) => void warnings.push(m));
    expect(warnings.filter((m) => /footsteps|breathing|knock|ghostFigure|jumpscare/.test(m))).toEqual([]);
    const byId = (id: string): Haunt | undefined => haunts.find((h) => h.id === id);
    expect(byId('footsteps')).toMatchObject({ role: 'layer', minLevel: 1, modes: ['classic', 'nightmare'] });
    expect(byId('breathing')).toMatchObject({ role: 'layer', minLevel: 1, modes: ['classic', 'nightmare'] });
    expect(byId('knock')).toMatchObject({ role: 'layer', minLevel: 3, modes: ['classic', 'nightmare'] });
    expect(byId('ghostFigure')).toMatchObject({ role: 'layer', minLevel: 1, modes: ['classic', 'nightmare'] });
    expect(effects.map((e) => e.id)).toEqual(expect.arrayContaining(['ghostFigure', 'jumpscare']));
    expect(effects.find((e) => e.id === 'jumpscare')?.jumpSound).toBe(true);
  });
  it('every module type-checks as its contract and names itself', () => {
    expect(layerModules.map((m) => m.id)).toEqual(['footsteps', 'breathing', 'knock', 'ghostFigure']);
    expect(effectModules.map((m) => m.id)).toEqual(['ghostFigure', 'jumpscare']);
  });
  it('no file runs in Gentle (no element, no sound there)', () => {
    for (const m of [...layerModules, ...effectModules]) {
      expect(m.modes).toBeDefined();
      expect(m.modes).not.toContain('gentle');
    }
  });
});

describe('spatial panner wrapper', () => {
  it('returns null when createPanner throws', async () => {
    const w = make({ createPannerThrows: true });
    const port = w.gate.open('probe');
    await w.unlock();
    let got: unknown = 'unset';
    port.audio.whenReady((ctx) => void (got = ctx.createSpatialPanner()));
    expect(got).toBeNull();
  });
  it('exposes no destination or context, and holds no real node', async () => {
    const w = make();
    const port = w.gate.open('probe');
    await w.unlock();
    port.audio.whenReady((ctx) => {
      const p = ctx.createSpatialPanner();
      expect(p).not.toBeNull();
      expect('destination' in (p as object)).toBe(false);
      expect('context' in (p as object)).toBe(false);
      expect(Object.values(p as object).some((v) => v instanceof FakeAudioNode)).toBe(false);
    });
    expect(w.ctx.nodesOfKind('panner')).toHaveLength(1);
  });
  for (const [name, mod, level] of [['footsteps', footsteps, 2], ['breathing', breathing, 1]] as const) {
    it(`${name} uses HRTF, inverse, refDistance 0.5, and the wrapper it gets has no destination`, async () => {
      const w = make();
      const run = await w.startLayer(mod, level, startInfo());
      expect(run.panners()).toHaveLength(1);
      const [p] = run.panners();
      expect([p.panningModel, p.distanceModel, p.refDistance]).toEqual(['HRTF', 'inverse', 0.5]);
      expect(run.wrappers).toHaveLength(1);
      expect('destination' in run.wrappers[0]).toBe(false);
      expect('destination' in run.contexts[0]).toBe(false);
      run.stop();
    });
  }
});

describe.each([['footsteps', footsteps, 2], ['breathing', breathing, 1]] as const)('%s panner fallback', (_n, mod, level) => {
  const cases: [string, WorldOptions, number, number][] = [
    ['spatial panner', {}, 1, 0],
    ['stereo panner when createPanner throws', { createPannerThrows: true }, 0, 1],
    ['no panner when stereo throws too', { createPannerThrows: true, stereoThrows: true }, 0, 0],
  ];
  it.each(cases)('uses the %s and disconnects every node on stop', async (_label, opts, spatial, stereo) => {
    const w = make(opts);
    const run = await w.startLayer(mod, level, startInfo());
    expect(run.panners()).toHaveLength(spatial);
    expect(run.nodes().filter((n) => n instanceof FakeStereoPannerNode)).toHaveLength(stereo);
    expect(run.nodes()).toHaveLength(2 + spatial + stereo);
    expect(run.sources()).toHaveLength(1);
    expect(run.sources()[0].startCalls).toHaveLength(1);
    chainEndsAtInput(w, run);
    expect(w.connectedAmong(run.nodes())).toHaveLength(run.nodes().length);
    run.stop();
    expect(run.sources()[0].stopCalls).toHaveLength(1);
    expectAllDisconnected(w, run.nodes());
    expect(w.warnings).toEqual([]);
  });
});

describe('audio layers without an audio context', () => {
  it('a throwing createAudioContext makes no node and raises no error', async () => {
    const w = make({ constructorThrows: true });
    for (const [mod, level] of [[footsteps, 3], [breathing, 1], [knock, 3]] as const) {
      const run = await w.startLayer(mod, level, startInfo());
      expect(run.nodes()).toEqual([]);
      expect(() => {
        mod.setLevel(level);
        run.advance(1000);
        run.stop();
      }).not.toThrow();
    }
    expect(w.hasContext).toBe(false);
  });
  it('locked audio makes no node until the first gesture, then one source', async () => {
    const w = make();
    const run = await w.startLayer(knock, 3, undefined, false);
    expect(w.hasContext).toBe(false);
    await w.unlock();
    const sources = w.ctx.nodesOfKind('bufferSource') as FakeBufferSourceNode[];
    expect(sources).toHaveLength(1);
    expect(sources[0].startCalls).toHaveLength(1);
    expect((sources[0].startCalls[0] as number) - w.ctx.currentTime).toBeLessThan(0.5);
    run.stop();
  });
  it('sound off keeps every layer silent at the output', async () => {
    const w = make();
    await w.unlock();
    w.gate.setSoundEnabled(false);
    const first = await w.startLayer(footsteps, 3, startInfo());
    const firstSources = first.sources();
    const second = await w.startLayer(knock, 3);
    const secondSources = second.sources();
    w.scheduler.advance(2000);
    for (const sources of [firstSources, secondSources]) {
      expect(sources).toHaveLength(1);
      for (let t = 0; t <= 4; t += 0.25) expect(w.ctx.effectiveGainAt(sources[0], t)).toBe(0);
    }
    first.stop();
    second.stop();
  });
});

describe('knock', () => {
  it('starts exactly one source, under 0.5 s after ready, and never again', async () => {
    const w = make();
    await w.unlock();
    const readyAt = w.ctx.currentTime;
    const run = await w.startLayer(knock, 3);
    expect(run.sources()).toHaveLength(1);
    const [src] = run.sources();
    expect(src.startCalls).toHaveLength(1);
    const at = src.startCalls[0] as number;
    expect(at).toBeGreaterThanOrEqual(readyAt);
    expect(at - readyAt).toBeLessThan(0.5);
    expect(src.loop).toBe(false);
    run.advance(10000);
    expect(run.sources()).toHaveLength(1);
    expect(src.startCalls).toHaveLength(1);
    run.stop();
    expect(src.stopCalls).toHaveLength(1);
    expectAllDisconnected(w, run.nodes());
  });
  it('plays once per start', async () => {
    const w = make();
    for (let i = 0; i < 3; i++) {
      const run = await w.startLayer(knock, 3);
      expect(run.sources()).toHaveLength(1);
      expect(run.sources()[0].startCalls).toHaveLength(1);
      run.stop();
    }
  });
  it.each([false, true])('gain at the knock start never exceeds the layer target (reduced motion %s)', async (reduced) => {
    const w = make({ reduced });
    const run = await w.startLayer(knock, 3);
    const [src] = run.sources();
    const startAt = src.startCalls[0] as number;
    const atStart = w.ctx.effectiveGainAt(src, startAt);
    const target = w.ctx.effectiveGainAt(src, startAt + 10);
    expect(target).toBeGreaterThan(0);
    expect(target).toBeLessThanOrEqual(0.5);
    expect(atStart).toBeLessThanOrEqual(target + 1e-9);
    if (reduced) expect(atStart).toBeLessThan(target);
    run.stop();
  });
});

describe('breathing', () => {
  /** -1 for left, 1 for right, from the panner position or the stereo pan the haunt set. */
  function sideOf(run: LayerRun): number {
    const [p] = run.panners();
    if (p !== undefined) return Math.sign(param(p.positionX).calls[0].value as number);
    const s = run.nodes().find((n): n is FakeStereoPannerNode => n instanceof FakeStereoPannerNode);
    if (s === undefined) throw new Error('no panner of any kind');
    return Math.sign(s.pan.calls[0].value as number);
  }
  it.each([['spatial', {}], ['stereo fallback', { createPannerThrows: true }]] as const)(
    'alternates sides across starts (%s)', async (_n, opts) => {
      const w = make(opts);
      const sides: number[] = [];
      for (let i = 0; i < 4; i++) {
        const run = await w.startLayer(breathing, 1, startInfo({ roll: 0.1 + i * 0.2 }));
        sides.push(sideOf(run));
        run.stop();
      }
      expect(sides.every((s) => s === 1 || s === -1)).toBe(true);
      for (let i = 1; i < sides.length; i++) expect(sides[i]).toBe(-sides[i - 1]);
    });
  it('sets its position once and never ramps, even as time passes', async () => {
    const w = make();
    const run = await w.startLayer(breathing, 2, startInfo());
    run.advance(5000);
    run.mod.setLevel(3);
    run.advance(5000);
    const [p] = run.panners();
    for (const axis of [p.positionX, p.positionY, p.positionZ]) {
      const calls: AutomationCall[] = param(axis).calls;
      expect(calls.map((c) => c.type)).toEqual(['setValueAtTime']);
    }
    run.stop();
  });
});

describe('footsteps ramps', () => {
  /** Position automation of one panner, grouped by the context time of each tick's calls. */
  function groups(p: FakePannerNode): Map<number, { x: AutomationCall[]; z: AutomationCall[] }> {
    const out = new Map<number, { x: AutomationCall[]; z: AutomationCall[] }>();
    for (const [axis, key] of [[param(p.positionX), 'x'], [param(p.positionZ), 'z']] as const) {
      for (const c of axis.calls) {
        const g = out.get(c.atContextTime) ?? { x: [], z: [] };
        g[key].push(c);
        out.set(c.atContextTime, g);
      }
    }
    return out;
  }
  function expectTick(g: { x: AutomationCall[]; z: AutomationCall[] }, at: number, distanceM: number): void {
    const ramps = (cs: AutomationCall[]): AutomationCall[] => cs.filter((c) => c.type === 'linearRampToValueAtTime');
    expect(ramps(g.x)).toHaveLength(ramps(g.z).length);
    expect(ramps(g.x).length).toBeGreaterThanOrEqual(1);
    const here = [g.x, g.z].map((cs) => cs.find((c) => c.type === 'setValueAtTime')?.value as number);
    expect(Math.hypot(here[0], here[1])).toBeCloseTo(distanceM, 6);
    let previous = at;
    ramps(g.x).forEach((r, i) => {
      expect(r.time - previous).toBeGreaterThanOrEqual(1 - 1e-9);
      previous = r.time;
      expect(Math.hypot(r.value as number, ramps(g.z)[i].value as number)).toBeCloseTo(distanceM, 6);
    });
  }
  it('ramps on every 500 ms tick, each segment at least 1 s, at the level distance', async () => {
    const w = make();
    const run = await w.startLayer(footsteps, 2, startInfo({ roll: 0.25 }));
    for (let i = 0; i < 6; i++) run.advance(500);
    expect(w.scheduler.requestedDelays).toContain(500);
    const g = groups(run.panners()[0]);
    expect([...g.keys()]).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
    for (const [at, calls] of g) expectTick(calls, at, footstepSpec(2).distanceM);
    run.stop();
  });
  it('setLevel re-reads the spec for distance and step rate', async () => {
    const w = make();
    const run = await w.startLayer(footsteps, 1, startInfo());
    run.advance(750);
    run.mod.setLevel(3);
    const g = groups(run.panners()[0]);
    const at = w.ctx.currentTime;
    expect(footstepSpec(3).distanceM).not.toBe(footstepSpec(1).distanceM);
    expectTick(g.get(at) as { x: AutomationCall[]; z: AutomationCall[] }, at, footstepSpec(3).distanceM);
    const rate = run.sources()[0].playbackRate.calls;
    expect(rate[rate.length - 1].value).toBe(footstepSpec(3).stepsPerSec);
    run.advance(250);
    expect(w.ctx.currentTime).toBe(1);
    const later = groups(run.panners()[0]).get(1) as { x: AutomationCall[]; z: AutomationCall[] };
    expectTick(later, 1, footstepSpec(3).distanceM);
    run.stop();
  });
  it('stops its ticks on stop', async () => {
    const w = make();
    const run = await w.startLayer(footsteps, 3, startInfo());
    const p = run.panners()[0];
    run.stop();
    const before = param(p.positionX).calls.length;
    run.advance(5000);
    expect(param(p.positionX).calls.length).toBe(before);
  });
});
