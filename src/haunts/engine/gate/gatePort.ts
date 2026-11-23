/**
 * Visual wrapper handed to a haunt. It records the haunt's layers so the gate can fade them,
 * and ignores requests after the port has been faded out (a haunt cannot bring itself back).
 */
import type { VisualLayer, VisualOut } from '../types';

export interface PortVisual {
  readonly visual: VisualOut;
  /** Fade every layer and the glow to nothing within `ms`, then ignore further requests. */
  fadeOut(ms: number): void;
}

export function wrapVisual(inner: VisualOut): PortVisual {
  const layers: VisualLayer[] = [];
  let faded = false;

  const visual: VisualOut = {
    glow: {
      setDim(amount, fadeMs) {
        if (!faded) inner.glow.setDim(amount, fadeMs);
      },
      setGutter(depth, dipsPerSec) {
        if (!faded) inner.glow.setGutter(depth, dipsPerSec);
      },
    },
    createLayer(side) {
      const layer = inner.createLayer(side);
      layers.push(layer);
      return {
        setMarkup: (svg) => layer.setMarkup(svg),
        setOpacity(opacity, fadeMs) {
          if (!faded) layer.setOpacity(opacity, fadeMs);
        },
        setSweep(periodMs) {
          if (!faded || periodMs === null) layer.setSweep(periodMs);
        },
        setLabel: (text) => layer.setLabel(text),
        remove: () => layer.remove(),
      };
    },
  };

  return {
    visual,
    fadeOut(ms) {
      if (faded) return;
      inner.glow.setGutter(0, 0);
      inner.glow.setDim(0, ms);
      for (const l of layers) {
        l.setSweep(null);
        l.setOpacity(0, ms);
      }
      faded = true;
    },
  };
}
