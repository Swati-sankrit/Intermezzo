/**
 * `AudioOut.onTick` and `VisualLayer.setLabel` on the real gate, real adapters and real DOM.
 * Only time (FakeScheduler) and the AudioContext are stand-ins.
 */
import { describe, expect, it } from 'vitest';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import { MIN_TICK_PERIOD_MS } from '../gate/tickHost';
import { KEYS } from '../settings';
import {
  createFakeAudioContextFactory, createFakeMatchMedia, createFakeStorage, createFakeTime,
  type FakeScheduler,
} from './fakes';

interface Env {
  readonly gate: ReturnType<typeof createGate>;
  readonly scheduler: FakeScheduler;
  readonly left: HTMLElement;
  readonly warnings: string[];
}

function makeEnv(): Env {
  const { clock, scheduler } = createFakeTime();
  const factory = createFakeAudioContextFactory(clock);
  const root = document.createElement('div');
  const left = document.createElement('div');
  const right = document.createElement('div');
  root.append(left, right);
  const warnings: string[] = [];
  const gate = createGate({
    audio: { createAudioContext: factory.create, eventTarget: new EventTarget() },
    hosts: { root, left, right },
    storage: createFakeStorage({ [KEYS.volumeCap]: '1' }),
    storageEvents: null,
    reducedMotion: createReducedMotion(createFakeMatchMedia(false).matchMedia),
    scheduler,
    warn: (m) => void warnings.push(m),
  });
  return { gate, scheduler, left, warnings };
}

describe('AudioOut.onTick (real gate)', () => {
  it('calls back about every period and stops after the returned cancel', () => {
    const { gate, scheduler } = makeEnv();
    const port = gate.open('a');
    let n = 0;
    const off = port.audio.onTick(() => void n++, 500);
    scheduler.advance(1600);
    expect(n).toBe(3);
    off();
    scheduler.advance(2000);
    expect(n).toBe(3);
    expect(scheduler.pendingCount).toBe(0);
  });

  it('raises periods below 100 ms to 100 ms, including NaN and negative values', () => {
    const { gate, scheduler } = makeEnv();
    const port = gate.open('a');
    port.audio.onTick(() => {}, 5);
    port.audio.onTick(() => {}, -20);
    port.audio.onTick(() => {}, Number.NaN);
    port.audio.onTick(() => {}, 100);
    port.audio.onTick(() => {}, 250);
    expect(MIN_TICK_PERIOD_MS).toBe(100);
    expect(scheduler.requestedDelays).toEqual([100, 100, 100, 100, 250]);
    let n = 0;
    port.audio.onTick(() => void n++, 1);
    scheduler.advance(1000);
    expect(n).toBe(10);
  });

  it('stops when the port closes', () => {
    const { gate, scheduler } = makeEnv();
    const port = gate.open('a');
    let n = 0;
    port.audio.onTick(() => void n++, 100);
    scheduler.advance(250);
    port.close();
    scheduler.advance(1000);
    expect(n).toBe(2);
    expect(scheduler.pendingCount).toBe(0);
  });

  it('stops on port fadeOut and on fadeOutAll, and refuses new ticks afterwards', () => {
    const { gate, scheduler } = makeEnv();
    const a = gate.open('a');
    const b = gate.open('b');
    let na = 0;
    let nb = 0;
    a.audio.onTick(() => void na++, 100);
    b.audio.onTick(() => void nb++, 100);
    scheduler.advance(300);
    a.fadeOut(300);
    scheduler.advance(300);
    expect([na, nb]).toEqual([3, 6]);
    gate.fadeOutAll(300);
    scheduler.advance(300);
    expect(nb).toBe(6);
    const late = a.audio.onTick(() => void na++, 100);
    scheduler.advance(500);
    expect(na).toBe(3);
    expect(scheduler.pendingCount).toBe(0);
    expect(() => late()).not.toThrow();
  });

  it('stops on gate.dispose', () => {
    const { gate, scheduler } = makeEnv();
    const port = gate.open('a');
    let n = 0;
    port.audio.onTick(() => void n++, 100);
    scheduler.advance(150);
    gate.dispose();
    scheduler.advance(1000);
    expect(n).toBe(1);
    expect(scheduler.pendingCount).toBe(0);
  });

  it('sends a throwing callback to warn and keeps the other ticks and its own schedule running', () => {
    const { gate, scheduler, warnings } = makeEnv();
    const port = gate.open('a');
    let bad = 0;
    let good = 0;
    port.audio.onTick(() => {
      bad++;
      throw new Error('boom');
    }, 100);
    port.audio.onTick(() => void good++, 100);
    scheduler.advance(300);
    expect(good).toBe(3);
    expect(bad).toBe(3);
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain('boom');
  });

  it('lets a callback cancel itself without scheduling again', () => {
    const { gate, scheduler } = makeEnv();
    const port = gate.open('a');
    let n = 0;
    const off = port.audio.onTick(() => {
      n++;
      off();
    }, 100);
    scheduler.advance(1000);
    expect(n).toBe(1);
    expect(scheduler.pendingCount).toBe(0);
  });
});

describe('VisualLayer.setLabel (real gate and visual adapter)', () => {
  it('sets role="img" and aria-label and removes aria-hidden', () => {
    const { gate, left } = makeEnv();
    const layer = gate.open('a').visual.createLayer('left');
    const el = left.querySelector('.haunt-layer');
    expect(el?.getAttribute('aria-hidden')).toBe('true');
    layer.setLabel('A ghost stands nearby');
    expect(el?.getAttribute('role')).toBe('img');
    expect(el?.getAttribute('aria-label')).toBe('A ghost stands nearby');
    expect(el?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('keeps unlabelled layers aria-hidden, and an empty label returns a layer to hidden', () => {
    const { gate, left } = makeEnv();
    const port = gate.open('a');
    port.visual.createLayer('left');
    const labelled = port.visual.createLayer('left');
    const [plain, other] = Array.from(left.querySelectorAll('.haunt-layer'));
    expect(plain.getAttribute('aria-hidden')).toBe('true');
    expect(plain.hasAttribute('role')).toBe(false);
    labelled.setLabel('Something stands here');
    expect(plain.getAttribute('aria-hidden')).toBe('true');
    expect(other.getAttribute('aria-label')).toBe('Something stands here');
    labelled.setLabel('   ');
    expect(other.getAttribute('aria-hidden')).toBe('true');
    expect(other.hasAttribute('role')).toBe(false);
    expect(other.hasAttribute('aria-label')).toBe(false);
  });
});
