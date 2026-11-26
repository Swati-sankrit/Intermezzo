/**
 * Fitting a Ghost_Image (the visible, non-transparent part of a bundled PNG) inside a region.
 * Pure: no DOM, clock, timer or random access. Reuses the `ghostBox` rules: the step is sanitised
 * like `ghostDistance`, a region under 48 px wide gets no ghost, unsafe sizes count as 0, and the
 * height fractions grow like `GHOST_HEIGHT_UNITS`.
 */
import type { GhostAssetName } from './assets';
import { GHOST_HEIGHT_UNITS, MIN_GHOST_BOX_WIDTH } from './ghostBox';
import { ghostDistance } from './ghostDistance';

export interface ImageSize {
  readonly w: number;
  readonly h: number;
}

/** Where the visible part sits in the image file, in image pixels. */
export interface ImageFit {
  /** Ghost_Distance step; a higher step is drawn strictly larger. */
  readonly step: number;
  readonly visible: ImageSize & { readonly x: number; readonly y: number };
  /** Size of the whole file. */
  readonly natural: ImageSize;
}

/** Alpha bounding boxes of the bundled files (measured from the PNGs, both 1376 by 768). */
export const GHOST_IMAGE_GEOMETRY: Readonly<Record<GhostAssetName, Omit<ImageFit, 'step'>>> = {
  'ghost-standing.png': { visible: { x: 359, y: 64, w: 667, h: 649 }, natural: { w: 1376, h: 768 } },
  'ghost-face.png': { visible: { x: 66, y: 0, w: 1269, h: 768 }, natural: { w: 1376, h: 768 } },
};

function size(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

const LARGEST = GHOST_HEIGHT_UNITS[GHOST_HEIGHT_UNITS.length - 1];

/**
 * Rendered size of the visible part inside `region`: aspect ratio kept, never larger than the
 * region, strictly larger for a higher step (the step-4 box is the largest that fits). `null`
 * when the region is under 48 px wide or the visible part has no usable size.
 */
export function imageBox(
  step: number,
  visible: { w: number; h: number },
  region: { width: number; height: number },
): { width: number; height: number } | null {
  const rw = size(region.width);
  const rh = size(region.height);
  const vw = size(visible.w);
  const vh = size(visible.h);
  if (rw < MIN_GHOST_BOX_WIDTH || rh <= 0 || vw <= 0 || vh <= 0) return null;
  const fit = Math.min(rw / vw, rh / vh);
  const scale = (fit * GHOST_HEIGHT_UNITS[ghostDistance(step)]) / LARGEST;
  return { width: Math.min(rw, vw * scale), height: Math.min(rh, vh * scale) };
}
