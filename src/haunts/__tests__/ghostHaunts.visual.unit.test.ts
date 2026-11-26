/**
 * Unit tests for ghostFigure.ts and jumpscare.ts. Real gate, real adapters, real restricted audio
 * context, fake AudioContext and scheduler. The haunts are never mocked.
 * Requirements: 1.11, 1.13, 1.15, 2.10, 2.11, 5.13, 5.14 (and 1.5 where a panner is involved).
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as ghostFigure from '../ghostFigure';
import * as jumpscare from '../jumpscare';
import * as footsteps from '../footsteps';
import { GHOST_IMAGE_GEOMETRY, imageBox } from '../engine/ghost/imageFit';
import { FakeGainNode } from '../engine/__tests__/fakes';
import { World, plan, startInfo, type WorldOptions } from './ghostWorld';

let world: World | null = null;
function make(o: WorldOptions = {}): World {
  world = new World(o);
  return world;
}
afterEach(() => {
  world?.dispose();
  world = null;
});

const JUMP = { startMs: 400, durationMs: 1200 } as const;
const BIG = { left: 0, right: 300, top: 0, bottom: 600 };
const TINY = { left: 0, right: 40, top: 0, bottom: 600 };
const ms = (el: HTMLElement): number => parseFloat(el.style.transitionDuration);
const srcs = (el: Element): (string | null)[] => [...el.querySelectorAll('img')].map((i) => i.getAttribute('src'));

describe('ghostFigure as a layer', () => {
  it('draws one labelled Ghost, and stop removes every element', async () => {
    const w = make();
    const run = await w.startLayer(ghostFigure, 1, startInfo({ regions: { left: TINY, right: BIG } }));
    expect(w.layers()).toHaveLength(1);
    const [el] = w.layers();
    expect(el.getAttribute('aria-label')).toBe('A ghost stands nearby');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.style.opacity).toBe('1');
    expect(w.root.children[1].contains(el)).toBe(true);
    run.stop();
    expect(w.layers()).toHaveLength(0);
  });
  it('shows ghost-standing.png in its layer, with no SVG, and stop removes the picture', async () => {
    const w = make();
    const run = await w.startLayer(ghostFigure, 2, startInfo());
    expect(w.warnings).toEqual([]);
    expect(srcs(w.layers()[0])).toEqual(['/ghosts/ghost-standing.png']);
    expect(w.root.querySelector('svg')).toBeNull();
    run.stop();
    expect(w.root.querySelector('img')).toBeNull();
  });
  it('a failed image load leaves the layer with no picture and no SVG fallback', async () => {
    const w = make();
    await w.startLayer(ghostFigure, 2, startInfo());
    w.layers()[0].querySelector('img')!.dispatchEvent(new Event('error'));
    expect(w.root.querySelector('img')).toBeNull();
    expect(w.root.querySelector('svg')).toBeNull();
    expect(w.warnings).toEqual([]);
  });
  it('a higher Ghost_Distance step shows a larger picture', async () => {
    const widths: number[] = [];
    for (const step of [0, 2, 4] as const) {
      const w = make();
      await w.startLayer(ghostFigure, 1, startInfo({ ghostStep: step }));
      widths.push(parseFloat(w.layers()[0].querySelector<HTMLElement>('.haunt-picture')!.style.width));
      w.dispose();
    }
    expect(widths[1]).toBeGreaterThan(widths[0]);
    expect(widths[2]).toBeGreaterThan(widths[1]);
  });
  it('fades in over at least 1000 ms, also under reduced motion', async () => {
    for (const reduced of [false, true]) {
      const w = make({ reduced });
      const run = await w.startLayer(ghostFigure, 1, startInfo());
      expect(ms(w.layers()[0])).toBeGreaterThanOrEqual(1000);
      run.stop();
      w.dispose();
    }
  });
  it('Gentle adds no element and no sound', async () => {
    const w = make();
    const run = await w.startLayer(ghostFigure, 1, startInfo({ mode: 'gentle' }));
    expect(w.layers()).toHaveLength(0);
    expect(w.root.querySelector('svg')).toBeNull();
    expect(w.root.querySelector('img')).toBeNull();
    expect(w.ctx.createdNodes.filter((n) => n.kind !== 'gain' && n.kind !== 'compressor')).toEqual([]);
    run.stop();
  });
  it('draws nothing without start info or when the side region is too narrow', async () => {
    const w = make();
    const a = await w.startLayer(ghostFigure, 1);
    const b = await w.startLayer(ghostFigure, 1, startInfo({ regions: { left: TINY, right: TINY } }));
    expect(w.layers()).toHaveLength(0);
    a.stop();
    b.stop();
  });
  it('stays drawn when the audio context cannot be created, with no error', async () => {
    const w = make({ constructorThrows: true });
    const ghost = await w.startLayer(ghostFigure, 1, startInfo());
    const steps = await w.startLayer(footsteps, 3, startInfo());
    expect(w.layers()).toHaveLength(1);
    expect(w.layers()[0].getAttribute('aria-label')).toBe('A ghost stands nearby');
    expect(w.hasContext).toBe(false);
    expect(() => {
      ghost.advance(2000);
      steps.stop();
      ghost.stop();
    }).not.toThrow();
    expect(w.layers()).toHaveLength(0);
  });
  it('stays drawn while audio is locked and while sound is off', async () => {
    const w = make();
    const locked = await w.startLayer(ghostFigure, 1, startInfo(), false);
    expect(w.layers()).toHaveLength(1);
    expect(w.hasContext).toBe(false);
    locked.stop();
    await w.unlock();
    w.gate.setSoundEnabled(false);
    const off = await w.startLayer(ghostFigure, 2, startInfo());
    expect(w.layers()).toHaveLength(1);
    expect(off.sources()).toEqual([]);
    off.stop();
  });
});

describe('ghostFigure as a return effect', () => {
  it('span uses ghostLingerMs, and is null when there is no linger', () => {
    expect(ghostFigure.span(plan({ ghostLingerMs: 1500 }))).toEqual({ startMs: 0, endMs: 1500 });
    expect(ghostFigure.span(plan({ ghostLingerMs: 700 }))).toEqual({ startMs: 0, endMs: 700 });
    expect(ghostFigure.span(plan({ ghostLingerMs: 0 }))).toBeNull();
  });
  it('begin draws a labelled ghost overlay and end removes it, twice safely', async () => {
    const w = make();
    const run = await w.beginEffect(ghostFigure, plan({ ghostStep: 3 }));
    expect(w.overlays('ghost')).toHaveLength(1);
    expect(w.overlays('ghost')[0].getAttribute('aria-label')).toBe('A ghost stands nearby');
    expect(srcs(w.overlays('ghost')[0])).toEqual(['/ghosts/ghost-standing.png']);
    expect(w.root.querySelector('svg')).toBeNull();
    ghostFigure.begin(plan(), run.port);
    expect(w.overlays()).toHaveLength(1);
    ghostFigure.end();
    ghostFigure.end();
    expect(w.overlays()).toHaveLength(0);
  });
  it('fades in over at least 1000 ms under reduced motion', async () => {
    const w = make({ reduced: true });
    await w.beginEffect(ghostFigure, plan());
    expect(ms(w.overlays('ghost')[0])).toBeGreaterThanOrEqual(1000);
    ghostFigure.end();
  });
  it('end after the gate hard deadline does not throw', async () => {
    const w = make();
    await w.beginEffect(ghostFigure, plan());
    w.scheduler.advance(3000);
    expect(w.overlays()).toHaveLength(0);
    expect(() => ghostFigure.end()).not.toThrow();
  });
});

describe('jumpscare', () => {
  it('span is null without a jumpscare and follows the plan with one', () => {
    expect(jumpscare.span(plan({ jumpscare: null }))).toBeNull();
    expect(jumpscare.span(plan({ jumpscare: { ...JUMP, render: 'full' } }))).toEqual({ startMs: 400, endMs: 1600 });
  });
  it('without a jumpscare in the plan, begin adds nothing', async () => {
    const w = make();
    await w.beginEffect(jumpscare, plan({ jumpscare: null }));
    expect(w.overlays()).toHaveLength(0);
    expect(() => jumpscare.end()).not.toThrow();
  });
  it('plays one jump source and, on end, releases every node, overlay and the channel', async () => {
    const w = make();
    const run = await w.beginEffect(jumpscare, plan({ jumpscare: { ...JUMP, render: 'full' } }));
    expect(w.overlays('jumpscare')).toHaveLength(1);
    expect(run.sources()).toHaveLength(1);
    const [src] = run.sources();
    expect(src.startCalls).toHaveLength(1);
    expect(src.loop).toBe(false);
    const channel = w.channelGain(0) as FakeGainNode;
    expect(w.connectedAmong(run.nodes())).toHaveLength(run.nodes().length);
    expect(w.connectedAmong([channel])).toHaveLength(1);
    jumpscare.end();
    expect(src.stopCalls).toHaveLength(1);
    expect(w.connectedAmong(run.nodes())).toEqual([]);
    expect(w.connectedAmong([channel])).toEqual([]);
    expect(w.overlays()).toHaveLength(0);
  });
  it('the jump channel attacks in 20 ms and stays at or below the cap', async () => {
    const w = make();
    const run = await w.beginEffect(jumpscare, plan({ jumpscare: { ...JUMP, render: 'full' } }));
    const gain = w.channelGain(0).gain;
    const target = gain.valueAt(1);
    expect(target).toBeGreaterThan(0);
    expect(target).toBeLessThanOrEqual(0.5);
    expect(gain.valueAt(0.02)).toBeCloseTo(target, 9);
    expect(gain.valueAt(0.01)).toBeLessThan(target);
    expect(run.sources()).toHaveLength(1);
  });
  it('Nightmare shows ghost-face.png and Classic shows ghost-standing.png, never SVG', async () => {
    const expected = [['nightmare', '/ghosts/ghost-face.png'], ['classic', '/ghosts/ghost-standing.png']] as const;
    for (const [mode, src] of expected) {
      const w = make();
      await w.beginEffect(jumpscare, plan({ jumpscare: { ...JUMP, render: 'full' } }), true, mode);
      expect(w.warnings).toEqual([]);
      expect(srcs(w.overlays('jumpscare')[0])).toEqual([src]);
      expect(w.root.querySelector('svg')).toBeNull();
      jumpscare.end();
      expect(w.root.querySelector('img')).toBeNull();
      w.dispose();
    }
  });
  it('the Classic picture is smaller than the Nightmare picture would be at the largest scale', async () => {
    const w = make();
    await w.beginEffect(jumpscare, plan({ jumpscare: { ...JUMP, render: 'full' } }), true, 'classic');
    const classic = w.overlays('jumpscare')[0].querySelector<HTMLElement>('.haunt-picture')!;
    // Same standing image at the largest step (4) in the same 1000 x 700 viewport.
    const largest = imageBox(4, GHOST_IMAGE_GEOMETRY['ghost-standing.png'].visible, { width: 1000, height: 700 })!;
    expect(parseFloat(classic.style.width)).toBeLessThan(largest.width);
    jumpscare.end();
  });
  it('a failed close-up load shows no picture and no SVG', async () => {
    const w = make();
    await w.beginEffect(jumpscare, plan({ jumpscare: { ...JUMP, render: 'full' } }), true, 'nightmare');
    w.overlays('jumpscare')[0].querySelector('img')!.dispatchEvent(new Event('error'));
    expect(w.root.querySelector('img')).toBeNull();
    expect(w.root.querySelector('svg')).toBeNull();
    jumpscare.end();
  });
  it('the picture is gone when the Return_Moment ends, with no image left over', async () => {
    const w = make();
    await w.beginEffect(jumpscare, plan({ jumpscare: { ...JUMP, render: 'full' } }), true, 'nightmare');
    expect(w.root.querySelector('img')).not.toBeNull();
    w.scheduler.advance(3000);
    expect(w.root.querySelector('img')).toBeNull();
  });
  it('without a jumpscare in the plan no picture is requested, in either mode', async () => {
    for (const mode of ['classic', 'nightmare'] as const) {
      const w = make();
      await w.beginEffect(jumpscare, plan({ jumpscare: null }), true, mode);
      expect(w.root.querySelector('img')).toBeNull();
      w.dispose();
    }
  });
  it('shows the close-up without sound while audio is locked', async () => {
    const w = make();
    const run = await w.beginEffect(jumpscare, plan({ jumpscare: { ...JUMP, render: 'full' } }), false);
    expect(w.overlays('jumpscare')).toHaveLength(1);
    expect(w.hasContext).toBe(false);
    expect(run.sources()).toEqual([]);
    expect(() => jumpscare.end()).not.toThrow();
  });
  it('shows the close-up with no audible output while sound is off', async () => {
    const w = make();
    await w.unlock();
    w.gate.setSoundEnabled(false);
    const run = await w.beginEffect(jumpscare, plan({ jumpscare: { ...JUMP, render: 'full' } }));
    expect(w.overlays('jumpscare')).toHaveLength(1);
    for (const src of run.sources()) {
      for (let t = 0; t <= 3; t += 0.1) expect(w.ctx.effectiveGainAt(src, t)).toBe(0);
    }
    jumpscare.end();
    expect(w.overlays()).toHaveLength(0);
  });
  it('under render fade the close-up fades in over at least 1000 ms, with the picture and no sudden change', async () => {
    for (const reduced of [false, true]) {
      const w = make({ reduced });
      await w.beginEffect(jumpscare, plan({ jumpscare: { startMs: 0, durationMs: 1000, render: 'fade' } }), true, 'nightmare');
      expect(ms(w.overlays('jumpscare')[0])).toBeGreaterThanOrEqual(1000);
      expect(srcs(w.overlays('jumpscare')[0])).toEqual(['/ghosts/ghost-face.png']);
      expect(w.overlays('jumpscare')[0].querySelector('.haunt-picture')!.getAttribute('style')).not.toMatch(/transform|animation/);
      jumpscare.end();
      w.dispose();
    }
  });
  it('under render full the close-up appears fast', async () => {
    const w = make();
    await w.beginEffect(jumpscare, plan({ jumpscare: { ...JUMP, render: 'full' } }));
    expect(ms(w.overlays('jumpscare')[0])).toBeLessThan(100);
    jumpscare.end();
  });
  it('end after the gate hard deadline does not throw', async () => {
    const w = make();
    await w.beginEffect(jumpscare, plan({ jumpscare: { ...JUMP, render: 'full' } }));
    w.scheduler.advance(3000);
    expect(w.overlays()).toHaveLength(0);
    expect(() => jumpscare.end()).not.toThrow();
    expect(() => jumpscare.end()).not.toThrow();
  });
  it('no jump channel exists outside a Return_Moment', async () => {
    const w = make();
    await w.unlock();
    expect(w.gate.openReturn('jumpscare', { jumpSound: true })).toBeNull();
    await w.beginEffect(jumpscare, plan({ jumpscare: { ...JUMP, render: 'full' } }), false);
    jumpscare.end();
    w.gate.endReturnMoment();
    w.scheduler.advance(200);
    expect(w.gate.openReturn('jumpscare', { jumpSound: true })).toBeNull();
    // A normal layer port never gets the fast attack, even asking for the same gain.
    const port = w.gate.open('plain');
    port.audio.setGain(0.9);
    const channel = w.ctx.nodesOfKind('gain').slice(-1)[0] as FakeGainNode;
    const target = channel.gain.valueAt(5);
    expect(target).toBeGreaterThan(0);
    expect(channel.gain.valueAt(0.02 + w.ctx.currentTime)).toBeLessThan(target);
  });
});
