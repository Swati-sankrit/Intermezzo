import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Regions, VisualHosts } from '../haunts/engine';
import { measureRegions, sameRegions } from './measureRegions';
import './HauntStage.css';

interface HauntStageProps {
  /** Called with the host elements once mounted, and with `null` on unmount. */
  hostsRef?: (hosts: VisualHosts | null) => void;
}

function regionStyle(r: Regions['left']): CSSProperties {
  return { left: r.left, width: Math.max(0, r.right - r.left) };
}

function Glow({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`haunt-stage__glow haunt-stage__glow--${side}`} aria-hidden="true">
      <div className="haunt-stage__gutter">
        <div className="haunt-stage__drift" />
      </div>
    </div>
  );
}

/**
 * Fixed overlay with the Candle_Glow and two side regions beside the reading
 * column. Haunt visuals are drawn only in the side regions.
 *
 * The root is not `aria-hidden`: a descendant cannot undo an `aria-hidden` ancestor, and a
 * labelled haunt layer (`role="img"`) must reach screen readers (Req 2.12). The glow keeps
 * `aria-hidden`, and the visual adapter hides every layer and overlay that has no label.
 */
export function HauntStage({ hostsRef }: HauntStageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(hostsRef);
  useEffect(() => {
    callbackRef.current = hostsRef;
  });
  const [regions, setRegions] = useState<Regions>(() => measureRegions());

  useEffect(() => {
    const update = (): void => {
      const next = measureRegions();
      setRegions((prev) => (sameRegions(prev, next) ? prev : next));
    };
    update();
    window.addEventListener('resize', update);
    let observer: ResizeObserver | undefined;
    const column = document.querySelector('[data-reading-column]');
    if (typeof ResizeObserver !== 'undefined' && column !== null) {
      observer = new ResizeObserver(update);
      observer.observe(column);
    }
    return () => {
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!root || !left || !right) return;
    callbackRef.current?.({ root, left, right });
    return () => callbackRef.current?.(null);
  }, []);

  return (
    <div className="haunt-stage" ref={rootRef}>
      <div className="haunt-stage__region" ref={leftRef} style={regionStyle(regions.left)}>
        <Glow side="left" />
      </div>
      <div className="haunt-stage__region" ref={rightRef} style={regionStyle(regions.right)}>
        <Glow side="right" />
      </div>
    </div>
  );
}
