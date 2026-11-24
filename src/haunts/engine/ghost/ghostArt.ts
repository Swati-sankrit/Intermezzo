/**
 * Ghost art: an original sheet-and-hood silhouette with two faint eyes, drawn as static SVG
 * markup, plus the box it takes inside a side region. Pure: no DOM, clock, timer or random
 * access. Colours are theme custom properties only. No image, link, script or motion.
 */
import { ghostDistance } from './ghostDistance';

export interface GhostArt {
  readonly markup: string;
  readonly heightUnits: number;
  readonly detailCount: number;
}

/** Width of the drawing in viewBox units; every step is this wide. */
export const GHOST_WIDTH_UNITS = 100;
/** Viewport units per step: the Ghost grows taller as it comes closer. */
export const GHOST_HEIGHT_UNITS: readonly number[] = [120, 150, 185, 225, 270];
/** A region narrower than this (px) gets no Ghost; the sound carries the haunt. */
export const MIN_GHOST_BOX_WIDTH = 48;
/** Largest rendering: one viewBox unit per pixel. */
const MAX_PX_PER_UNIT = 1;
/** Constant opacity of the eyes (no change over time). */
const EYE_OPACITY = 0.45;

/** Shared with `ghostDistance`: NaN, negatives and non-finite become 0 or 4, non-integers floor. */
function sanitiseStep(step: number): number {
  return ghostDistance(step);
}

function body(h: number): string {
  const hem = h - 12;
  const d = `M10 ${hem} L10 42 C10 16 30 4 50 4 C70 4 90 16 90 42 L90 ${hem} Q80 ${h} 70 ${hem} T50 ${hem} T30 ${hem} T10 ${hem} Z`;
  return `<path d="${d}" fill="var(--surface)" stroke="var(--text-dim)" stroke-width="1.5"/>`;
}

function eyes(): string {
  const f = `fill="var(--text)" fill-opacity="${EYE_OPACITY}"`;
  return `<ellipse cx="40" cy="40" rx="4" ry="6" ${f}/><ellipse cx="60" cy="40" rx="4" ry="6" ${f}/>`;
}

/** Extra drawings, in the order they appear. Detail n is present when step >= n. */
function detail(n: number, h: number): string {
  const hem = h - 12;
  const stroke = 'fill="none" stroke="var(--text-dim)" stroke-width="1"';
  switch (n) {
    case 1: // hem folds
      return `<path d="M30 ${hem - 40} L30 ${hem - 4} M50 ${hem - 40} L50 ${hem - 4} M70 ${hem - 40} L70 ${hem - 4}" ${stroke}/>`;
    case 2: // two hands, reaching out from the sides
      return `<ellipse cx="8" cy="${h * 0.55}" rx="7" ry="5" fill="var(--surface)" stroke="var(--text-dim)" stroke-width="1"/>`
        + `<ellipse cx="92" cy="${h * 0.55}" rx="7" ry="5" fill="var(--surface)" stroke="var(--text-dim)" stroke-width="1"/>`;
    case 3: // a second shadow layer behind the figure
      return `<ellipse cx="50" cy="${h - 4}" rx="46" ry="5" fill="var(--shadow)"/>`;
    default: // hood shade over the face
      return `<path d="M22 34 C30 18 70 18 78 34 C70 26 30 26 22 34 Z" fill="var(--shadow)"/>`;
  }
}

/**
 * SVG markup for the Ghost at a step. `step` is sanitised like `ghostDistance`: NaN, negative
 * and below-1 values give 0, non-integers floor, 4 and above (and +Infinity) give 4.
 * `heightUnits` and `detailCount` both strictly increase with the step (detailCount = step).
 * Detail layers are drawn first so the figure and its eyes stay on top.
 */
export function ghostArt(step: number): GhostArt {
  const s = sanitiseStep(step);
  const h = GHOST_HEIGHT_UNITS[s];
  const layers: string[] = [];
  if (s >= 3) layers.push(detail(3, h));
  layers.push(body(h));
  for (let n = 1; n <= s; n++) if (n !== 3) layers.push(detail(n, h));
  layers.push(eyes());
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GHOST_WIDTH_UNITS} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" focusable="false">`
    + layers.join('')
    + '</svg>';
  return { markup, heightUnits: h, detailCount: s };
}

/** Non-finite or negative sizes count as 0. */
function size(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Pure. The Ghost's rendered size inside a side region: aspect ratio kept, never wider or taller
 * than the region, and never larger than one px per viewBox unit. `null` when the region is
 * under 48 px wide. Unsafe region sizes (NaN, negative, infinite) count as 0, so they give `null`.
 */
export function ghostBox(step: number, region: { width: number; height: number }): { width: number; height: number } | null {
  const width = size(region.width);
  const height = size(region.height);
  if (width < MIN_GHOST_BOX_WIDTH) return null;
  const units = GHOST_HEIGHT_UNITS[sanitiseStep(step)];
  const scale = Math.min(MAX_PX_PER_UNIT, width / GHOST_WIDTH_UNITS, height / units);
  // min() guards against a rounding step that would leave the box a hair over the region.
  return { width: Math.min(width, GHOST_WIDTH_UNITS * scale), height: Math.min(height, units * scale) };
}
