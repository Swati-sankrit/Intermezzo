import { useEffect, useState } from 'react';
import './ShellEffects.css';

/**
 * Slow fog along the bottom. The drift is a CSS animation (90 s to cross) that pauses
 * while the document is hidden. Reduced motion turns the animation off in CSS.
 */
export function FogLayer() {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);

  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return (
    <div className="shell-fog" aria-hidden="true">
      <div className={hidden ? 'shell-fog__drift shell-fog__drift--paused' : 'shell-fog__drift'} />
    </div>
  );
}
