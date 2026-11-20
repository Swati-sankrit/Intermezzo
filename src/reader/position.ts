import { splitIntoParagraphs } from './splitter';
import type { Book, StoredState } from './types';

/**
 * Returns the saved position if it exists in the book; otherwise chapter 0,
 * paragraph 0. Negative or non-integer indices count as out of range.
 */
export function resolvePosition(
  state: StoredState,
  book: Book,
): { chapterIndex: number; paragraphIndex: number } {
  const { chapterIndex, paragraphIndex } = state.position;
  const reset = { chapterIndex: 0, paragraphIndex: 0 };

  if (!Number.isInteger(chapterIndex) || !Number.isInteger(paragraphIndex)) return reset;
  if (chapterIndex < 0 || paragraphIndex < 0) return reset;
  if (chapterIndex >= book.chapters.length) return reset;
  if (paragraphIndex >= splitIntoParagraphs(book.chapters[chapterIndex].text).length) return reset;

  return { chapterIndex, paragraphIndex };
}
