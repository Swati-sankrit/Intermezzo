import { useCallback, useEffect, useState } from 'react';
import { drawnLooks, shellEffects, type ShellEffects } from '../shellEffects';
import { BurnOverlay } from './BurnOverlay';
import type { BurnSource } from './coverCapture';
import './OpeningTransition.css';

/** Phase lengths in ms. Gutter + dim + fade = 1500, the most the transition may take. */
export const GUTTER_MS = 400;
export const DIM_MS = 600;
export const FADE_MS = 500;
/** The single fade used under Reduced_Motion (at most 300 ms). */
export const REDUCED_FADE_MS = 250;

type Phase = 'burn' | 'gutter' | 'dim' | 'hold' | 'fade';

const SKIP_EVENTS = ['keydown', 'pointerdown', 'mousedown', 'click', 'touchstart'] as const;

export interface OpeningTransitionProps {
  /** True once the book is shown. The fade up waits for it. */
  ready: boolean;
  /** True if the book failed to open. The transition ends at once. */
  failed: boolean;
  /** Called once, when the transition ends for any reason. */
  onDone: () => void;
  /** The chosen cover, for the Burn. Without it, or under 'fade', no burn plays. */
  burn?: BurnSource | null;
  /** Effect options; defaults to the file `shellEffects.ts`. */
  effects?: ShellEffects;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The candle gutters, the screen dims to dark, then fades up on the book.
 * Decorative and silent: it takes no pointer events and no focus, and the
 * listeners that skip it only watch events, so the key or click still reaches the page.
 */
export function OpeningTransition({ ready, failed, onDone, burn = null, effects = shellEffects }: OpeningTransitionProps) {
  const [reduced] = useState(prefersReducedMotion);
  const burnSource = !reduced && drawnLooks(effects).bookOpen === 'burn' ? burn : null;
  const [phase, setPhase] = useState<Phase>(reduced ? 'hold' : burnSource ? 'burn' : 'gutter');
  // The burn never waits for loading; when it ends, or cannot be drawn, the usual sequence starts.
  const endBurn = useCallback(() => setPhase((p) => (p === 'burn' ? 'gutter' : p)), []);

  // Any key, click or touch ends it at once. Listeners observe only; nothing is prevented or stopped.
  useEffect(() => {
    const skip = () => onDone();
    for (const type of SKIP_EVENTS) window.addEventListener(type, skip, { capture: true, passive: true });
    return () => {
      for (const type of SKIP_EVENTS) window.removeEventListener(type, skip, { capture: true });
    };
  }, [onDone]);

  useEffect(() => {
    if (failed) {
      onDone();
      return;
    }
    if (phase === 'burn') return;
    if (phase === 'hold') {
      if (ready) setPhase('fade');
      return;
    }
    const ms = phase === 'gutter' ? GUTTER_MS : phase === 'dim' ? DIM_MS : reduced ? REDUCED_FADE_MS : FADE_MS;
    const timer = setTimeout(() => {
      if (phase === 'gutter') setPhase('dim');
      else if (phase === 'dim') setPhase('hold');
      else onDone();
    }, ms);
    return () => clearTimeout(timer);
  }, [phase, ready, failed, reduced, onDone]);

  return (
    <>
      {phase === 'burn' && burnSource && (
        <BurnOverlay
          source={burnSource}
          burnMs={effects.strengths.burnMs}
          maxSparks={effects.strengths.burnMaxSparks}
          onDone={endBurn}
          onFail={endBurn}
        />
      )}
      <div
        className={`opening opening--${phase}${reduced ? ' opening--reduced' : ''}`}
        aria-hidden="true"
      >
        <div className="opening__glow" />
      </div>
    </>
  );
}
