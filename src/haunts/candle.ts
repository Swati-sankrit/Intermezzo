import type { AudioOut, HauntLevel, VisualOut } from './engine/types';

export const id = 'candle';
export const name = 'The candle gutters';

/** Glow dim per level: 0 = calm, 1 = darkest allowed. */
const DIM: Record<HauntLevel, number> = { 1: 0.25, 2: 0.5, 3: 0.7 };

/** Gutter depth and dips per second. Level 1 has none; rates stay well under the flash budget. */
const GUTTER: Record<HauntLevel, { depth: number; rate: number }> = {
  1: { depth: 0, rate: 0 },
  2: { depth: 0.15, rate: 0.2 },
  3: { depth: 0.3, rate: 0.5 },
};

let visual: VisualOut | null = null;

function apply(level: HauntLevel): void {
  if (!visual) return;
  const gutter = GUTTER[level];
  visual.glow.setDim(DIM[level]);
  visual.glow.setGutter(gutter.depth, gutter.rate);
}

export function start(level: HauntLevel, _audio: AudioOut, v: VisualOut): void {
  visual = v;
  apply(level);
}

export function setLevel(level: HauntLevel): void {
  apply(level);
}

export function stop(): void {
  if (visual) {
    visual.glow.setDim(0);
    visual.glow.setGutter(0, 0);
  }
  visual = null;
}
