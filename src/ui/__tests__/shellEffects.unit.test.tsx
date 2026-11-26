import { render } from '@testing-library/react';
import { afterEach } from 'vitest';
import { FlameCursor, showsFlame } from '../shell/FlameCursor';
import { createFlicker } from '../shell/flameFlicker';
import { describe, expect, it, vi } from 'vitest';
import { ShellFrame } from '../shell/ShellFrame';
import { SmokeLayer } from '../shell/SmokeLayer';
import { getAnchor } from '../shell/lightAnchorStore';
import { CandlePool } from '../shell/CandlePool';
import { DEFAULT_EFFECTS, drawnLooks, resolveEffects, shellEffects } from '../shellEffects';

describe('shellEffects', () => {
  it('defaults to flame, smoke and burn', () => {
    expect(shellEffects).toBe(DEFAULT_EFFECTS);
    expect(resolveEffects({})).toMatchObject({ cursorLight: 'flame', ambient: 'smoke', bookOpen: 'burn' });
  });

  it("keeps 'pool', 'fog' and 'fade' when chosen, and draws them", () => {
    const r = resolveEffects({ cursorLight: 'pool', ambient: 'fog', bookOpen: 'fade' });
    expect(r).toMatchObject({ cursorLight: 'pool', ambient: 'fog', bookOpen: 'fade' });
    expect(drawnLooks(r)).toEqual({ cursorLight: 'pool', ambient: 'fog', bookOpen: 'fade' });
  });

  it('switches one option without touching the others', () => {
    expect(resolveEffects({ ambient: 'fog' })).toMatchObject({
      cursorLight: 'flame',
      ambient: 'fog',
      bookOpen: 'burn',
    });
  });

  it('resolves unlisted values to the default for that option', () => {
    const r = resolveEffects({ cursorLight: 'torch', ambient: 42, bookOpen: null });
    expect(r).toMatchObject({ cursorLight: 'flame', ambient: 'smoke', bookOpen: 'burn' });
  });

  it('draws the flame, smoke and burn by default', () => {
    expect(drawnLooks(DEFAULT_EFFECTS)).toEqual({ cursorLight: 'flame', ambient: 'smoke', bookOpen: 'burn' });
  });
});

describe('smoke layer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("draws smoke for 'smoke' and only the fog for 'fog'", () => {
    const smoke = render(<ShellFrame library={<p>lib</p>} effects={resolveEffects({ ambient: 'smoke' })} />);
    expect(smoke.container.querySelector('.shell-smoke')).not.toBeNull();
    expect(smoke.container.querySelector('.shell-fog')).toBeNull();
    smoke.unmount();
    const fog = render(<ShellFrame library={<p>lib</p>} effects={resolveEffects({ ambient: 'fog' })} />);
    expect(fog.container.querySelector('.shell-fog')).not.toBeNull();
    expect(fog.container.querySelector('.shell-smoke')).toBeNull();
  });

  it('draws moving wisps normally and one still haze under reduced motion', () => {
    const normal = render(<SmokeLayer />);
    expect(normal.container.querySelectorAll('.shell-smoke__wisp').length).toBeGreaterThan(0);
    expect(normal.container.querySelector('.shell-smoke__haze')).toBeNull();
    normal.unmount();
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const still = render(<SmokeLayer />);
    expect(still.container.querySelectorAll('.shell-smoke__wisp')).toHaveLength(0);
    expect(still.container.querySelector('.shell-smoke__haze')).not.toBeNull();
  });

  it('is hidden from assistive tech and rises over at least 15 seconds', () => {
    const { container } = render(<SmokeLayer />);
    const layer = container.querySelector('.shell-smoke') as HTMLElement;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(parseFloat(layer.style.getPropertyValue('--smoke-rise'))).toBeGreaterThanOrEqual(15);
  });
});

describe('effects wiring', () => {
  it('sizes the Candle_Pool from lightRadiusPx', () => {
    const effects = { ...DEFAULT_EFFECTS, strengths: { ...DEFAULT_EFFECTS.strengths, lightRadiusPx: 200 } };
    const { container } = render(<CandlePool effects={effects} />);
    const pool = container.querySelector('.shell-candle-pool') as HTMLElement;
    expect(pool.style.width).toBe('200px');
    expect(pool.style.height).toBe('200px');
  });
});

describe('flame cursor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("draws the flame and glow for 'flame' and only the pool for 'pool'", () => {
    const flame = render(<ShellFrame library={<p>lib</p>} effects={resolveEffects({ cursorLight: 'flame' })} />);
    expect(flame.container.querySelector('.shell-flame-glow')).not.toBeNull();
    expect(flame.container.querySelector('.shell-candle-pool')).toBeNull();
    flame.unmount();
    const pool = render(<ShellFrame library={<p>lib</p>} effects={resolveEffects({ cursorLight: 'pool' })} />);
    expect(pool.container.querySelector('.shell-candle-pool')).not.toBeNull();
    expect(pool.container.querySelector('.shell-flame-glow')).toBeNull();
  });

  it('publishes the light anchor when the pointer moves', () => {
    render(<FlameCursor />);
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 90 }));
    expect(getAnchor()).toEqual({ x: 120, y: 90 });
  });

  it('shows the flame for a mouse and for touch (Requirement 15.5), not for keyboard focus', () => {
    const { container } = render(<FlameCursor />);
    const flame = container.querySelector('.shell-flame') as HTMLElement;
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 10, pointerType: 'mouse' }));
    expect(flame.style.visibility).toBe('visible');
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 20, pointerType: 'touch' }));
    expect(flame.style.visibility).toBe('visible');
    expect(showsFlame('focus')).toBe(false);
  });

  it('keeps a steady glow with no animation loop under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const { container } = render(<FlameCursor />);
    const glow = container.querySelector('.shell-flame-glow') as HTMLElement;
    expect(raf).not.toHaveBeenCalled();
    expect(Number(glow.style.opacity)).toBeGreaterThan(0);
    expect(Number(glow.style.opacity)).toBeLessThanOrEqual(1);
    raf.mockRestore();
  });

  it('resamples the flicker at most flameFlickerMaxHz times per second and stays in range', () => {
    let samples = 0;
    const f = createFlicker(2.5, () => (samples++, 0.5));
    const start = samples;
    for (let t = 0; t <= 1000; t += 16) {
      const v = f.at(t);
      expect(v).toBeGreaterThanOrEqual(0.6);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(samples - start).toBeLessThanOrEqual(3);
  });
});
