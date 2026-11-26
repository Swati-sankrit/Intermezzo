/**
 * Pure helpers for the Burn (Requirement 17). No DOM, no canvas: the overlay calls these
 * to decide which pixel of the cover is gone, which is glowing, and where the sparks are.
 */

/** Width of the glowing rim, in units of the 0..1 burn value. */
export const RIM_BAND = 0.08;

/** Small deterministic random generator, so a burn can be repeated. */
export function makeRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface NoiseGrid {
  cols: number;
  rows: number;
  values: Float32Array;
}

/** A low-resolution value-noise grid, scaled up by `sampleNoise`. */
export function makeNoise(cols: number, rows: number, rand: () => number): NoiseGrid {
  const values = new Float32Array(cols * rows);
  for (let i = 0; i < values.length; i++) values[i] = rand();
  return { cols, rows, values };
}

/** Bilinear sample at u, v in [0, 1]. */
export function sampleNoise(grid: NoiseGrid, u: number, v: number): number {
  const x = Math.min(Math.max(u, 0), 1) * (grid.cols - 1);
  const y = Math.min(Math.max(v, 0), 1) * (grid.rows - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, grid.cols - 1);
  const y1 = Math.min(y0 + 1, grid.rows - 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (cx: number, cy: number) => grid.values[cy * grid.cols + cx];
  const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
  const bottom = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/** When a pixel burns: low near the card edges and where the noise is low, so fire starts there. */
export function burnValue(u: number, v: number, noise: number): number {
  const edge = Math.min(u, 1 - u, v, 1 - v) * 2;
  return 0.6 * Math.min(Math.max(edge, 0), 1) + 0.4 * noise;
}

/** Burn progress in [0, 1] from the time since the burn began. */
export function burnProgress(elapsedMs: number, burnMs: number): number {
  if (burnMs <= 0) return 1;
  return Math.min(Math.max(elapsedMs / burnMs, 0), 1);
}

export interface PixelBurn {
  /** True when the pixel is already burnt away. */
  gone: boolean;
  /** 0..1, how deep inside the glowing rim the pixel is (0 outside the rim). */
  rim: number;
}

/** The state of one pixel at progress `t`. At t = 1 every pixel is gone; at t = 0 none is. */
export function pixelBurn(value: number, t: number): PixelBurn {
  if (t >= 1) return { gone: true, rim: 0 };
  const front = t * (1 + RIM_BAND);
  if (value < front - RIM_BAND) return { gone: true, rim: 0 };
  if (value < front) return { gone: false, rim: 1 - (value - (front - RIM_BAND)) / RIM_BAND };
  return { gone: false, rim: 0 };
}

/** One smooth swell and fade of the rim glow over the burn: no flicker. */
export function rimEnvelope(t: number): number {
  return Math.max(0, Math.min(1, t / 0.2, (1 - t) / 0.2));
}

export interface Spark {
  x: number;
  y: number;
  vy: number;
  age: number;
  life: number;
}

/**
 * Moves the sparks and drops the dead ones, then adds one from `source` (a point on the rim)
 * if there is room. Never returns more than `max` sparks.
 */
export function stepSparks(
  sparks: readonly Spark[],
  dtMs: number,
  source: { x: number; y: number } | null,
  max: number,
  rand: () => number,
): Spark[] {
  const next = sparks
    .map((s) => ({ ...s, age: s.age + dtMs, y: s.y - s.vy * dtMs, x: s.x + (rand() - 0.5) * 0.04 * dtMs }))
    .filter((s) => s.age < s.life);
  if (source && next.length < max && rand() < 0.35) {
    next.push({ x: source.x, y: source.y, vy: 0.03 + rand() * 0.05, age: 0, life: 500 + rand() * 400 });
  }
  return next.slice(0, Math.max(0, max));
}

export interface ImageFit {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

/** Source and destination rectangles that match CSS `object-fit` 'cover' or 'contain'. */
export function fitImage(natW: number, natH: number, boxW: number, boxH: number, fit: 'cover' | 'contain'): ImageFit {
  const scale = fit === 'cover' ? Math.max(boxW / natW, boxH / natH) : Math.min(boxW / natW, boxH / natH);
  if (fit === 'cover') {
    const sw = boxW / scale;
    const sh = boxH / scale;
    return { sx: (natW - sw) / 2, sy: (natH - sh) / 2, sw, sh, dx: 0, dy: 0, dw: boxW, dh: boxH };
  }
  const dw = natW * scale;
  const dh = natH * scale;
  return { sx: 0, sy: 0, sw: natW, sh: natH, dx: (boxW - dw) / 2, dy: (boxH - dh) / 2, dw, dh };
}
