import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_STRENGTHS } from '../shellEffects';
import { blend, contrastRatio, readColour, readThemeCss } from '../../../scripts/contrast.mjs';

// Validates: Requirements 3.7, 3.8, 3.9, 12.5
const css = readThemeCss(resolve(process.cwd(), 'src/ui/theme.css'));
const get = (name: string) => readColour(css, name);

const CANDLES = ['amber', 'rose', 'violet', 'teal', 'ash', 'moss'].map((n) => `candle-${n}`);
const TEXT = ['text', 'text-dim', 'accent', 'danger', ...CANDLES];
const BACKGROUNDS = ['bg', 'surface', 'darkness'];

describe('theme contrast (WCAG AA, 4.5:1)', () => {
  it('computes known reference ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  for (const bg of BACKGROUNDS) {
    for (const fg of TEXT) {
      it(`--${fg} on --${bg} is at least 4.5:1`, () => {
        expect(contrastRatio(get(fg), get(bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  // Ledger dashboard (tasks 14.1 to 14.4, Requirements 20.14, 12.14). Text pairs need 4.5:1, drawing 3:1.
  // The moon outline is --text at 50% stroke opacity over the cell colour (--bg).
  const moonOutline = blend(get('text'), get('bg'), 0.5);
  const ledgerPairs: ReadonlyArray<readonly [string, string, string, number]> = [
    ['ring fill (--accent) on --surface', get('accent'), get('surface'), 3],
    ['ring track (--text-dim) on --surface', get('text-dim'), get('surface'), 3],
    ['goal field border (--text-dim) on --surface', get('text-dim'), get('surface'), 3],
    ['pace track border (--text-dim) on --bg', get('text-dim'), get('bg'), 3],
    ['pace typical marker (--text) on --bg', get('text'), get('bg'), 3],
    ['pace reader marker (--accent) on --bg', get('accent'), get('bg'), 3],
    ['pace reader marker edge (--surface) on --accent', get('surface'), get('accent'), 3],
    ['today tally border (--accent) on --bg', get('accent'), get('bg'), 3],
    ['today moon ring (--accent) on --bg', get('accent'), get('bg'), 3],
    ['moon outline (--text at 50%) on --bg', moonOutline, get('bg'), 3],
    ['lit moon (--text) on --bg', get('text'), get('bg'), 3],
    ['tally marks (--text-dim) on --bg', get('text-dim'), get('bg'), 3],
    ['tally count and weekday (--text) on --bg', get('text'), get('bg'), 4.5],
    ['tally weekday (--text-dim) on --bg', get('text-dim'), get('bg'), 4.5],
    ['stat tile number (--accent) on --bg', get('accent'), get('bg'), 4.5],
    ['stat tile label (--text-dim) on --bg', get('text-dim'), get('bg'), 4.5],
    ['card text (--text) on --surface', get('text'), get('surface'), 4.5],
    ['card secondary text (--text-dim) on --surface', get('text-dim'), get('surface'), 4.5],
    ['card big figure (--accent) on --surface', get('accent'), get('surface'), 4.5],
  ];
  for (const [label, fg, bg, min] of ledgerPairs) {
    it(`ledger: ${label} is at least ${min}:1`, () => {
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
    });
  }

  // Requirement 14.5: the Darkness at backgroundBrightness, and its Vignette edge (black at
  // `vignette` strength). Both are darker than the plain colours, so contrast can only rise.
  {
    const { backgroundBrightness, vignette } = DEFAULT_STRENGTHS;
    const scale = (hex: string, k: number) =>
      '#' +
      [1, 3, 5]
        .map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0'))
        .join('');
    const dimmed = scale(get('darkness'), backgroundBrightness);
    const edge = blend('#000000', dimmed, vignette);
    for (const [label, bg] of [['dimmed Darkness', dimmed], ['Vignette edge', edge]] as const) {
      for (const fg of TEXT) {
        it(`--${fg} on the ${label} (${bg}) is at least 4.5:1`, () => {
          expect(contrastRatio(get(fg), bg)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }

  // The design models the Candle_Pool as amber at 12% and 14% over the Darkness.
  for (const alpha of [0.12, 0.14]) {
    const pool = blend(get('candle-amber'), get('darkness'), alpha);
    for (const fg of TEXT) {
      it(`--${fg} on the amber pool at ${alpha * 100}% (${pool}) is at least 4.5:1`, () => {
        expect(contrastRatio(get(fg), blend(get('candle-amber'), get('darkness'), alpha))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  // Requirement 15.9: the Flame_Glow at its peak alpha (0.16) over each background.
  for (const bg of BACKGROUNDS) {
    const glow = blend(get('flame-glow'), get(bg), DEFAULT_STRENGTHS.flameGlowMaxAlpha);
    for (const fg of TEXT) {
      it(`--${fg} on the flame glow at peak over --${bg} (${glow}) is at least 4.5:1`, () => {
        expect(contrastRatio(get(fg), glow)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  // Requirement 16.8: the Smoke_Layer (--candle-ash) at its peak alpha (0.10) over each background.
  for (const bg of BACKGROUNDS) {
    const smoke = blend(get('candle-ash'), get(bg), DEFAULT_STRENGTHS.smokeMaxAlpha);
    for (const fg of TEXT) {
      it(`--${fg} on the smoke at peak over --${bg} (${smoke}) is at least 4.5:1`, () => {
        expect(contrastRatio(get(fg), smoke)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
