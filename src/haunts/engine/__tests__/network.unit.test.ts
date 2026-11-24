/**
 * Task 10.1 (Req 16.6, 16.7): a haunt session sends nothing over the network, never touches the
 * camera, and writes only the documented storage keys.
 *
 * The spies wrap globals, not the code under test. Network and camera spies record the call and
 * throw, so a stray call also fails inside the code that made it. The `setItem` spy records the key
 * and calls through, because the session needs working storage.
 *
 * Test 1 runs the real engine, real gate (real audio and visual adapters), the real discovered
 * haunts, and the real settings store over jsdom's localStorage. Time, timers and the AudioContext
 * are fakes from ./fakes. Test 2 renders the real `HauntLayer` (the UI wiring) with a fake attention
 * module. Neither needs the camera.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HauntLayer } from '../../../ui/HauntLayer';
import { createHauntEngine } from '../engine';
import { createGate } from '../gate/gate';
import { createReducedMotion } from '../gate/reducedMotion';
import { loadHaunts } from '../registry';
import { createSettingsStore, KEYS } from '../settings';
import type { AttentionSignalLike } from '../types';
import { createFakeAudioContextFactory, createFakeMatchMedia, createFakeTime } from './fakes';

const ALLOWED_KEYS: readonly string[] = [KEYS.sound, KEYS.mode, KEYS.headphonesTipSeen, KEYS.noticeSeen, KEYS.volumeCap];

interface Spies {
  /** One entry per forbidden call, e.g. `fetch`, `WebSocket`, `getUserMedia`. */
  readonly forbidden: string[];
  /** Key of every `Storage.prototype.setItem` call made during the spy window. */
  readonly setItemKeys: string[];
  restore(): void;
}

function installSpies(): Spies {
  const forbidden: string[] = [];
  const setItemKeys: string[] = [];
  const undo: (() => void)[] = [];

  const define = (target: object, name: string, value: unknown): void => {
    const original = Object.getOwnPropertyDescriptor(target, name);
    Object.defineProperty(target, name, { value, configurable: true, writable: true, enumerable: true });
    undo.push(() => {
      if (original) Object.defineProperty(target, name, original);
      else Reflect.deleteProperty(target, name);
    });
  };
  const forbiddenFn = (label: string) =>
    function recordAndThrow(): never {
      forbidden.push(label);
      throw new Error(`forbidden call: ${label}`);
    };

  define(globalThis, 'fetch', forbiddenFn('fetch'));
  define(globalThis, 'XMLHttpRequest', forbiddenFn('XMLHttpRequest'));
  define(globalThis, 'WebSocket', forbiddenFn('WebSocket'));
  define(globalThis, 'EventSource', forbiddenFn('EventSource'));
  define(navigator, 'sendBeacon', forbiddenFn('sendBeacon'));
  define(navigator, 'mediaDevices', { getUserMedia: forbiddenFn('getUserMedia') });

  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function recordSetItem(this: Storage, key: string, value: string): void {
    setItemKeys.push(key);
    originalSetItem.call(this, key, value);
  };
  undo.push(() => {
    Storage.prototype.setItem = originalSetItem;
  });

  return { forbidden, setItemKeys, restore: () => undo.reverse().forEach((fn) => fn()) };
}

