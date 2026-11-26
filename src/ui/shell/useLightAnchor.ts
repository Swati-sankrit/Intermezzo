import { useLayoutEffect, type RefObject } from 'react';
import { publishAnchor } from './lightAnchorStore';


/**
 * Moves the pool element (`poolSize` px across, from the Effect_Options) to the Light_Anchor: the pointer or touch point, the
 * centre of the keyboard-focused element, or the centre of the visible Tab_Panel
 * until the first event. Writes the position straight to the element, so a pointer
 * move shows in the same frame and React never re-renders for it.
 */
export function useLightAnchor(poolRef: RefObject<HTMLElement | null>, poolSize: number): void {
  useLayoutEffect(() => {
    const el = poolRef.current;
    if (!el) return;
    let moved = false;

    const place = (x: number, y: number) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      el.style.transform = `translate3d(${x - poolSize / 2}px, ${y - poolSize / 2}px, 0)`;
      publishAnchor(x, y);
    };

    const placeAtPanel = () => {
      const panel = document.querySelector('[role="tabpanel"]:not([hidden])');
      const r = panel?.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!r || r.width === 0) return place(vw / 2, vh / 2);
      // The panel can be taller than the screen; keep the centre on screen.
      const cy = Math.min(Math.max(r.top + r.height / 2, 0), vh);
      place(r.left + r.width / 2, cy);
    };

    const onPointer = (e: PointerEvent) => {
      moved = true;
      place(e.clientX, e.clientY);
    };

    const onFocus = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      try {
        // A click also focuses; only keyboard focus moves the light.
        if (!t.matches(':focus-visible')) return;
      } catch {
        return;
      }
      const r = t.getBoundingClientRect();
      moved = true;
      place(r.left + r.width / 2, r.top + r.height / 2);
    };

    const onResize = () => {
      if (!moved) placeAtPanel();
    };

    placeAtPanel();
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    document.addEventListener('focusin', onFocus);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('focusin', onFocus);
      window.removeEventListener('resize', onResize);
    };
  }, [poolRef, poolSize]);
}
