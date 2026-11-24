/**
 * Measures the side regions beside the Reading_Column (`[data-reading-column]`) from the live
 * DOM. Shared by `HauntStage` (layout) and the engine wiring (a getter read at each haunt start).
 */
import { computeRegions, type Rect, type Regions } from '../haunts/engine';

/** Rough width of one `ch` in px, used only when the column cannot be measured. */
const CH_ESTIMATE_PX = 11;
const COLUMN_CH = 65;

/** Centred 65ch estimate, used when the column element has no box. */
function estimateColumn(viewportWidth: number): Rect {
  const half = Math.min(viewportWidth, COLUMN_CH * CH_ESTIMATE_PX) / 2;
  const mid = viewportWidth / 2;
  return { left: mid - half, right: mid + half, top: 0, bottom: 0 };
}

export function measureRegions(): Regions {
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

export function sameRegions(a: Regions, b: Regions): boolean {
  return (
    a.left.right === b.left.right &&
    a.right.left === b.right.left &&
    a.left.bottom === b.left.bottom &&
    a.right.right === b.right.right
  );
}
