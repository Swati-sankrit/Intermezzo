import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createReducedMotion } from '../../haunts/engine/gate/reducedMotion';
import { shellEffects, type ShellEffects } from '../shellEffects';
import { createFlicker } from './flameFlicker';
import { subscribeAnchor, getAnchor } from './lightAnchorStore';
import { useLightAnchor } from './useLightAnchor';
import './FlameCursor.css';

const FLAME_W = 40;
const FLAME_H = 56;
/** Steady brightness factor under Reduced_Motion. */
const STEADY = 0.8;

type Source = 'none' | 'pointer' | 'touch' | 'focus';

/** The flame is drawn for a mouse, pen or touch point (Requirement 15.5); keyboard focus shows the glow alone. */
export function showsFlame(source: Source): boolean {
  return source === 'pointer' || source === 'touch';
}

function useReducedMotion(): boolean {
  const [adapter] = useState(() => createReducedMotion());
  const [reduced, setReduced] = useState(() => adapter.get());
  useEffect(() => adapter.subscribe(setReduced), [adapter]);
  return reduced;
}

/**
 * A small flame at the pointer with a local red-amber glow. The glow element is moved by
 * `useLightAnchor`, which publishes the Light_Anchor that lit covers follow. Both layers take no
 * pointer events and the system pointer stays visible. Brightness changes at most
 * `flameFlickerMaxHz` times a second; reduced motion gives a still flame and a steady glow.
 */
export function FlameCursor({ effects = shellEffects }: { effects?: ShellEffects }) {
  const s = effects.strengths;
  const reduced = useReducedMotion();
  const glowRef = useRef<HTMLDivElement>(null);
  const flameRef = useRef<HTMLDivElement>(null);
  const radius = Math.min(s.flameGlowRadiusPx, s.lightRadiusPx);
  const size = radius * 2;
  useLightAnchor(glowRef, size);

  // Place the flame at the anchor, and hide it unless the source is a mouse or pen.
  useEffect(() => {
    const flame = flameRef.current;
    if (!flame) return;
    let source: Source = 'none';
    const place = () => {
      const a = getAnchor();
      if (!a) return;
      // Base of the flame just above the pointer tip, so the system arrow stays visible.
      flame.style.transform = `translate3d(${a.x - FLAME_W / 2}px, ${a.y - FLAME_H - 2}px, 0)`;
      flame.style.visibility = showsFlame(source) ? 'visible' : 'hidden';
    };
    const onPointer = (e: PointerEvent) => {
      source = e.pointerType === 'touch' ? 'touch' : 'pointer';
      place();
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target;
      try {
        if (t instanceof Element && t.matches(':focus-visible')) source = 'focus';
      } catch {
        /* selector unsupported: keep the previous source */
      }
      place();
    };
    place();
    const unsubscribe = subscribeAnchor(place);
    window.addEventListener('pointermove', onPointer, { passive: true, capture: true });
    window.addEventListener('pointerdown', onPointer, { passive: true, capture: true });
    document.addEventListener('focusin', onFocus, true);
    return () => {
      unsubscribe();
      window.removeEventListener('pointermove', onPointer, true);
      window.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('focusin', onFocus, true);
    };
  }, []);

  // Flicker loop. None under reduced motion, and paused while the document is hidden.
  useEffect(() => {
    const glow = glowRef.current;
    const flame = flameRef.current;
    if (!glow || !flame) return;
    const apply = (level: number, sway: number) => {
      glow.style.opacity = String(level);
      flame.style.setProperty('--flame-level', String(level));
      flame.style.setProperty('--flame-sway', `${sway}deg`);
    };
    if (reduced) {
      apply(STEADY, 0);
      return;
    }
    const flicker = createFlicker(s.flameFlickerMaxHz);
    let frame = 0;
    const tick = (now: number) => {
      apply(flicker.at(now), Math.sin(now / 900) * 3);
      frame = requestAnimationFrame(tick);
    };
    const run = () => {
      if (!frame && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : run());
    document.addEventListener('visibilitychange', onVisibility);
    run();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [reduced, s.flameFlickerMaxHz]);

  const glowStyle = { width: size, height: size, '--flame-glow-alpha': `${Math.round(s.flameGlowMaxAlpha * 100)}%` } as CSSProperties;
  return (
    <>
      <div ref={glowRef} className="shell-flame-glow" style={glowStyle} aria-hidden="true" />
      <div
        ref={flameRef}
        className="shell-flame"
        style={{ width: FLAME_W, height: FLAME_H }}
        aria-hidden="true"
      >
        <span className="shell-flame__outer" />
        <span className="shell-flame__mid" />
        <span className="shell-flame__core" />
      </div>
    </>
  );
}
