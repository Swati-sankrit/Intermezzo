// Feature: reader-core, Property 1: Round-trip completeness
// Feature: reader-core, Property 2: No whitespace-only paragraphs
// Feature: reader-core, Property 3: Non-empty input produces at least one paragraph
// Feature: reader-core, Property 4: Structured input splits back to original paragraphs

import * as fc from 'fast-check';
import { splitIntoParagraphs, joinParagraphs } from '../splitter';

/** Strips all whitespace, leaving only non-whitespace characters in order. */
function stripWhitespace(s: string): string {
  return s.replace(/\s/g, '');
}

/**
 * Generates a string built from 1–10 non-empty paragraph bodies joined by
 * one of the recognised blank-line separator variants. Each paragraph body is
 * a non-empty string that itself contains no blank-line sequence (so the
 * boundaries are unambiguous).
 */
const SEPARATORS = ['\n\n', '\n\n\n', '\r\n\r\n', '\n  \t\n'];

const paragraphBody = fc
  .string({ minLength: 1 })
  // Exclude strings that contain a blank-line pattern so they don't
  // accidentally introduce extra boundaries inside a paragraph body.
  .filter((s) => !/(\r?\n[ \t]*){2,}/.test(s) && !/\r{2,}/.test(s))
  // Also ensure the body itself is not all-whitespace (the splitter trims and
  // drops whitespace-only segments, so a body with no non-whitespace content
  // could vanish and invalidate Property 4's exact-count check).
  .filter((s) => /\S/.test(s));

const separator = fc.constantFrom(...SEPARATORS);

/** Generates a full multi-paragraph text and the expected trimmed bodies. */
const structuredText = fc
  .tuple(
    fc.array(paragraphBody, { minLength: 1, maxLength: 10 }),
    fc.array(separator, { minLength: 0, maxLength: 9 }),
  )
  .map(([bodies, seps]) => {
    // Interleave bodies with separators (there is always one fewer separator
    // than body, so cap the separator array to bodies.length - 1).
    const cappedSeps = seps.slice(0, bodies.length - 1);
    // Pad missing separators with the default '\n\n'.
    while (cappedSeps.length < bodies.length - 1) {
      cappedSeps.push('\n\n');
    }
    let text = bodies[0];
    for (let i = 0; i < cappedSeps.length; i++) {
      text += cappedSeps[i] + bodies[i + 1];
    }
    return { text, expectedBodies: bodies.map((b) => b.trim()) };
  });

describe('splitIntoParagraphs — property tests (fc.string)', () => {
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

describe('splitIntoParagraphs — property tests (structured multi-paragraph generator)', () => {
  it('Property 1: round-trip loses no non-whitespace characters', () => {
    fc.assert(
      fc.property(structuredText, ({ text }) => {
        const paragraphs = splitIntoParagraphs(text);
        const joined = joinParagraphs(paragraphs);
        expect(stripWhitespace(joined)).toBe(stripWhitespace(text));
      }),
      { numRuns: 100 },
    );
  });

  it('Property 2: every paragraph contains at least one non-whitespace character', () => {
    fc.assert(
      fc.property(structuredText, ({ text }) => {
        const paragraphs = splitIntoParagraphs(text);
        for (const paragraph of paragraphs) {
          expect(/\S/.test(paragraph.text)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('Property 3: structured input produces at least one paragraph', () => {
    fc.assert(
      fc.property(structuredText, ({ text }) => {
        const paragraphs = splitIntoParagraphs(text);
        expect(paragraphs.length).toBeGreaterThanOrEqual(1);
      }),
      { numRuns: 100 },
    );
  });

  it('Property 4: splitting structured text returns exactly the original paragraphs trimmed in order', () => {
    fc.assert(
      fc.property(structuredText, ({ text, expectedBodies }) => {
        const paragraphs = splitIntoParagraphs(text);
        expect(paragraphs.length).toBe(expectedBodies.length);
        for (let i = 0; i < expectedBodies.length; i++) {
          expect(paragraphs[i].text).toBe(expectedBodies[i]);
        }
      }),
      { numRuns: 100 },
    );
  });
});
