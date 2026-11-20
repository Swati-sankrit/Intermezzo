import type { Book, Paragraph, Position } from './types';

export type SplitFn = (text: string) => Paragraph[];

/** Integer percentage in [0, 100]; 0 when there are no paragraphs. */
export function calculateProgress(absoluteIdx: number, totalParagraphs: number): number {
  if (totalParagraphs === 0) return 0;
  const pct = Math.floor((absoluteIdx / totalParagraphs) * 100);
  return Math.min(100, Math.max(0, pct));
}

/** Paragraphs in all chapters before chapterIndex, plus paragraphIndex. */
export function absoluteIndex(
  book: Book,
  position: Pick<Position, 'chapterIndex' | 'paragraphIndex'>,
  splitFn: SplitFn,
): number {
  let total = 0;
  for (let i = 0; i < position.chapterIndex && i < book.chapters.length; i++) {
    total += splitFn(book.chapters[i].text).length;
  }
  return total + position.paragraphIndex;
}

/** Paragraph count across every chapter. */
export function countTotalParagraphs(book: Book, splitFn: SplitFn): number {
  return book.chapters.reduce((sum, ch) => sum + splitFn(ch.text).length, 0);
}