/** Writes storage the way another tab would: not through the spy. */
const realSetItem = Storage.prototype.setItem;
function writeAsOtherTab(key: string, value: string): void {
  realSetItem.call(localStorage, key, value);
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

let spies: Spies;

beforeEach(() => {
  localStorage.clear();
  spies = installSpies();
});
afterEach(() => {
  cleanup();
  spies.restore();
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('network and storage spies (Req 16.6, 16.7)', () => {
  it('a full engine and gate session makes no network or camera call and writes only documented keys', async () => {
    const registry = loadHaunts();
    const registryIds = registry.map((h) => h.id);
    expect(registryIds.length).toBeGreaterThanOrEqual(2);

    // The user's cap is set before the session, outside the spy window of the engine's own writes.
    writeAsOtherTab(KEYS.volumeCap, '0.5');
    spies.setItemKeys.length = 0;

    const { clock, scheduler } = createFakeTime(1_000_000);
    const audioFactory = createFakeAudioContextFactory(clock);
    const unlockTarget = new EventTarget();
    const root = document.createElement('div');
    const left = document.createElement('div');
    const right = document.createElement('div');
    root.append(left, right);
    document.body.append(root);

    const gate = createGate({
      audio: { createAudioContext: audioFactory.create, eventTarget: unlockTarget },
      hosts: { root, left, right },
      storage: localStorage,
      storageEvents: window,
      reducedMotion: createReducedMotion(createFakeMatchMedia(false).matchMedia),
      scheduler,
    });
    const settings = createSettingsStore(localStorage);
    const sendSignal: { current: ((s: AttentionSignalLike) => void) | null } = { current: null };
    const signal = (value: 'present' | 'away'): void => sendSignal.current?.({ value, timestamp: clock.now() });
    const rolls = [0.1, 0.2, 0.9, 0.8, 0.4, 0.6];
    let rollIndex = 0;

    const engine = createHauntEngine({
      subscribeSignal(cb) {
        sendSignal.current = cb;
        cb({ value: 'present', timestamp: clock.now() });
        return () => {
          sendSignal.current = null;
        };
      },
      haunts: registry,
      gate,
      settings,
      clock,
      scheduler,
      random: () => rolls[rollIndex++ % rolls.length],
      warn: () => undefined,
    });
    const seen = new Set<string>();
    const observe = (): ReturnType<typeof engine.getState> => {
      const state = engine.getState();
      for (const id of state.running) seen.add(id);
      return state;
    };

    engine.start();
    expect(observe().level).toBe(0);

    // First-run notice dismissed, then the sound and gentle toggles. The gate is told about sound
    // the same way useHauntEngine does.
    settings.set({ noticeSeen: true });
    settings.set({ sound: false });
    gate.setSoundEnabled(false);
    settings.set({ sound: true });
    gate.setSoundEnabled(true);
    settings.set({ mode: 'gentle' });
    settings.set({ mode: 'classic' });
    unlockTarget.dispatchEvent(new Event('pointerdown'));
    await flush();
    expect(audioFactory.contexts[0]?.state).toBe('running');

    // Look away for 13 s: level 3 with a lead and a companion.
    signal('away');
    scheduler.advance(13_000);
    let state = observe();
    expect(state.level).toBe(3);
    expect(state.leadId).not.toBeNull();
    expect(state.running).toHaveLength(Math.min(2, registryIds.length));
    expect(state.running.every((id) => registryIds.includes(id))).toBe(true);
    // Real visual and audio effects reached the fakes and jsdom hosts.
    expect(root.style.getPropertyValue('--glow-dim')).not.toBe('');
    expect(audioFactory.contexts[0]?.automation.length).toBeGreaterThan(0);

    // Gentle while haunted, then off again.
    settings.set({ mode: 'gentle' });
    scheduler.advance(1_000);
    expect(observe().level).toBe(1);
    settings.set({ mode: 'classic' });
    scheduler.advance(100);
    observe();

    // Another tab changes the Volume_Cap; the gate re-reads it on the storage event.
    writeAsOtherTab(KEYS.volumeCap, '0.2');
    window.dispatchEvent(new StorageEvent('storage', { key: KEYS.volumeCap }));
    scheduler.advance(500);

    // Look back: everything fades out and stops.
    signal('present');
    scheduler.advance(2_000);
    state = observe();
    expect(state.level).toBe(0);
    expect(state.running).toEqual([]);

    // A second look-away, shorter, then back.
    signal('away');
    scheduler.advance(6_000);
    expect(observe().level).toBe(2);
    signal('present');
    scheduler.advance(2_000);
    observe();

    engine.stop();
    gate.dispose();
    scheduler.advance(2_000);

    // The session really started haunts, so the checks below are not vacuous.
    expect(seen.size).toBeGreaterThanOrEqual(Math.min(2, registryIds.length));
    for (const id of seen) expect(registryIds).toContain(id);
    expect(spies.setItemKeys.length).toBeGreaterThan(0);
    expect(spies.setItemKeys).toEqual(expect.arrayContaining([KEYS.sound, KEYS.mode, KEYS.noticeSeen]));

    expect(spies.forbidden).toEqual([]);
    for (const key of spies.setItemKeys) expect(ALLOWED_KEYS).toContain(key);
    // The engine and gate never write the Volume_Cap (Req 6.16); only the other-tab writes did.
    expect(spies.setItemKeys).not.toContain(KEYS.volumeCap);
    expect(localStorage.getItem(KEYS.volumeCap)).toBe('0.2');
  });

  it('the real HauntLayer (UI wiring) also makes no network or camera call and writes only documented keys', () => {
    const listeners = new Set<(s: AttentionSignalLike) => void>();
    const stamp = (value: 'present' | 'away'): AttentionSignalLike => ({
      value,
      timestamp: performance.timeOrigin + performance.now(),
    });
    // A fake attention module: it only delivers present or away, as the real one does.
    const subscribeSignal = (cb: (s: AttentionSignalLike) => void): (() => void) => {
      listeners.add(cb);
      cb(stamp('present'));
      return () => void listeners.delete(cb);
    };
    const send = (value: 'present' | 'away'): void => {
      act(() => {
        for (const cb of [...listeners]) cb(stamp(value));
      });
    };

    const view = render(createElement(HauntLayer, { subscribeSignal }));
    expect(listeners.size).toBe(1); // the real engine subscribed through the real hook

    fireEvent.click(screen.getByRole('button', { name: 'Begin reading' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    send('away');
    const stage = view.container.ownerDocument.querySelector<HTMLElement>('.haunt-stage');
    // Level 1 is running. Which haunt leads is random: the candle sets --glow-dim, whispers adds a layer.
    const dimmed = stage?.style.getPropertyValue('--glow-dim') === '0.25';
    const layerAdded = [...(stage?.children ?? [])].some((region) => region.children.length > 1);
    expect(dimmed || layerAdded).toBe(true);
    send('present');
    view.unmount();

    expect(spies.setItemKeys.length).toBeGreaterThan(0);
    expect(spies.setItemKeys).toContain(KEYS.noticeSeen);
    expect(spies.forbidden).toEqual([]);
    for (const key of spies.setItemKeys) expect(ALLOWED_KEYS).toContain(key);
    expect(spies.setItemKeys).not.toContain(KEYS.volumeCap);
  });
});
