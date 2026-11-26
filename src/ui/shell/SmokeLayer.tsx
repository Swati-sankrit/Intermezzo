import { useEffect, useState, type CSSProperties } from 'react';
import { createReducedMotion } from '../../haunts/engine/gate/reducedMotion';
import { shellEffects, type ShellEffects } from '../shellEffects';
import './SmokeLayer.css';

/** Left edge (percent), width (percent) and start offset (share of one rise) of each wisp. */
const WISPS: ReadonlyArray<{ left: number; width: number; offset: number }> = [
  { left: 2, width: 22, offset: 0 },
  { left: 26, width: 22, offset: 0.5 },
  { left: 50, width: 22, offset: 0.25 },
  { left: 74, width: 22, offset: 0.75 },
];

function useReducedMotion(): boolean {
  const [adapter] = useState(() => createReducedMotion());
  const [reduced, setReduced] = useState(() => adapter.get());
  useEffect(() => adapter.subscribe(setReduced), [adapter]);
  return reduced;
}

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return hidden;
}

/**
 * Soft wisps of smoke that rise slowly from the bottom, each taking `smokeRiseSeconds` and
 * fading in and out along the way, at a peak alpha of `smokeMaxAlpha`. The layer sits behind the
 * content, takes no pointer events and no focus. The wisps pause while the document is hidden.
 * Under reduced motion one still haze is drawn instead. Opacity moves over a whole rise, so it
 * changes far slower than 3 times a second.
 */
export function SmokeLayer({ effects = shellEffects }: { effects?: ShellEffects }) {
  const s = effects.strengths;
  const reduced = useReducedMotion();
  const hidden = useDocumentHidden();
  const style = {
    '--smoke-alpha': `${Math.round(s.smokeMaxAlpha * 100)}%`,
    '--smoke-rise': `${Math.max(15, s.smokeRiseSeconds)}s`,
  } as CSSProperties;

  if (reduced) {
    return (
      <div className="shell-smoke shell-smoke--still" style={style} aria-hidden="true">
        <div className="shell-smoke__haze" />
      </div>
    );
  }

  return (
    <div className={hidden ? 'shell-smoke shell-smoke--paused' : 'shell-smoke'} style={style} aria-hidden="true">
      {WISPS.map((w) => (
        <div
          key={w.left}
          className="shell-smoke__wisp"
          style={{
            left: `${w.left}%`,
            width: `${w.width}%`,
            animationDelay: `calc(var(--smoke-rise) * ${-w.offset})`,
          }}
        />
      ))}
    </div>
  );
}
