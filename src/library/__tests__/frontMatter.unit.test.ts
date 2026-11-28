import { describe, expect, it } from 'vitest';
import { findStoryRange, findStoryStart, type ChapterInfo } from '../frontMatter';

const ch = (href: string, title?: string, wordCount?: number): ChapterInfo => ({
  href,
  title,
  wordCount,
});

const seLayout: ChapterInfo[] = [
  ch('text/titlepage.xhtml'),
  ch('text/imprint.xhtml'),
  ch('text/chapter-1.xhtml'),
  ch('text/chapter-2.xhtml'),
  ch('text/chapter-3.xhtml'),
  ch('text/endnotes.xhtml'),
  ch('text/colophon.xhtml'),
  ch('text/uncopyright.xhtml'),
];

describe('findStoryRange', () => {
  it('Standard Ebooks layout: skips titlepage/imprint, drops colophon/uncopyright, keeps endnotes', () => {
    const r = findStoryRange({ chapterTypes: {} }, seLayout);
    expect(r).toEqual({ start: 2, end: 5 });
    expect(findStoryStart({ chapterTypes: {} }, seLayout)).toEqual({ chapterIndex: 2 });
  });

  it('uses epub:type tokens when file names say nothing', () => {
    const chapters = [ch('a.xhtml'), ch('b.xhtml'), ch('c.xhtml'), ch('d.xhtml')];
    const r = findStoryRange(
      {
        chapterTypes: {
          'a.xhtml': ['frontmatter', 'imprint'],
          'd.xhtml': ['backmatter', 'colophon'],
        },
      },
      chapters,
    );
    expect(r).toEqual({ start: 1, end: 2 });
  });

  it('bodymatter landmark wins over file names', () => {
    const r = findStoryRange({ bodymatterHref: 'text/chapter-2.xhtml#top', chapterTypes: {} }, seLayout);
    expect(r.start).toBe(3);
    expect(r.end).toBe(5);
  });

  it('works from file names alone, case-insensitive', () => {
    const chapters = [ch('OEBPS/TitlePage.XHTML'), ch('OEBPS/Imprint.html'), ch('OEBPS/one.html'), ch('OEBPS/Colophon.html')];
    expect(findStoryRange({ chapterTypes: {} }, chapters)).toEqual({ start: 2, end: 2 });
  });

  it('text fallback applies only when nothing else marks matter', () => {
    const chapters = [ch('x1.html', 'Imprint', 80), ch('x2.html', 'Chapter I', 3000), ch('x3.html', 'Colophon', 60)];
    expect(findStoryRange({ chapterTypes: {} }, chapters)).toEqual({ start: 1, end: 1 });

    const longImprint = [ch('x1.html', 'Imprint', 5000), ch('x2.html', 'Chapter I', 3000)];
    expect(findStoryRange({ chapterTypes: {} }, longImprint)).toEqual({ start: 0, end: 1 });
  });

  it('no markers returns the whole book', () => {
    const chapters = [ch('a.html', 'One'), ch('b.html', 'Two'), ch('c.html', 'Three')];
    expect(findStoryRange({ chapterTypes: {} }, chapters)).toEqual({ start: 0, end: 2 });
  });

  it('returns the whole book when everything looks like matter', () => {
    const chapters = [ch('titlepage.xhtml'), ch('imprint.xhtml')];
    expect(findStoryRange({ chapterTypes: {} }, chapters)).toEqual({ start: 0, end: 1 });
  });

  it('a chapter typed as story is never dropped even with a matter-like name', () => {
    const chapters = [ch('imprint.xhtml'), ch('colophon.xhtml'), ch('end.xhtml')];
    const r = findStoryRange({ chapterTypes: { 'colophon.xhtml': ['chapter'] } }, chapters);
    expect(r).toEqual({ start: 1, end: 2 });
  });
});
