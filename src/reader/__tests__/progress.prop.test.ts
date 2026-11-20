import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateProgress, absoluteIndex, countTotalParagraphs } from '../progress';
import { splitIntoParagraphs } from '../splitter';
import type { Book } from '../types';

const paragraphArb = fc
  .array(fc.stringMatching(/^[a-z]{1,8}$/), { minLength: 1, maxLength: 6 })
  .map((words) => words.join(' '));

const chapterArb = fc
  .array(paragraphArb, { minLength: 1, maxLength: 6 })
  .map((paras) => ({ title: '', text: paras.join('\n\n') }));

const bookArb: fc.Arbitrary<Book> = fc
  .array(chapterArb, { minLength: 1, maxLength: 6 })
  .map((chapters) => ({ fileName: 'book.txt', chapters }));

describe('progress properties', () => {
  // Feature: reader-core, Property 8: Progress formula correctness and bounds
  /** **Validates: Requirements 5.1, 5.2, 5.3** */
  it('matches floor(idx/total*100) clamped to [0,100], and is 0 when total is 0', () => {
    fc.assert(
      fc.property(fc.nat(), fc.nat(), (absoluteIdx, totalParagraphs) => {
        const expected =
          totalParagraphs === 0
            ? 0
            : Math.min(100, Math.max(0, Math.floor((absoluteIdx / totalParagraphs) * 100)));
        const actual = calculateProgress(absoluteIdx, totalParagraphs);
        expect(actual).toBe(expected);
        expect(actual).toBeGreaterThanOrEqual(0);
        expect(actual).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: reader-core, Property 9: Progress never decreases moving forward
  /** **Validates: Requirements 5.1, 5.2, 5.3** */
  it('is non-decreasing from position A to a later position B', () => {
    const scenario = bookArb
      .filter((book) => countTotalParagraphs(book, splitIntoParagraphs) >= 2)
      .chain((book) => {
        const total = countTotalParagraphs(book, splitIntoParagraphs);
        return fc
          .nat({ max: total - 2 })
          .chain((a) =>
            fc.integer({ min: a + 1, max: total - 1 }).map((b) => ({ book, total, a, b })),
          );
      });

    fc.assert(
      fc.property(scenario, ({ book, total, a, b }) => {
        const toPosition = (abs: number) => {
          let remaining = abs;
          for (let c = 0; c < book.chapters.length; c++) {
            const n = splitIntoParagraphs(book.chapters[c].text).length;
            if (remaining < n) return { chapterIndex: c, paragraphIndex: remaining };
            remaining -= n;
          }
          throw new Error('index out of range');
        };
        const posA = toPosition(a);
        const posB = toPosition(b);
        const idxA = absoluteIndex(book, posA, splitIntoParagraphs);
        const idxB = absoluteIndex(book, posB, splitIntoParagraphs);
        expect(idxA).toBe(a);
        expect(idxB).toBe(b);
        const pA = calculateProgress(idxA, total);
        const pB = calculateProgress(idxB, total);
        expect(pA).toBeLessThanOrEqual(pB);
        expect(pA).toBeGreaterThanOrEqual(0);
        expect(pB).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });
});
