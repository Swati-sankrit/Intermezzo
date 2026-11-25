// Checks each --candle-* colour in src/ui/theme.css is at least 3:1 against --surface.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/ui/theme.css', import.meta.url), 'utf8');
const get = (name) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--${name} not found as a #rrggbb value`);
  return m[1];
};
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const surface = get('surface');
let failed = false;
for (const n of ['amber', 'rose', 'violet', 'teal', 'ash', 'moss']) {
  const hex = get(`candle-${n}`);
  const r = ratio(hex, surface);
  if (r < 3) failed = true;
  console.log(`--candle-${n} ${hex} ${r.toFixed(2)}:1 ${r >= 3 ? 'ok' : 'FAIL'}`);
}
process.exit(failed ? 1 : 0);
