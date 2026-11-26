import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BurnSource } from '../shell/coverCapture';
import { OpeningTransition } from '../shell/OpeningTransition';
import { resolveEffects } from '../shellEffects';

function makeSource(): BurnSource {
  return {
    rect: { left: 40, top: 60, width: 100, height: 150 },
    image: document.createElement('img'),
    fit: 'cover',
    hide: document.createElement('button'),
  };
}

/** A canvas context that accepts every call. jsdom has no canvas, and the pixels are not under test. */
function fakeContext() {
  const blank = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    putImageData: vi.fn(),
    fillRect: vi.fn(),
    getImageData: (_x: number, _y: number, w: number, h: number) => blank(w, h),
    createImageData: (w: number, h: number) => blank(w, h),
    fillStyle: '',
    globalAlpha: 1,
  };
}

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function setup(props: Partial<React.ComponentProps<typeof OpeningTransition>> = {}) {
  const onDone = vi.fn();
  const view = render(
    <OpeningTransition
      ready={false}
      failed={false}
      onDone={onDone}
      burn={makeSource()}
      effects={resolveEffects({ bookOpen: 'burn' })}
      {...props}
    />,
  );
  return { onDone, ...view };
}

describe('burn on open', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubReducedMotion(false);
    document.documentElement.style.setProperty('--accent', '#e0a64a');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => fakeContext() as unknown as CanvasRenderingContext2D,
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--accent');
  });

  it("plays the burn first for 'burn', then the usual sequence starts", () => {
    const { container, onDone } = setup();
    expect(container.querySelector('.burn-overlay')).not.toBeNull();
    expect(container.querySelector('.opening--burn')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1200));
    expect(container.querySelector('.burn-overlay')).toBeNull();
    expect(container.querySelector('.opening--gutter')).not.toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("plays no burn for 'fade'", () => {
    const { container } = setup({ effects: resolveEffects({ bookOpen: 'fade' }) });
    expect(container.querySelector('.burn-overlay')).toBeNull();
    expect(container.querySelector('.opening--gutter')).not.toBeNull();
  });

  it('plays no burn without a chosen cover', () => {
    const { container } = setup({ burn: null });
    expect(container.querySelector('.burn-overlay')).toBeNull();
    expect(container.querySelector('.opening--gutter')).not.toBeNull();
  });

  it('skips the burn under reduced motion and plays the single fade', () => {
    stubReducedMotion(true);
    const { container } = setup({ ready: true });
    expect(container.querySelector('.burn-overlay')).toBeNull();
    expect(container.querySelector('.opening--reduced')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(0));
    expect(container.querySelector('.opening--fade')).not.toBeNull();
  });

  it('ends the whole transition at once on a click, without swallowing it', () => {
    const { onDone } = setup();
    const button = document.body.appendChild(document.createElement('button'));
    const reachedPage = vi.fn();
    button.addEventListener('click', reachedPage);
    fireEvent.click(button);
    expect(onDone).toHaveBeenCalled();
    expect(reachedPage).toHaveBeenCalledTimes(1);
    button.remove();
  });

  it('ends the whole transition at once on a key press, without preventing it', () => {
    const { onDone } = setup();
    const notPrevented = fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onDone).toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });

  it('ends at once when the book fails to open during the burn', () => {
    const { onDone, rerender } = setup();
    rerender(
      <OpeningTransition
        ready={false}
        failed
        onDone={onDone}
        burn={makeSource()}
        effects={resolveEffects({ bookOpen: 'burn' })}
      />,
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('skips the burn and plays the usual sequence when it cannot be drawn', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const { container, onDone } = setup();
    act(() => void vi.advanceTimersByTime(1));
    expect(container.querySelector('.burn-overlay')).toBeNull();
    expect(container.querySelector('.opening--gutter')).not.toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows the real card again after the burn', () => {
    const source = makeSource();
    const { container } = setup({ burn: source });
    expect(source.hide.style.visibility).toBe('hidden');
    act(() => void vi.advanceTimersByTime(1200));
    expect(container.querySelector('.burn-overlay')).toBeNull();
    expect(source.hide.style.visibility).not.toBe('hidden');
  });
});
