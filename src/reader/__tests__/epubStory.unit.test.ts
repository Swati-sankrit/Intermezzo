// Task 13.3: story range extraction from real EPUB files and the wiring around it.
// Real epub.js, real stripHtml, real bundled EPUB bytes. No mocks.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '../../library/catalogueData';
import { restorePosition } from '../../ui/bookSession';
import { chaptersToStoredText, restoreBook } from '../bookCodec';
import { buildEpubBook, buildTxtBook } from '../parser';
import { absoluteIndex, calculateProgress, countTotalParagraphs, lastStoryChapter } from '../progress';
import { splitIntoParagraphs } from '../splitter';
import { stripHtml } from '../stripHtml';
import type { Book } from '../types';

async function loadReal(epubPath: string): Promise<Book> {
  const bytes = readFileSync(join(process.cwd(), 'public', epubPath));
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const r = await buildEpubBook(epubPath.split('/').pop() as string, ab, stripHtml);
  if (!r.ok) throw new Error(r.error);
  return r.book;
}

const JEKYLL = CATALOGUE.find((c) => c.slug.endsWith('the-strange-case-of-dr-jekyll-and-mr-hyde'));

describe('Jekyll and Hyde (real bundled EPUB)', () => {
  it('opens at the first real chapter and ends before the colophon', async () => {
    expect(JEKYLL).toBeDefined();
    const book = await loadReal(JEKYLL!.epubPath);
    // Spine: titlepage (image only, no text, so the loader drops it), imprint, chapter-1..10,
    // colophon, uncopyright. Chapter indices count the chapters the loader keeps.
    expect(book.chapters).toHaveLength(13);
    expect(book.chapters[0].title).toBe('Imprint');
    expect(book.story).toEqual({ start: 1, end: 10 });
    expect(book.chapters[book.story!.start].title).not.toMatch(/imprint|title/i);
    expect(book.chapters[book.story!.end + 1].text.toLowerCase()).toContain('colophon');
    // Front matter stays in the book as the first chapters.
    expect(book.chapters[0].text.length).toBeGreaterThan(0);
  });

  it('with no saved Position opens at the Story_Start; a saved Position is restored as is', async () => {
    const book = await loadReal(JEKYLL!.epubPath);
    expect(restorePosition(book, undefined)).toEqual({ chapterIndex: 1, paragraphIndex: 0, malformed: false });
    expect(restorePosition(book, { chapterIndex: 0, paragraphIndex: 0 })).toEqual({
      chapterIndex: 0,
      paragraphIndex: 0,
      malformed: false,
    });
    expect(restorePosition(book, { chapterIndex: 5, paragraphIndex: 1 })).toEqual({
      chapterIndex: 5,
      paragraphIndex: 1,
      malformed: false,
    });
  });

  it('finishes at Story_End: no next chapter into back matter, progress is 100 there', async () => {
    const book = await loadReal(JEKYLL!.epubPath);
    expect(lastStoryChapter(book)).toBe(10);
    const total = countTotalParagraphs(book, splitIntoParagraphs);
    const sumStory = book.chapters.slice(1, 11).reduce((n, c) => n + splitIntoParagraphs(c.text).length, 0);
    expect(total).toBe(sumStory);
    const lastCount = splitIntoParagraphs(book.chapters[10].text).length;
    const abs = absoluteIndex(book, { chapterIndex: 10, paragraphIndex: lastCount - 1 }, splitIntoParagraphs) + 1;
    expect(calculateProgress(abs, total)).toBe(100);
    expect(absoluteIndex(book, { chapterIndex: 0, paragraphIndex: 0 }, splitIntoParagraphs)).toBe(0);
    expect(absoluteIndex(book, { chapterIndex: 1, paragraphIndex: 0 }, splitIntoParagraphs)).toBe(0);
  });

  it('keeps the story range through the stored-text round trip', async () => {
    const book = await loadReal(JEKYLL!.epubPath);
    const r = restoreBook(book.fileName, chaptersToStoredText(book), book.title);
    expect(r).toEqual({ ok: true, book: { ...book, title: book.title } });
  });
});

describe('every bundled catalogue EPUB', () => {
  it('detects a story range; results are written to /tmp/story-ranges.json for the build log', async () => {
    const rows: Array<Record<string, unknown>> = [];
    for (const entry of CATALOGUE) {
      const book = await loadReal(entry.epubPath);
      const range = book.story ?? { start: 0, end: book.chapters.length - 1 };
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeGreaterThanOrEqual(range.start);
      expect(range.end).toBeLessThan(book.chapters.length);
      rows.push({
        book: entry.title,
        chapters: book.chapters.length,
        start: range.start,
        startTitle: book.chapters[range.start].title,
        end: range.end,
        endTitle: book.chapters[range.end].title,
        after: book.chapters.slice(range.end + 1).map((c) => c.title),
      });
    }
    writeFileSync('/tmp/story-ranges.json', JSON.stringify(rows, null, 2));
    expect(rows).toHaveLength(CATALOGUE.length);
  }, 120_000);
});

describe('plain text and books without matter', () => {
  it('plain text has no story range and opens at the first paragraph', () => {
    const r = buildTxtBook('a.txt', 'Chapter 1\n\nHello there.\n\nSecond.\n\nChapter 2\n\nThird.');
    if (!r.ok) throw new Error(r.error);
    expect(r.book.story).toBeUndefined();
    expect(restorePosition(r.book, undefined)).toEqual({ chapterIndex: 0, paragraphIndex: 0, malformed: false });
    expect(lastStoryChapter(r.book)).toBe(1);
    expect(countTotalParagraphs(r.book, splitIntoParagraphs)).toBe(3);
  });

  it('an EPUB with no markers gets no story range', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file(
      'META-INF/container.xml',
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    );
    zip.file(
      'content.opf',
      '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="i"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="i">x</dc:identifier><dc:title>T</dc:title></metadata><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>',
    );
    const page = (t: string): string =>
      `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body><p>${t}</p></body></html>`;
    zip.file('a.xhtml', page('First chapter words here.'));
    zip.file('b.xhtml', page('Second chapter words here.'));
    const r = await buildEpubBook('t.epub', await zip.generateAsync({ type: 'arraybuffer' }), stripHtml);
    if (!r.ok) throw new Error(r.error);
    expect(r.book.chapters).toHaveLength(2);
    expect(r.book.story).toBeUndefined();
  });
});
