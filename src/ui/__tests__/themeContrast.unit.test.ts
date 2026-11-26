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
