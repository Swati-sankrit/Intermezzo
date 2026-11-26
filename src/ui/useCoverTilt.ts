import { useCallback } from 'react';
import type { PointerEvent } from 'react';

/** Largest tilt on each axis, in degrees (Requirement 5.1). */
export const MAX_TILT_DEGREES = 8;

/** Tilt angles for a pointer at (x, y) inside a box, so the card leans toward the pointer. */
export function tiltAngles(x: number, y: number, width: number, height: number) {
  if (!(width > 0) || !(height > 0)) return { rotateX: 0, rotateY: 0 };
  const nx = Math.min(1, Math.max(-1, (x / width - 0.5) * 2));
  const ny = Math.min(1, Math.max(-1, (y / height - 0.5) * 2));
  return { rotateX: -ny * MAX_TILT_DEGREES, rotateY: nx * MAX_TILT_DEGREES };
}

function tiltAllowed(event: PointerEvent<HTMLElement>): boolean {
  if (event.pointerType === 'touch') return false;
  const media = typeof window !== 'undefined' ? window.matchMedia : undefined;
  if (!media) return true;
  return !media('(prefers-reduced-motion: reduce)').matches && !media('(hover: none)').matches;
}

/**
 * Pointer handlers that set `--tilt-x` and `--tilt-y` on the cover button.
 * Keyboard focus never sets them, so a focused card stays flat. CSS applies the
 * transform and also turns it off for Reduced_Motion and `hover: none`.
 */
export function useCoverTilt() {
  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const el = event.currentTarget;
    if (!tiltAllowed(event)) return;
    const box = el.getBoundingClientRect();
    const { rotateX, rotateY } = tiltAngles(event.clientX - box.left, event.clientY - box.top, box.width, box.height);
    el.style.setProperty('--tilt-x', `${rotateX.toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${rotateY.toFixed(2)}deg`);
  }, []);

  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.removeProperty('--tilt-x');
    event.currentTarget.style.removeProperty('--tilt-y');
  }, []);

  return { onPointerMove, onPointerLeave };
}
