import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DEFAULT_VOLUME_CAP, parseVolumeCap } from '../gate/plan';
import {
  emptyCapTextArb,
  nonNumericCapTextArb,
  nonStringCapArb,
  outOfRangeCapTextArb,
  validCapTextArb,
  volumeCapRawArb,
} from './arbitraries';

const NUM_RUNS = 300;

type CapClass = 'valid' | 'empty' | 'nonNumeric' | 'outOfRange' | 'nonString';

/** Raw values tagged with the class they were drawn from, with every class equally likely. */
const taggedArb: fc.Arbitrary<{ cls: CapClass; raw: unknown; value?: number }> = fc.oneof(
  validCapTextArb.map((v) => ({ cls: 'valid' as const, raw: v.text, value: v.value })),
  emptyCapTextArb.map((raw) => ({ cls: 'empty' as const, raw })),
  nonNumericCapTextArb.map((raw) => ({ cls: 'nonNumeric' as const, raw })),
  outOfRangeCapTextArb.map((raw) => ({ cls: 'outOfRange' as const, raw })),
  nonStringCapArb.map((raw) => ({ cls: 'nonString' as const, raw })),
);

describe('Volume_Cap parsing', () => {
  // Feature: haunt-feature, Property 13: Volume_Cap parsing falls back to 0.4
  // **Validates: Requirements 6.14, 6.15**
  it('Property 13: any raw value gives a finite number in [0, 1]', () => {
    fc.assert(
      fc.property(volumeCapRawArb, (raw) => {
        const cap = parseVolumeCap(raw);
        expect(typeof cap).toBe('number');
        expect(Number.isFinite(cap)).toBe(true);
        expect(cap).toBeGreaterThanOrEqual(0);
        expect(cap).toBeLessThanOrEqual(1);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 13: Volume_Cap parsing falls back to 0.4
  // **Validates: Requirements 6.14, 6.15**
  it('Property 13: the decimal text of a number in [0, 1] parses back to that number', () => {
    fc.assert(
      fc.property(validCapTextArb, ({ value, text }) => {
        expect(parseVolumeCap(text)).toBe(value);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 13: Volume_Cap parsing falls back to 0.4
  // **Validates: Requirements 6.14, 6.15**
  it('Property 13: empty, non-numeric, out-of-range and non-string input gives 0.4', () => {
    const invalidArb = fc.oneof(emptyCapTextArb, nonNumericCapTextArb, outOfRangeCapTextArb, nonStringCapArb);
    fc.assert(
      fc.property(invalidArb, (raw) => {
        expect(parseVolumeCap(raw)).toBe(DEFAULT_VOLUME_CAP);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Feature: haunt-feature, Property 13: Volume_Cap parsing falls back to 0.4
  // **Validates: Requirements 6.14, 6.15**
  it('Property 13: the default is 0.4', () => {
    expect(DEFAULT_VOLUME_CAP).toBe(0.4);
    expect(parseVolumeCap(undefined)).toBe(0.4);
    expect(parseVolumeCap(null)).toBe(0.4);
  });

  // Feature: haunt-feature, Property 13: Volume_Cap parsing falls back to 0.4
  // **Validates: Requirements 6.14, 6.15**
  it('Property 13: valid text and each invalid class are common, and each class gets the right result', () => {
    const seen: Record<CapClass | 'runs', number> = {
      runs: 0,
      valid: 0,
      empty: 0,
      nonNumeric: 0,
      outOfRange: 0,
      nonString: 0,
    };
    fc.assert(
      fc.property(taggedArb, ({ cls, raw, value }) => {
        seen.runs++;
        seen[cls]++;
        const cap = parseVolumeCap(raw);
        if (cls === 'valid') expect(cap).toBe(value);
        else expect(cap).toBe(DEFAULT_VOLUME_CAP);
      }),
      { numRuns: NUM_RUNS },
    );
    const msg = JSON.stringify(seen);
    const floor = seen.runs * 0.05;
    for (const key of Object.keys(seen) as (keyof typeof seen)[]) {
      if (key === 'runs') continue;
      expect(seen[key], `${key}: ${msg}`).toBeGreaterThanOrEqual(floor);
    }
  });
});
