import type { Book, Paragraph, Position } from './types';

export type SplitFn = (text: string) => Paragraph[];

/** Integer percentage in [0, 100]; 0 when there are no paragraphs. */
export function calculateProgress(absoluteIdx: number, totalParagraphs: number): number {
  if (totalParagraphs === 0) return 0;
  const pct = Math.floor((absoluteIdx / totalParagraphs) * 100);
  return Math.min(100, Math.max(0, pct));
}

/**
 * Inclusive chapter range of the story. Without a stored range, or with one that
 * does not fit the book, the whole book is the story.
 */
export function storyRangeOf(book: Book): { start: number; end: number } {
  const last = book.chapters.length - 1;
  const s = book.story;
  if (s && Number.isInteger(s.start) && Number.isInteger(s.end) && s.start >= 0 && s.start <= s.end && s.end <= last) {
    return { start: s.start, end: s.end };
  }
  return { start: 0, end: Math.max(0, last) };
}

/** Index of the last chapter a reader can reach by "Next chapter". */
export function lastStoryChapter(book: Book): number {
  return storyRangeOf(book).end;
}

/**
 * Story paragraphs before the position: from the story start, up to the position.
 * A position in front matter counts 0; a position in back matter counts the whole story.
 */
export function absoluteIndex(
  book: Book,
  position: Pick<Position, 'chapterIndex' | 'paragraphIndex'>,
  splitFn: SplitFn,
): number {
  const { start, end } = storyRangeOf(book);
  if (position.chapterIndex < start) return 0;
  let total = 0;
  for (let i = start; i < position.chapterIndex && i <= end && i < book.chapters.length; i++) {
    total += splitFn(book.chapters[i].text).length;
  }
  return position.chapterIndex > end ? total : total + position.paragraphIndex;
}

/** Paragraph count across the story chapters (the whole book when there is no front or back matter). */
export function countTotalParagraphs(book: Book, splitFn: SplitFn): number {
  const { start, end } = storyRangeOf(book);
  let total = 0;
  for (let i = start; i <= end && i < book.chapters.length; i++) {
    total += splitFn(book.chapters[i].text).length;
  }
  return total;
}
