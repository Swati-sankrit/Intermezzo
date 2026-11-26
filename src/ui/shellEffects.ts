/**
 * Every visual choice for the Shell effects lives here (Requirement 13).
 * Change one value in `shellEffects` to switch a look; effect components read
 * options and strengths from this file and hold no copies of them.
 */
export type CursorLight = 'flame' | 'pool';
export type Ambient = 'smoke' | 'fog';
export type BookOpen = 'burn' | 'fade';

export interface EffectStrengths {
  imageBrightness: number; // 0.40 (allowed 0.35-0.45)
  imageSaturation: number;
  backgroundBrightness: number;
  vignette: number; // edge darkness
  lightRadiusPx: number; // Candle_Pool width, and the cap for the flame glow
  flameGlowRadiusPx: number;
  flameGlowMaxAlpha: number;
  flameFlickerMaxHz: number; // under the 3 per second limit
  smokeMaxAlpha: number;
  smokeRiseSeconds: number; // at least 15
  burnMs: number;
  burnMaxSparks: number;
  ghostHeightVh: number; // allowed 30-35
  ghostVisibleFraction: number; // at most 0.7
  peekDelaySeconds: readonly [number, number];
  demoFirstPeekDelaySeconds: number; // Demo_Mode: first Peek after page load
  demoPeekDelaySeconds: readonly [number, number]; // Demo_Mode: every later Peek
}

export interface ShellEffects {
  cursorLight: CursorLight;
  ambient: Ambient;
  bookOpen: BookOpen;
  strengths: EffectStrengths;
}

export const DEFAULT_STRENGTHS: EffectStrengths = {
  imageBrightness: 0.4,
  imageSaturation: 0.4,
  backgroundBrightness: 0.4,
  vignette: 0.6,
  lightRadiusPx: 280,
  flameGlowRadiusPx: 220,
  flameGlowMaxAlpha: 0.16,
  flameFlickerMaxHz: 2.5,
  smokeMaxAlpha: 0.1,
  smokeRiseSeconds: 20,
  burnMs: 1200,
  burnMaxSparks: 12,
  ghostHeightVh: 32,
  ghostVisibleFraction: 0.6,
  peekDelaySeconds: [45, 90],
  demoFirstPeekDelaySeconds: 3,
  demoPeekDelaySeconds: [4, 6],
};

export const DEFAULT_EFFECTS: ShellEffects = {
  cursorLight: 'flame',
  ambient: 'smoke',
  bookOpen: 'burn',
  strengths: DEFAULT_STRENGTHS,
};

/** The one place to edit. */
export const shellEffects: ShellEffects = DEFAULT_EFFECTS;

const CURSOR_LIGHTS: readonly CursorLight[] = ['flame', 'pool'];
const AMBIENTS: readonly Ambient[] = ['smoke', 'fog'];
const BOOK_OPENS: readonly BookOpen[] = ['burn', 'fade'];

function pick<T extends string>(allowed: readonly T[], raw: unknown, fallback: T): T {
  return (allowed as readonly unknown[]).includes(raw) ? (raw as T) : fallback;
}

/** Pure. An option that is not one of its listed names resolves to its default (13.7). */
export function resolveEffects(
  raw: Partial<Record<'cursorLight' | 'ambient' | 'bookOpen', unknown>> = {},
): ShellEffects {
  return {
    cursorLight: pick(CURSOR_LIGHTS, raw.cursorLight, DEFAULT_EFFECTS.cursorLight),
    ambient: pick(AMBIENTS, raw.ambient, DEFAULT_EFFECTS.ambient),
    bookOpen: pick(BOOK_OPENS, raw.bookOpen, DEFAULT_EFFECTS.bookOpen),
    strengths: DEFAULT_STRENGTHS,
  };
}

/** The look a component actually draws. */
export interface DrawnLooks {
  cursorLight: CursorLight;
  ambient: Ambient;
  bookOpen: BookOpen;
}

/**
 * Looks that exist so far. 'flame', 'smoke' and 'burn' are all built; a
 * value missing from this table draws the earlier look.
 */
const BUILT: { [K in keyof DrawnLooks]: readonly DrawnLooks[K][] } = {
  cursorLight: ['flame', 'pool'],
  ambient: ['smoke', 'fog'],
  bookOpen: ['burn', 'fade'],
};

const EARLIER: DrawnLooks = { cursorLight: 'pool', ambient: 'fog', bookOpen: 'fade' };

/** Pure. Maps the chosen options to looks that exist, falling back to 'pool', 'fog' and 'fade'. */
export function drawnLooks(effects: ShellEffects): DrawnLooks {
  const r = resolveEffects(effects);
  return {
    cursorLight: BUILT.cursorLight.includes(r.cursorLight) ? r.cursorLight : EARLIER.cursorLight,
    ambient: BUILT.ambient.includes(r.ambient) ? r.ambient : EARLIER.ambient,
    bookOpen: BUILT.bookOpen.includes(r.bookOpen) ? r.bookOpen : EARLIER.bookOpen,
  };
}
