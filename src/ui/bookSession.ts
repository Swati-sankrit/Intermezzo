// Helpers for opening one book by Book_Id: load it, restore its Position, build the save update.
// No React. Parser and splitter are the existing ones, unchanged.
import { CATALOGUE } from '../library/catalogueData';
import type { DataStore } from '../library/localStore';
import type { BookEntry, DataModel } from '../library/model';
import { POSITION_SAVE_DELAY_MS } from '../library/modelSaver';
import { moveToShelf, savePosition } from '../library/shelfOps';
import { restoreBook } from '../reader/bookCodec';
import { absoluteIndex, calculateProgress, countTotalParagraphs, storyRangeOf } from '../reader/progress';
import { splitIntoParagraphs } from '../reader/splitter';
import type { Book } from '../reader/types';
import { loadFromLibrary } from './loadSource';
import type { SaveKind } from './useLibrary';

export type ModelUpdater = (
  fn: (m: DataModel) => DataModel,
  opts?: { delayMs?: number; kind?: SaveKind },
) => void;

/** What useLibrary gives the reader, plus the store for uploaded text. */
export interface ReaderSession {
  bookId: string;
  store: DataStore;
  model: DataModel;
  status: 'loading' | 'ready';
  updateModel: ModelUpdater;
}

/** 'epub': the book could not be opened. 'text': an uploaded book's text is missing. */
export type OpenFailure = 'epub' | 'text';

export const READER_MESSAGES = {
  epubFailed: 'This book could not be opened. Go back to the library and try again.',
  textMissing: "This book's file needs to be opened again.",
  positionLost: 'Your saved place could not be restored. The book opens at the start.',
} as const;

export type Opened = { ok: true; book: Book } | { ok: false; failure: OpenFailure };

export async function openBookById(entry: BookEntry | undefined, store: DataStore): Promise<Opened> {
  if (!entry) return { ok: false, failure: 'epub' };
  if (entry.source === 'catalogue') {
    const cat = CATALOGUE.find((c) => c.slug === (entry.catalogueSlug ?? entry.bookId));
    if (!cat) return { ok: false, failure: 'epub' };
    const loaded = await loadFromLibrary({
      title: cat.title,
      author: cat.author,
      filePath: cat.epubPath,
      format: 'epub',
    });
    return loaded.ok ? { ok: true, book: loaded.book } : { ok: false, failure: 'epub' };
  }
  const text = await store.getText(entry.bookId).catch(() => null);
  if (!text || !text.ok) return { ok: false, failure: 'text' };
  const restored = restoreBook(entry.fileName, text.value, entry.title);
  return restored.ok ? { ok: true, book: restored.book } : { ok: false, failure: 'text' };
}

export interface Restored {
  chapterIndex: number;
  paragraphIndex: number;
  malformed: boolean;
}

const isIndex = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/**
 * No Position: the Story_Start. Malformed: the Story_Start, flagged. Past the end: the last paragraph.
 * A valid saved Position is restored as is; the Story_Start is not applied to it.
 */
export function restorePosition(book: Book, saved: unknown): Restored {
  const start = { chapterIndex: storyRangeOf(book).start, paragraphIndex: 0 };
  if (saved === undefined) return { ...start, malformed: false };
  const p = saved as { chapterIndex?: unknown; paragraphIndex?: unknown } | null;
  if (typeof p !== 'object' || p === null || !isIndex(p.chapterIndex) || !isIndex(p.paragraphIndex)) {
    return { ...start, malformed: true };
  }
  const lastChapter = Math.max(0, book.chapters.length - 1);
  const chapterIndex = Math.min(p.chapterIndex, lastChapter);
  const count = splitIntoParagraphs(book.chapters[chapterIndex]?.text ?? '').length;
  const clamped = p.chapterIndex > lastChapter ? Math.max(0, count - 1) : p.paragraphIndex;
  return { chapterIndex, paragraphIndex: Math.min(clamped, Math.max(0, count - 1)), malformed: false };
}

/** A saved place with progress 0 but a non-zero place: migrated data whose progress was never worked out. */
export function needsProgressRepair(saved: unknown, at: Restored): boolean {
  if (at.malformed || typeof saved !== 'object' || saved === null) return false;
  const progress = (saved as { progress?: unknown }).progress;
  return progress === 0 && (at.chapterIndex > 0 || at.paragraphIndex > 0);
}

export function progressFor(
  book: Book,
  at: { chapterIndex: number; paragraphIndex: number },
  complete: boolean,
): number {
  const total = countTotalParagraphs(book, splitIntoParagraphs);
  const abs = absoluteIndex(book, at, splitIntoParagraphs) + (complete ? 1 : 0);
  return calculateProgress(abs, total);
}

/** Save the Position; when the last paragraph of the book is done, also move it to `finished`. */
export function savePositionUpdate(
  session: ReaderSession,
  book: Book,
  at: { chapterIndex: number; paragraphIndex: number },
  complete: boolean,
  finished: boolean,
): void {
  const progress = progressFor(book, at, complete);
  session.updateModel(
    (m) => {
      const saved = savePosition(m, session.bookId, {
        chapterIndex: at.chapterIndex,
        paragraphIndex: at.paragraphIndex,
        savedAt: Date.now(),
        progress,
      });
      return finished ? moveToShelf(saved, session.bookId, 'finished') : saved;
    },
    { delayMs: POSITION_SAVE_DELAY_MS, kind: 'position' },
  );
}
