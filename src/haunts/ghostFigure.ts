import { GHOST_IMAGE_GEOMETRY, imageBox, type ImageFit } from './engine/ghost/imageFit';
import type {
  AudioOut, HauntLevel, HauntMode, ReturnPlan, ReturnPort, StartInfo, VisualLayer, VisualOut,
} from './engine/types';

export const id = 'ghostFigure';
export const name = 'A ghost stands nearby';
export const role = 'layer' as const;
export const modes: readonly HauntMode[] = ['classic', 'nightmare'];
export const minLevel: HauntLevel = 1;

const LABEL = 'A ghost stands nearby';
const IMAGE = 'ghost-standing.png';

const fitFor = (step: number): ImageFit => ({ step, ...GHOST_IMAGE_GEOMETRY[IMAGE] });
/** Requested fade-in. The gate raises it to at least 1000 ms under reduced motion. */
const LAYER_FADE_IN_MS = 1000;
const OVERLAY_FADE_IN_MS = 200;

let layer: VisualLayer | null = null;
let overlay: VisualLayer | null = null;

type Side = 'left' | 'right';
type RegionRect = { left: number; right: number; top: number; bottom: number };

/** Region Rect (edges) to the size `ghostBox` takes. */
function sizeOf(r: RegionRect): { width: number; height: number } {
  return { width: r.right - r.left, height: r.bottom - r.top };
}

/** The wider side when regions are known, otherwise a side picked by the start roll. */
function pickSide(info: StartInfo): Side {
  const r = info.regions;
  if (r) return sizeOf(r.right).width >= sizeOf(r.left).width ? 'right' : 'left';
  return info.roll < 0.5 ? 'left' : 'right';
}

/**
 * Shows the Ghost picture in a side region. Nothing in Gentle, with no start info, or when the region
 * is too small for the Ghost (`imageBox` is null or has no height). When the engine gives no
 * regions, the layer's own CSS (it fills its region and keeps the aspect ratio) keeps it inside.
 */
export function start(_level: HauntLevel, _audio: AudioOut, visual: VisualOut, info?: StartInfo): void {
  if (!info || info.mode === 'gentle') return;
  const side = pickSide(info);
  const region = info.regions?.[side];
  if (region) {
    const box = imageBox(info.ghostStep, GHOST_IMAGE_GEOMETRY[IMAGE].visible, sizeOf(region));
    if (box === null || box.height <= 0 || box.width <= 0) return;
  }
  layer = visual.createLayer(side);
  layer.setImage(IMAGE, fitFor(info.ghostStep));
  layer.setLabel(LABEL);
  layer.setOpacity(1, LAYER_FADE_IN_MS);
}

export function setLevel(_level: HauntLevel): void {
  // The Ghost's distance is fixed for the look-away; the level changes nothing.
}

export function stop(): void {
  layer?.remove();
  layer = null;
}

export function span(plan: ReturnPlan): { startMs: number; endMs: number } | null {
  return plan.ghostLingerMs > 0 ? { startMs: 0, endMs: plan.ghostLingerMs } : null;
}

export function begin(plan: ReturnPlan, port: ReturnPort): void {
  end();
  overlay = port.visual.createOverlay('ghost');
  overlay.setImage(IMAGE, fitFor(plan.ghostStep));
  overlay.setLabel(LABEL);
  overlay.setOpacity(1, OVERLAY_FADE_IN_MS);
}

export function end(): void {
  overlay?.remove();
  overlay = null;
}
