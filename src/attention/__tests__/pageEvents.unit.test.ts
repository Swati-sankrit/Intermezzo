import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPageEvents } from '../pageEvents';

const INPUTS = ['keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel', 'scroll'];

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

afterEach(() => {
  vi.restoreAllMocks();
  setVisibility('visible');
});

describe('createPageEvents', () => {
  it('adds every input listener as passive and the state listeners', () => {
    const winAdd = vi.spyOn(window, 'addEventListener');
    const docAdd = vi.spyOn(document, 'addEventListener');
    const pe = createPageEvents();
    for (const type of INPUTS) {
      const call = winAdd.mock.calls.find((c) => c[0] === type);
      expect(call, type).toBeDefined();
      expect((call![2] as AddEventListenerOptions).passive).toBe(true);
    }
    expect(winAdd.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['focus', 'blur']));
    expect(docAdd.mock.calls.map((c) => c[0])).toContain('visibilitychange');
    pe.dispose();
  });

  it('records only a timestamp on input', () => {
    let t = 1000;
    const pe = createPageEvents({ now: () => t });
    expect(pe.lastInputT()).toBe(1000);
    t = 2500;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'secret' }));
    expect(pe.lastInputT()).toBe(2500);
    expect(Object.keys(pe).sort()).toEqual(['dispose', 'lastInputT', 'onChange', 'tabActive']);
    expect(typeof pe.lastInputT()).toBe('number');
    pe.dispose();
  });

  it('fires onChange only when tabActive changes', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const pe = createPageEvents();
    const cb = vi.fn();
    pe.onChange(cb);
    expect(pe.tabActive()).toBe(true);

    window.dispatchEvent(new Event('focus'));
    expect(cb).not.toHaveBeenCalled();

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenLastCalledWith(false);
    expect(pe.tabActive()).toBe(false);

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).toHaveBeenLastCalledWith(true);

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    expect(cb).toHaveBeenLastCalledWith(false);
    expect(cb).toHaveBeenCalledTimes(3);
    pe.dispose();
  });

  it('dispose removes every listener it added', () => {
    const winAdd = vi.spyOn(window, 'addEventListener');
    const docAdd = vi.spyOn(document, 'addEventListener');
    const winRemove = vi.spyOn(window, 'removeEventListener');
    const docRemove = vi.spyOn(document, 'removeEventListener');
    let t = 1;
    const pe = createPageEvents({ now: () => t });
    const cb = vi.fn();
    pe.onChange(cb);
    pe.dispose();

    for (const [type, fn] of winAdd.mock.calls) {
      expect(winRemove.mock.calls.some((c) => c[0] === type && c[1] === fn)).toBe(true);
    }
    for (const [type, fn] of docAdd.mock.calls) {
      expect(docRemove.mock.calls.some((c) => c[0] === type && c[1] === fn)).toBe(true);
    }

    t = 99;
    window.dispatchEvent(new KeyboardEvent('keydown'));
    expect(pe.lastInputT()).toBe(1);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(cb).not.toHaveBeenCalled();
  });
});
