import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { loadSavedBook, saveBook } from '../bookStore';

describe('bookStore properties', () => {
  // Feature: reader-core, Property 16: Book storage round-trip
  // **Validates: Requirements 6.1**
  it('Property 16: saveBook then loadSavedBook returns the same fileName and text', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (fileName, text) => {
        const saved = await saveBook(fileName, text);
        expect(saved).toBe(true);
        const loaded = await loadSavedBook();
        expect(loaded).toEqual({ fileName, text });
      }),
      { numRuns: 100 },
    );
  });

  // Feature: reader-core, Property 16: Book storage round-trip (binary unit: all UTF-16 code units, incl. lone surrogates)
  // **Validates: Requirements 6.1**
  it('Property 16: round-trip holds for arbitrary UTF-16 strings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ unit: 'binary' }),
        fc.string({ unit: 'binary', maxLength: 500 }),
        async (fileName, text) => {
          const saved = await saveBook(fileName, text);
          expect(saved).toBe(true);
          const loaded = await loadSavedBook();
          expect(loaded).toEqual({ fileName, text });
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: reader-core, Property 16: Book storage round-trip (title)
  // **Validates: Requirements 6.1**
  it('Property 16: a saved title comes back with the book', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), fc.string(), async (fileName, text, title) => {
        expect(await saveBook(fileName, text, title)).toBe(true);
        expect(await loadSavedBook()).toEqual({ fileName, text, title });
      }),
      { numRuns: 100 },
    );
  });
});
