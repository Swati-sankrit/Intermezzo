// Checks each --candle-* colour in src/ui/theme.css is at least 3:1 against --surface.
import { contrastRatio, readColour, readThemeCss } from './contrast.mjs';

const css = readThemeCss(new URL('../src/ui/theme.css', import.meta.url));
const get = (name) => readColour(css, name);
const surface = get('surface');
let failed = false;
for (const n of ['amber', 'rose', 'violet', 'teal', 'ash', 'moss']) {
  const hex = get(`candle-${n}`);
  const r = contrastRatio(hex, surface);
  if (r < 3) failed = true;
  console.log(`--candle-${n} ${hex} ${r.toFixed(2)}:1 ${r >= 3 ? 'ok' : 'FAIL'}`);
}
process.exit(failed ? 1 : 0);
