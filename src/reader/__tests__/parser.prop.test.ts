// Feature: reader-core, Property 4: Chapter splitting completeness
// Feature: reader-core, Property 5: No chapter headings means exactly one chapter

import * as fc from 'fast-check';
import { buildTxtBook, isChapterHeading } from '../parser';

/**
 * Returns a map of character → count for all non-whitespace characters in `s`.
 */
function charCounts(s: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ch of s) {
    if (!/\s/.test(ch)) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  return counts;
}

describe('buildTxtBook — property tests', () => {
  it('Property 4: every non-whitespace character in input appears in the output chapters', () => {
    // Validates: Requirements 1.2, 1.3, 1.4
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = buildTxtBook('test.txt', input);

        // ok: false only for empty/whitespace-only input — that case is correct, skip.
        if (!result.ok) return;

        // Collect all non-whitespace chars from every chapter title and text.
        const allChapterContent = result.book.chapters
          .flatMap((ch) => [ch.title, ch.text])
          .join('');

        const inputCounts = charCounts(input);
        const outputCounts = charCounts(allChapterContent);

        // Every character in the input must appear with the same count in the output.
        for (const [ch, count] of inputCounts) {
          expect(outputCounts.get(ch)).toBe(count);
        }

        // Output must not introduce new non-whitespace characters absent in the input.
        for (const [ch, count] of outputCounts) {
          expect(inputCounts.get(ch)).toBe(count);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Property 5: a string with no chapter heading lines produces exactly one chapter', () => {
    // Validates: Requirements 1.3, 1.4
    fc.assert(
      fc.property(
        fc
          .string()
          // Keep only strings where no line is a chapter heading.
          .filter((text) => !text.split('\n').some((line) => isChapterHeading(line)))
          // Keep only strings with at least one non-whitespace character
          // so buildTxtBook returns ok: true.
          .filter((text) => /\S/.test(text)),
        (input) => {
          const result = buildTxtBook('test.txt', input);
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.book.chapters).toHaveLength(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
