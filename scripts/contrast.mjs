// Shared WCAG contrast helpers, used by check-candle-contrast.mjs and the theme contrast test.
import { readFileSync } from 'node:fs';

/** Read a #rrggbb custom property from CSS text. */
export function readColour(css, name) {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--${name} not found as a #rrggbb value`);
  return m[1];
}

/** Read a CSS file as text. Callers pass the path (Vitest's jsdom env has no file: import.meta.url). */
export function readThemeCss(path) {
  return readFileSync(path, 'utf8');
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex) {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG contrast ratio between two #rrggbb colours (always >= 1). */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite `fg` at `alpha` (0..1) over opaque `bg`; returns #rrggbb. */
export function blend(fg, bg, alpha) {
  const ch = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
  return (
    '#' +
    [1, 3, 5]
      .map((i) => Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}
