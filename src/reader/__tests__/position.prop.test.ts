import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { resolvePosition } from '../position';
import { splitIntoParagraphs } from '../splitter';
import type { Book, StoredState } from '../types';

const paragraphArb = fc
  .array(fc.stringMatching(/^[a-z]{1,8}$/), { minLength: 1, maxLength: 6 })
  .map((words) => words.join(' '));

const chapterArb = fc
  .array(paragraphArb, { minLength: 1, maxLength: 6 })
  .map((paras) => ({ title: '', text: paras.join('\n\n') }));

const bookArb: fc.Arbitrary<Book> = fc
  .array(chapterArb, { minLength: 1, maxLength: 6 })
  .map((chapters) => ({ fileName: 'book.txt', chapters }));

function stateAt(chapterIndex: number, paragraphIndex: number): StoredState {
  return {
    fileName: 'book.txt',
    position: { chapterIndex, paragraphIndex, savedAt: 0 },
    averagePace: 200,
    paceGuideEnabled: false,
  };
}

const badIndexArb = fc.oneof(
  fc.integer({ min: -1000, max: -1 }),
  fc.double({ noNaN: false }).filter((n) => !Number.isInteger(n)),
);

describe('resolvePosition properties', () => {
  // Feature: reader-core, Property: In-range position is unchanged
  /** **Validates: Requirements 6.4, 6.5** */
  it('returns any in-range position unchanged', () => {
    fc.assert(
      fc.property(
        bookArb.chain((book) =>
          fc.nat({ max: book.chapters.length - 1 }).chain((ci) => {
            const count = splitIntoParagraphs(book.chapters[ci].text).length;
            return fc.tuple(fc.constant(book), fc.constant(ci), fc.nat({ max: count - 1 }));
          }),
        ),
        ([book, ci, pi]) => {
          expect(resolvePosition(stateAt(ci, pi), book)).toEqual({
            chapterIndex: ci,
            paragraphIndex: pi,
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: reader-core, Property: Out-of-range position resets
  /** **Validates: Requirements 6.4, 6.5** */
  it('returns 0,0 for chapter or paragraph indices outside the book', () => {
    const zero = { chapterIndex: 0, paragraphIndex: 0 };
    fc.assert(
      fc.property(
        bookArb,
        fc.nat({ max: 50 }),
        fc.nat({ max: 50 }),
        badIndexArb,
        fc.nat({ max: 5 }),
        (book, extraC, extraP, bad, pick) => {
          const ci = Math.floor(pick % book.chapters.length);
          const count = splitIntoParagraphs(book.chapters[ci].text).length;
          expect(resolvePosition(stateAt(book.chapters.length + extraC, 0), book)).toEqual(zero);
          expect(resolvePosition(stateAt(ci, count + extraP), book)).toEqual(zero);
          expect(resolvePosition(stateAt(bad, 0), book)).toEqual(zero);
          expect(resolvePosition(stateAt(0, bad), book)).toEqual(zero);
          expect(resolvePosition(stateAt(ci, bad), book)).toEqual(zero);
        },
      ),
      { numRuns: 100 },
    );
  });
});
