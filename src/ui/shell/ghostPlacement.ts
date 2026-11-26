import { GHOST_ASSETS, assetUrl } from '../../haunts/engine/ghost/assets';
import { shellEffects, type ShellEffects } from '../shellEffects';

/** How long a Peek stays on screen. */
export const PEEK_VISIBLE_MS = 1_500;

/** Width over height of the bundled ghost images (both are 1376 x 768). */
export const GHOST_ASPECT = 1376 / 768;

/** Everything a Peek can collide with. */
export const CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="link"], [role="slider"], [tabindex]:not([tabindex="-1"])';

export type Edge = 'left' | 'right';
export interface Size {
  readonly width: number;
  readonly height: number;
}
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** True when the query string contains demo=1 (Demo_Mode). */
export function isDemoMode(search: string): boolean {
  return new URLSearchParams(search).get('demo') === '1';
}

/**
 * Peek delay in ms. Normal: the normal range for every Peek. Demo: exactly
 * demoFirstPeekDelaySeconds when `isFirst` (first Peek after page load),
 * otherwise the demo range. `rand` is in [0, 1).
 */
export function nextPeekDelayMs(
  rand: number,
  demo: boolean,
  isFirst: boolean,
  fx: ShellEffects = shellEffects,
): number {
  if (demo && isFirst) return Math.round(fx.strengths.demoFirstPeekDelaySeconds * 1000);
  const [lo, hi] = demo ? fx.strengths.demoPeekDelaySeconds : fx.strengths.peekDelaySeconds;
  return Math.round((lo + rand * (hi - lo)) * 1000);
}

/**
 * Ghost box for an edge slot. Its height is ghostHeightVh of the viewport and
 * its width follows the image aspect ratio. It is pushed past the edge so that
 * only ghostVisibleFraction of its width is inside the viewport. `offset` is
 * the distance in px from the top of the viewport.
 */
export function slotRect(edge: Edge, offset: number, viewport: Size, aspect: number, fx: ShellEffects = shellEffects): Rect {
  const { ghostHeightVh, ghostVisibleFraction } = fx.strengths;
  const height = (viewport.height * ghostHeightVh) / 100;
  const width = height * aspect;
  const left = edge === 'left' ? -width * (1 - ghostVisibleFraction) : viewport.width - width * ghostVisibleFraction;
  return { left, top: offset, right: left + width, bottom: offset + height };
}

/** The part of the ghost inside the viewport. The part behind the edge is ignored. */
export function visiblePart(rect: Rect, viewport: Size): Rect {
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const right = Math.min(rect.right, viewport.width);
  const bottom = Math.min(rect.bottom, viewport.height);
  return { left, top, right: Math.max(left, right), bottom: Math.max(top, bottom) };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Picks, among the edge slots whose visible part overlaps no Control, the one
 * `rand` (in [0, 1)) points at. Returns undefined when every slot overlaps one,
 * and the Peek is then skipped.
 */
export function pickSlot(
  controls: readonly Rect[],
  viewport: Size,
  aspect: number,
  rand: number,
  fx: ShellEffects = shellEffects,
): Rect | undefined {
  const height = (viewport.height * fx.strengths.ghostHeightVh) / 100;
  const step = Math.max(1, height / 2);
  const free: Rect[] = [];
  for (const edge of ['left', 'right'] as const) {
    for (let offset = 0; offset + height <= viewport.height + 0.5; offset += step) {
      const slot = slotRect(edge, offset, viewport, aspect, fx);
      const inside = visiblePart(slot, viewport);
      if (!controls.some((c) => overlaps(inside, c))) free.push(slot);
    }
  }
  if (free.length === 0) return undefined;
  return free[Math.min(free.length - 1, Math.floor(rand * free.length))];
}

/** A chosen Peek: the slot, the side it comes from and the bundled image. */
export interface Peek {
  readonly rect: Rect;
  readonly side: Edge;
  readonly url: string;
}

/** Reads Control rectangles from the page. A page with no visible Control gives []. */
export function readControls(root: ParentNode): Rect[] {
  const rects: Rect[] = [];
  root.querySelectorAll(CONTROL_SELECTOR).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  });
  return rects;
}

/** Picks a Peek for the current page, or null when no slot is free (the Peek is skipped). */
export function pickPeek(root: ParentNode, viewport: Size, rand: number, fx: ShellEffects = shellEffects): Peek | null {
  const rect = pickSlot(readControls(root), viewport, GHOST_ASPECT, rand, fx);
  if (!rect) return null;
  const side: Edge = rect.left + rect.right < viewport.width ? 'left' : 'right';
  const index = Math.floor(rect.top) % GHOST_ASSETS.length;
  const url = assetUrl('ghost', GHOST_ASSETS[index]);
  return url ? { rect, side, url } : null;
}
