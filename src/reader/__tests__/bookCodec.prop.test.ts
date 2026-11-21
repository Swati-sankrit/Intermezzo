// Feature: reader-core, Property 17: EPUB chapters survive a save/restore round-trip
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { chaptersToStoredText, restoreBook } from '../bookCodec';

describe('bookCodec', () => {
  it('Property 17: epub chapters round-trip through stored text', () => {
    // **Validates: Requirements 6.1, 6.3**
    fc.assert(
      fc.property(
        fc.array(fc.record({ title: fc.string(), text: fc.string() }), { minLength: 1, maxLength: 6 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }).filter((t) => t.trim().length > 0),
        (chapters, name, rawTitle) => {
          const fileName = `${name}.epub`;
          const title = rawTitle.trim();
          const book = { fileName, title, chapters };
          const r = restoreBook(fileName, chaptersToStoredText(book), title);
          expect(r).toEqual({ ok: true, book });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects malformed epub storage text without throwing', () => {
    expect(restoreBook('a.epub', 'not json').ok).toBe(false);
    expect(restoreBook('a.epub', '[]').ok).toBe(false);
    expect(restoreBook('a.epub', '[{"title":1}]').ok).toBe(false);
  });

  it('re-parses txt books from their text', () => {
    const r = restoreBook('a.txt', 'Chapter 1\n\nHello there.\n\nSecond.');
    expect(r.ok).toBe(true);
  });
});
