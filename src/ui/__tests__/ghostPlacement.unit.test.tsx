import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHauntSettingsStore } from '../hauntSettingsStore';
import { LurkingGhost } from '../shell/LurkingGhost';
import {
  GHOST_ASPECT,
  isDemoMode,
  nextPeekDelayMs,
  pickSlot,
  slotRect,
  visiblePart,
  type Rect,
} from '../shell/ghostPlacement';
import { DEFAULT_EFFECTS } from '../shellEffects';

const VIEW = { width: 1000, height: 800 };

describe('Demo_Mode and the peek delay', () => {
  it('is on only for demo=1', () => {
    expect(isDemoMode('?demo=1')).toBe(true);
    expect(isDemoMode('?a=b&demo=1')).toBe(true);
    expect(isDemoMode('')).toBe(false);
    expect(isDemoMode('?demo=0')).toBe(false);
    expect(isDemoMode('?demo=10')).toBe(false);
  });

  it('gives 3 s first then 4 to 6 s in demo, and 45 to 90 s otherwise', () => {
    for (const rand of [0, 0.25, 0.5, 0.999]) {
      expect(nextPeekDelayMs(rand, true, true)).toBe(3000);
      const later = nextPeekDelayMs(rand, true, false);
      expect(later).toBeGreaterThanOrEqual(4000);
      expect(later).toBeLessThanOrEqual(6000);
      for (const isFirst of [true, false]) {
        const normal = nextPeekDelayMs(rand, false, isFirst);
        expect(normal).toBeGreaterThanOrEqual(45000);
        expect(normal).toBeLessThanOrEqual(90000);
      }
    }
    expect(nextPeekDelayMs(0.5, true, false)).toBe(5000);
    expect(nextPeekDelayMs(0, false, true)).toBe(45000);
  });
});

describe('ghost slots', () => {
  it('draws the ghost at ghostHeightVh of the viewport, with part behind the edge', () => {
    const left = slotRect('left', 100, VIEW, GHOST_ASPECT);
    const right = slotRect('right', 100, VIEW, GHOST_ASPECT);
    const h = (800 * DEFAULT_EFFECTS.strengths.ghostHeightVh) / 100;
    expect(left.bottom - left.top).toBeCloseTo(h);
    expect(left.top).toBe(100);
    expect(left.left).toBeLessThan(0);
    expect(right.right).toBeGreaterThan(VIEW.width);
    const w = h * GHOST_ASPECT;
    const frac = DEFAULT_EFFECTS.strengths.ghostVisibleFraction;
    const inside = visiblePart(left, VIEW);
    expect((inside.right - inside.left) / w).toBeCloseTo(frac);
    const insideR = visiblePart(right, VIEW);
    expect((insideR.right - insideR.left) / w).toBeCloseTo(frac);
  });

  it('keeps only the part inside the viewport', () => {
    expect(visiblePart({ left: -50, top: 10, right: 100, bottom: 900 }, VIEW)).toEqual({
      left: 0,
      top: 10,
      right: 100,
      bottom: 800,
    });
  });

  it('picks a slot whose visible part overlaps no Control', () => {
    // A Control along the top left corner blocks the top left slots only.
    const control: Rect = { left: 0, top: 0, right: 200, bottom: 100 };
    for (const rand of [0, 0.3, 0.6, 0.99]) {
      const slot = pickSlot([control], VIEW, GHOST_ASPECT, rand);
      expect(slot).toBeDefined();
      const v = visiblePart(slot as Rect, VIEW);
      const hit = v.left < control.right && v.right > control.left && v.top < control.bottom && v.bottom > control.top;
      expect(hit).toBe(false);
    }
  });

  it('ignores a Control that only touches the part behind the edge', () => {
    const behind: Rect = { left: -400, top: 0, right: -1, bottom: 800 };
    expect(pickSlot([behind], VIEW, GHOST_ASPECT, 0)).toBeDefined();
  });

  it('returns nothing when every slot overlaps a Control', () => {
    const everywhere: Rect = { left: 0, top: 0, right: VIEW.width, bottom: VIEW.height };
    expect(pickSlot([everywhere], VIEW, GHOST_ASPECT, 0.5)).toBeUndefined();
  });
});

describe('LurkingGhost scheduling', () => {
  const stubMotion = (reduced: boolean) =>
    vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} }));

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    getHauntSettingsStore().set({ mode: 'classic' });
    window.history.pushState({}, '', '/');
  });

  const peeks = () => document.querySelector('.lurking-ghost');

  it('peeks 3 s after mount with ?demo=1', () => {
    stubMotion(false);
    window.history.pushState({}, '', '/?demo=1');
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    render(<LurkingGhost />);
    act(() => void vi.advanceTimersByTime(2900));
    expect(peeks()).toBeNull();
    act(() => void vi.advanceTimersByTime(200));
    expect(peeks()).not.toBeNull();
  });

  it('does not peek within 40 s without ?demo=1', () => {
    stubMotion(false);
    render(<LurkingGhost />);
    act(() => void vi.advanceTimersByTime(40_000));
    expect(peeks()).toBeNull();
  });

  it('never peeks under reduced motion, in demo mode as well', () => {
    stubMotion(true);
    window.history.pushState({}, '', '/?demo=1');
    render(<LurkingGhost />);
    act(() => void vi.advanceTimersByTime(120_000));
    expect(peeks()).toBeNull();
  });

  it('never peeks in Gentle mode, in demo mode as well', () => {
    stubMotion(false);
    getHauntSettingsStore().set({ mode: 'gentle' });
    window.history.pushState({}, '', '/?demo=1');
    render(<LurkingGhost />);
    act(() => void vi.advanceTimersByTime(120_000));
    expect(peeks()).toBeNull();
  });
});
