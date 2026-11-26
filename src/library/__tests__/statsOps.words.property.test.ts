import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { EMPTY_DATA_MODEL, type BookEntry, type DataModel, type Stats } from '../model';
import { addBookEntry } from '../shelfOps';
import { recordEvent } from '../statsOps';
import { countWords } from '../../reader/paceCalc';

/**
 * Feature: haunted-shell, Property 6: Recording a paragraph adds exactly its word count to
 * wordsRead and one to paragraphs read, for the book and the day
 * **Validates: Requirements 11.2, 11.3, 11.4**
 *
 * useStatsRecorder builds exactly this event ({ kind: 'paragraphs', count: 1, words:
 * countWords(text) }) and passes it to recordEvent, so the real recordEvent and countWords run here.
 * The hook itself is exercised in src/ui/__tests__/useStatsRecorder.unit.test.ts.
 */

const TODAY = '2026-03-15';
const BOOK = 'book-1';

const num = fc.nat({ max: 1_000_000 });
const stats: fc.Arbitrary<Stats> = fc
  .record({
    paragraphsRead: num,
    chaptersFinished: num,
    activeReadingSeconds: num,
    lookAwayCount: num,
    sessionCount: num,
    awaySeconds: num,
    wordsRead: num,
  })
  .map((s) => ({ ...s }));

// Empty, whitespace-only (incl. unicode spaces and newlines), and words with punctuation.
const ws = fc.constantFrom(' ', '\t', '\n', '\r\n', '\u00a0', '\u2003', '\u3000');
const wordish = fc.string({ minLength: 1, maxLength: 8 });
const text = fc.oneof(
  fc.constant(''),
  fc.array(ws, { maxLength: 6 }).map((a) => a.join('')),
  fc.array(fc.oneof(wordish, ws), { maxLength: 40 }).map((a) => a.join('')),
  fc.string({ maxLength: 200 }),
  fc.lorem({ maxCount: 60, mode: 'sentences' }),
);

const entry: BookEntry = {
  bookId: BOOK,
  title: 't',
  author: '',
  fileName: 'f.txt',
  source: 'upload',
  format: 'txt',
  addedAt: 1,
};

function modelWith(book: Stats, day: Stats | undefined): DataModel {
  const m = addBookEntry(EMPTY_DATA_MODEL, entry);
  return {
    ...m,
    stats: { ...m.stats, [BOOK]: book },
    daily: day ? { [TODAY]: day } : {},
  };
}

describe('Property 6: recording a paragraph adds its word count and one paragraph', () => {
  it('adds countWords(text) to wordsRead and 1 to paragraphsRead for the book and the day, nothing else changes', () => {
    fc.assert(
      fc.property(text, stats, fc.option(stats, { nil: undefined }), (t, book, day) => {
        const words = countWords(t);
        const after = recordEvent(modelWith(book, day), BOOK, { kind: 'paragraphs', count: 1, words }, TODAY);

        const dayBefore: Stats = day ?? {
          paragraphsRead: 0,
          chaptersFinished: 0,
          activeReadingSeconds: 0,
          lookAwayCount: 0,
          sessionCount: 0,
          awaySeconds: 0,
          wordsRead: 0,
        };
        expect(after.stats[BOOK]).toEqual({
          ...book,
          paragraphsRead: book.paragraphsRead + 1,
          wordsRead: book.wordsRead + words,
        });
        expect(after.daily[TODAY]).toEqual({
          ...dayBefore,
          paragraphsRead: dayBefore.paragraphsRead + 1,
          wordsRead: dayBefore.wordsRead + words,
        });
      }),
      { numRuns: 200 },
    );
  });

  it('empty and whitespace-only text adds one paragraph and zero words', () => {
    const zero: Stats = {
      paragraphsRead: 4,
      chaptersFinished: 0,
      activeReadingSeconds: 0,
      lookAwayCount: 0,
      sessionCount: 0,
      awaySeconds: 0,
      wordsRead: 10,
    };
    for (const t of ['', '   ', '\n\t \u00a0']) {
      const after = recordEvent(modelWith(zero, zero), BOOK, { kind: 'paragraphs', count: 1, words: countWords(t) }, TODAY);
      expect(after.stats[BOOK].paragraphsRead).toBe(5);
      expect(after.stats[BOOK].wordsRead).toBe(10);
      expect(after.daily[TODAY].paragraphsRead).toBe(5);
      expect(after.daily[TODAY].wordsRead).toBe(10);
    }
  });
});
