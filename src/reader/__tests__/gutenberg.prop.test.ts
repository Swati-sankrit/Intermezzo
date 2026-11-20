// Feature: reader-core, Property 7: Text without Gutenberg markers is unchanged
// Feature: reader-core, Property 8: Text between Gutenberg markers is returned exactly

import * as fc from 'fast-check';
import { stripGutenbergBoilerplate } from '../gutenberg';

// Generated text never contains "***", so it cannot contain a marker line.
const plain = fc.string().filter((s) => !s.includes('***'));

const START = '*** START OF THE PROJECT GUTENBERG EBOOK SOME TITLE ***';
const END = '*** END OF THE PROJECT GUTENBERG EBOOK SOME TITLE ***';

describe('stripGutenbergBoilerplate — property tests', () => {
  it('Property 7: text without markers is returned unchanged', () => {
    // Validates: Gutenberg boilerplate stripping (task: reader-core hardening)
    fc.assert(
      fc.property(plain, (text) => {
        expect(stripGutenbergBoilerplate(text)).toBe(text);
      }),
      { numRuns: 100 },
    );
  });

  it('Property 8: output is exactly the middle between the START and END lines', () => {
    // Validates: Gutenberg boilerplate stripping (task: reader-core hardening)
    // Newline handling: the input is
    //   prefix + START + "\n" + middle + "\n" + END + suffix
    // The "\n" ending the START line and the "\n" before the END line are
    // delimiters, not part of the middle. prefix is either empty or ends in
    // "\n" so START begins a line. Middle may be empty or contain any
    // newlines/whitespace, which are preserved.
    const prefix = fc.oneof(fc.constant(''), plain.map((s) => s + '\n'));
    fc.assert(
      fc.property(prefix, plain, plain, (pre, middle, suffix) => {
        const input = pre + START + '\n' + middle + '\n' + END + suffix;
        expect(stripGutenbergBoilerplate(input)).toBe(middle);
      }),
      { numRuns: 100 },
    );
  });

  it('Property 8b: with no END marker, everything after the START line is kept', () => {
    const prefix = fc.oneof(fc.constant(''), plain.map((s) => s + '\n'));
    fc.assert(
      fc.property(prefix, plain, (pre, rest) => {
        const input = pre + START + '\n' + rest;
        expect(stripGutenbergBoilerplate(input)).toBe(rest);
      }),
      { numRuns: 100 },
    );
  });
});

describe('stripGutenbergBoilerplate — examples', () => {
  it('leaves a START line that is not a Gutenberg ebook marker alone', () => {
    const t = '*** START OF SOMETHING ELSE ***\nbody';
    expect(stripGutenbergBoilerplate(t)).toBe(t);
  });

  it('accepts THIS variant', () => {
    const t = 'x\n*** START OF THIS PROJECT GUTENBERG EBOOK X ***\nhi\n*** END OF THIS PROJECT GUTENBERG EBOOK X ***\nlicence';
    expect(stripGutenbergBoilerplate(t)).toBe('hi');
  });
});
