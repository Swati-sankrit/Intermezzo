import { useEffect, useRef } from 'react';

/** The cover the reader chose: where it is, its image, and the element to hide while it burns. */
export interface BurnSource {
  rect: { left: number; top: number; width: number; height: number };
  image: HTMLImageElement;
  fit: 'cover' | 'contain';
  hide: HTMLElement;
}

/** A click older than this is not the click that opened the book. */
const FRESH_MS = 1000;

/** Pure. The source for a click on `target`, or null when it is not on a button with a cover image. */
export function sourceFromClick(target: EventTarget | null): BurnSource | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest('.shell-frame button');
  const image = button?.querySelector('img');
  if (!button || !image) return null;
  const r = image.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const fit = getComputedStyle(image).objectFit === 'contain' ? 'contain' : 'cover';
  return {
    rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    image,
    fit,
    hide: button as HTMLElement,
  };
}

/**
 * Remembers the cover under the latest click in the Library tab. `take()` returns it once, if the
 * click was recent. The listener only watches: the click still reaches the page.
 */
export function useCoverCapture(): () => BurnSource | null {
  const last = useRef<{ at: number; source: BurnSource } | null>(null);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const source = sourceFromClick(event.target);
      last.current = source ? { at: Date.now(), source } : null;
    };
    window.addEventListener('click', onClick, { capture: true, passive: true });
    return () => window.removeEventListener('click', onClick, { capture: true });
  }, []);
  return () => {
    const found = last.current;
    last.current = null;
    return found && Date.now() - found.at <= FRESH_MS ? found.source : null;
  };
}
