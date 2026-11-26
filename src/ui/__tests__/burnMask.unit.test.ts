import { describe, expect, it } from 'vitest';
import { burnProgress, makeRandom, pixelBurn, stepSparks, type Spark } from '../shell/burnMask';

describe('burn mask', () => {
  it('burns nothing at the start and everything at the end', () => {
    for (const value of [0, 0.3, 0.7, 1]) {
      expect(pixelBurn(value, 0).gone).toBe(false);
      expect(pixelBurn(value, 1).gone).toBe(true);
    }
  });

  it('burns a low-value (edge) pixel before a high-value (centre) one', () => {
    expect(pixelBurn(0.1, 0.3).gone).toBe(true);
    expect(pixelBurn(0.9, 0.3).gone).toBe(false);
  });

  it('keeps progress between 0 and 1', () => {
    expect(burnProgress(-5, 1200)).toBe(0);
    expect(burnProgress(600, 1200)).toBe(0.5);
    expect(burnProgress(9999, 1200)).toBe(1);
  });

  it('never shows more sparks than the cap', () => {
    const rand = makeRandom(3);
    let sparks: Spark[] = [];
    for (let i = 0; i < 500; i++) {
      sparks = stepSparks(sparks, 16, { x: 5, y: 5 }, 12, rand);
      expect(sparks.length).toBeLessThanOrEqual(12);
    }
  });
});
