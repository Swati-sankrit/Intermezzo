import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { STORAGE_KEY, loadState, saveState } from '../storage';
import type { StoredState } from '../types';

const validState: fc.Arbitrary<StoredState> = fc.record({
  fileName: fc.string(),
  position: fc.record({
    chapterIndex: fc.nat(),
    paragraphIndex: fc.nat(),
    savedAt: fc.nat(),
  }),
  averagePace: fc.double({ min: 50, max: 1000, noNaN: true, noDefaultInfinity: true }),
  paceGuideEnabled: fc.boolean(),
});

const badIndex = fc.oneof(
  fc.integer({ max: -1 }),
  fc.double({ noNaN: true, noDefaultInfinity: true }).filter((n) => !Number.isInteger(n)),
);

const badPace = fc.oneof(
  fc.constant(NaN),
  fc.double({ noNaN: true, noDefaultInfinity: true, max: 49.999 }),
  fc.double({ noNaN: true, noDefaultInfinity: true, min: 1000.001 }),
);

describe('storage property tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Feature: reader-core, Property 10: Position storage round-trip
  // **Validates: Requirements 6.2, 6.4**
  it('Property 10: saveState then loadState returns an equal state', () => {
    fc.assert(
      fc.property(validState, (state) => {
        localStorage.clear();
        saveState(state);
        expect(loadState()).toEqual(state);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: reader-core, Property 11: Invalid position falls back to null
  // **Validates: Requirements 6.5**
  it('Property 11a: malformed JSON strings load as null', () => {
    const isValidShape = (s: string): boolean => {
      localStorage.setItem(STORAGE_KEY, s);
      return loadState() !== null;
    };
    fc.assert(
      fc.property(
        fc.string().filter((s) => !isValidShape(s)),
        (s) => {
          localStorage.clear();
          localStorage.setItem(STORAGE_KEY, s);
          expect(loadState()).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: reader-core, Property 11: Invalid position falls back to null
  // **Validates: Requirements 6.5**
  it('Property 11b: valid-looking states with one invalid field load as null', () => {
    const corrupted = fc.oneof(
      fc.tuple(validState, badIndex).map(([s, v]) => ({
        ...s,
        position: { ...s.position, chapterIndex: v },
      })),
      fc.tuple(validState, badIndex).map(([s, v]) => ({
        ...s,
        position: { ...s.position, paragraphIndex: v },
      })),
      fc.tuple(validState, badPace).map(([s, v]) => ({ ...s, averagePace: v })),
    );
    fc.assert(
      fc.property(corrupted, (bad) => {
        localStorage.clear();
        // JSON.stringify turns NaN into null, which is also invalid.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
        expect(loadState()).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});
