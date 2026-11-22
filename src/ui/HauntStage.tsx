import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { computeRegions, type Rect, type Regions, type VisualHosts } from '../haunts/engine';
import './HauntStage.css';

/** Rough width of one `ch` in px, used only when the column cannot be measured. */
const CH_ESTIMATE_PX = 11;
const COLUMN_CH = 65;

interface HauntStageProps {
  /** Called with the host elements once mounted, and with `null` on unmount. */
  hostsRef?: (hosts: VisualHosts | null) => void;
}

/** Centred 65ch estimate, used when the column element or ResizeObserver is missing. */
function estimateColumn(viewportWidth: number): Rect {
  const half = Math.min(viewportWidth, COLUMN_CH * CH_ESTIMATE_PX) / 2;
  const mid = viewportWidth / 2;
  return { left: mid - half, right: mid + half, top: 0, bottom: 0 };
}

function measureRegions(): Regions {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const el = document.querySelector('[data-reading-column]');
  const r = el?.getBoundingClientRect();
  const hasBox = r !== undefined && r.width > 0;
  const column: Rect = hasBox
    ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    : estimateColumn(w);
  return computeRegions(w, h, column);
}

function sameRegions(a: Regions, b: Regions): boolean {
  return (
    a.left.right === b.left.right &&
    a.right.left === b.right.left &&
    a.left.bottom === b.left.bottom &&
    a.right.right === b.right.right
  );
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
    <div className="haunt-stage" ref={rootRef} aria-hidden="true">
      <div className="haunt-stage__region" ref={leftRef} style={regionStyle(regions.left)}>
        <Glow side="left" />
      </div>
      <div className="haunt-stage__region" ref={rightRef} style={regionStyle(regions.right)}>
        <Glow side="right" />
      </div>
    </div>
  );
}
