// Turns a Book into the text kept in IndexedDB and back. Pure, no DOM or React.
// .txt books are kept as their (boilerplate-stripped) source text and re-parsed.
// .epub books have no plain-text source, so their chapters are kept as JSON.
import { buildTxtBook } from './parser';
import { resolveTitle } from './title';
import type { Book, Chapter, LoadResult } from './types';

const BAD_SAVED = 'The saved book could not be read.';

export function isEpubName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.epub');
}

/**
 * Chapters as JSON, for books that have no plain-text source (EPUB).
 * A plain array when the whole book is the story; otherwise `{ chapters, story }`.
 */
export function chaptersToStoredText(book: Book): string {
  return JSON.stringify(book.story ? { chapters: book.chapters, story: book.story } : book.chapters);
}

function isStory(v: unknown, count: number): v is { start: number; end: number } {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    Number.isInteger(o.start) && Number.isInteger(o.end) &&
    (o.start as number) >= 0 && (o.start as number) <= (o.end as number) && (o.end as number) < count
  );
}

function isChapter(v: unknown): v is Chapter {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.title === 'string' && typeof o.text === 'string';
}

/**
 * Rebuild a Book from text saved by saveBook. Never throws.
 * `title` is the saved title; data saved before titles existed has none,
 * so the title falls back to the file name without its extension.
 */
export function restoreBook(fileName: string, text: string, title?: string): LoadResult {
  if (!isEpubName(fileName)) return buildTxtBook(fileName, text, title);
  try {
    const parsed: unknown = JSON.parse(text);
    const wrapped = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    const v: unknown = wrapped ? (parsed as { chapters?: unknown }).chapters : parsed;
    if (!Array.isArray(v) || v.length === 0 || !v.every(isChapter)) {
      return { ok: false, error: BAD_SAVED };
    }
    const book: Book = {
      fileName,
      title: resolveTitle(title, fileName),
      chapters: v.map((c) => ({ title: c.title, text: c.text })),
    };
    const story = wrapped ? (parsed as { story?: unknown }).story : undefined;
    if (isStory(story, v.length)) book.story = { start: story.start, end: story.end };
    return { ok: true, book };
  } catch {
    return { ok: false, error: BAD_SAVED };
  }
}
