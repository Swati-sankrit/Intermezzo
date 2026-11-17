// Feature: reader-core, Property 1: Round-trip completeness
// Feature: reader-core, Property 2: No whitespace-only paragraphs
// Feature: reader-core, Property 3: Non-empty input produces at least one paragraph

import * as fc from 'fast-check';
import { splitIntoParagraphs, joinParagraphs } from '../splitter';

/**
 * Strips all whitespace from a string, leaving only non-whitespace characters
 * in their original relative order.
 */
function stripWhitespace(s: string): string {
  return s.replace(/\s/g, '');
}

describe('splitIntoParagraphs — property tests', () => {
  // Feature: reader-core, Property 1: Round-trip completeness
  // Joining all paragraphs back loses no non-whitespace characters.
  // The non-whitespace content of the joined output must equal the
  // non-whitespace content of the original input (same characters, same order).
  it('Property 1: round-trip loses no non-whitespace characters', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const paragraphs = splitIntoParagraphs(input);
        const joined = joinParagraphs(paragraphs);
        expect(stripWhitespace(joined)).toBe(stripWhitespace(input));
      }),
      { numRuns: 100 },
    );
  });

  // Feature: reader-core, Property 2: No whitespace-only paragraphs
  // Every paragraph produced by splitIntoParagraphs contains at least one
  // non-whitespace character.
  it('Property 2: every paragraph contains at least one non-whitespace character', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const paragraphs = splitIntoParagraphs(input);
        for (const paragraph of paragraphs) {
          expect(/\S/.test(paragraph.text)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: reader-core, Property 3: Non-empty input produces at least one paragraph
  // When the input contains at least one non-whitespace character,
  // splitIntoParagraphs returns an array of length ≥ 1.
  it('Property 3: input with at least one non-whitespace char produces at least one paragraph', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => /\S/.test(s)),
        (input) => {
          const paragraphs = splitIntoParagraphs(input);
          expect(paragraphs.length).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
