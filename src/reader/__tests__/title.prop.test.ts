// Feature: reader-core, Property 18: Book titles are never empty and never keep the file extension
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildTxtBook } from '../parser';
import { restoreBook } from '../bookCodec';
import { fileNameToTitle, resolveTitle } from '../title';

const EXTS = ['txt', 'epub'] as const;
const extArb = fc.constantFrom(...EXTS);
// A stem that does not itself end in a known extension, so one strip is the whole story.
const stemArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => !/[\\/]/.test(s) && !/\.(txt|epub)$/i.test(s));

describe('title derivation', () => {
  it('Property 18a: a file-based title is never empty and never ends with the extension', () => {
    // **Validates: Requirements 8.2**
    fc.assert(
      fc.property(stemArb, extArb, (stem, ext) => {
        const title = fileNameToTitle(`${stem}.${ext}`);
        expect(title.length).toBeGreaterThan(0);
        expect(title.toLowerCase().endsWith(`.${ext}`)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('Property 18b: buildTxtBook without a title uses the file name without extension', () => {
    const body = 'Some words here.\n\nAnd more.';
    fc.assert(
      fc.property(stemArb, (stem) => {
        const r = buildTxtBook(`${stem}.txt`, body);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.book.title.length).toBeGreaterThan(0);
        expect(r.book.title.endsWith('.txt')).toBe(false);
        expect(r.book.title).toBe(stem.trim().length > 0 ? stem.trim() : 'Untitled');
      }),
      { numRuns: 100 },
    );
  });

  it('Property 18c: resolveTitle never returns an empty title', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: undefined }), fc.string(), (title, fileName) => {
        expect(resolveTitle(title, fileName).trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('Property 18d: a saved title survives restoreBook for txt and epub books', () => {
    const nonBlank = fc.string({ minLength: 1 }).filter((t) => t.trim().length > 0);
    fc.assert(
      fc.property(nonBlank, (title) => {
        const txt = restoreBook('a.txt', 'Hello there.\n\nSecond.', title);
        const epub = restoreBook('a.epub', JSON.stringify([{ title: 'c', text: 'x' }]), title);
        expect(txt.ok && txt.book.title).toBe(title.trim());
        expect(epub.ok && epub.book.title).toBe(title.trim());
      }),
      { numRuns: 100 },
    );
  });
});

describe('title unit examples', () => {
  it('strips only the last extension and keeps the rest', () => {
    expect(fileNameToTitle('the-yellow-wallpaper.txt')).toBe('the-yellow-wallpaper');
    expect(fileNameToTitle('Mr. Smith.v2.epub')).toBe('Mr. Smith.v2');
    expect(fileNameToTitle('noextension')).toBe('noextension');
  });

  it('falls back to Untitled when nothing is left', () => {
    expect(fileNameToTitle('.txt')).toBe('Untitled');
    expect(fileNameToTitle('   .epub')).toBe('Untitled');
  });

  it('old saved data without a title loads with the file-name title', () => {
    const r = restoreBook('old-book.txt', 'Hello there.');
    expect(r.ok && r.book.title).toBe('old-book');
    const e = restoreBook('old.epub', JSON.stringify([{ title: 'c', text: 'x' }]));
    expect(e.ok && e.book.title).toBe('old');
  });

  it('a blank title falls back to the file name', () => {
    expect(resolveTitle('   ', 'x.epub')).toBe('x');
  });
});
