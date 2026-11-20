// Turns a Book into the text kept in IndexedDB and back. Pure, no DOM or React.
// .txt books are kept as their (boilerplate-stripped) source text and re-parsed.
// .epub books have no plain-text source, so their chapters are kept as JSON.
import { buildTxtBook } from './parser';
import type { Book, Chapter, LoadResult } from './types';

const BAD_SAVED = 'The saved book could not be read.';

export function isEpubName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.epub');
}

/** Chapters as JSON, for books that have no plain-text source (EPUB). */
export function chaptersToStoredText(book: Book): string {
  return JSON.stringify(book.chapters);
}

function isChapter(v: unknown): v is Chapter {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.title === 'string' && typeof o.text === 'string';
}

/** Rebuild a Book from text saved by saveBook. Never throws. */
export function restoreBook(fileName: string, text: string): LoadResult {
  if (!isEpubName(fileName)) return buildTxtBook(fileName, text);
  try {
    const v: unknown = JSON.parse(text);
    if (!Array.isArray(v) || v.length === 0 || !v.every(isChapter)) {
      return { ok: false, error: BAD_SAVED };
    }
    return {
      ok: true,
      book: { fileName, chapters: v.map((c) => ({ title: c.title, text: c.text })) },
    };
  } catch {
    return { ok: false, error: BAD_SAVED };
  }
}
